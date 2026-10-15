// Shared by the in-app "Send" action and the quarterly cron.
import { buildStatement, type Statement } from "@/lib/loanStatement";
import { loadLoans, logReport } from "@/lib/financeLoansData";
import { FINANCE_OWNER, previewMail, sendFinanceMail } from "@/lib/financeMail";
import type { Loan } from "@/lib/loans";

export function appUrl(): string {
  return (process.env.APP_URL ?? "https://ordering-alpha.vercel.app").replace(/\/$/, "");
}

/** One statement per lender (both current loans share one lender). */
export async function statementsFor(periodEnd: string): Promise<{ lenderKey: string; loans: Loan[]; statement: Statement }[]> {
  const { loans, payments } = await loadLoans();
  const groups = new Map<string, Loan[]>();
  for (const l of loans) {
    const key = l.lender_name.trim().toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), l]);
  }
  return [...groups.entries()].map(([lenderKey, ls]) => ({
    lenderKey,
    loans: ls,
    statement: buildStatement({ loans: ls, payments, periodEnd, senderName: "Marc Wesseling", senderEmail: FINANCE_OWNER }),
  }));
}

export async function sendPreviews(periodEnd: string) {
  const out: { subject: string; ok: boolean; error?: string }[] = [];
  for (const g of await statementsFor(periodEnd)) {
    const lenderEmail = g.loans.find((l) => l.lender_email)?.lender_email ?? null;
    const m = previewMail(g.statement, appUrl(), lenderEmail);
    const res = await sendFinanceMail({ to: [FINANCE_OWNER], subject: m.subject, html: m.html, text: m.text });
    await logReport({
      period_start: g.statement.periodStart,
      period_end: g.statement.periodEnd,
      loan_ids: g.loans.map((l) => l.id),
      status: res.ok ? "preview_sent" : "failed",
      recipients: [FINANCE_OWNER],
      subject: m.subject,
      html: g.statement.html,
      error: res.error ?? null,
    });
    out.push({ subject: m.subject, ok: res.ok, error: res.error });
  }
  return out;
}

export async function sendToLenders(periodEnd: string) {
  const out: { subject: string; to: string[]; ok: boolean; error?: string }[] = [];
  for (const g of await statementsFor(periodEnd)) {
    const to = [...new Set(g.loans.map((l) => l.lender_email).filter((e): e is string => !!e))];
    if (!to.length) {
      out.push({ subject: g.statement.subject, to, ok: false, error: "No lender email set" });
      continue;
    }
    const res = await sendFinanceMail({ to, cc: [FINANCE_OWNER], subject: g.statement.subject, html: g.statement.html, text: g.statement.text });
    await logReport({
      period_start: g.statement.periodStart,
      period_end: g.statement.periodEnd,
      loan_ids: g.loans.map((l) => l.id),
      status: res.ok ? "sent_to_lender" : "failed",
      recipients: [...to, FINANCE_OWNER],
      subject: g.statement.subject,
      html: g.statement.html,
      error: res.error ?? null,
    });
    out.push({ subject: g.statement.subject, to, ok: res.ok, error: res.error });
  }
  return out;
}
