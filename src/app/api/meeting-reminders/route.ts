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
//   3. pre-MMM    — TWEE momenten vóór de MMM (eerste DINSDAG v/d maand): een week
//                   ervoor (de vorige dinsdag) én een dag ervoor (de maandag). Team
//                   updatet data en bereidt zaken voor.
//
// Verzending gaat via Resend (zelfde conventie als plaud-webhook: RESEND_API_KEY +
// FROM_EMAIL). Alle team-mail is Engelstalig — Hadi (Operations) leest mee.
// Opmaak, ontvangers en verzending: src/lib/meetingEmails.ts (gedeeld met de webhook).

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

// Valt vandaag exact `daysBefore` dagen vóór een eerste-dinsdag-MMM?
// We kijken naar de eerste dinsdag van deze én de volgende maand (jaar-overgang mee).
// Gebruikt voor twee momenten: een week ervoor (7) en een dag ervoor (1).
function mmmDaysAway(p: AmsParts, daysBefore: number): { y: number; m: number; d: number } | null {
  const today = dateOnly(p.year, p.month, p.day);
  const nextMonth = p.month === 12 ? 1 : p.month + 1;
  const nextYear = p.month === 12 ? p.year + 1 : p.year;
  const candidates = [firstTuesday(p.year, p.month), firstTuesday(nextYear, nextMonth)];
  for (const c of candidates) {
    if (diffDays(today, dateOnly(c.y, c.m, c.d)) === daysBefore) return c;
  }
  return null;
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
function preMMMMMail(): Mail {
  const subject = "Before Monday's MMMM — update your to-do's";
  const text =
    "Hi team,\n\n" +
    "The weekly meeting (MMMM) is on Monday morning. Please take a few minutes to go " +
    "through your Mima to-do's in Notion: tick off or dismiss the ones that are already " +
    "done, and update the status of the rest. That way we start Monday with a clean, " +
    "up-to-date list." +
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
    ],
    buttonLabel: BTN_LABEL,
    buttonUrl: TASKS_DB_URL,
  });
  return { to: TEAM, subject, text, html };
}

function preMMMWeekMail(mmm: { y: number; m: number; d: number }): Mail {
  const when = fmtDate(mmm.y, mmm.m, mmm.d);
  const subject = "Monthly Mima Meeting in a week — update your data & prepare";
  const text =
    "Hi team,\n\n" +
    `The monthly tactical meeting (MMM) is one week from today, on ${when} at 09:00. ` +
    "Time to start preparing: please update your numbers and data and get your domain " +
    "updates ready so we can make good tactical decisions." +
    tasksLink() +
    "\n\nThanks!";
  const html = renderEmail({
    eyebrow: "Monthly meeting &middot; MMM",
    heading: "Monthly meeting in a week",
    paragraphs: [
      `The monthly tactical meeting (<strong>MMM</strong>) is one week from today, on ` +
        `<strong>${when}</strong> at 09:00.`,
      "Time to start preparing: please update your numbers and data and get your domain " +
        "updates ready so we can make good tactical decisions.",
    ],
    buttonLabel: BTN_LABEL,
    buttonUrl: TASKS_DB_URL,
  });
  return { to: TEAM, subject, text, html };
}

function preMMMDayMail(mmm: { y: number; m: number; d: number }): Mail {
  const when = fmtDate(mmm.y, mmm.m, mmm.d);
  const subject = "Monthly Mima Meeting tomorrow — final data check";
  const text =
    "Hi team,\n\n" +
    `Reminder: the monthly tactical meeting (MMM) is tomorrow, ${when} at 09:00. ` +
    "Please make sure your numbers and data are up to date and your domain updates are " +
    "ready, so we can dive straight in." +
    tasksLink() +
    "\n\nThanks!";
  const html = renderEmail({
    eyebrow: "Monthly meeting &middot; MMM",
    heading: "Monthly meeting tomorrow",
    paragraphs: [
      `Reminder: the monthly tactical meeting (<strong>MMM</strong>) is <strong>tomorrow</strong>, ` +
        `${when} at 09:00.`,
      "Please make sure your numbers and data are up to date and your domain updates are " +
        "ready, so we can dive straight in.",
    ],
    buttonLabel: BTN_LABEL,
    buttonUrl: TASKS_DB_URL,
  });
  return { to: TEAM, subject, text, html };
}


// ---- Sync Log-check (is de meeting daadwerkelijk verwerkt?) -----------------
// De post-meeting-mails gingen tot 09-2026 blind uit ("MMMM is verwerkt"), ook als de
// pijplijn stil was uitgevallen. Nu: eerst in de Plaud Sync Log kijken. Niets gevonden
// => geen team-mail maar een alarm naar Marc. Zo is stilte nooit meer "ok".
const SYNC_LOG_DB_ID = "38821d9d-7c6a-819c-87fb-c10b6a969483";
const NOTION_VERSION = "2022-06-28";

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

  // test-override: forceert één specifieke mail, ongeacht de datum. Handig om de
  // verzending / deliverability te verifiëren zonder op de juiste dag te wachten.
  // bv. ?secret=...&test=preMMMM  (waarden: preMMMM | postMMMM | preMMM)
  const test = url.searchParams.get("test");
  if (test) {
    let mail: Mail | null = null;
    if (test === "preMMMM") mail = preMMMMMail();
    else if (test === "postMMMM") mail = draftsReviewMail("MMMM", 0);
    else if (test === "preMMMweek") {
      const c = mmmDaysAway(p, 7) ?? firstTuesday(
        p.month === 12 ? p.year + 1 : p.year,
        p.month === 12 ? 1 : p.month + 1,
      );
      mail = preMMMWeekMail(c);
    } else if (test === "preMMMday") {
      const c = mmmDaysAway(p, 1) ?? firstTuesday(
        p.month === 12 ? p.year + 1 : p.year,
        p.month === 12 ? 1 : p.month + 1,
      );
      mail = preMMMDayMail(c);
    }
    if (!mail) {
      return NextResponse.json(
        { error: "unknown test value (use preMMMM | postMMMM | preMMMweek | preMMMday)" },
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

  // 1. pre-MMMM — vrijdag (5), middag-slot
  if (p.weekday === 5 && slotAllows("afternoon")) {
    due.push({ name: "pre-MMMM", mail: preMMMMMail() });
  }
  // 2. post-MMMM — dinsdag (2), ochtend-slot: ALLEEN VANGNET. De team-mail zelf
  //    ("review your Drafts for review") stuurt de Plaud-webhook zodra de taken er
  //    staan. Staat er na het weekend geen verwerkte MMMM in de Sync Log → alarm Marc.
  if (p.weekday === 2 && slotAllows("morning")) {
    const check = await processedSince("Weekly", isoDaysAgo(6));
    if (!(check.checked && check.count > 0)) {
      due.push({ name: "post-MMMM-NOT-PROCESSED", mail: notProcessedMail("MMMM", check) });
    }
  }
  // 2b. post-MMM — de dag na de eerste-dinsdag-MMM (woensdag), ochtend-slot: alleen
  //     een controle; bij ontbreken alarm naar Marc.
  if (mmmDaysAway(p, -1) && slotAllows("morning")) {
    const check = await processedSince("Monthly", isoDaysAgo(6));
    if (!(check.checked && check.count > 0)) {
      due.push({ name: "post-MMM-NOT-PROCESSED", mail: notProcessedMail("MMM", check) });
    }
  }
  // 3a. pre-MMM (week) — 7 dagen vóór de eerste-dinsdag-MMM, ochtend-slot
  const mmmWeek = mmmDaysAway(p, 7);
  if (mmmWeek && slotAllows("morning")) {
    due.push({ name: "pre-MMM-week", mail: preMMMWeekMail(mmmWeek) });
  }
  // 3b. pre-MMM (dag) — 1 dag vóór de eerste-dinsdag-MMM, ochtend-slot
  const mmmDay = mmmDaysAway(p, 1);
  if (mmmDay && slotAllows("morning")) {
    due.push({ name: "pre-MMM-day", mail: preMMMDayMail(mmmDay) });
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
  });
}
