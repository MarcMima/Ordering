import { NextResponse } from "next/server";
import { requireFinanceOwner } from "@/lib/financeAccess";
import { sendPreviews, sendToLenders, statementsFor } from "@/lib/financeStatementRun";

export const dynamic = "force-dynamic";
const ISO = /^\d{4}-\d{2}-\d{2}$/;

// POST { action: "render" | "preview" | "send", periodEnd: "YYYY-MM-DD" }
//  render  -> returns the statement HTML + warnings (shown in the app, nothing is sent)
//  preview -> mails the statement to Marc only
//  send    -> mails the statement to the lender, Marc in cc (explicit click in the app)
export async function POST(req: Request) {
  const auth = await requireFinanceOwner();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const body = (await req.json().catch(() => null)) as { action?: string; periodEnd?: string } | null;
  const periodEnd = body?.periodEnd;
  if (!periodEnd || !ISO.test(periodEnd)) return NextResponse.json({ error: "periodEnd (YYYY-MM-DD) required" }, { status: 400 });
  try {
    if (body?.action === "render") {
      const groups = await statementsFor(periodEnd);
      return NextResponse.json({
        statements: groups.map((g) => ({
          subject: g.statement.subject,
          html: g.statement.html,
          warnings: g.statement.warnings,
          to: g.loans.map((l) => l.lender_email).filter(Boolean),
        })),
      });
    }
    if (body?.action === "preview") return NextResponse.json({ results: await sendPreviews(periodEnd) });
    if (body?.action === "send") return NextResponse.json({ results: await sendToLenders(periodEnd) });
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
