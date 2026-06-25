import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { Client } from "@notionhq/client";
import Anthropic from "@anthropic-ai/sdk";

// Plaud-meeting -> Notion-taken webhook.
// Aangeroepen door Zapier zodra Plaud een MMMM-samenvatting oplevert.
// Geeft NOOIT een 5xx terug: fouten worden in de Plaud Sync Log geadministreerd
// en met status 200 teruggemeld, zodat Zapier niet eindeloos retryt.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ---- Constanten -----------------------------------------------------------
const NOTION_VERSION = "2022-06-28";
const TASKS_DB_ID = "35e21d9d7c6a800f8921db421d9eee94";
const MMMM_DB_ID = "35e21d9d-7c6a-808d-ab9e-de35fbe85b92";
const SYNC_LOG_DB_ID = "38821d9d-7c6a-819c-87fb-c10b6a969483";
// LET OP: er bestaan twee "People"-databases. De Tasks "Owner"-relatie linkt naar
// DEZE database (d3d2...). Owners moeten hier vandaan komen, anders negeert Notion
// de relation-write stil (de page-id hoort niet bij de gelinkte DB). Geverifieerd:
// writes met onderstaande page-ids blijven staan (read-back bevestigd).
const PEOPLE_DB_ID = "d3d21d9d-7c6a-82df-b0d8-014512d331ec";

// Claude levert de korte voornaam uit de "– Owner: X" markering. Map naar de
// page-id in PEOPLE_DB_ID (records heten "Marc Wesseling" / "Michiel" / "Abdul Hadi").
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

// Normaliseer apostrof-varianten/casing voor de structuur-detectie.
function normalizeForSection(s: string): string {
  return s.toUpperCase().replace(/[‘’ʼ`]/g, "'");
}

function isMmmmSummary(summary: string): boolean {
  const S = normalizeForSection(summary);
  return S.includes("NEW TO-DO'S THIS WEEK") && S.includes("DOMAIN UPDATES");
}

// Bepaal het weekvenster (maandag..zondag, Europe/Amsterdam) dat create_time bevat.
// Geeft date-only grenzen "YYYY-MM-DD" terug — robuust tegen DST-offsetwissels.
function amsterdamWeekWindow(createTimeIso: string): { start: string; end: string } {
  const d = new Date(createTimeIso);
  const amsDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
  }).format(d); // "YYYY-MM-DD"
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Amsterdam",
    weekday: "short",
  }).format(d); // "Mon".."Sun"
  const idx: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const offset = idx[weekday] ?? 0;
  // Anker op 12:00Z zodat dag-rekenwerk niet over een DST-grens schuift.
  const base = new Date(`${amsDate}T12:00:00Z`);
  const monday = new Date(base);
  monday.setUTCDate(base.getUTCDate() - offset);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const ymd = (x: Date) => x.toISOString().slice(0, 10);
  return { start: ymd(monday), end: ymd(sunday) };
}

function plainText(rich: Array<{ plain_text?: string }> | undefined): string {
  return (rich ?? []).map((t) => t.plain_text ?? "").join("");
}

function stripFences(text: string): string {
  let t = text.trim();
  // Verwijder een eventuele ```json ... ``` of ``` ... ``` wrapper.
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;
  const m = t.match(fence);
  if (m) t = m[1].trim();
  return t;
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
  }
): Promise<string> {
  const properties: Record<string, any> = {
    Key: { title: [{ text: { content: args.recordingKey } }] },
    "Recording title": { rich_text: [{ text: { content: args.title.slice(0, 1900) } }] },
    "Create time": { date: { start: args.createTime } },
    Status: { select: { name: args.status } },
  };
  if (args.meetingPageId) {
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

// ---- Notion: meeting matching --------------------------------------------
async function findMeetingForWeek(
  notion: Client,
  createTimeIso: string
): Promise<string | null> {
  const { start, end } = amsterdamWeekWindow(createTimeIso);
  const res = await notion.databases.query({
    database_id: MMMM_DB_ID,
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
const SYSTEM_PROMPT = `You convert the action items of a weekly team meeting (the "MMMM") into structured records.

STRICT 1-TO-1 MAPPING — THIS IS THE CORE RULE:
The section titled "NEW TO-DO'S THIS WEEK" in the SUMMARY contains one bullet line (starting with "•") per task. You MUST emit EXACTLY ONE output object for EACH such bullet line, in the same order. Do not skip any bullet. Do not summarise, group, or combine bullets. Do not decide which bullets are "worth" keeping — the task set IS the set of bullets, period. If there are N bullet lines, you return N objects (minus only literal duplicates, see below).

The ONLY permitted reduction: if two bullet lines are a WORD-FOR-WORD identical copy of each other (same action, same object, AND same owner — a literal duplicate Plaud emitted twice), output one object for them. If ANYTHING differs — different owner, different object, different wording, different scope, location or context — they are SEPARATE tasks and BOTH must be emitted. When in doubt, keep both. A duplicate the reviewer dismisses is acceptable; a lost task is not.

SCOPE: Use ONLY the bullets under the "NEW TO-DO'S THIS WEEK" heading. That section ENDS at the next heading — typically "DECISIONS MADE THIS WEEK" or "DOMAIN UPDATES". Bullets under "DECISIONS MADE THIS WEEK" are past decisions, NOT action items — do NOT turn them into tasks. Likewise ignore "DOMAIN UPDATES", anything else in the summary, and the transcript. Use the TRANSCRIPT only as context to enrich each to-do bullet (domain, priority, deadline). Invent nothing.

YOUR JOB is to ENRICH each bullet, not to filter it. For every bullet, return an object with:
- "task": the cleaned-up task text (concise, imperative) — the same action as the bullet, just tidied.
- "original_bullet": the literal bullet line it came from, verbatim (including the "• " and the "– Owner: X" tail), for traceability.
- "owner": one of "Marc" | "Michiel" | "Hadi" | null. Read it from the "– Owner: X" marker on the bullet. If absent/unclear, use null.
- "domain": choose EXACTLY ONE of: Locations, Product development, Catering, Marketing, Systems, Finance, HR, Operations. Pick the best fit based on the task's content.
- "priority": one of "P1 (High)" | "P2 (Medium)" | "P3 (Low)". DEFAULT to "P2 (Medium)". Use "P1 (High)" ONLY when there is a hard/near deadline or explicit urgency. Use "P3 (Low)" only when explicitly optional/low/"someday".
- "deadline": an ISO date "YYYY-MM-DD" or null. Derive from explicit dates, or from relative language such as "by end of tomorrow", computed relative to the MEETING DATE provided.

OUTPUT: Respond with ONLY a JSON array of these objects. No prose, no explanation, no markdown code fences.`;

async function extractTasks(
  anthropic: Anthropic,
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
    max_tokens: 16000, // ruim genoeg voor ~57 taken; output mag nooit afkappen
    temperature: 0,
    system: SYSTEM_PROMPT,
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
  meetingPageId: string
): Promise<Set<string>> {
  const ids = new Set<string>();
  let cursor: string | undefined = undefined;
  do {
    const res: any = await notion.databases.query({
      database_id: TASKS_DB_ID,
      filter: { property: "Created in meeting", relation: { contains: meetingPageId } },
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
    "Created in meeting": { relation: [{ id: meetingPageId }] },
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
  meetingPageId: string
): Promise<number> {
  const seen = await existingSyncIdsForMeeting(notion, meetingPageId);
  let created = 0;

  for (const t of tasks) {
    if (!t?.task || !t.task.trim()) continue;
    const syncId = sha256_32(`${meetingPageId}|${normalizeTaskText(t.task)}`);
    if (seen.has(syncId)) continue; // dedup laag 2

    try {
      try {
        await notion.pages.create({
          parent: { database_id: TASKS_DB_ID },
          properties: buildTaskProperties(t, meetingPageId, syncId, true),
        });
      } catch (err: any) {
        // Owner-relatie kan stil falen (target-db niet gedeeld). Retry zonder Owner
        // zodat één property de hele taak niet sloopt.
        if (err?.code === "validation_error" && t.owner) {
          await notion.pages.create({
            parent: { database_id: TASKS_DB_ID },
            properties: buildTaskProperties(t, meetingPageId, syncId, false),
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
      // doorgaan met de rest
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
    // 200 zodat Zapier niet blijft retryen op een deploy-misconfig.
    return NextResponse.json({ ok: false, error: "server not configured" }, { status: 200 });
  }

  const notion = new Client({ auth: notionToken, notionVersion: NOTION_VERSION });
  // Vertrouw op de ingebouwde retries van de SDK (exp. backoff + jitter, respecteert
  // retry-after). Retryt op 408/409/429 en alle 5xx (incl. 529 overloaded); NIET op
  // 4xx zoals 400/401. Geen eigen retry-laag eroverheen -> geen dubbel retryen.
  const anthropic = new Anthropic({ apiKey: anthropicKey, maxRetries: 5 });

  let syncLogId: string | null = null;
  let recordingKey: string | null = null;

  try {
    const body = (await req.json()) as PlaudPayload;
    const title = (body.title ?? "").trim();
    const createTime = (body.create_time ?? "").trim();
    const transcript = body.transcript ?? "";
    const summary = body.summary ?? "";

    if (!createTime || !summary) {
      return NextResponse.json(
        { ignored: true, reason: "missing create_time or summary" },
        { status: 200 }
      );
    }

    // 2. STRUCTUUR-FILTER
    if (!isMmmmSummary(summary)) {
      return NextResponse.json(
        { ignored: true, reason: "not an MMMM summary" },
        { status: 200 }
      );
    }

    // recordingKey (gebruikt in stap 4 en de fail-safe van stap 8)
    recordingKey = sha256_32(`${createTime}|${title}`);

    // 3. MEETING-MATCHING
    const meetingPageId = await findMeetingForWeek(notion, createTime);

    // 8 (fail-safe): geen meeting voor die week
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
        });
      }
      console.error(`[plaud-webhook] no MMMM record for week of ${createTime}`);
      return NextResponse.json(
        { ok: false, reason: "no MMMM record for that week" },
        { status: 200 }
      );
    }

    // 4. DEDUP LAAG 1 (opname-niveau)
    const existing = await findSyncLog(notion, recordingKey);
    const status = syncLogStatus(existing);
    if (existing && status === "Done") {
      return NextResponse.json(
        { skipped: true, reason: "already processed" },
        { status: 200 }
      );
    }
    if (existing && (status === "Processing" || status === "Failed")) {
      return NextResponse.json(
        { skipped: true, reason: "in progress or previously failed — manual review" },
        { status: 200 }
      );
    }
    // Nieuw: maak een Sync Log-record aan met Status "Processing".
    syncLogId = await createSyncLog(notion, {
      recordingKey,
      title,
      createTime,
      meetingPageId,
      status: "Processing",
    });

    // 5. CLAUDE-EXTRACTIE
    const meetingDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Amsterdam",
    }).format(new Date(createTime));
    const tasks = await extractTasks(anthropic, { summary, transcript, meetingDate });

    // 6 + 7. OWNER-MAPPING + TAKEN AANMAKEN (incl. dedup laag 2)
    const created = await createTasks(notion, tasks, meetingPageId);

    // 8. AFRONDEN (succes)
    await updateSyncLog(notion, syncLogId, {
      status: "Done",
      tasksCreated: created,
      processedAt: new Date().toISOString(),
    });

    // "extracted" = aantal taken dat Claude opleverde (na eigen merge, vóór dedup laag 2);
    // "created" = daadwerkelijk aangemaakt na dedup laag 2. Handig voor observability.
    return NextResponse.json(
      { ok: true, created, extracted: tasks.length, meeting: meetingPageId },
      { status: 200 }
    );
  } catch (err: any) {
    // 8. FAIL-SAFE: onverwachte fout
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
