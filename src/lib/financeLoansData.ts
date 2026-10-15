// Server-side data access for the loans section (service role only).
import { createAdminClient } from "@/lib/supabase/admin";
import type { Loan, LoanPayment } from "@/lib/loans";

export type LoanReport = {
  id: string;
  period_start: string;
  period_end: string;
  loan_ids: string[];
  status: string;
  recipients: string[];
  subject: string | null;
  error: string | null;
  created_at: string;
};

function num<T extends Record<string, unknown>>(row: T, keys: string[]): T {
  const out: Record<string, unknown> = { ...row };
  for (const k of keys) out[k] = out[k] == null ? out[k] : Number(out[k]);
  return out as T;
}

export async function loadLoans(): Promise<{ loans: Loan[]; payments: LoanPayment[]; reports: LoanReport[] }> {
  const db = createAdminClient();
  const [l, p, r] = await Promise.all([
    db.from("finance_loans").select("*").order("first_payment_date"),
    db.from("finance_loan_payments").select("*").order("paid_on"),
    db
      .from("finance_loan_reports")
      .select("id, period_start, period_end, loan_ids, status, recipients, subject, error, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  if (l.error) throw new Error(l.error.message);
  if (p.error) throw new Error(p.error.message);
  return {
    loans: (l.data ?? []).map((x) => num(x, ["principal", "annual_rate", "term_months"])) as Loan[],
    payments: (p.data ?? []).map((x) => num(x, ["amount"])) as LoanPayment[],
    reports: (r.data ?? []) as LoanReport[],
  };
}

export async function logReport(row: {
  period_start: string;
  period_end: string;
  loan_ids: string[];
  status: "preview_sent" | "sent_to_lender" | "failed";
  recipients: string[];
  subject: string;
  html: string;
  error?: string | null;
}) {
  const db = createAdminClient();
  await db.from("finance_loan_reports").insert({ ...row, error: row.error ?? null });
}
