import { NextResponse } from "next/server";
import { Client } from "@notionhq/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { amsterdamDateTime, classifyMeetingTitle, readCalendar } from "@/lib/meetingCalendar";
import { syncMeetingRecords } from "@/lib/meetingRecordSync";

// Receives the management meetings from Marc's Google Calendar (Apps Script, docs/meeting-calendar.md)
// and makes them the schedule: table public.meeting_calendar + the Date of the Notion meeting records.
//   POST { windowStart, windowEnd, events: [{ id, title, start, end }] }  → replaces the window
//   GET                                                               → what is stored (debug)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type InEvent = { id?: string; title?: string; start?: string; end?: string | null };

// Two ways in:
//   1. the Apps Script sends its own Google access token (ScriptApp.getOAuthToken()); Google's tokeninfo
//      endpoint confirms it belongs to an allowed account (MEETING_CALENDAR_ACCOUNTS, default marc@).
//      No shared secret has to live in the script.
//   2. MEETING_CALENDAR_SECRET (optional) as Bearer or ?secret=, for manual checks.
const ALLOWED_ACCOUNTS = (process.env.MEETING_CALENDAR_ACCOUNTS ?? "marc@mimafood.nl")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

async function authorized(req: Request): Promise<boolean> {
  const secret = process.env.MEETING_CALENDAR_SECRET;
  const url = new URL(req.url);
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (secret && (bearer === secret || url.searchParams.get("secret") === secret)) return true;
  if (!bearer || bearer.length < 20) return false;
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(bearer)}`, {
      cache: "no-store",
    });
    if (!res.ok) return false;
    const info = (await res.json()) as { email?: string; email_verified?: string | boolean };
    const verified = info.email_verified === true || info.email_verified === "true";
    return verified && !!info.email && ALLOWED_ACCOUNTS.includes(info.email.toLowerCase());
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  if (!(await authorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const today = new Date().toISOString().slice(0, 10);
  const until = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
  return NextResponse.json(await readCalendar(today, until));
}

export async function POST(req: Request) {
  if (!(await authorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { windowStart?: string; windowEnd?: string; events?: InEvent[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const windowStart = body.windowStart && !isNaN(Date.parse(body.windowStart)) ? body.windowStart : null;
  const windowEnd = body.windowEnd && !isNaN(Date.parse(body.windowEnd)) ? body.windowEnd : null;
  if (!windowStart || !windowEnd || !Array.isArray(body.events)) {
    return NextResponse.json({ error: "windowStart, windowEnd and events[] are required" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const skipped: string[] = [];
  const rows = [];
  for (const e of body.events) {
    if (!e.id || !e.title || !e.start || isNaN(Date.parse(e.start))) continue;
    const type = classifyMeetingTitle(e.title);
    if (!type) {
      skipped.push(e.title);
      continue;
    }
    rows.push({
      instance_id: e.id,
      meeting_type: type,
      title: e.title,
      starts_at: new Date(e.start).toISOString(),
      ends_at: e.end && !isNaN(Date.parse(e.end)) ? new Date(e.end).toISOString() : null,
      meeting_date: amsterdamDateTime(e.start).date,
      synced_at: now,
    });
  }

  const db = createAdminClient();
  // Replace the window: rows in it that are no longer in the calendar (moved out, cancelled) go.
  const keep = rows.map((r) => r.instance_id);
  let del = db.from("meeting_calendar").delete().gte("starts_at", windowStart).lte("starts_at", windowEnd);
  if (keep.length) del = del.not("instance_id", "in", `(${keep.map((k) => `"${k.replace(/"/g, "")}"`).join(",")})`);
  const { error: delErr } = await del;
  if (delErr) return NextResponse.json({ error: `delete: ${delErr.message}` }, { status: 500 });
  if (rows.length) {
    const { error: upErr } = await db.from("meeting_calendar").upsert(rows, { onConflict: "instance_id" });
    if (upErr) return NextResponse.json({ error: `upsert: ${upErr.message}` }, { status: 500 });
  }
  const { error: syncErr } = await db.from("meeting_calendar_sync").upsert({
    id: 1,
    synced_at: now,
    window_start: windowStart,
    window_end: windowEnd,
    events: rows.length,
    note: skipped.length ? `skipped: ${skipped.slice(0, 5).join(" | ")}` : null,
  });
  if (syncErr) return NextResponse.json({ error: `sync meta: ${syncErr.message}` }, { status: 500 });

  // Notion meeting records follow the calendar.
  let records = null;
  const token = process.env.NOTION_TOKEN;
  if (token) {
    const notion = new Client({ auth: token });
    const today = now.slice(0, 10);
    const until = new Date(Date.now() + 75 * 86_400_000).toISOString().slice(0, 10);
    const cal = await readCalendar(new Date(Date.now() - 86_400_000).toISOString().slice(0, 10), until);
    records = await syncMeetingRecords(notion, cal.meetings.filter((m) => m.date >= today || m.date === today));
  }

  return NextResponse.json({ ok: true, stored: rows.length, skipped: skipped.length, records });
}
