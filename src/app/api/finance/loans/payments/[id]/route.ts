import { NextResponse } from "next/server";
import { requireFinanceOwner } from "@/lib/financeAccess";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireFinanceOwner();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { id } = await ctx.params;
  const db = createAdminClient();
  // Ledger-imported rows are history: only manually added rows can be removed here.
  const { data: row } = await db.from("finance_loan_payments").select("source").eq("id", id).single();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.source === "ledger") return NextResponse.json({ error: "Ledger rows cannot be deleted here" }, { status: 400 });
  const { error } = await db.from("finance_loan_payments").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
