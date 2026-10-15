// Quarterly lender statement (email) for the private loans.
// House rules for emails: no dashes as punctuation, warm and calm, sentence case.
// Design: Mima "Editorial Calm" (paper, serif headings, hairlines, square corners).

import { ARREARS_TOLERANCE, loanState, quarterOf, round2, type Loan, type LoanPayment, type LoanState } from "./loans";

type Lang = "nl" | "en";

const C = {
  paper: "#FBF8F3",
  card: "#FFFFFF",
  green: "#5A713F",
  ink: "#2C3320",
  body: "#55584C",
  muted: "#6E6A61",
  quiet: "#8A8C7E",
  sand: "#A08A6A",
  tagline: "#8C9A72",
  line: "rgba(44,51,32,0.10)",
  lineStrong: "#E4DED3",
  track: "#EFE9DF",
};
const SERIF = "Georgia,'Times New Roman',serif";
const SANS = "Arial,Helvetica,sans-serif";

const T = {
  nl: {
    quarter: (q: number, y: number) => `${["1e", "2e", "3e", "4e"][q - 1]} kwartaal ${y}`,
    subject: (q: string) => `Overzicht leningen Mima, ${q}`,
    eyebrow: (q: string) => `Overzicht leningen &middot; ${q}`,
    heading: "De stand van uw leningen aan Mima",
    greeting: (g: string) => `${g},`,
    defaultGreeting: "Beste mevrouw Kruize",
    intro: (q: string, n: number) =>
      `Hierbij het overzicht van ${n === 1 ? "de lening" : n === 2 ? "de twee leningen" : `de ${n} leningen`} aan Mima over het ${q}. ` +
      "U ziet per lening wat er dit kwartaal is betaald, hoeveel er in totaal is afgelost en wat er nog openstaat.",
    allOnTime: "Alle termijnen van dit kwartaal zijn via automatische incasso voldaan.",
    total: "Totaal",
    outstanding: "Nog openstaand",
    repaid: "Afgelost",
    ofPrincipal: (p: string) => `van ${p}`,
    loan: "Lening",
    principal: "Oorspronkelijk bedrag",
    rate: "Rente",
    perYear: "per jaar",
    repaidToDate: "Afgelost tot en met",
    interestToDate: "Rente betaald tot en met",
    expectedEnd: "Verwachte laatste termijn",
    instalment: "Maandtermijn",
    thisQuarter: "Termijnen dit kwartaal",
    month: "Maand",
    payment: "Termijn",
    interest: "Rente",
    principalPart: "Aflossing",
    balance: "Restschuld",
    received: (amount: string, n: number) => `Ontvangen dit kwartaal: ${amount} in ${n} ${n === 1 ? "betaling" : "betalingen"}.`,
    extra: (amount: string, date: string) => `Extra aflossing van ${amount} op ${date}.`,
    arrears: (amount: string) =>
      `Ten opzichte van het aflossingsschema staat er nog ${amount} open. Dit vullen wij zo snel mogelijk aan.`,
    assumed: (n: number) =>
      `${n === 1 ? "Eén termijn is" : `${n} termijnen zijn`} via automatische incasso afgeschreven en nog niet in onze administratie verwerkt.`,
    nextQuarter: (amount: string) => `Volgend kwartaal verwachten wij in totaal ${amount} aan termijnen te betalen.`,
    closing: "Heeft u vragen over dit overzicht, dan hoor ik het graag.",
    regards: "Met vriendelijke groet,",
    footer: (date: string) =>
      `Dit overzicht is opgesteld op basis van de betalingen in de administratie van Mima tot en met ${date}. ` +
      "Bij een verschil is de administratie van de leningverstrekker leidend (artikel 5 van de overeenkomst).",
    locale: "nl-NL",
  },
  en: {
    quarter: (q: number, y: number) => `Q${q} ${y}`,
    subject: (q: string) => `Mima loan statement, ${q}`,
    eyebrow: (q: string) => `Loan statement &middot; ${q}`,
    heading: "Where your loans to Mima stand",
    greeting: (g: string) => `${g},`,
    defaultGreeting: "Dear Mrs Kruize",
    intro: (q: string, n: number) =>
      `Here is the statement for ${n === 1 ? "the loan" : n === 2 ? "the two loans" : `the ${n} loans`} to Mima for ${q}. ` +
      "For each loan you can see what was paid this quarter, how much has been repaid in total and what is still outstanding.",
    allOnTime: "All instalments for this quarter were paid by direct debit.",
    total: "Total",
    outstanding: "Outstanding",
    repaid: "Repaid",
    ofPrincipal: (p: string) => `of ${p}`,
    loan: "Loan",
    principal: "Original amount",
    rate: "Interest rate",
    perYear: "per year",
    repaidToDate: "Repaid up to",
    interestToDate: "Interest paid up to",
    expectedEnd: "Expected final instalment",
    instalment: "Monthly instalment",
    thisQuarter: "Instalments this quarter",
    month: "Month",
    payment: "Instalment",
    interest: "Interest",
    principalPart: "Principal",
    balance: "Balance",
    received: (amount: string, n: number) => `Received this quarter: ${amount} in ${n} ${n === 1 ? "payment" : "payments"}.`,
    extra: (amount: string, date: string) => `Extra repayment of ${amount} on ${date}.`,
    arrears: (amount: string) => `Compared with the schedule, ${amount} is still to be paid. We will make this up as soon as possible.`,
    assumed: (n: number) => `${n === 1 ? "One instalment was" : `${n} instalments were`} collected by direct debit and not yet booked in our accounts.`,
    nextQuarter: (amount: string) => `Next quarter we expect to pay ${amount} in instalments in total.`,
    closing: "If you have any questions about this statement, please let me know.",
    regards: "Kind regards,",
    footer: (date: string) =>
      `This statement is based on the payments in Mima's accounts up to and including ${date}. ` +
      "Where there is a difference, the lender's records prevail (article 5 of the agreement).",
    locale: "en-GB",
  },
};

export type StatementInput = {
  loans: Loan[];
  payments: LoanPayment[];
  periodEnd: string; // any date inside the quarter, normally its last day
  senderName?: string;
  senderEmail?: string;
  lang?: Lang;
};

export type Statement = {
  subject: string;
  html: string;
  text: string;
  periodStart: string;
  periodEnd: string;
  states: LoanState[];
  warnings: string[];
};

function eur(x: number, lang: Lang): string {
  return new Intl.NumberFormat(T[lang].locale, { style: "currency", currency: "EUR" }).format(round2(x));
}
function pct(x: number, lang: Lang, digits = 2): string {
  return new Intl.NumberFormat(T[lang].locale, { style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(x);
}
function dateLong(iso: string, lang: Lang): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat(T[lang].locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}
function monthLong(iso: string, lang: Lang): string {
  const [y, m] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat(T[lang].locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
}

function bar(share: number): string {
  const w = Math.max(0, Math.min(100, Math.round(share * 100)));
  const cells =
    (w > 0 ? `<td width="${w}%" style="background:${C.green};height:6px;line-height:6px;font-size:0;">&nbsp;</td>` : "") +
    (w < 100 ? `<td width="${100 - w}%" style="background:${C.track};height:6px;line-height:6px;font-size:0;">&nbsp;</td>` : "");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>${cells}</tr></table>`;
}

function kv(label: string, value: string): string {
  return (
    `<tr><td style="padding:7px 0;border-bottom:1px solid ${C.lineStrong};font-family:${SANS};font-size:14px;color:${C.muted};">${label}</td>` +
    `<td align="right" style="padding:7px 0;border-bottom:1px solid ${C.lineStrong};font-family:${SANS};font-size:14px;color:${C.ink};">${value}</td></tr>`
  );
}

export function buildStatement(input: StatementInput): Statement {
  const lang: Lang = input.lang ?? (input.loans[0]?.statement_language ?? "nl");
  const t = T[lang];
  const q = quarterOf(input.periodEnd);
  const qLabel = t.quarter(q.q, q.year);
  const asOf = q.end;
  const states = input.loans.map((l) => loanState(l, input.payments, asOf, { assumeDirectDebit: true }));
  const warnings: string[] = [];

  const totPrincipal = states.reduce((s, x) => s + x.loan.principal, 0);
  const totOutstanding = states.reduce((s, x) => s + x.outstanding, 0);
  const totRepaid = totPrincipal - totOutstanding;
  const allOnTime = states.every((s) => s.arrears <= ARREARS_TOLERANCE && s.assumed.length === 0);
  const greeting = input.loans[0]?.lender_greeting?.trim() || t.defaultGreeting;
  const sender = input.senderName ?? "Marc Wesseling";

  const textLines: string[] = [t.greeting(greeting), "", t.intro(qLabel, states.length).replace(/&[a-z]+;/g, "")];
  if (allOnTime) textLines.push(t.allOnTime);
  textLines.push("", `${t.total}: ${t.outstanding.toLowerCase()} ${eur(totOutstanding, lang)} ${t.ofPrincipal(eur(totPrincipal, lang))}, ${t.repaid.toLowerCase()} ${eur(totRepaid, lang)} (${pct(totRepaid / totPrincipal, lang, 1)}).`);

  let nextQuarterTotal = 0;
  const loanBlocks = states
    .map((s) => {
      const l = s.loan;
      const inQ = s.rows.filter((r) => r.dueDate >= q.start && r.dueDate <= q.end && r.payment > 0);
      const receivedQ = input.payments.filter((p) => p.loan_id === l.id && p.paid_on >= q.start && p.paid_on <= q.end);
      const assumedQ = s.assumed.filter((r) => r.dueDate >= q.start && r.dueDate <= q.end);
      const receivedAmount = receivedQ.reduce((a, p) => a + Number(p.amount), 0) + assumedQ.reduce((a, r) => a + r.payment, 0);
      const extrasQ = receivedQ.filter((p) => p.kind === "extra");
      const nq = quarterOf(addQuarter(q.end));
      nextQuarterTotal += s.rows.filter((r) => r.dueDate >= nq.start && r.dueDate <= nq.end).reduce((a, r) => a + r.payment, 0);
      if (s.arrears > ARREARS_TOLERANCE) warnings.push(`${l.name}: ${eur(s.arrears, "en")} behind schedule. The statement says so; settle it before sending if you can.`);
      if (s.assumed.length) warnings.push(`${l.name}: ${s.assumed.length} instalment(s) assumed paid by direct debit, not yet recorded.`);

      const rowsHtml = inQ
        .map(
          (r) =>
            `<tr>` +
            `<td style="padding:7px 8px 7px 0;border-bottom:1px solid ${C.lineStrong};font-family:${SANS};font-size:13px;color:${C.ink};">${monthLong(r.dueDate, lang)}</td>` +
            `<td align="right" style="padding:7px 8px;border-bottom:1px solid ${C.lineStrong};font-family:${SANS};font-size:13px;color:${C.ink};">${eur(r.payment, lang)}</td>` +
            `<td align="right" style="padding:7px 8px;border-bottom:1px solid ${C.lineStrong};font-family:${SANS};font-size:13px;color:${C.muted};">${eur(r.interest, lang)}</td>` +
            `<td align="right" style="padding:7px 8px;border-bottom:1px solid ${C.lineStrong};font-family:${SANS};font-size:13px;color:${C.muted};">${eur(r.principal, lang)}</td>` +
            `<td align="right" style="padding:7px 0 7px 8px;border-bottom:1px solid ${C.lineStrong};font-family:${SANS};font-size:13px;color:${C.ink};">${eur(r.balance, lang)}</td>` +
            `</tr>`,
        )
        .join("");
      const th = (x: string, align = "right") =>
        `<td align="${align}" style="padding:0 8px 6px 0;font-family:${SANS};font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${C.quiet};">${x}</td>`;
      const notes: string[] = [];
      if (receivedQ.length || assumedQ.length) notes.push(t.received(eur(receivedAmount, lang), receivedQ.length + assumedQ.length));
      for (const e of extrasQ) notes.push(t.extra(eur(Number(e.amount), lang), dateLong(e.paid_on, lang)));
      if (s.assumed.length) notes.push(t.assumed(s.assumed.length));
      if (s.arrears > ARREARS_TOLERANCE) notes.push(t.arrears(eur(s.arrears, lang)));

      textLines.push(
        "",
        `${t.loan} ${l.borrower_entity}`,
        `  ${t.principal}: ${eur(l.principal, lang)} (${pct(l.annual_rate, lang)} ${t.perYear})`,
        `  ${t.repaidToDate} ${dateLong(asOf, lang)}: ${eur(s.principalRepaid, lang)} (${pct(s.principalRepaid / l.principal, lang, 1)})`,
        `  ${t.outstanding}: ${eur(s.outstanding, lang)}`,
        `  ${t.interestToDate} ${dateLong(asOf, lang)}: ${eur(s.interestPaid, lang)}`,
        ...(s.expectedEnd ? [`  ${t.expectedEnd}: ${monthLong(s.expectedEnd, lang)}`] : []),
        ...notes.map((n) => `  ${n}`),
      );

      return (
        `<tr><td style="padding:30px 36px 0 36px;">` +
        `<div style="font-family:${SANS};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${C.sand};">${t.loan}</div>` +
        `<div style="font-family:${SERIF};font-size:20px;line-height:1.3;color:${C.ink};margin:6px 0 4px 0;">${l.borrower_entity}</div>` +
        `<div style="font-family:${SANS};font-size:13px;color:${C.muted};margin:0 0 14px 0;">${pct(l.annual_rate, lang)} ${t.perYear} &middot; ${t.instalment} ${eur(s.instalment, lang)}</div>` +
        bar(s.principalRepaid / l.principal) +
        `<div style="font-family:${SANS};font-size:13px;color:${C.muted};margin:8px 0 12px 0;">${t.repaid} ${pct(s.principalRepaid / l.principal, lang, 1)}</div>` +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">` +
        kv(t.principal, eur(l.principal, lang)) +
        kv(`${t.repaidToDate} ${dateLong(asOf, lang)}`, eur(s.principalRepaid, lang)) +
        kv(t.outstanding, `<strong style="font-weight:400;color:${C.green};">${eur(s.outstanding, lang)}</strong>`) +
        kv(`${t.interestToDate} ${dateLong(asOf, lang)}`, eur(s.interestPaid, lang)) +
        (s.expectedEnd ? kv(t.expectedEnd, monthLong(s.expectedEnd, lang)) : "") +
        `</table>` +
        (inQ.length
          ? `<div style="font-family:${SANS};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${C.sand};margin:22px 0 8px 0;">${t.thisQuarter}</div>` +
            `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">` +
            `<tr>${th(t.month, "left")}${th(t.payment)}${th(t.interest)}${th(t.principalPart)}${th(t.balance)}</tr>${rowsHtml}</table>`
          : "") +
        (notes.length
          ? `<div style="font-family:${SANS};font-size:14px;line-height:1.75;color:${C.body};margin:12px 0 0 0;">${notes.join("<br>")}</div>`
          : "") +
        `</td></tr>`
      );
    })
    .join(`<tr><td style="padding:30px 36px 0 36px;"><div style="height:1px;background:${C.line};"></div></td></tr>`);

  if (nextQuarterTotal > 0) textLines.push("", t.nextQuarter(eur(nextQuarterTotal, lang)));
  textLines.push("", t.closing, "", t.regards, sender, "Mima Fresh Mediterranean", ...(input.senderEmail ? [input.senderEmail] : []), "", t.footer(dateLong(asOf, lang)));

  const p = (x: string) => `<p style="margin:0 0 14px 0;">${x}</p>`;
  const html =
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>` +
    `<body style="margin:0;padding:0;background:${C.paper};">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper};padding:32px 12px;"><tr><td align="center">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${C.card};border:1px solid ${C.lineStrong};">` +
    // wordmark
    `<tr><td style="padding:30px 36px 0 36px;">` +
    `<div style="font-family:${SERIF};font-size:26px;letter-spacing:1px;color:${C.green};line-height:1;">mima</div>` +
    `<div style="font-family:${SANS};font-size:10px;letter-spacing:3px;text-transform:uppercase;color:${C.tagline};margin-top:6px;">Fresh &middot; Mediterranean</div>` +
    `<div style="height:1px;background:${C.line};margin:22px 0 0 0;"></div></td></tr>` +
    // heading
    `<tr><td style="padding:24px 36px 0 36px;">` +
    `<div style="font-family:${SANS};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${C.sand};">${t.eyebrow(qLabel)}</div>` +
    `<h1 style="font-family:${SERIF};font-weight:400;font-size:26px;line-height:1.25;color:${C.ink};margin:10px 0 18px 0;">${t.heading}</h1>` +
    `<div style="font-family:${SANS};font-size:15px;line-height:1.75;color:${C.body};">` +
    p(t.greeting(greeting)) +
    p(t.intro(qLabel, states.length)) +
    (allOnTime ? p(t.allOnTime) : "") +
    `</div></td></tr>` +
    // total
    `<tr><td style="padding:10px 36px 0 36px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper};border:1px solid ${C.lineStrong};"><tr><td style="padding:20px 22px;">` +
    `<div style="font-family:${SANS};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${C.sand};">${t.total} &middot; ${t.outstanding.toLowerCase()} ${dateLong(asOf, lang)}</div>` +
    `<div style="font-family:${SERIF};font-size:32px;line-height:1.2;color:${C.green};margin:8px 0 2px 0;">${eur(totOutstanding, lang)}</div>` +
    `<div style="font-family:${SANS};font-size:13px;color:${C.muted};margin:0 0 14px 0;">${t.ofPrincipal(eur(totPrincipal, lang))} &middot; ${t.repaid.toLowerCase()} ${eur(totRepaid, lang)} (${pct(totRepaid / totPrincipal, lang, 1)})</div>` +
    bar(totRepaid / totPrincipal) +
    `</td></tr></table></td></tr>` +
    loanBlocks +
    // closing
    `<tr><td style="padding:30px 36px 0 36px;font-family:${SANS};font-size:15px;line-height:1.75;color:${C.body};">` +
    (nextQuarterTotal > 0 ? p(t.nextQuarter(eur(nextQuarterTotal, lang))) : "") +
    p(t.closing) +
    `<p style="margin:0;">${t.regards}<br>${sender}<br><span style="color:${C.muted};">Mima Fresh Mediterranean${input.senderEmail ? `<br>${input.senderEmail}` : ""}</span></p>` +
    `</td></tr>` +
    `<tr><td style="padding:28px 36px 30px 36px;"><div style="height:1px;background:${C.line};margin-bottom:14px;"></div>` +
    `<div style="font-family:${SANS};font-size:12px;line-height:1.6;color:${C.quiet};">${t.footer(dateLong(asOf, lang))}</div></td></tr>` +
    `</table></td></tr></table></body></html>`;

  return { subject: t.subject(qLabel), html, text: textLines.join("\n"), periodStart: q.start, periodEnd: q.end, states, warnings };
}

function addQuarter(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return dt.toISOString().slice(0, 10);
}
