import { NextResponse } from "next/server";
import { previousQuarter } from "@/lib/loans";
import { sendPreviews } from "@/lib/financeStatementRun";

// Quarterly cron (vercel.json, 2nd day of Jan/Apr/Jul/Oct, 06:15 UTC).
// Mails Marc a PREVIEW of the lender statement for the quarter that just ended.
// It never mails the lender: Marc sends from /admin/finance/loans (house rule: draft, a human sends).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const url = new URL(req.url);
  const authorized = !!secret && (auth === `Bearer ${secret}` || url.searchParams.get("secret") === secret);
  if (!authorized) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const today = new Date().toISOString().slice(0, 10);
  const q = url.searchParams.get("periodEnd") ?? previousQuarter(today).end;
  try {
    return NextResponse.json({ periodEnd: q, results: await sendPreviews(q) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
