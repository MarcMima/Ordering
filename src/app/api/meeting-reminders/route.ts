import { NextResponse } from "next/server";

// Meeting-reminders cron-endpoint.
// Stuurt de wekelijkse/maandelijkse voorbereidings-mails die aan de Mima-meetings
// vastzitten. Wordt door Vercel Cron dagelijks aangeroepen; alle datum-logica zit
// server-side (Europe/Amsterdam), zodat er geen losse scheduler of connector nodig is.
//
// Drie reminders:
//   1. pre-MMMM   — elke VRIJDAG (middag): team werkt hun MMMM to-do's bij / klikt
//                   afgeronde weg, vóór de weekly meeting op maandag.
//   2. post-MMMM  — SINDS 09-2026 NIET MEER VANUIT DE CRON. De "review your Drafts for
//                   review"-mail wordt door /api/plaud-webhook verstuurd op het moment
//                   dat de taken daadwerkelijk in Notion staan (src/lib/meetingEmails.ts).
//                   De dinsdag-ochtend hier is alleen nog een VANGNET: staat er geen
//                   verwerkte MMMM in de Sync Log, dan krijgt Marc een alarm.
//   4. manager-homework — elke DONDERDAG (ochtend): de restaurantmanagers krijgen de drie
//                   toezeggingen uit hun maandag-check-in ("the week ahead") als huiswerk
//                   (src/lib/managerHomework.ts, sinds 23-09-2026).
//   3. pre-MMM    — TWEE momenten vóór de maandmeeting: een week ervoor én de laatste
//                   werkdag ervoor. De datum komt uit de Notion MMM/QMM-records (zelfde
//                   planning als de meetings-app); de eerste dinsdag v/d maand is alleen
//                   de vulling voor maanden zonder record.
//
// Verzending gaat via Resend (zelfde conventie als plaud-webhook: RESEND_API_KEY +
// FROM_EMAIL). Alle team-mail is Engelstalig — Hadi (Operations) leest mee.
// Opmaak, ontvangers en verzending: src/lib/meetingEmails.ts (gedeeld met de webhook).
// Sinds 16-09-2026 bevatten de pre-meeting-mails ook de open agendapunten uit de
// Notion Agenda items-DB (zie fetchAgenda/agendaBlock hieronder).

import {
  type Mail,
  MARC,
  TEAM,
  TASKS_DB_URL,
  BTN_LABEL,
  tasksLink,
  renderEmail,
  draftsReviewMail,
  sendBrandedMail as sendMail,
} from "@/lib/meetingEmails";
import { managerHomeworkMails } from "@/lib/managerHomework";
import { readCalendar, type CalendarRead } from "@/lib/meetingCalendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---- Datum-helpers (Europe/Amsterdam) -------------------------------------
type AmsParts = { year: number; month: number; day: number; weekday: number };

// weekday: 0 = zondag ... 6 = zaterdag
function amsterdamParts(now: Date): AmsParts {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: wd[get("weekday")] ?? -1,
  };
}

// Date-only anker op 12:00 UTC — vermijdt DST-randgevallen bij dag-verschillen.
function dateOnly(y: number, m1: number, d: number): number {
  return Date.UTC(y, m1 - 1, d, 12, 0, 0, 0);
}

// Eerste dinsdag van (year, month1). month1 = 1-12.
function firstTuesday(year: number, month1: number): { y: number; m: number; d: number } {
  const first = new Date(Date.UTC(year, month1 - 1, 1, 12));
  const dow = first.getUTCDay(); // 0 zo .. 6 za
  const offset = (2 - dow + 7) % 7; // dagen tot dinsdag (2)
  return { y: year, m: month1, d: 1 + offset };
}

function diffDays(fromMs: number, toMs: number): number {
  return Math.round((toMs - fromMs) / 86_400_000);
}

// ---- Planning van de maandmeeting (MMM/QMM) ---------------------------------
// Sinds 29-09-2026 volgt deze route dezelfde planning als de meetings-app
// (mima-meetings, src/lib/notion.ts resolveNext): de Notion meeting-records zijn de
// planning, de vaste regel (eerste dinsdag) vult alleen maanden zonder record.
// Een MMM/QMM-record binnen 15 dagen van de regeldatum vervangt die regeldatum
// (MMM en QMM delen het maandslot). Aanleiding: MMM oktober werd naar ma 28-09
// gehaald, maar op 29-09 ging toch "MMM in a week (6 October)" uit.
// Wordt een meeting in de agenda verplaatst: verplaats ook de Date van het record.
type Ymd = { y: number; m: number; d: number };
const MONTHLY_DB_IDS: Record<"MMM" | "QMM", string> = {
  MMM: process.env.MMM_DB_ID ?? "39c21d9d7c6a80ae8178f531269a51a7",
  QMM: process.env.QMM_DB_ID ?? "39c21d9d7c6a80e38707f6bb6f9dc5b1",
};
type MonthlySchedule = {
  dates: Ymd[];
  source: "calendar" | "notion" | "rule";
  records: string[];
  times?: Record<string, string>; // YYYY-MM-DD -> HH:MM (from the calendar)
  error?: string;
};

function ymdFromMs(ms: number): Ymd {
  const d = new Date(ms);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}
function ymdIso(x: Ymd): string {
  return `${x.y}-${String(x.m).padStart(2, "0")}-${String(x.d).padStart(2, "0")}`;
}
function addMonths(y: number, m1: number, n: number): { y: number; m: number } {
  const idx = y * 12 + (m1 - 1) + n;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

async function fetchMonthlyRecords(fromIso: string, toIso: string): Promise<{ dates: string[]; error?: string }> {
  const token = process.env.NOTION_TOKEN;
  if (!token) return { dates: [], error: "NOTION_TOKEN missing" };
  const out: string[] = [];
  try {
    for (const [type, id] of Object.entries(MONTHLY_DB_IDS)) {
      const res = await fetch(`https://api.notion.com/v1/databases/${id}/query`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filter: {
            and: [
              { property: "Date", date: { on_or_after: fromIso } },
              { property: "Date", date: { on_or_before: toIso } },
            ],
          },
          page_size: 50,
        }),
      });
      if (!res.ok) return { dates: [], error: `${type}: ${res.status} ${await res.text()}` };
      const data = (await res.json()) as { results: Array<{ properties: { Date?: { date?: { start?: string } | null } } }> };
      for (const r of data.results) {
        const start = r.properties?.Date?.date?.start?.slice(0, 10);
        if (start) out.push(start);
      }
    }
    return { dates: out };
  } catch (e: unknown) {
    return { dates: [], error: e instanceof Error ? e.message : String(e) };
  }
}

// Alle maandmeeting-datums rond vandaag (vorige t/m over twee maanden).
async function monthlySchedule(p: AmsParts, cal?: CalendarRead): Promise<MonthlySchedule> {
  const today = dateOnly(p.year, p.month, p.day);
  // Since 29-09-2026 the Google Calendar is the schedule (src/lib/meetingCalendar.ts). Only when it
  // has not synced recently do we fall back to the Notion records + first-Tuesday rule below.
  if (cal?.fresh) {
    const mmm = cal.meetings.filter((m) => m.type === "MMM");
    const times: Record<string, string> = {};
    for (const m of mmm) times[m.date] = m.time;
    const dates = mmm.map((m) => {
      const [y, mo, d] = m.date.split("-").map(Number);
      return { y, m: mo, d };
    });
    return { dates, source: "calendar", records: [], times };
  }
  const rules: Ymd[] = [-1, 0, 1, 2].map((n) => {
    const a = addMonths(p.year, p.month, n);
    return firstTuesday(a.y, a.m);
  });
  const from = ymdIso(ymdFromMs(today - 45 * 86_400_000));
  const to = ymdIso(ymdFromMs(today + 75 * 86_400_000));
  const rec = await fetchMonthlyRecords(from, to);
  if (rec.error) return { dates: rules, source: "rule", records: [], error: rec.error };
  const recMs = rec.dates.map((iso) => Date.parse(`${iso}T12:00:00Z`));
  const free = rules.filter((r) => !recMs.some((ms) => Math.abs(diffDays(ms, dateOnly(r.y, r.m, r.d))) < 15));
  const all = new Map<string, Ymd>();
  for (const ms of recMs) { const x = ymdFromMs(ms); all.set(ymdIso(x), x); }
  for (const r of free) all.set(ymdIso(r), r);
  const dates = [...all.values()].sort((a, b) => dateOnly(a.y, a.m, a.d) - dateOnly(b.y, b.m, b.d));
  return { dates, source: "notion", records: rec.dates };
}

// De "dag ervoor"-mail gaat op de laatste werkdag vóór de meeting (MMM op maandag → vrijdag).
function workdayBefore(ms: number): number {
  let t = ms - 86_400_000;
  while ([0, 6].includes(new Date(t).getUTCDay())) t -= 86_400_000;
  return t;
}

// Valt vandaag op het gevraagde moment t.o.v. een maandmeeting?
//   "week"  = precies 7 dagen ervoor, "day" = laatste werkdag ervoor, "after" = de dag erna.
function mmmMoment(s: MonthlySchedule, p: AmsParts, moment: "week" | "day" | "after"): Ymd | null {
  const today = dateOnly(p.year, p.month, p.day);
  for (const c of s.dates) {
    const ms = dateOnly(c.y, c.m, c.d);
    if (moment === "week" && diffDays(today, ms) === 7) return c;
    if (moment === "day" && workdayBefore(ms) === today) return c;
    if (moment === "after" && diffDays(today, ms) === -1) return c;
  }
  return null;
}

// Eerstvolgende maandmeeting vanaf vandaag (voor de test-override).
function nextMonthly(s: MonthlySchedule, p: AmsParts): Ymd {
  const today = dateOnly(p.year, p.month, p.day);
  const n = s.dates.find((c) => dateOnly(c.y, c.m, c.d) >= today);
  if (n) return n;
  const a = addMonths(p.year, p.month, 1);
  return firstTuesday(a.y, a.m);
}

function fmtDate(y: number, m: number, d: number): string {
  // bv. "Tuesday 1 September 2026"
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(dateOnly(y, m, d)));
}

// ---- Mailinhoud (Engels) --------------------------------------------------
function preMMMMMail(agenda: { html: string; text: string }): Mail {
  const subject = "Before Monday's MMMM — update your to-do's";
  const text =
    "Hi team,\n\n" +
    "The weekly meeting (MMMM) is on Monday morning. Please take a few minutes to go " +
    "through your Mima to-do's in Notion: tick off or dismiss the ones that are already " +
    "done, and update the status of the rest. That way we start Monday with a clean, " +
    "up-to-date list." +
    agenda.text +
    tasksLink() +
    "\n\nThanks!";
  const html = renderEmail({
    eyebrow: "Weekly meeting &middot; MMMM",
    heading: "Update your to-do&rsquo;s before Monday",
    paragraphs: [
      "The weekly meeting (<strong>MMMM</strong>) is on Monday morning. Please take a few " +
        "minutes to go through your Mima to-do&rsquo;s in Notion: tick off or dismiss the ones " +
        "that are already done, and update the status of the rest.",
      "That way we start Monday with a clean, up-to-date list.",
      agenda.html,
    ],
    buttonLabel: BTN_LABEL,
    buttonUrl: TASKS_DB_URL,
  });
  return { to: TEAM, subject, text, html };
}

function preMMMWeekMail(mmm: { y: number; m: number; d: number }, agenda: { html: string; text: string }, time = "09:00"): Mail {
  const when = fmtDate(mmm.y, mmm.m, mmm.d);
  const subject = "Monthly Mima Meeting in a week — update your data & prepare";
  const text =
    "Hi team,\n\n" +
    `The monthly tactical meeting (MMM) is one week from today, on ${when} at ${time}. ` +
    "Time to start preparing: please update your numbers and data and get your domain " +
    "updates ready so we can make good tactical decisions." +
    agenda.text +
    tasksLink() +
    "\n\nThanks!";
  const html = renderEmail({
    eyebrow: "Monthly meeting &middot; MMM",
    heading: "Monthly meeting in a week",
    paragraphs: [
      `The monthly tactical meeting (<strong>MMM</strong>) is one week from today, on ` +
        `<strong>${when}</strong> at ${time}.`,
      "Time to start preparing: please update your numbers and data and get your domain " +
        "updates ready so we can make good tactical decisions.",
      agenda.html,
    ],
    buttonLabel: BTN_LABEL,
    buttonUrl: TASKS_DB_URL,
  });
  return { to: TEAM, subject, text, html };
}

function preMMMDayMail(mmm: { y: number; m: number; d: number }, agenda: { html: string; text: string }, today?: AmsParts, time = "09:00"): Mail {
  const when = fmtDate(mmm.y, mmm.m, mmm.d);
  // Normaal "tomorrow"; valt de meeting op maandag, dan gaat deze mail vrijdag uit.
  const gap = today ? diffDays(dateOnly(today.year, today.month, today.day), dateOnly(mmm.y, mmm.m, mmm.d)) : 1;
  const tomorrow = gap <= 1;
  const whenWord = tomorrow ? "tomorrow" : "on " + when.split(" ")[0];
  const subject = tomorrow
    ? "Monthly Mima Meeting tomorrow — final data check"
    : `Monthly Mima Meeting ${whenWord} — final data check`;
  const text =
    "Hi team,\n\n" +
    `Reminder: the monthly tactical meeting (MMM) is ${whenWord}, ${when} at ${time}. ` +
    "Please make sure your numbers and data are up to date and your domain updates are " +
    "ready, so we can dive straight in." +
    agenda.text +
    tasksLink() +
    "\n\nThanks!";
  const html = renderEmail({
    eyebrow: "Monthly meeting &middot; MMM",
    heading: tomorrow ? "Monthly meeting tomorrow" : `Monthly meeting ${whenWord}`,
    paragraphs: [
      `Reminder: the monthly tactical meeting (<strong>MMM</strong>) is <strong>${whenWord}</strong>, ` +
        `${when} at ${time}.`,
      "Please make sure your numbers and data are up to date and your domain updates are " +
        "ready, so we can dive straight in.",
      agenda.html,
    ],
    buttonLabel: BTN_LABEL,
    buttonUrl: TASKS_DB_URL,
  });
  return { to: TEAM, subject, text, html };
}


// ---- Agenda items (Notion "Agenda items"-database) ---------------------------
// Sinds 16-09-2026 landen gespreksonderwerpen in een aparte Agenda items-DB
// (Meeting type MMMM/MMM/QMM, Status Proposed/Scheduled/...). De pre-meeting-mails
// tonen de open punten voor de betreffende meeting, zodat iedereen weet wat er komt.
// Best-effort: faalt de query (geen toegang, DB verplaatst), dan gaat de mail zonder
// agenda-blok uit en staat de fout in de response (`agenda.error`).
const NOTION_VERSION = "2022-06-28";
const AGENDA_DB_ID = process.env.AGENDA_DB_ID ?? "b73a458189e2484fb5383098404e320e";
const AGENDA_DB_URL =
  process.env.AGENDA_DB_URL ?? `https://www.notion.so/${AGENDA_DB_ID.replace(/-/g, "")}`;

type AgendaItem = { topic: string; ask: string; raisedBy: string; minutes: number | null; url: string };
type AgendaFetch = { ok: boolean; items: AgendaItem[]; error?: string };

async function fetchAgenda(meetingType: "MMMM" | "MMM" | "QMM"): Promise<AgendaFetch> {
  const token = process.env.NOTION_TOKEN;
  if (!token) return { ok: false, items: [], error: "NOTION_TOKEN missing" };
  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${AGENDA_DB_ID}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filter: {
          and: [
            { property: "Meeting type", select: { equals: meetingType } },
            {
              or: [
                { property: "Status", select: { equals: "Scheduled" } },
                { property: "Status", select: { equals: "Proposed" } },
              ],
            },
          ],
        },
        sorts: [
          { property: "Status", direction: "descending" }, // Scheduled vóór Proposed
          { property: "Created", direction: "ascending" },
        ],
        page_size: 25,
      }),
    });
    if (!res.ok) return { ok: false, items: [], error: `${res.status} ${await res.text()}` };
    type NotionAgendaRow = {
      url: string;
      properties: {
        Topic?: { title?: Array<{ plain_text: string }> };
        Ask?: { select?: { name?: string } | null };
        "Time needed (min)"?: { number?: number | null };
      };
    };
    const data = (await res.json()) as { results: NotionAgendaRow[] };
    const items: AgendaItem[] = data.results.map((r) => {
      const pr = r.properties ?? {};
      const topic = (pr["Topic"]?.title ?? []).map((t) => t.plain_text).join("") || "(untitled)";
      const ask = pr["Ask"]?.select?.name ?? "";
      const minutes = typeof pr["Time needed (min)"]?.number === "number" ? pr["Time needed (min)"].number : null;
      // Raised by is een relatie; namen ophalen kost extra calls — we tonen de relatie
      // niet in de mail. (Wel beschikbaar in Notion zelf.)
      return { topic, ask, raisedBy: "", minutes, url: r.url };
    });
    return { ok: true, items };
  } catch (e: unknown) {
    return { ok: false, items: [], error: e instanceof Error ? e.message : String(e) };
  }
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Agenda-blok voor in de mail (html-paragraaf + platte tekst).
function agendaBlock(meetingType: "MMMM" | "MMM" | "QMM", a: AgendaFetch): { html: string; text: string } {
  if (!a.ok || a.items.length === 0) {
    return {
      html:
        `<strong>Agenda:</strong> nothing on the list yet. Got something to discuss? ` +
        `<a href="${AGENDA_DB_URL}">Add it to the agenda</a> or ask Claude to put it on the agenda.`,
      text: `\n\nAgenda: nothing on the list yet. Add topics here: ${AGENDA_DB_URL}`,
    };
  }
  const line = (i: AgendaItem) =>
    `${i.topic}${i.ask ? ` (${i.ask.toLowerCase()}` + (i.minutes ? `, ${i.minutes} min)` : ")") : i.minutes ? ` (${i.minutes} min)` : ""}`;
  const html =
    `<strong>On the agenda for this ${meetingType}:</strong><br>` +
    a.items.map((i) => `&bull; <a href="${i.url}">${esc(line(i))}</a>`).join("<br>") +
    `<br><a href="${AGENDA_DB_URL}">Add a topic</a>`;
  const text =
    `\n\nOn the agenda for this ${meetingType}:\n` +
    a.items.map((i) => `- ${line(i)}`).join("\n") +
    `\nAdd a topic: ${AGENDA_DB_URL}`;
  return { html, text };
}

// ---- Sync Log-check (is de meeting daadwerkelijk verwerkt?) -----------------
// De post-meeting-mails gingen tot 09-2026 blind uit ("MMMM is verwerkt"), ook als de
// pijplijn stil was uitgevallen. Nu: eerst in de Plaud Sync Log kijken. Niets gevonden
// => geen team-mail maar een alarm naar Marc. Zo is stilte nooit meer "ok".
const SYNC_LOG_DB_ID = "38821d9d-7c6a-819c-87fb-c10b6a969483";

type ProcessedCheck = { checked: boolean; count: number; tasks: number; error?: string };

async function processedSince(
  typeLabel: "Weekly" | "Monthly" | "Quarterly",
  sinceIso: string,
): Promise<ProcessedCheck> {
  const token = process.env.NOTION_TOKEN;
  if (!token) return { checked: false, count: 0, tasks: 0, error: "NOTION_TOKEN missing" };
  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${SYNC_LOG_DB_ID}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filter: {
          and: [
            { property: "Status", select: { equals: "Done" } },
            { property: "Processed at", date: { on_or_after: sinceIso } },
            {
              or: [
                { property: "Meeting type", select: { equals: typeLabel } },
                // legacy-rijen (vóór 09-2026) hebben geen Meeting type; alleen relevant
                // voor Weekly, want die waren het overgrote deel.
                ...(typeLabel === "Weekly" ? [{ property: "Meeting type", select: { is_empty: true } }] : []),
              ],
            },
          ],
        },
        page_size: 20,
      }),
    });
    if (!res.ok) return { checked: false, count: 0, tasks: 0, error: `${res.status} ${await res.text()}` };
    const data = (await res.json()) as { results: Array<{ properties: Record<string, any> }> };
    const tasks = data.results.reduce((n, r) => n + (r.properties?.["Tasks created"]?.number ?? 0), 0);
    return { checked: true, count: data.results.length, tasks };
  } catch (e: unknown) {
    return { checked: false, count: 0, tasks: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

// Alarm naar Marc (Nederlands: alleen hij leest dit).
function notProcessedMail(kind: "MMMM" | "MMM", check: ProcessedCheck): Mail {
  const subject = `⚠️ Geen ${kind} verwerkt — pijplijn controleren`;
  const text =
    `De ${kind} van deze ${kind === "MMMM" ? "week" : "maand"} staat NIET als Done in de Plaud Sync Log` +
    (check.checked ? "." : ` (check zelf mislukt: ${check.error}).`) +
    "\n\nHet team heeft dus ook geen 'review your Drafts for review'-mail gekregen (die stuurt de webhook pas na verwerking).\n\n" +
    "Mogelijke oorzaken: opname niet gemaakt of niet gesynct, AutoFlow niet gevuurd, watchdog nog niet gedraaid, " +
    "of een Failed/Ignored-rij in de Sync Log.\n\n" +
    "Herstel: vraag Claude 'draai de Plaud-watchdog' (die haalt de opname op via de Plaud-MCP en biedt hem opnieuw aan), " +
    "of controleer de Sync Log: https://www.notion.so/38821d9d7c6a819c87fbc10b6a969483";
  const html = renderEmail({
    eyebrow: `Pijplijn-alarm &middot; ${kind}`,
    heading: `Geen ${kind} verwerkt`,
    paragraphs: [
      `De <strong>${kind}</strong> van deze ${kind === "MMMM" ? "week" : "maand"} staat niet als Done in de Plaud Sync Log` +
        (check.checked ? "." : ` (check zelf mislukt: ${check.error}).`),
      "Het team heeft dus ook geen &ldquo;review your Drafts for review&rdquo;-mail gekregen (die stuurt de webhook pas na verwerking).",
      "Herstel: vraag Claude &ldquo;draai de Plaud-watchdog&rdquo;, of controleer de Sync Log.",
    ],
    buttonLabel: "Open de Plaud Sync Log",
    buttonUrl: "https://www.notion.so/38821d9d7c6a819c87fbc10b6a969483",
  });
  return { to: [MARC], subject, text, html };
}

// ---- Handler --------------------------------------------------------------
// Vercel Cron roept dit als GET aan en stuurt (als CRON_SECRET is gezet) automatisch
// de header `Authorization: Bearer <CRON_SECRET>` mee. Handmatig testen kan met
// ?secret=<CRON_SECRET> in de URL.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const url = new URL(req.url);
  const querySecret = url.searchParams.get("secret");
  const authorized =
    !!secret && (auth === `Bearer ${secret}` || querySecret === secret);
  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const p = amsterdamParts(new Date());
  const todayIso = ymdIso({ y: p.year, m: p.month, d: p.day });
  const cal = await readCalendar(
    ymdIso(ymdFromMs(dateOnly(p.year, p.month, p.day) - 45 * 86_400_000)),
    ymdIso(ymdFromMs(dateOnly(p.year, p.month, p.day) + 75 * 86_400_000)),
  );
  const timeOf = (s: MonthlySchedule, c: Ymd) => s.times?.[ymdIso(c)] ?? "09:00";
  // MMMM within the next/previous n days according to the calendar (only meaningful when cal.fresh).
  const mmmmWithin = (fromDays: number, toDays: number) =>
    cal.meetings.some((m) => {
      if (m.type !== "MMMM") return false;
      const diff = diffDays(dateOnly(p.year, p.month, p.day), Date.parse(`${m.date}T12:00:00Z`));
      return diff >= fromDays && diff <= toDays;
    });

  // test-override: forceert één specifieke mail, ongeacht de datum. Handig om de
  // verzending / deliverability te verifiëren zonder op de juiste dag te wachten.
  // bv. ?secret=...&test=preMMMM  (waarden: preMMMM | postMMMM | preMMM)
  const test = url.searchParams.get("test");
  if (test) {
    let mail: Mail | null = null;
    if (test === "preMMMM") mail = preMMMMMail(agendaBlock("MMMM", await fetchAgenda("MMMM")));
    else if (test === "postMMMM") mail = draftsReviewMail("MMMM", 0);
    else if (test === "preMMMweek") {
      const s = await monthlySchedule(p, cal);
      const c = nextMonthly(s, p);
      mail = preMMMWeekMail(c, agendaBlock("MMM", await fetchAgenda("MMM")), timeOf(s, c));
    } else if (test === "preMMMday") {
      const s = await monthlySchedule(p, cal);
      const c = nextMonthly(s, p);
      mail = preMMMDayMail(c, agendaBlock("MMM", await fetchAgenda("MMM")), p, timeOf(s, c));
    }
    else if (test === "managerHomework") {
      // Test: alle manager-mails naar Marc, niet naar de managers.
      const h = await managerHomeworkMails([MARC]);
      const out = [];
      for (const m of h.mails) out.push({ name: m.name, ...(await sendMail(m.mail)) });
      return NextResponse.json({ ok: !h.error && out.every((o) => o.ok), test, sent: out, error: h.error });
    }
    if (!mail) {
      return NextResponse.json(
        { error: "unknown test value (use preMMMM | postMMMM | preMMMweek | preMMMday | managerHomework)" },
        { status: 400 },
      );
    }
    const r = await sendMail(mail);
    return NextResponse.json({ ok: r.ok, test, to: mail.to, error: r.error });
  }

  // slot: "morning" | "afternoon" | null (null = alle regels evalueren, handig bij test)
  const slot = url.searchParams.get("slot");
  const slotAllows = (s: string) => !slot || slot === s;

  const due: { name: string; mail: Mail }[] = [];
  const agendaErrors: Record<string, string> = {};
  const agendaFor = async (t: "MMMM" | "MMM" | "QMM") => {
    const a = await fetchAgenda(t);
    if (!a.ok && a.error) agendaErrors[t] = a.error;
    return agendaBlock(t, a);
  };

  const skippedByCalendar: string[] = [];
  // 1. pre-MMMM — vrijdag (5), middag-slot. Met een verse agenda alleen als er de komende 4 dagen
  //    echt een MMMM staat (vakantie of geschrapte meeting → geen mail).
  const mmmmAhead = !cal.fresh || mmmmWithin(1, 4);
  if (p.weekday === 5 && slotAllows("afternoon") && !mmmmAhead) skippedByCalendar.push("pre-MMMM: no MMMM in the calendar in the next 4 days");
  if (p.weekday === 5 && slotAllows("afternoon") && mmmmAhead) {
    due.push({ name: "pre-MMMM", mail: preMMMMMail(await agendaFor("MMMM")) });
  }
  // 2. post-MMMM — dinsdag (2), ochtend-slot: ALLEEN VANGNET. De team-mail zelf
  //    ("review your Drafts for review") stuurt de Plaud-webhook zodra de taken er
  //    staan. Staat er na het weekend geen verwerkte MMMM in de Sync Log → alarm Marc.
  const mmmmBehind = !cal.fresh || mmmmWithin(-3, -1);
  if (p.weekday === 2 && slotAllows("morning") && !mmmmBehind) skippedByCalendar.push("post-MMMM check: no MMMM in the calendar in the last 3 days");
  if (p.weekday === 2 && slotAllows("morning") && mmmmBehind) {
    const check = await processedSince("Weekly", isoDaysAgo(6));
    if (!(check.checked && check.count > 0)) {
      due.push({ name: "post-MMMM-NOT-PROCESSED", mail: notProcessedMail("MMMM", check) });
    }
  }
  // Maandplanning uit de Notion meeting-records (vaste regel alleen als vulling).
  const monthly = await monthlySchedule(p, cal);
  if (!cal.fresh) agendaErrors["calendar"] = `calendar not synced recently (${cal.syncedAt ?? "never"}${cal.error ? `, ${cal.error}` : ""}); using fallback`;
  if (monthly.error) agendaErrors["monthlySchedule"] = `fell back to first-Tuesday rule: ${monthly.error}`;

  // 2b. post-MMM — de dag na de maandmeeting, ochtend-slot: alleen een controle;
  //     bij ontbreken alarm naar Marc.
  if (mmmMoment(monthly, p, "after") && slotAllows("morning")) {
    const check = await processedSince("Monthly", isoDaysAgo(6));
    if (!(check.checked && check.count > 0)) {
      due.push({ name: "post-MMM-NOT-PROCESSED", mail: notProcessedMail("MMM", check) });
    }
  }
  // 3a. pre-MMM (week) — 7 dagen vóór de maandmeeting, ochtend-slot
  const mmmWeek = mmmMoment(monthly, p, "week");
  if (mmmWeek && slotAllows("morning")) {
    due.push({ name: "pre-MMM-week", mail: preMMMWeekMail(mmmWeek, await agendaFor("MMM"), timeOf(monthly, mmmWeek)) });
  }
  // 3b. pre-MMM (dag) — laatste werkdag vóór de maandmeeting, ochtend-slot
  const mmmDay = mmmMoment(monthly, p, "day");
  if (mmmDay && slotAllows("morning")) {
    due.push({ name: "pre-MMM-day", mail: preMMMDayMail(mmmDay, await agendaFor("MMM"), p, timeOf(monthly, mmmDay)) });
  }

  // 4. manager-homework — donderdag (4), ochtend-slot: huiswerk uit de maandag-check-in.
  if (p.weekday === 4 && slotAllows("morning")) {
    const h = await managerHomeworkMails();
    if (h.error) agendaErrors["managerHomework"] = h.error;
    due.push(...h.mails);
  }

  const results: { name: string; to: string[]; ok: boolean; error?: string }[] = [];
  for (const item of due) {
    const r = await sendMail(item.mail);
    results.push({ name: item.name, to: item.mail.to, ok: r.ok, error: r.error });
  }

  return NextResponse.json({
    ok: results.every((r) => r.ok),
    date: `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`,
    weekday: p.weekday,
    slot: slot ?? "all",
    sent: results,
    today: todayIso,
    calendar: { fresh: cal.fresh, syncedAt: cal.syncedAt, meetings: cal.meetings.length, skipped: skippedByCalendar },
    monthly: { source: monthly.source, dates: monthly.dates.map(ymdIso) },
    agenda: { errors: agendaErrors },
  });
}
