// Server-side Notion helpers for the Meeting cockpit (/meeting).
//
// Notion blijft de bron van waarheid: dit bestand leest en schrijft alleen de
// bestaande team-databases (Agenda items, Tasks, de drie meeting-DB's). Er wordt
// niets in Supabase opgeslagen. Alles wat naar Notion gaat is Engels (Hadi leest mee).
//
// Gebruikt door src/app/api/meeting/route.ts. Auth: NOTION_TOKEN (integratie
// "MMMM webhook", dezelfde als plaud-webhook en meeting-reminders).

import { Client } from "@notionhq/client";

export const NOTION_VERSION = "2022-06-28";

export const AGENDA_DB_ID = process.env.AGENDA_DB_ID ?? "b73a458189e2484fb5383098404e320e";
export const TASKS_DB_ID = "35e21d9d7c6a800f8921db421d9eee94";

export type MeetingType = "MMMM" | "MMM" | "QMM";

export const MEETING_DB_ID: Record<MeetingType, string> = {
  MMMM: "35e21d9d7c6a808dab9ede35fbe85b92",
  MMM: "39c21d9d7c6a80ae8178f531269a51a7",
  QMM: "39c21d9d7c6a80e38707f6bb6f9dc5b1",
};

export const MEETING_LABEL: Record<MeetingType, string> = {
  MMMM: "Mima Monday Morning Meeting",
  MMM: "Mima Monthly Meeting",
  QMM: "Quarterly Mima Meeting",
};

// Relatie-naam op Agenda items per type ("Discussed in …")
const DISCUSSED_IN: Record<MeetingType, string> = {
  MMMM: "Discussed in MMMM",
  MMM: "Discussed in MMM",
  QMM: "Discussed in QMM",
};

// People-DB pagina's (Owner / Raised by / Present)
export const PEOPLE: Record<string, { id: string; name: string; short: string }> = {
  marc: { id: "93621d9d-7c6a-83ab-9064-016824a2bc18", name: "Marc Wesseling", short: "Marc" },
  michiel: { id: "7fd21d9d-7c6a-83f8-9c7a-01cfd9f95c47", name: "Michiel Kruize", short: "Michiel" },
  hadi: { id: "bcf21d9d-7c6a-83ca-bb19-81af75159e0b", name: "Abdul Hadi", short: "Hadi" },
};
export const PEOPLE_ORDER = ["marc", "michiel", "hadi"] as const;

export const TASK_STATUSES = [
  "Drafts for review",
  "To do",
  "In progress",
  "Waiting / Blocked",
  "Done",
  "Canceled",
  "Deferred",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
const OPEN_TASK_STATUSES: TaskStatus[] = ["Drafts for review", "To do", "In progress", "Waiting / Blocked"];

export const AGENDA_ASKS = ["Decide", "Discuss", "Inform", "Brainstorm"] as const;
export const DOMAINS = [
  "Locations",
  "Product development",
  "Catering",
  "Marketing",
  "Systems",
  "Finance",
  "HR",
  "Operations",
] as const;

export type AgendaItem = {
  id: string;
  url: string;
  topic: string;
  meetingType: MeetingType | null;
  status: string;
  ask: string | null;
  domain: string | null;
  raisedBy: string[]; // person keys (marc/michiel/hadi) of onbekende id's
  whyNow: string;
  context: string | null;
  minutes: number | null;
  targetDate: string | null;
  outcome: string;
  created: string;
};

export type TaskItem = {
  id: string;
  url: string;
  task: string;
  owners: string[]; // person keys
  domain: string | null;
  priority: string | null;
  status: string;
  deadline: string | null;
  blocker: string;
  notes: string;
  createdInMeeting: boolean;
};

export type MeetingRecord = {
  id: string;
  url: string;
  name: string;
  date: string | null;
  status: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NotionPage = { id: string; url: string; created_time?: string; properties: Record<string, any> };

export function getNotion(): Client {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("NOTION_TOKEN missing");
  return new Client({ auth: token, notionVersion: NOTION_VERSION });
}

function dashed(id: string): string {
  const s = id.replace(/-/g, "");
  if (s.length !== 32) return id;
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

function personKey(pageId: string): string {
  const d = dashed(pageId);
  for (const [key, p] of Object.entries(PEOPLE)) if (p.id === d) return key;
  return d;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rich(p: any): string {
  const arr = p?.rich_text ?? p?.title ?? [];
  return Array.isArray(arr) ? arr.map((t: { plain_text?: string }) => t.plain_text ?? "").join("") : "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rel(p: any): string[] {
  const arr = p?.relation ?? [];
  return Array.isArray(arr) ? arr.map((r: { id: string }) => personKey(r.id)) : [];
}

async function queryAll(
  notion: Client,
  databaseId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filter: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sorts?: any[],
  max = 500,
): Promise<NotionPage[]> {
  const out: NotionPage[] = [];
  let cursor: string | undefined;
  do {
    const res = await notion.databases.query({
      database_id: databaseId,
      filter,
      sorts,
      start_cursor: cursor,
      page_size: 100,
    });
    out.push(...(res.results as NotionPage[]));
    cursor = res.has_more && res.next_cursor ? res.next_cursor : undefined;
  } while (cursor && out.length < max);
  return out;
}

// ---- Agenda -----------------------------------------------------------------

function toAgenda(p: NotionPage): AgendaItem {
  const pr = p.properties;
  return {
    id: p.id,
    url: p.url,
    topic: rich(pr["Topic"]) || "(untitled)",
    meetingType: (pr["Meeting type"]?.select?.name as MeetingType | undefined) ?? null,
    status: pr["Status"]?.select?.name ?? "Proposed",
    ask: pr["Ask"]?.select?.name ?? null,
    domain: pr["Domain"]?.select?.name ?? null,
    raisedBy: rel(pr["Raised by"]),
    whyNow: rich(pr["Why now"]),
    context: pr["Context"]?.url ?? null,
    minutes: typeof pr["Time needed (min)"]?.number === "number" ? pr["Time needed (min)"].number : null,
    targetDate: pr["Target date"]?.date?.start ?? null,
    outcome: rich(pr["Outcome"]),
    created: pr["Created"]?.created_time ?? p.created_time ?? "",
  };
}

/** Open agenda (Proposed/Scheduled) + Parked, voor één meetingtype. */
export async function fetchAgenda(notion: Client, type: MeetingType): Promise<AgendaItem[]> {
  const pages = await queryAll(
    notion,
    AGENDA_DB_ID,
    {
      and: [
        { property: "Meeting type", select: { equals: type } },
        {
          or: [
            { property: "Status", select: { equals: "Scheduled" } },
            { property: "Status", select: { equals: "Proposed" } },
            { property: "Status", select: { equals: "Parked" } },
          ],
        },
      ],
    },
    [{ property: "Created", direction: "ascending" }],
  );
  const order: Record<string, number> = { Scheduled: 0, Proposed: 1, Parked: 2 };
  return pages.map(toAgenda).sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
}

export async function setAgendaStatus(
  notion: Client,
  pageId: string,
  status: "Proposed" | "Scheduled" | "Discussed" | "Parked" | "Dropped",
  opts: { outcome?: string; meetingType?: MeetingType; meetingRecordId?: string | null } = {},
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties: Record<string, any> = { Status: { select: { name: status } } };
  if (typeof opts.outcome === "string") {
    properties["Outcome"] = { rich_text: [{ type: "text", text: { content: opts.outcome.slice(0, 1900) } }] };
  }
  if (status === "Discussed" && opts.meetingType && opts.meetingRecordId) {
    properties[DISCUSSED_IN[opts.meetingType]] = { relation: [{ id: opts.meetingRecordId }] };
  }
  await notion.pages.update({ page_id: pageId, properties });
}

export async function createAgendaItem(
  notion: Client,
  input: {
    topic: string;
    meetingType: MeetingType;
    ask?: string | null;
    domain?: string | null;
    whyNow?: string;
    context?: string | null;
    minutes?: number | null;
    raisedBy?: string | null; // person key
    source?: string;
  },
): Promise<{ id: string; url: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties: Record<string, any> = {
    Topic: { title: [{ type: "text", text: { content: input.topic.slice(0, 200) } }] },
    "Meeting type": { select: { name: input.meetingType } },
    Status: { select: { name: "Proposed" } },
    Source: { rich_text: [{ type: "text", text: { content: input.source ?? "meeting cockpit" } }] },
  };
  if (input.ask) properties["Ask"] = { select: { name: input.ask } };
  if (input.domain) properties["Domain"] = { select: { name: input.domain } };
  if (input.whyNow) properties["Why now"] = { rich_text: [{ type: "text", text: { content: input.whyNow.slice(0, 1900) } }] };
  if (input.context) properties["Context"] = { url: input.context };
  if (typeof input.minutes === "number") properties["Time needed (min)"] = { number: input.minutes };
  if (input.raisedBy && PEOPLE[input.raisedBy]) properties["Raised by"] = { relation: [{ id: PEOPLE[input.raisedBy].id }] };
  const page = (await notion.pages.create({ parent: { database_id: AGENDA_DB_ID }, properties })) as NotionPage;
  return { id: page.id, url: page.url };
}

// ---- Tasks ------------------------------------------------------------------

function toTask(p: NotionPage): TaskItem {
  const pr = p.properties;
  return {
    id: p.id,
    url: p.url,
    task: rich(pr["Task"]) || "(untitled)",
    owners: rel(pr["Owner"]),
    domain: pr["Domain"]?.select?.name ?? null,
    priority: pr["Priority"]?.select?.name ?? null,
    status: pr["Status"]?.select?.name ?? "To do",
    deadline: pr["Deadline"]?.date?.start ?? null,
    blocker: rich(pr["Blocker"]),
    notes: rich(pr["Notes"]),
    createdInMeeting:
      (pr["Created in meeting"]?.relation?.length ?? 0) +
        (pr["Created in MMM"]?.relation?.length ?? 0) +
        (pr["Created in QMM"]?.relation?.length ?? 0) >
      0,
  };
}

/** Alle open taken (niet Done/Canceled/Deferred), incl. Drafts for review. */
export async function fetchOpenTasks(notion: Client): Promise<TaskItem[]> {
  const pages = await queryAll(
    notion,
    TASKS_DB_ID,
    { or: OPEN_TASK_STATUSES.map((s) => ({ property: "Status", select: { equals: s } })) },
    [
      { property: "Priority", direction: "ascending" },
      { property: "Deadline", direction: "ascending" },
    ],
  );
  return pages.map(toTask);
}

export async function setTaskStatus(notion: Client, pageId: string, status: TaskStatus): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties: Record<string, any> = { Status: { select: { name: status } } };
  if (status === "Done") {
    properties["Completed date"] = { date: { start: new Date().toISOString().slice(0, 10) } };
  }
  await notion.pages.update({ page_id: pageId, properties });
}

// ---- Meeting record ---------------------------------------------------------

function amsterdamToday(): { y: number; m: number; d: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { y: Number(get("year")), m: Number(get("month")), d: Number(get("day")), weekday: wd[get("weekday")] ?? 1 };
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Datumvenster van de huidige periode voor een type (week / maand / kwartaal), als YYYY-MM-DD. */
export function currentWindow(type: MeetingType): { start: string; end: string } {
  const t = amsterdamToday();
  const today = Date.UTC(t.y, t.m - 1, t.d, 12);
  if (type === "MMMM") {
    const offset = (t.weekday + 6) % 7; // dagen sinds maandag
    const mon = today - offset * 86_400_000;
    return { start: isoDate(mon), end: isoDate(mon + 6 * 86_400_000) };
  }
  if (type === "MMM") {
    return { start: isoDate(Date.UTC(t.y, t.m - 1, 1, 12)), end: isoDate(Date.UTC(t.y, t.m, 0, 12)) };
  }
  const q0 = Math.floor((t.m - 1) / 3) * 3; // 0,3,6,9
  return { start: isoDate(Date.UTC(t.y, q0, 1, 12)), end: isoDate(Date.UTC(t.y, q0 + 3, 0, 12)) };
}

/** Welk type is vandaag het meest waarschijnlijk? Eerste dinsdag v/d maand = MMM, 1e dinsdag van jan/apr/jul/okt = QMM, anders MMMM. */
export function defaultMeetingType(): MeetingType {
  const t = amsterdamToday();
  if (t.weekday === 2 && t.d <= 7) {
    return [1, 4, 7, 10].includes(t.m) ? "QMM" : "MMM";
  }
  return "MMMM";
}

export async function fetchMeetingRecord(notion: Client, type: MeetingType): Promise<MeetingRecord | null> {
  const { start, end } = currentWindow(type);
  const res = await notion.databases.query({
    database_id: MEETING_DB_ID[type],
    filter: {
      and: [
        { property: "Date", date: { on_or_after: start } },
        { property: "Date", date: { on_or_before: end } },
      ],
    },
    sorts: [{ property: "Date", direction: "descending" }],
    page_size: 5,
  });
  const p = (res.results as NotionPage[])[0];
  if (!p) return null;
  return {
    id: p.id,
    url: p.url,
    name: rich(p.properties["Name"]) || "(untitled)",
    date: p.properties["Date"]?.date?.start ?? null,
    status: p.properties["Status"]?.status?.name ?? null,
  };
}
