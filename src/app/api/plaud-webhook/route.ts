import { NextResponse, after } from "next/server";
import { createHash } from "crypto";
import { Client } from "@notionhq/client";
import Anthropic from "@anthropic-ai/sdk";
import {
  type MeetingType,
  type Period,
  detectMeetingType,
  meetingTypeByKey,
  isValidSummary,
  hasTodoSection,
  isMeetingSized,
  amsterdamPeriodWindow,
  buildSystemPrompt,
  buildTranscriptSystemPrompt,
  buildClassifierPrompt,
  TRANSCRIPT_WINDOW,
} from "./meetingTypes";
import { finalizeMeetingRecord } from "./meetingRecord";

// Plaud-meeting -> Notion-taken webhook.
//
// Twee aanleveraars, één verwerker:
//  - Zapier (AutoFlow-trigger): {title, create_time, transcript, summary}
//  - Watchdog (geplande Claude-taak via Supabase pg_net): idem + file_id, duration_sec,
//    source:"watchdog"; kan ook mode:"check" sturen om te vragen wat al verwerkt is.
//
// Ontwerpregels (sinds 09-2026, na de stille uitval van 2 sept):
//  1. De opname is de bron, niet de AutoFlow-template. Geen "NEW TO-DO'S" in de summary?
//     Dan extraheert Claude de actiepunten uit het transcript (route B).
//  2. Niets faalt stil. Elke meeting-formaat opname (>=15 min) krijgt een Sync Log-rij
//     (Done / Failed / Ignored) en Marc krijgt bij elke verwerking én elke fout een mail.
//     Alleen korte opnames (memo's) worden zonder spoor genegeerd.
//  3. Type-detectie is tolerant (woordvolgorde, dubbele woorden) en heeft een
//     Claude-classificatie als vangnet; nooit default naar MMMM.
//  4. Geeft NOOIT een 5xx terug; zware werk draait na de response (after()), zodat
//     Zapier/pg_net niet timen-out en niet retryen.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ---- Constanten -----------------------------------------------------------
const NOTION_VERSION = "2022-06-28";
const TASKS_DB_ID = "35e21d9d7c6a800f8921db421d9eee94";
const SYNC_LOG_DB_ID = "38821d9d-7c6a-819c-87fb-c10b6a969483";
const MMMM_KEY = "MMMM";
const ALERT_TO = ["marc@mimafood.nl"];

// LET OP: er bestaan twee "People"-databases. De Tasks "Owner"-relatie linkt naar
// DEZE database (d3d2...). Owners moeten hier vandaan komen, anders negeert Notion
// de relation-write stil (de page-id hoort niet bij de gelinkte DB).
const PEOPLE: Record<string, string> = {
  Marc: "93621d9d-7c6a-83ab-9064-016824a2bc18",
  Michiel: "7fd21d9d-7c6a-83f8-9c7a-01cfd9f95c47",
  Hadi: "bcf21d9d-7c6a-83ca-bb19-81af75159e0b",
};

const CLAUDE_MODEL = "claude-sonnet-4-6";

const ALLOWED_DOMAINS = [
  "Locations",
  "Product development",
  "Catering",
  "Marketing",
  "Systems",
  "Finance",
  "HR",
  "Operations",
] as const;

const ALLOWED_PRIORITIES = ["P1 (High)", "P2 (Medium)", "P3 (Low)"] as const;
const DEFAULT_PRIORITY = "P2 (Medium)";

// ---- Types ----------------------------------------------------------------
type Source = "Zapier" | "Watchdog" | "Manual";
type Extraction = "Template" | "Transcript";

type PlaudPayload = {
  mode?: "process" | "check";
  title?: string;
  create_time?: string;
  transcript?: string;
  summary?: string;
  file_id?: string;
  duration_sec?: number;
  duration_ms?: number;
  source?: string;
  meeting_type?: string; // expliciete override: MMMM | MMM | QMM
  wait?: boolean; // true = synchroon verwerken (tests); default: after()
  recordings?: Array<{ file_id?: string; title?: string; create_time?: string; duration_sec?: number }>;
};

type ExtractedTask = {
  task: string;
  original_bullet: string;
  owner: string | null;
  domain: string;
  priority: string;
  deadline: string | null;
};

type SyncStatus = "Processing" | "Done" | "Failed" | "Ignored";

type SyncLogPage = { id: string; properties: Record<string, any> };

type Recording = {
  title: string;
  createTime: string;
  transcript: string;
  summary: string;
  fileId: string | null;
  durationSec: number | null;
  source: Source;
  typeOverride: MeetingType | null;
};

// ---- Helpers --------------------------------------------------------------
function sha256_32(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 32);
}

function plainText(rich: Array<{ plain_text?: string }> | undefined): string {
  return (rich ?? []).map((t) => t.plain_text ?? "").join("");
}

function stripFences(text: string): string {
  let t = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;
  const m = t.match(fence);
  if (m) t = m[1].trim();
  return t;
}

function normalizeTitle(t: string): string {
  return (t ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function amsterdamDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(d);
}

function notionUrl(pageId: string): string {
  return `https://www.notion.so/${pageId.replace(/-/g, "")}`;
}

function parseSource(s: string | undefined): Source {
  const v = (s ?? "").toLowerCase();
  if (v === "watchdog") return "Watchdog";
  if (v === "manual") return "Manual";
  return "Zapier";
}

function parseRecording(body: PlaudPayload): Recording {
  const durationSec =
    typeof body.duration_sec === "number"
      ? body.duration_sec
      : typeof body.duration_ms === "number"
        ? body.duration_ms / 1000
        : null;
  return {
    title: (body.title ?? "").trim(),
    createTime: (body.create_time ?? "").trim(),
    transcript: body.transcript ?? "",
    summary: body.summary ?? "",
    fileId: (body.file_id ?? "").trim() || null,
    durationSec,
    source: parseSource(body.source),
    typeOverride: meetingTypeByKey(body.meeting_type),
  };
}

// ---- Resend: meldingen -----------------------------------------------------
// Faalt stil (log-only) zodat de webhook altijd netjes kan afronden.
async function sendMail(subject: string, lines: string[]): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error("[plaud-webhook] RESEND_API_KEY ontbreekt; mail niet verstuurd:", subject);
    return;
  }
  const from = process.env.FROM_EMAIL ?? "bestelling@mimafood.nl";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from, to: ALERT_TO, subject, text: lines.join("\n") }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      console.error(`[plaud-webhook] Resend faalde: ${res.status} ${err}`);
    }
  } catch (e: any) {
    console.error(`[plaud-webhook] Resend error: ${e?.message ?? e}`);
  }
}

function recordingLines(rec: Recording): string[] {
  return [
    `Titel: ${rec.title || "(leeg)"}`,
    `Create time: ${rec.createTime}`,
    `Duur: ${rec.durationSec ? Math.round(rec.durationSec / 60) + " min" : "onbekend"}`,
    `Plaud file ID: ${rec.fileId ?? "onbekend (Zapier-route)"}`,
    `Bron: ${rec.source}`,
  ];
}

// ---- Notion: Sync Log helpers --------------------------------------------
async function findSyncLogByKey(notion: Client, recordingKey: string): Promise<SyncLogPage | undefined> {
  const res = await notion.databases.query({
    database_id: SYNC_LOG_DB_ID,
    filter: { property: "Key", title: { equals: recordingKey } },
    page_size: 1,
  });
  return res.results[0] as SyncLogPage | undefined;
}

async function findSyncLogByFileId(notion: Client, fileId: string): Promise<SyncLogPage | undefined> {
  const res = await notion.databases.query({
    database_id: SYNC_LOG_DB_ID,
    filter: { property: "Plaud file ID", rich_text: { equals: fileId } },
    page_size: 5,
  });
  const pages = res.results as SyncLogPage[];
  // Voorkeur: Done > Processing > Failed > Ignored (de rij die "telt").
  const rank: Record<string, number> = { Done: 0, Processing: 1, Failed: 2, Ignored: 3 };
  pages.sort((a, b) => (rank[syncLogStatus(a) ?? ""] ?? 9) - (rank[syncLogStatus(b) ?? ""] ?? 9));
  return pages[0];
}

// Legacy-match: rijen van vóór 09-2026 hebben geen file ID. Zelfde Amsterdam-dag +
// zelfde (genormaliseerde) titel = dezelfde opname.
async function findSyncLogBySameDayTitle(
  notion: Client,
  createTime: string,
  title: string
): Promise<SyncLogPage | undefined> {
  const day = amsterdamDate(createTime);
  const res = await notion.databases.query({
    database_id: SYNC_LOG_DB_ID,
    filter: {
      and: [
        { property: "Create time", date: { on_or_after: `${day}T00:00:00+02:00` } },
        { property: "Create time", date: { on_or_before: `${day}T23:59:59+02:00` } },
      ],
    },
    page_size: 50,
  });
  const want = normalizeTitle(title);
  const pages = (res.results as SyncLogPage[]).filter(
    (p) => normalizeTitle(plainText(p.properties?.["Recording title"]?.rich_text)) === want
  );
  return pages.find((p) => syncLogStatus(p) === "Done") ?? pages[0];
}

// Alle manieren waarop deze opname al bekend kan zijn.
async function findExistingSyncLog(notion: Client, rec: Recording, recordingKey: string) {
  if (rec.fileId) {
    const byFile = await findSyncLogByFileId(notion, rec.fileId);
    if (byFile) return byFile;
  }
  const byKey = await findSyncLogByKey(notion, recordingKey);
  if (byKey) return byKey;
  if (rec.createTime && rec.title) {
    return findSyncLogBySameDayTitle(notion, rec.createTime, rec.title);
  }
  return undefined;
}

function syncLogStatus(record: { properties: Record<string, any> } | undefined): SyncStatus | null {
  const name = record?.properties?.Status?.select?.name;
  return (name as SyncStatus) ?? null;
}

async function createSyncLog(
  notion: Client,
  args: {
    recordingKey: string;
    rec: Recording;
    meetingPageId: string | null;
    status: SyncStatus;
    type: MeetingType | null;
    extraction?: Extraction;
    note?: string;
    // Meeting-relatie alleen zetten voor MMMM (relatie wijst enkel naar de MMMM-db).
    linkMeeting: boolean;
  }
): Promise<string> {
  const { rec } = args;
  const properties: Record<string, any> = {
    Key: { title: [{ text: { content: args.recordingKey } }] },
    "Recording title": { rich_text: [{ text: { content: rec.title.slice(0, 1900) } }] },
    "Create time": { date: { start: rec.createTime } },
    Status: { select: { name: args.status } },
    Source: { select: { name: rec.source } },
  };
  if (args.type) properties["Meeting type"] = { select: { name: args.type.label } };
  if (rec.fileId) properties["Plaud file ID"] = { rich_text: [{ text: { content: rec.fileId } }] };
  if (rec.durationSec) properties["Duur (min)"] = { number: Math.round(rec.durationSec / 60) };
  if (args.extraction) properties["Extraction"] = { select: { name: args.extraction } };
  if (args.note) properties["Note"] = { rich_text: [{ text: { content: args.note.slice(0, 1900) } }] };
  if (args.linkMeeting && args.meetingPageId) {
    properties["Meeting"] = { relation: [{ id: args.meetingPageId }] };
  }
  const page = await notion.pages.create({
    parent: { database_id: SYNC_LOG_DB_ID },
    properties,
  });
  return page.id;
}

async function updateSyncLog(
  notion: Client,
  pageId: string,
  fields: { status?: SyncStatus; tasksCreated?: number; processedAt?: string; note?: string; extraction?: Extraction }
) {
  const properties: Record<string, any> = {};
  if (fields.status) properties["Status"] = { select: { name: fields.status } };
  if (typeof fields.tasksCreated === "number")
    properties["Tasks created"] = { number: fields.tasksCreated };
  if (fields.processedAt) properties["Processed at"] = { date: { start: fields.processedAt } };
  if (fields.note) properties["Note"] = { rich_text: [{ text: { content: fields.note.slice(0, 1900) } }] };
  if (fields.extraction) properties["Extraction"] = { select: { name: fields.extraction } };
  await notion.pages.update({ page_id: pageId, properties });
}

// ---- Notion: meeting matching (per periode) -------------------------------
async function findMeetingInPeriod(
  notion: Client,
  meetingDbId: string,
  period: Period,
  createTimeIso: string
): Promise<string | null> {
  const { start, end } = amsterdamPeriodWindow(createTimeIso, period);
  const res = await notion.databases.query({
    database_id: meetingDbId,
    filter: {
      and: [
        { property: "Date", date: { on_or_after: start } },
        { property: "Date", date: { on_or_before: end } },
      ],
    },
  });
  const results = res.results as Array<{ id: string; properties: Record<string, any> }>;
  if (results.length === 0) return null;
  if (results.length === 1) return results[0].id;

  // Meerdere: kies de meeting met "Date" het dichtst bij create_time.
  const target = new Date(createTimeIso).getTime();
  let best = results[0];
  let bestDelta = Infinity;
  for (const r of results) {
    const ds = r.properties?.Date?.date?.start;
    if (!ds) continue;
    const delta = Math.abs(new Date(ds).getTime() - target);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = r;
    }
  }
  return best.id;
}

// ---- Claude: classificatie-vangnet ----------------------------------------
type Classification = {
  management_meeting: boolean;
  type: MeetingType | null;
  confidence: string;
  reason: string;
};

async function classifyRecording(anthropic: Anthropic, rec: Recording): Promise<Classification> {
  const head = rec.transcript.slice(0, TRANSCRIPT_WINDOW);
  const user = [
    `TITLE: ${rec.title || "(none)"}`,
    `DURATION: ${rec.durationSec ? Math.round(rec.durationSec / 60) + " minutes" : "unknown"}`,
    `SUMMARY HEADINGS: ${(rec.summary.match(/\*\*[A-Z][A-Z' &/-]+\*\*/g) ?? []).join(", ") || "(none)"}`,
    "",
    "OPENING OF TRANSCRIPT:",
    head || "(empty)",
  ].join("\n");
  const msg = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 300,
    temperature: 0,
    system: buildClassifierPrompt(),
    messages: [{ role: "user", content: user }],
  });
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const parsed = JSON.parse(stripFences(text)) as {
    management_meeting?: boolean;
    type?: string | null;
    confidence?: string;
    reason?: string;
  };
  return {
    management_meeting: Boolean(parsed.management_meeting),
    type: meetingTypeByKey(parsed.type ?? null),
    confidence: parsed.confidence ?? "unknown",
    reason: parsed.reason ?? "",
  };
}

// ---- Claude-extractie -----------------------------------------------------
async function extractTasks(
  anthropic: Anthropic,
  type: MeetingType,
  extraction: Extraction,
  args: { summary: string; transcript: string; meetingDate: string }
): Promise<ExtractedTask[]> {
  const userContent =
    extraction === "Template"
      ? [
          `MEETING DATE (for relative deadline math): ${args.meetingDate}`,
          "",
          "=== SUMMARY ===",
          args.summary,
          "",
          "=== TRANSCRIPT (context only) ===",
          args.transcript,
        ].join("\n")
      : [
          `MEETING DATE (for relative deadline math): ${args.meetingDate}`,
          "",
          "=== SUMMARY (unstructured, may be empty; checklist only) ===",
          args.summary || "(none)",
          "",
          "=== TRANSCRIPT (authoritative) ===",
          args.transcript,
        ].join("\n");

  const msg = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 16000, // ruim genoeg; output mag nooit afkappen
    temperature: 0,
    system: extraction === "Template" ? buildSystemPrompt(type) : buildTranscriptSystemPrompt(type),
    messages: [{ role: "user", content: userContent }],
  });

  if (msg.stop_reason === "max_tokens") {
    throw new Error("Claude extraction truncated (hit max_tokens) — raise max_tokens");
  }

  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const parsed = JSON.parse(stripFences(text));
  if (!Array.isArray(parsed)) throw new Error("Claude returned non-array JSON");
  return parsed as ExtractedTask[];
}

// ---- Tasks aanmaken (dedup laag 2) ---------------------------------------
async function existingSyncIdsForMeeting(
  notion: Client,
  type: MeetingType,
  meetingPageId: string
): Promise<Set<string>> {
  const ids = new Set<string>();
  let cursor: string | undefined = undefined;
  do {
    const res: any = await notion.databases.query({
      database_id: TASKS_DB_ID,
      filter: { property: type.taskRelation, relation: { contains: meetingPageId } },
      start_cursor: cursor,
      page_size: 100,
    });
    for (const page of res.results as Array<{ properties: Record<string, any> }>) {
      const v = plainText(page.properties?.["Sync ID"]?.rich_text).trim();
      if (v) ids.add(v);
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return ids;
}

function normalizeTaskText(task: string): string {
  return task.toLowerCase().trim().replace(/\s+/g, " ");
}

function buildTaskProperties(
  t: ExtractedTask,
  type: MeetingType,
  meetingPageId: string,
  syncId: string,
  includeOwner: boolean
): Record<string, any> {
  const domain = (ALLOWED_DOMAINS as readonly string[]).includes(t.domain) ? t.domain : null;
  const priority = (ALLOWED_PRIORITIES as readonly string[]).includes(t.priority)
    ? t.priority
    : DEFAULT_PRIORITY;
  const deadlineOk = typeof t.deadline === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.deadline);

  const properties: Record<string, any> = {
    Task: { title: [{ text: { content: t.task.slice(0, 1900) } }] },
    Status: { select: { name: "Drafts for review" } },
    // Meeting-relatie + Horizon per meeting-type.
    [type.taskRelation]: { relation: [{ id: meetingPageId }] },
    Horizon: { select: { name: type.horizon } },
    Priority: { select: { name: priority } },
    Notes: { rich_text: [{ text: { content: (t.original_bullet ?? "").slice(0, 1900) } }] },
    "Sync ID": { rich_text: [{ text: { content: syncId } }] },
  };
  if (domain) properties["Domain"] = { select: { name: domain } };
  if (deadlineOk) properties["Deadline"] = { date: { start: t.deadline } };

  const ownerId = includeOwner && t.owner ? PEOPLE[t.owner] : undefined;
  if (ownerId) properties["Owner"] = { relation: [{ id: ownerId }] };

  return properties;
}

async function createTasks(
  notion: Client,
  tasks: ExtractedTask[],
  type: MeetingType,
  meetingPageId: string
): Promise<number> {
  const seen = await existingSyncIdsForMeeting(notion, type, meetingPageId);
  let created = 0;

  for (const t of tasks) {
    if (!t?.task || !t.task.trim()) continue;
    const syncId = sha256_32(`${meetingPageId}|${normalizeTaskText(t.task)}`);
    if (seen.has(syncId)) continue; // dedup laag 2

    try {
      try {
        await notion.pages.create({
          parent: { database_id: TASKS_DB_ID },
          properties: buildTaskProperties(t, type, meetingPageId, syncId, true),
        });
      } catch (err: any) {
        // Owner-relatie kan stil falen; retry zonder Owner zodat één property
        // niet de hele taak sloopt.
        if (err?.code === "validation_error" && t.owner) {
          await notion.pages.create({
            parent: { database_id: TASKS_DB_ID },
            properties: buildTaskProperties(t, type, meetingPageId, syncId, false),
          });
        } else {
          throw err;
        }
      }
      seen.add(syncId);
      created += 1;
    } catch (err: any) {
      console.error(
        `[plaud-webhook] task create failed (code=${err?.code ?? "?"}): ${err?.message ?? err}`
      );
    }
  }
  return created;
}

// ---- Check-modus (watchdog) ------------------------------------------------
// Vraag: welke van deze opnames zijn al bekend? Antwoord per opname: status + rij-url.
async function handleCheck(notion: Client, body: PlaudPayload) {
  const out: Array<Record<string, unknown>> = [];
  for (const r of body.recordings ?? []) {
    const rec: Recording = {
      title: (r.title ?? "").trim(),
      createTime: (r.create_time ?? "").trim(),
      transcript: "",
      summary: "",
      fileId: (r.file_id ?? "").trim() || null,
      durationSec: typeof r.duration_sec === "number" ? r.duration_sec : null,
      source: "Watchdog",
      typeOverride: null,
    };
    const key = sha256_32(`${rec.createTime}|${rec.title}`);
    try {
      const existing = await findExistingSyncLog(notion, rec, key);
      out.push({
        file_id: rec.fileId,
        title: rec.title,
        status: existing ? (syncLogStatus(existing) ?? "unknown").toLowerCase() : "missing",
        sync_log: existing ? notionUrl(existing.id) : null,
        meeting_sized: isMeetingSized(rec.durationSec, ""),
      });
    } catch (e: any) {
      out.push({ file_id: rec.fileId, title: rec.title, status: "error", error: e?.message ?? String(e) });
    }
  }
  return NextResponse.json({ ok: true, mode: "check", results: out }, { status: 200 });
}

// ---- Kernverwerking ------------------------------------------------------
type Outcome = { ok: boolean; [k: string]: unknown };

async function processRecording(notion: Client, anthropic: Anthropic, rec: Recording): Promise<Outcome> {
  const recordingKey = sha256_32(`${rec.createTime}|${rec.title}`);
  let syncLogId: string | null = null;

  try {
    // 1. KANDIDAAT? Meeting-formaat (>=15 min / lang transcript) of het harde
    //    structuursignaal (DOMAIN UPDATES). Kleine memo's vallen hier stil weg.
    const hasStructure = isValidSummary(rec.summary);
    if (!hasStructure && !isMeetingSized(rec.durationSec, rec.transcript)) {
      return { ok: true, ignored: true, reason: "too short to be a management meeting" };
    }

    // 2. AL BEKEND? (dedup laag 1: file ID -> key -> zelfde dag + titel)
    const existing = await findExistingSyncLog(notion, rec, recordingKey);
    const existingStatus = syncLogStatus(existing);
    if (existing && existingStatus === "Done") {
      return { ok: true, skipped: true, reason: "already processed", sync_log: notionUrl(existing.id) };
    }
    if (existing && existingStatus === "Processing") {
      return { ok: true, skipped: true, reason: "in progress", sync_log: notionUrl(existing.id) };
    }
    // Failed/Ignored: bij een NIEUWE aanlevering (andere bron of expliciete override)
    // opnieuw proberen; dezelfde bron zonder override blijft handmatig-review.
    if (existing && (existingStatus === "Failed" || existingStatus === "Ignored")) {
      const prevSource = existing.properties?.Source?.select?.name as string | undefined;
      const retry = rec.typeOverride !== null || (prevSource && prevSource !== rec.source);
      if (!retry) {
        return {
          ok: true,
          skipped: true,
          reason: `previously ${existingStatus.toLowerCase()} — manual review (re-send with meeting_type to force)`,
          sync_log: notionUrl(existing.id),
        };
      }
    }

    // 3. TYPE-DETECTIE: override -> regex (frase/opening/titel) -> Claude-classificatie.
    let type: MeetingType | null = rec.typeOverride ?? detectMeetingType(rec.title, rec.transcript);
    let classification: Classification | null = null;
    if (!type) {
      classification = await classifyRecording(anthropic, rec);
      if (!classification.management_meeting && !hasStructure) {
        // Geen management-meeting (leveranciersgesprek, overdracht, ...). Wel spoor
        // achterlaten: lange opname, bewust genegeerd — zichtbaar, geen mail.
        syncLogId = await createSyncLog(notion, {
          recordingKey,
          rec,
          meetingPageId: null,
          status: "Ignored",
          type: null,
          note: `Classifier: not a management meeting (${classification.confidence}) — ${classification.reason}`,
          linkMeeting: false,
        });
        return { ok: true, ignored: true, reason: "not a management meeting", sync_log: notionUrl(syncLogId) };
      }
      type = classification.type;
    }

    if (!type) {
      // ECHT foutgeval: (waarschijnlijk) een management-meeting zonder herkenbaar type.
      syncLogId = await createSyncLog(notion, {
        recordingKey,
        rec,
        meetingPageId: null,
        status: "Failed",
        type: null,
        note: `Geen meeting-type herkend. ${classification ? `Classifier: ${classification.reason}` : ""}`,
        linkMeeting: false,
      });
      await sendMail("⚠️ Plaud: management-meeting niet gerouteerd — geen meeting-type herkend", [
        "Een opname lijkt een management-meeting, maar het type (MMMM/MMM/QMM) is niet te bepalen —",
        "niet uit de transcript-opening, niet uit de titel, en de classificatie twijfelt.",
        "",
        ...recordingLines(rec),
        classification ? `Classifier: ${classification.reason}` : "",
        "",
        `Er is geen taak aangemaakt. Sync Log: ${notionUrl(syncLogId)}`,
        "Herstel: stuur de opname opnieuw aan met meeting_type (MMMM|MMM|QMM), of vraag Claude",
        "de watchdog te draaien met het juiste type.",
      ]);
      return { ok: false, reason: "unknown meeting type", sync_log: notionUrl(syncLogId) };
    }

    // 4. MEETING-MATCHING binnen de juiste periode + meeting-DB.
    const meetingPageId = await findMeetingInPeriod(notion, type.meetingDbId, type.period, rec.createTime);
    if (!meetingPageId) {
      syncLogId = await createSyncLog(notion, {
        recordingKey,
        rec,
        meetingPageId: null,
        status: "Failed",
        type,
        note: `Geen ${type.key}-record in Notion voor de periode van deze opname.`,
        linkMeeting: false,
      });
      await sendMail(`⚠️ Plaud: ${type.key} herkend maar geen meeting-record voor die periode`, [
        `De opname is herkend als ${type.key}, maar in de ${type.key}-database staat geen meeting`,
        `voor de ${type.period === "week" ? "week" : type.period === "month" ? "maand" : "kwartaal"} van ${amsterdamDate(rec.createTime)}.`,
        "",
        ...recordingLines(rec),
        "",
        `Er is geen taak aangemaakt. Sync Log: ${notionUrl(syncLogId)}`,
        `Herstel: maak het ${type.key}-record aan (Date in die periode) en stuur de opname opnieuw aan.`,
      ]);
      return { ok: false, reason: `no ${type.key} record for that period`, sync_log: notionUrl(syncLogId) };
    }

    // 5. EXTRACTIE-ROUTE: template (1-op-1 bullets) als de to-do-sectie er is, anders transcript.
    const extraction: Extraction = hasTodoSection(rec.summary) ? "Template" : "Transcript";
    const noteParts: string[] = [];
    if (extraction === "Transcript") {
      noteParts.push(
        rec.summary
          ? "Summary zonder NEW TO-DO'S-sectie (verkeerde AutoFlow-template) → taken uit transcript."
          : "Geen summary aangeleverd → taken uit transcript."
      );
    }
    if (classification) noteParts.push(`Type via classifier (${classification.confidence}): ${classification.reason}`);
    if (rec.typeOverride) noteParts.push("Type expliciet meegegeven (override).");

    syncLogId = await createSyncLog(notion, {
      recordingKey,
      rec,
      meetingPageId,
      status: "Processing",
      type,
      extraction,
      note: noteParts.join(" ") || undefined,
      linkMeeting: type.key === MMMM_KEY,
    });

    // 6. CLAUDE-EXTRACTIE
    const meetingDate = amsterdamDate(rec.createTime);
    const tasks = await extractTasks(anthropic, type, extraction, {
      summary: rec.summary,
      transcript: rec.transcript,
      meetingDate,
    });

    // 7. TAKEN AANMAKEN (relatie + Horizon per type, incl. dedup laag 2)
    const created = await createTasks(notion, tasks, type, meetingPageId);

    // 8. MEETING-RECORD VERRIJKEN (best-effort, mag taak-aanmaak nooit breken)
    let meetingRecord: { renamed: string | null; completed: boolean; present: string[] } | null = null;
    try {
      meetingRecord = await finalizeMeetingRecord(notion, type, meetingPageId, rec.summary, PEOPLE, meetingDate);
    } catch (e: any) {
      console.error(`[plaud-webhook] finalizeMeetingRecord failed: ${e?.message ?? e}`);
    }

    // 9. AFRONDEN (succes) + positieve bevestiging per mail — stilte is nooit "ok".
    await updateSyncLog(notion, syncLogId, {
      status: "Done",
      tasksCreated: created,
      processedAt: new Date().toISOString(),
    });
    const routeLabel = extraction === "Template" ? "template (1-op-1 bullets)" : "TRANSCRIPT (geen to-do-sectie in de summary)";
    await sendMail(
      `${extraction === "Template" ? "✅" : "✅⚠️"} Plaud: ${type.key} verwerkt — ${created} taken (${extraction.toLowerCase()})`,
      [
        `${type.key} van ${meetingDate} is verwerkt.`,
        `Taken aangemaakt: ${created} (geëxtraheerd: ${tasks.length}, rest was al aanwezig).`,
        `Route: ${routeLabel}.`,
        extraction === "Transcript"
          ? "Let op: transcript-route is minder strak dan de template-route — loop de Drafts for review extra kritisch na."
          : "",
        "",
        ...recordingLines(rec),
        "",
        `Meeting-record: ${notionUrl(meetingPageId)}`,
        `Sync Log: ${notionUrl(syncLogId)}`,
        meetingRecord?.renamed ? `Meeting hernoemd naar: ${meetingRecord.renamed}` : "",
      ]
    );

    return {
      ok: true,
      type: type.key,
      extraction,
      created,
      extracted: tasks.length,
      meeting: meetingPageId,
      sync_log: notionUrl(syncLogId),
      meetingRecord,
    };
  } catch (err: any) {
    // FAIL-SAFE: onverwachte fout -> Failed + mail (nooit stil).
    console.error(`[plaud-webhook] unexpected error: ${err?.message ?? err}`);
    try {
      if (syncLogId) {
        await updateSyncLog(notion, syncLogId, { status: "Failed", note: `Unexpected error: ${err?.message ?? err}` });
      } else {
        syncLogId = await createSyncLog(notion, {
          recordingKey,
          rec,
          meetingPageId: null,
          status: "Failed",
          type: rec.typeOverride,
          note: `Unexpected error: ${err?.message ?? err}`,
          linkMeeting: false,
        });
      }
    } catch (e: any) {
      console.error(`[plaud-webhook] failed to mark Sync Log as Failed: ${e?.message ?? e}`);
    }
    await sendMail("❌ Plaud: verwerking mislukt (onverwachte fout)", [
      `Fout: ${err?.message ?? err}`,
      "",
      ...recordingLines(rec),
      "",
      syncLogId ? `Sync Log: ${notionUrl(syncLogId)}` : "Sync Log-rij kon niet worden aangemaakt.",
      "Herstel: stuur de opname opnieuw aan (watchdog of Zapier re-fire).",
    ]);
    return { ok: false, error: err?.message ?? "unexpected error" };
  }
}

// ---- Handler --------------------------------------------------------------
export async function POST(req: Request) {
  // 1. SECRET-CHECK
  const secret = process.env.MMMM_WEBHOOK_SECRET;
  const provided = req.headers.get("x-mmmm-secret");
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const notionToken = process.env.NOTION_TOKEN;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!notionToken || !anthropicKey) {
    console.error("[plaud-webhook] missing NOTION_TOKEN or ANTHROPIC_API_KEY");
    return NextResponse.json({ ok: false, error: "server not configured" }, { status: 200 });
  }

  const notion = new Client({ auth: notionToken, notionVersion: NOTION_VERSION });
  const anthropic = new Anthropic({ apiKey: anthropicKey, maxRetries: 5 });

  let body: PlaudPayload;
  try {
    body = (await req.json()) as PlaudPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 200 });
  }

  if (body.mode === "check") return handleCheck(notion, body);

  const rec = parseRecording(body);
  if (!rec.createTime) {
    return NextResponse.json({ ignored: true, reason: "missing create_time" }, { status: 200 });
  }
  if (!rec.transcript && !rec.summary) {
    return NextResponse.json({ ignored: true, reason: "no transcript and no summary" }, { status: 200 });
  }

  // Synchroon (tests / handmatig) of achtergrond (default: Zapier/pg_net krijgen direct
  // antwoord; de verwerking meldt zichzelf via Sync Log + mail).
  if (body.wait) {
    const outcome = await processRecording(notion, anthropic, rec);
    return NextResponse.json(outcome, { status: 200 });
  }
  after(async () => {
    const outcome = await processRecording(notion, anthropic, rec);
    console.log(`[plaud-webhook] outcome: ${JSON.stringify(outcome)}`);
  });
  return NextResponse.json(
    { accepted: true, source: rec.source, file_id: rec.fileId, note: "processing in background; see Plaud Sync Log + mail" },
    { status: 202 }
  );
}
