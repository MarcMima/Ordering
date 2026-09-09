// Gedeelde e-mailopmaak + verzending voor de Mima-meeting-mails.
//
// Gebruikt door:
//  - /api/meeting-reminders (cron: pre-MMMM, pre-MMM week/dag, pijplijn-alarmen)
//  - /api/plaud-webhook     (event: "review your Drafts for review" zodra de taken
//                            daadwerkelijk in Notion staan)
//
// Alle team-mail is Engelstalig — Hadi (Operations) leest mee.

// ---- Ontvangers -----------------------------------------------------------
export const MARC = "marc@mimafood.nl";
export const MICHIEL = "michiel@mimafood.nl";
export const HADI = "abdulhadi@mimafood.nl";
export const TEAM = [MARC, MICHIEL, HADI];

// De "Drafts for review"-mail gaat standaard naar het hele team (elke owner loopt zijn
// eigen drafts na). Zet dit op [MARC] als alleen Marc cureert.
export const DRAFTS_REVIEW_RECIPIENTS = TEAM;

// Notion-link in de mails (Vercel-env TASKS_DB_URL; leeg = geen link tonen).
export const TASKS_DB_URL =
  process.env.TASKS_DB_URL ??
  "https://www.notion.so/35e21d9d7c6a800f8921db421d9eee94";

export type Mail = { to: string[]; subject: string; text: string; html: string };

// ---- Huisstijl --------------------------------------------------------------
const C_ACCENT = "#2f7a57";
const C_INK = "#1f1d1a";
const C_BODY = "#4a4640";
const C_MUTED = "#9a948c";
const C_LINE = "#e7e2da";
const C_PAPER = "#f4f2ee";
const C_CARD = "#ffffff";
export const BTN_LABEL = "Open your tasks in Notion";
const EMAIL_FOOTER =
  "You're receiving this because you're part of the Mima management team. " +
  "It's an automated reminder tied to the meeting schedule.";

export function tasksLink(): string {
  return TASKS_DB_URL ? `\n\nYour tasks: ${TASKS_DB_URL}` : "";
}

// E-mailclient-vriendelijke kaart: inline styles, table-layout, bulletproof button.
export function renderEmail(opts: {
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

// ---- "Drafts for review"-mail (event-gedreven) ---------------------------------
// Wordt door de Plaud-webhook verstuurd zodra de taken ÉCHT in Notion staan — niet
// meer op een vast klokmoment. Werkt voor alle drie de meeting-types.
export type DraftsReviewKind = "MMMM" | "MMM" | "QMM";

const KIND_META: Record<DraftsReviewKind, { eyebrow: string; name: string; when: string }> = {
  MMMM: { eyebrow: "Weekly meeting &middot; MMMM", name: "weekly meeting (MMMM)", when: "This week's" },
  MMM: { eyebrow: "Monthly meeting &middot; MMM", name: "monthly tactical meeting (MMM)", when: "This month's" },
  QMM: { eyebrow: "Quarterly meeting &middot; QMM", name: "quarterly strategic meeting (QMM)", when: "This quarter's" },
};

export function draftsReviewMail(kind: DraftsReviewKind, tasks = 0): Mail {
  const m = KIND_META[kind];
  const count = tasks ? ` (${tasks} new to-do's)` : "";
  const countHtml = tasks ? ` (${tasks} new to-do&rsquo;s)` : "";
  const subject = `${kind} processed — review your Drafts for review`;
  const text =
    "Hi team,\n\n" +
    `${m.when} ${m.name} has just been processed into Notion${count}. The new to-do's are in ` +
    "as \"Drafts for review\". Please open your tasks, check the items assigned to you, and " +
    "adjust owner, domain, priority or deadline where needed — then they're confirmed." +
    tasksLink() +
    "\n\nThanks!";
  const html = renderEmail({
    eyebrow: m.eyebrow,
    heading: "Review your &ldquo;Drafts for review&rdquo;",
    paragraphs: [
      `${m.when} <strong>${m.name}</strong> has just been processed into Notion${countHtml}. ` +
        "The new to-do&rsquo;s are in as <strong>&ldquo;Drafts for review&rdquo;</strong>.",
      "Please open your tasks, check the items assigned to you, and adjust owner, domain, " +
        "priority or deadline where needed &mdash; then they&rsquo;re confirmed.",
    ],
    buttonLabel: BTN_LABEL,
    buttonUrl: TASKS_DB_URL,
  });
  return { to: DRAFTS_REVIEW_RECIPIENTS, subject, text, html };
}

// ---- Resend ---------------------------------------------------------------
export async function sendBrandedMail(m: Mail): Promise<{ ok: boolean; error?: string }> {
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
