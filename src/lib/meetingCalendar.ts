// Google Calendar is the schedule of the management meetings (MMMM weekly / MMM monthly / QMM quarterly).
//
// Flow (since 29-09-2026):
//   Google Apps Script on marc@mimafood.nl (docs/meeting-calendar.md) → POST /api/meeting-calendar
//   on every calendar change and every 15 minutes → table public.meeting_calendar (Supabase)
//   → read by the reminder mails (/api/meeting-reminders), the Plaud webhook (record matching)
//   and mima-meetings (next meeting). The same route moves the Date of the Notion meeting record
//   to the calendar date (src/lib/meetingRecordSync.ts).
// Moving or cancelling a meeting in the calendar is all it takes; nothing else has to be edited.
// If the calendar has not synced for CALENDAR_STALE_HOURS, readers fall back to their old logic.

import { createAdminClient } from "@/lib/supabase/admin";

export type CalendarMeetingType = "MMMM" | "MMM" | "QMM";
export type CalendarMeeting = {
  instanceId: string;
  type: CalendarMeetingType;
  title: string;
  startsAt: string; // ISO
  endsAt: string | null;
  date: string; // YYYY-MM-DD, Europe/Amsterdam
  time: string; // HH:MM, Europe/Amsterdam
};

export const CALENDAR_STALE_HOURS = 26;

/** Meeting type from an event title; null when the event is not a management meeting. */
export function classifyMeetingTitle(title: string): CalendarMeetingType | null {
  const t = title.trim();
  if (/\bmissed\b/i.test(t) || /\bmanager meeting\b/i.test(t)) return null;
  if (/\bMMMM\b/.test(t) || /\boperational\b/i.test(t) || /monday morning meeting/i.test(t)) return "MMMM";
  if (/\bQMM\b/.test(t) || /\bquarterly\b/i.test(t) || /\bstrateg/i.test(t)) return "QMM";
  if (/\bMMM\b/.test(t) || /\btactical\b/i.test(t) || /monthly (mima )?meeting/i.test(t)) return "MMM";
  return null;
}

export function amsterdamDateTime(iso: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const g = (k: string) => parts.find((p) => p.type === k)?.value ?? "";
  return { date: `${g("year")}-${g("month")}-${g("day")}`, time: `${g("hour")}:${g("minute")}` };
}

type Row = {
  instance_id: string;
  meeting_type: CalendarMeetingType;
  title: string;
  starts_at: string;
  ends_at: string | null;
  meeting_date: string;
};

const toMeeting = (r: Row): CalendarMeeting => ({
  instanceId: r.instance_id,
  type: r.meeting_type,
  title: r.title,
  startsAt: r.starts_at,
  endsAt: r.ends_at,
  date: r.meeting_date,
  time: amsterdamDateTime(r.starts_at).time,
});

export type CalendarRead = { fresh: boolean; syncedAt: string | null; meetings: CalendarMeeting[]; error?: string };

/** Calendar meetings with a date in [fromDate, toDate] (YYYY-MM-DD, inclusive). */
export async function readCalendar(fromDate: string, toDate: string): Promise<CalendarRead> {
  try {
    const db = createAdminClient();
    const [{ data: sync, error: e1 }, { data: rows, error: e2 }] = await Promise.all([
      db.from("meeting_calendar_sync").select("synced_at").eq("id", 1).maybeSingle(),
      db
        .from("meeting_calendar")
        .select("instance_id, meeting_type, title, starts_at, ends_at, meeting_date")
        .gte("meeting_date", fromDate)
        .lte("meeting_date", toDate)
        .order("starts_at", { ascending: true }),
    ]);
    if (e1 || e2) return { fresh: false, syncedAt: null, meetings: [], error: (e1 ?? e2)!.message };
    const syncedAt = (sync as { synced_at: string } | null)?.synced_at ?? null;
    const fresh = !!syncedAt && Date.now() - Date.parse(syncedAt) < CALENDAR_STALE_HOURS * 3_600_000;
    return { fresh, syncedAt, meetings: ((rows ?? []) as Row[]).map(toMeeting) };
  } catch (e: unknown) {
    return { fresh: false, syncedAt: null, meetings: [], error: e instanceof Error ? e.message : String(e) };
  }
}
