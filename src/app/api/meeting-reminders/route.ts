import { NextResponse } from "next/server";

// Meeting-reminders cron-endpoint.
// Stuurt de wekelijkse/maandelijkse voorbereidings-mails die aan de Mima-meetings
// vastzitten. Wordt door Vercel Cron dagelijks aangeroepen; alle datum-logica zit
// server-side (Europe/Amsterdam), zodat er geen losse scheduler of connector nodig is.
//
// Drie reminders:
//   1. pre-MMMM   — elke VRIJDAG (middag): team werkt hun MMMM to-do's bij / klikt
//                   afgeronde weg, vóór de weekly meeting op maandag.
//   2. post-MMMM  — elke DINSDAG (ochtend): de verwerkte "Drafts for review" nalopen
//                   en waar nodig aanpassen (de MMMM is maandag; pipeline verwerkt ma.).
//   3. pre-MMM    — TWEE momenten vóór de MMM (eerste DINSDAG v/d maand): een week
//                   ervoor (de vorige dinsdag) én een dag ervoor (de maandag). Team
//                   updatet data en bereidt zaken voor.
//
// Verzending gaat via Resend (zelfde conventie als plaud-webhook: RESEND_API_KEY +
// FROM_EMAIL). Alle mail is Engelstalig — Hadi (Operations) leest mee, dus alles waar
// hij bij betrokken is is Engels.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---- Ontvangers -----------------------------------------------------------
const MARC = "marc@mimafood.nl";
const MICHIEL = "michiel@mimafood.nl";
const HADI = "abdulhadi@mimafood.nl";

const TEAM = [MARC, MICHIEL, HADI];

// De post-MMMM "Drafts for review"-reminder gaat standaard naar het hele team (elke
// owner loopt zijn eigen drafts na). Zet dit op [MARC] als alleen Marc cureert.
const DRAFTS_REVIEW_RECIPIENTS = TEAM;

// Optionele Notion-links in de mail (leeg laten = geen link tonen).
const TASKS_DB_URL =
  process.env.TASKS_DB_URL ??
  "https://www.notion.so/35e21d9d7c6a800f8921db421d9eee94";

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
type Mail = { to: string[]; subject: string; text: string; html: string };

// Merk-kleuren — accent is makkelijk te wijzigen (Mediterrane groen).
const C_ACCENT = "#2f7a57";
const C_INK = "#1f1d1a";
const C_BODY = "#4a4640";
const C_MUTED = "#9a948c";
const C_LINE = "#e7e2da";
const C_PAPER = "#f4f2ee";
const C_CARD = "#ffffff";
const BTN_LABEL = "Open your tasks in Notion";
const EMAIL_FOOTER =
  "You're receiving this because you're part of the Mima management team. " +
  "It's an automated reminder tied to the meeting schedule.";

function tasksLink(): string {
  return TASKS_DB_URL ? `\n\nYour tasks: ${TASKS_DB_URL}` : "";
}

// Gedeelde, e-mailclient-vriendelijke opmaak: inline styles, table-layout,
// bulletproof button. Alle vier de reminders gebruiken dezelfde kaart.
function renderEmail(opts: {
  eyebrow: string;
  heading: string;
  paragraphs: string[];
  buttonLabel?: string;
  buttonUrl?: string;
}): string {
  const paras = opts.paragraphs
    .map((p) => `<p style="margin:14px 0 0 0;">${p}</p>`)
    .join("");
  const button =
    opts.buttonUrl && opts.buttonLabel
      ? `<table role="presentation" cellpadding="0" cellspacing="0"><tr>` +
        `<td style="border-radius:8px;background:${C_ACCENT};">` +
        `<a href="${opts.buttonUrl}" style="display:inline-block;padding:12px 22px;` +
        `font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;` +
        `color:#ffffff;text-decoration:none;border-radius:8px;">${opts.buttonLabel} &rarr;</a>` +
        `</td></tr></table>`
      : "";
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C_PAPER};padding:28px 12px;">` +
    `<tr><td align="center">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${C_CARD};border:1px solid ${C_LINE};border-radius:14px;">` +
    `<tr><td style="padding:26px 36px 0 36px;">` +
    `<div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;letter-spacing:1px;color:${C_ACCENT};font-weight:700;">mima</div>` +
    `<div style="height:1px;background:${C_LINE};margin:18px 0 0 0;"></div>` +
    `</td></tr>` +
    `<tr><td style="padding:22px 36px 0 36px;">` +
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${C_ACCENT};font-weight:700;">${opts.eyebrow}</div>` +
    `<h1 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.3;color:${C_INK};margin:10px 0 0 0;font-weight:700;">${opts.heading}</h1>` +
    `</td></tr>` +
    `<tr><td style="padding:2px 36px 0 36px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:${C_BODY};">${paras}</td></tr>` +
    `<tr><td style="padding:24px 36px 4px 36px;">${button}</td></tr>` +
    `<tr><td style="padding:26px 36px 28px 36px;">` +
    `<div style="height:1px;background:${C_LINE};margin-bottom:16px;"></div>` +
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:${C_MUTED};">${EMAIL_FOOTER}</div>` +
    `</td></tr>` +
    `</table></td></tr></table>`
  );
}

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

function postMMMMMail(): Mail {
  const subject = "MMMM processed — review your Drafts for review";
  const text =
    "Hi team,\n\n" +
    "Monday's weekly meeting (MMMM) has been processed into Notion. New to-do's and " +
    "decisions are in as \"Drafts for review\". Please open your tasks, check the items " +
    "assigned to you, and adjust owner, domain, priority or deadline where needed — then " +
    "they're confirmed." +
    tasksLink() +
    "\n\nThanks!";
  const html = renderEmail({
    eyebrow: "Weekly meeting &middot; MMMM",
    heading: "Review your &ldquo;Drafts for review&rdquo;",
    paragraphs: [
      "Monday&rsquo;s weekly meeting (<strong>MMMM</strong>) has been processed into Notion. " +
        "New to-do&rsquo;s and decisions are in as <strong>&ldquo;Drafts for review&rdquo;</strong>.",
      "Please open your tasks, check the items assigned to you, and adjust owner, domain, " +
        "priority or deadline where needed &mdash; then they&rsquo;re confirmed.",
    ],
    buttonLabel: BTN_LABEL,
    buttonUrl: TASKS_DB_URL,
  });
  return { to: DRAFTS_REVIEW_RECIPIENTS, subject, text, html };
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

// ---- Resend ---------------------------------------------------------------
async function sendMail(m: Mail): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY missing" };
  const from = process.env.FROM_EMAIL ?? "bestelling@mimafood.nl";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from, to: m.to, subject: m.subject, text: m.text, html: m.html }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      return { ok: false, error: `${res.status} ${err}` };
    }
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
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
    else if (test === "postMMMM") mail = postMMMMMail();
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
  // 2. post-MMMM — dinsdag (2), ochtend-slot
  if (p.weekday === 2 && slotAllows("morning")) {
    due.push({ name: "post-MMMM", mail: postMMMMMail() });
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
