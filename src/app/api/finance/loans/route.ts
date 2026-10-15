import { NextResponse } from "next/server";
import { requireFinanceOwner } from "@/lib/financeAccess";
import { loadLoans } from "@/lib/financeLoansData";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireFinanceOwner();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  try {
    return NextResponse.json(await loadLoans());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const missing = /finance_loans|does not exist|schema cache/i.test(msg);
    return NextResponse.json({ error: missing ? "Migration 257_finance_loans has not been applied yet." : msg }, { status: 500 });
  }
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// POST: record a payment { loan_id, paid_on, amount, kind, note }
export async function POST(req: Request) {
  const auth = await requireFinanceOwner();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const body = (await req.json().catch(() => null)) as {
    loan_id?: string;
    paid_on?: string;
    amount?: number;
    kind?: string;
    note?: string | null;
    source?: string;
  } | null;
  const amount = Number(body?.amount);
  if (!body?.loan_id || !body.paid_on || !ISO.test(body.paid_on) || !(amount > 0)) {
    return NextResponse.json({ error: "loan_id, paid_on (YYYY-MM-DD) and a positive amount are required" }, { status: 400 });
  }
  const kind = ["instalment", "extra", "correction"].includes(body.kind ?? "") ? body.kind : "instalment";
  const source = body.source === "direct_debit" ? "direct_debit" : "manual";
  const db = createAdminClient();
  const { data, error } = await db
    .from("finance_loan_payments")
    .insert({ loan_id: body.loan_id, paid_on: body.paid_on, amount: Math.round(amount * 100) / 100, kind, source, note: body.note ?? null })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ payment: data });
}

// PATCH: loan settings { id, lender_email?, lender_greeting?, statement_language?, prepay_mode?, direct_debit? }
export async function PATCH(req: Request) {
  const auth = await requireFinanceOwner();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body?.id || typeof body.id !== "string") return NextResponse.json({ error: "id required" }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.lender_email === "string") {
    const e = body.lender_email.trim();
    if (e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    patch.lender_email = e || null;
  }
  if (typeof body.lender_greeting === "string") patch.lender_greeting = body.lender_greeting.trim() || null;
  if (body.statement_language === "nl" || body.statement_language === "en") patch.statement_language = body.statement_language;
  if (body.prepay_mode === "shorten" || body.prepay_mode === "keepterm") patch.prepay_mode = body.prepay_mode;
  if (typeof body.direct_debit === "boolean") patch.direct_debit = body.direct_debit;
  const db = createAdminClient();
  const { error } = await db.from("finance_loans").update(patch).eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
