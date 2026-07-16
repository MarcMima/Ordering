import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { Client } from "@notionhq/client";
import Anthropic from "@anthropic-ai/sdk";
import {
  type MeetingType,
  type Period,
  detectMeetingType,
  isValidSummary,
  amsterdamPeriodWindow,
  buildSystemPrompt,
} from "./meetingTypes";

// Plaud-meeting -> Notion-taken webhook.
// Ondersteunt drie meeting-types (MMMM/MMM/QMM), onderscheiden op de opnametitel
// (Weekly/Monthly/Quarterly). Elk type heeft een eigen meeting-DB, eigen Tasks-relatie
// en eigen Horizon. Geeft NOOIT een 5xx terug: fouten worden in de Plaud Sync Log
// geadministreerd en met status 200 teruggemeld, zodat Zapier niet eindeloos retryt.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ---- Constanten -----------------------------------------------------------
const NOTION_VERSION = "2022-06-28";
const TASKS_DB_ID = "35e21d9d7c6a800f8921db421d9eee94";
const SYNC_LOG_DB_ID = "38821d9d-7c6a-819c-87fb-c10b6a969483";
// MMMM-db-id apart nodig voor de Sync Log "Meeting"-relatie (die wijst enkel hierheen).
const MMMM_KEY = "MMMM";

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
type PlaudPayload = {
  title?: string;
  create_time?: string;
  transcript?: string;
  summary?: string;
};

type ExtractedTask = {
  task: string;
  original_bullet: string;
  owner: string | null;
  domain: string;
  priority: string;
  deadline: string | null;
};

type SyncStatus = "Processing" | "Done" | "Failed";

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

// ---- Resend: e-mailmelding bij onbekende titel ----------------------------
// Faalt stil (log-only) zodat de webhook altijd netjes 200 kan teruggeven.
async function sendUnknownTitleAlert(title: string, createTime: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error("[plaud-webhook] RESEND_API_KEY ontbreekt; onbekende-titel-mail niet verstuurd");
    return;
  }
  const from = process.env.FROM_EMAIL ?? "bestelling@mimafood.nl";
  const text = [
    "Een management-meeting-opname is NIET gerouteerd.",
    "De samenvatting bevat 'DOMAIN UPDATES' (dus het is een echte meeting), maar er is",
    "geen meeting-type herkend — niet in de titel én niet in de transcript-opening.",
    "",
    `Titel: ${title || "(leeg)"}`,
    `Create time: ${createTime}`,
    "Reden: geen Weekly/Monthly/Quarterly (of de frase 'Mima Monday Morning Meeting' /",
    "'Mima Monthly Meeting' / 'Quarterly Mima Meeting') gevonden.",
    "",
    'Er is geen taak aangemaakt. De opname staat als "Failed" in de Plaud Sync Log.',
    "Tip: hernoem de opname in Plaud met Weekly/Monthly/Quarterly en re-fire de Zap.",
  ].join("\n");
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from,
        to: ["marc@mimafood.nl"],
        subject: "⚠️ Plaud management-meeting niet gerouteerd — geen meeting-type herkend",
        text,
      }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      console.error(`[plaud-webhook] Resend alert faalde: ${res.status} ${err}`);
    }
  } catch (e: any) {
    console.error(`[plaud-webhook] Resend alert error: ${e?.message ?? e}`);
  }
}

// ---- Notion: Sync Log helpers --------------------------------------------
async function findSyncLog(notion: Client, recordingKey: string) {
  const res = await notion.databases.query({
    database_id: SYNC_LOG_DB_ID,
    filter: { property: "Key", title: { equals: recordingKey } },
    page_size: 1,
  });
  return res.results[0] as { id: string; properties: Record<string, any> } | undefined;
}

function syncLogStatus(record: { properties: Record<string, any> } | undefined): SyncStatus | null {
  const name = record?.properties?.Status?.select?.name;
  return (name as SyncStatus) ?? null;
}

async function createSyncLog(
  notion: Client,
  args: {
    recordingKey: string;
    title: string;
    createTime: string;
    meetingPageId: string | null;
    status: SyncStatus;
    // Meeting-relatie alleen zetten voor MMMM (relatie wijst enkel naar de MMMM-db).
    linkMeeting: boolean;
  }
): Promise<string> {
  const properties: Record<string, any> = {
    Key: { title: [{ text: { content: args.recordingKey } }] },
    "Recording title": { rich_text: [{ text: { content: args.title.slice(0, 1900) } }] },
    "Create time": { date: { start: args.createTime } },
    Status: { select: { name: args.status } },
  };
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
  fields: { status?: SyncStatus; tasksCreated?: number; processedAt?: string }
) {
  const properties: Record<string, any> = {};
  if (fields.status) properties["Status"] = { select: { name: fields.status } };
  if (typeof fields.tasksCreated === "number")
    properties["Tasks created"] = { number: fields.tasksCreated };
  if (fields.processedAt) properties["Processed at"] = { date: { start: fields.processedAt } };
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

// ---- Claude-extractie -----------------------------------------------------
async function extractTasks(
  anthropic: Anthropic,
  type: MeetingType,
  args: { summary: string; transcript: string; meetingDate: string }
): Promise<ExtractedTask[]> {
  const userContent = [
    `MEETING DATE (for relative deadline math): ${args.meetingDate}`,
    "",
    "=== SUMMARY ===",
    args.summary,
    "",
    "=== TRANSCRIPT (context only) ===",
    args.transcript,
  ].join("\n");

  const msg = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 16000, // ruim genoeg; output mag nooit afkappen
    temperature: 0,
    system: buildSystemPrompt(type),
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

  let syncLogId: string | null = null;
  let recordingKey: string | null = null;

  try {
    const body = (await req.json()) as PlaudPayload;
    const title = (body.title ?? "").trim();
    const createTime = (body.create_time ?? "").trim();
    const transcript = body.transcript ?? "";
    const summary = body.summary ?? "";

    // 2. STRUCTUUR-FILTER EERST — alleen op "DOMAIN UPDATES" (identiek in alle types).
    // Alle niet-management opnames (catch-all AutoFlow: leveranciersgesprekken, memo's)
    // vallen hier stil weg: HTTP 200, GEEN Sync Log, GEEN Resend-alert.
    if (!summary || !isValidSummary(summary)) {
      return NextResponse.json(
        { ignored: true, reason: "not a management meeting" },
        { status: 200 }
      );
    }

    if (!createTime) {
      return NextResponse.json({ ignored: true, reason: "missing create_time" }, { status: 200 });
    }

    // recordingKey (gebruikt door dedup laag 1 en de fail-safes)
    recordingKey = sha256_32(`${createTime}|${title}`);

    // 3. TYPE-DETECTIE: titel (los woord) -> transcript-opening (volledige AutoFlow-frase),
    // precedence Q>M>W. Zie meetingTypes.detectMeetingType.
    const type = detectMeetingType(title, transcript);
    if (!type) {
      // ECHT foutgeval: de summary bevat DOMAIN UPDATES (dus een echte meeting) maar
      // routeert niet. Sync Log "Failed" + Resend-alert — alleen bij de EERSTE keer
      // (geen bestaande entry) om mail-spam bij retries te voorkomen.
      const existing = await findSyncLog(notion, recordingKey);
      if (!existing) {
        await createSyncLog(notion, {
          recordingKey,
          title,
          createTime,
          meetingPageId: null,
          status: "Failed",
          linkMeeting: false,
        });
        await sendUnknownTitleAlert(title, createTime);
      }
      console.error(
        `[plaud-webhook] management meeting failed to route (no type in title/transcript): ${JSON.stringify(title)}`
      );
      return NextResponse.json(
        { ignored: true, reason: "unknown meeting type" },
        { status: 200 }
      );
    }

    // 4. MEETING-MATCHING binnen de juiste periode + meeting-DB.
    const meetingPageId = await findMeetingInPeriod(
      notion,
      type.meetingDbId,
      type.period,
      createTime
    );

    // Fail-safe: geen meeting voor die periode.
    if (!meetingPageId) {
      const existing = await findSyncLog(notion, recordingKey);
      if (existing) {
        await updateSyncLog(notion, existing.id, { status: "Failed" });
      } else {
        await createSyncLog(notion, {
          recordingKey,
          title,
          createTime,
          meetingPageId: null,
          status: "Failed",
          linkMeeting: false,
        });
      }
      console.error(`[plaud-webhook] no ${type.key} record for period of ${createTime}`);
      return NextResponse.json(
        { ok: false, reason: `no ${type.key} record for that period` },
        { status: 200 }
      );
    }

    // 5. DEDUP LAAG 1 (opname-niveau)
    const existing = await findSyncLog(notion, recordingKey);
    const status = syncLogStatus(existing);
    if (existing && status === "Done") {
      return NextResponse.json({ skipped: true, reason: "already processed" }, { status: 200 });
    }
    if (existing && (status === "Processing" || status === "Failed")) {
      return NextResponse.json(
        { skipped: true, reason: "in progress or previously failed — manual review" },
        { status: 200 }
      );
    }

    // Nieuw: Sync Log-record "Processing" (Meeting-relatie alleen voor MMMM).
    syncLogId = await createSyncLog(notion, {
      recordingKey,
      title,
      createTime,
      meetingPageId,
      status: "Processing",
      linkMeeting: type.key === MMMM_KEY,
    });

    // 6. CLAUDE-EXTRACTIE (prompt per type)
    const meetingDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Amsterdam",
    }).format(new Date(createTime));
    const tasks = await extractTasks(anthropic, type, { summary, transcript, meetingDate });

    // 7. TAKEN AANMAKEN (relatie + Horizon per type, incl. dedup laag 2)
    const created = await createTasks(notion, tasks, type, meetingPageId);

    // 8. AFRONDEN (succes)
    await updateSyncLog(notion, syncLogId, {
      status: "Done",
      tasksCreated: created,
      processedAt: new Date().toISOString(),
    });

    return NextResponse.json(
      { ok: true, type: type.key, created, extracted: tasks.length, meeting: meetingPageId },
      { status: 200 }
    );
  } catch (err: any) {
    // FAIL-SAFE: onverwachte fout
    console.error(`[plaud-webhook] unexpected error: ${err?.message ?? err}`);
    try {
      if (syncLogId) {
        await updateSyncLog(notion, syncLogId, { status: "Failed" });
      } else if (recordingKey) {
        const existing = await findSyncLog(notion, recordingKey);
        if (existing) await updateSyncLog(notion, existing.id, { status: "Failed" });
      }
    } catch (e: any) {
      console.error(`[plaud-webhook] failed to mark Sync Log as Failed: ${e?.message ?? e}`);
    }
    return NextResponse.json(
      { ok: false, error: err?.message ?? "unexpected error" },
      { status: 200 }
    );
  }
}
