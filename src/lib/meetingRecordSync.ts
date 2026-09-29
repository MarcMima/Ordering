// Keeps the Notion meeting records (MMMM / MMM / QMM databases) on the dates of the Google Calendar.
// Called by /api/meeting-calendar after every calendar push (see src/lib/meetingCalendar.ts).
//
// Per upcoming calendar meeting:
//   1. a record of that type already on that date → nothing to do;
//   2. otherwise the nearest Planned record of that type within the window (MMMM ±3 days,
//      MMM ±16, QMM ±45) that no other calendar meeting sits on → its Date moves to the calendar date;
//   3. no record at all and the meeting starts within CREATE_HORIZON_HOURS → a Planned record is created
//      (title as the Plaud webhook names it). Further ahead nothing is created, because Notion's own
//      repeating templates still add the records at the start of each week/month/quarter.
// Completed records are never touched. Records whose meeting disappeared from the calendar are left
// alone; the readers go by the calendar, not by the records.

import type { Client } from "@notionhq/client";
import { MMMM_DB_ID, MMM_DB_ID, QMM_DB_ID } from "@/app/api/plaud-webhook/meetingTypes";
import { meetingRecordTitle } from "@/app/api/plaud-webhook/meetingRecord";
import type { CalendarMeeting, CalendarMeetingType } from "@/lib/meetingCalendar";

const DB_ID: Record<CalendarMeetingType, string> = { MMMM: MMMM_DB_ID, MMM: MMM_DB_ID, QMM: QMM_DB_ID };
const WINDOW_DAYS: Record<CalendarMeetingType, number> = { MMMM: 3, MMM: 16, QMM: 45 };
const CREATE_HORIZON_HOURS = 9;

type Rec = { id: string; date: string | null; status: string | null; name: string };
export type RecordSyncResult = {
  moved: { type: CalendarMeetingType; name: string; from: string | null; to: string }[];
  created: { type: CalendarMeetingType; name: string; date: string }[];
  errors: string[];
};

const dayMs = (ymd: string) => Date.parse(`${ymd}T12:00:00Z`);
const addDays = (ymd: string, n: number) => new Date(dayMs(ymd) + n * 86_400_000).toISOString().slice(0, 10);

async function recordsAround(notion: Client, type: CalendarMeetingType, from: string, to: string): Promise<Rec[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = await notion.databases.query({
    database_id: DB_ID[type],
    filter: { and: [{ property: "Date", date: { on_or_after: from } }, { property: "Date", date: { on_or_before: to } }] },
    page_size: 100,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return res.results.map((p: any) => ({
    id: p.id,
    date: p.properties?.Date?.date?.start?.slice(0, 10) ?? null,
    status: p.properties?.Status?.status?.name ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    name: (p.properties?.Name?.title ?? []).map((t: any) => t.plain_text).join("") || "(untitled)",
  }));
}

export async function syncMeetingRecords(
  notion: Client,
  meetings: CalendarMeeting[],
  nowMs = Date.now(),
): Promise<RecordSyncResult> {
  const out: RecordSyncResult = { moved: [], created: [], errors: [] };
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const upcoming = meetings.filter((m) => m.date >= addDays(today, -1));

  for (const type of ["MMMM", "MMM", "QMM"] as CalendarMeetingType[]) {
    const mine = upcoming.filter((m) => m.type === type);
    if (mine.length === 0) continue;
    const w = WINDOW_DAYS[type];
    let recs: Rec[];
    try {
      recs = await recordsAround(notion, type, addDays(mine[0].date, -w), addDays(mine[mine.length - 1].date, w));
    } catch (e: unknown) {
      out.errors.push(`${type}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    const calendarDates = new Set(mine.map((m) => m.date));
    const claimed = new Set<string>();
    // Records already on a calendar date are taken by that meeting.
    for (const r of recs) if (r.date && calendarDates.has(r.date)) claimed.add(r.id);

    for (const m of mine) {
      if (recs.some((r) => r.date === m.date)) continue;
      const candidates = recs
        .filter((r) => r.status !== "Completed" && r.date && !claimed.has(r.id))
        .filter((r) => Math.abs(dayMs(r.date!) - dayMs(m.date)) <= w * 86_400_000)
        .sort((a, b) => Math.abs(dayMs(a.date!) - dayMs(m.date)) - Math.abs(dayMs(b.date!) - dayMs(m.date)));
      const pick = candidates[0];
      try {
        if (pick) {
          await notion.pages.update({ page_id: pick.id, properties: { Date: { date: { start: m.date } } } });
          out.moved.push({ type, name: pick.name, from: pick.date, to: m.date });
          claimed.add(pick.id);
          pick.date = m.date;
          continue;
        }
        const inWindow = recs.some((r) => r.date && Math.abs(dayMs(r.date) - dayMs(m.date)) <= w * 86_400_000 && !claimed.has(r.id));
        const soon = Date.parse(m.startsAt) - nowMs <= CREATE_HORIZON_HOURS * 3_600_000;
        if (!inWindow && soon) {
          const name = meetingRecordTitle(type, m.date);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const page: any = await notion.pages.create({
            parent: { database_id: DB_ID[type] },
            properties: {
              Name: { title: [{ text: { content: name } }] },
              Date: { date: { start: m.date } },
              Status: { status: { name: "Planned" } },
            },
          });
          recs.push({ id: page.id, date: m.date, status: "Planned", name });
          claimed.add(page.id);
          out.created.push({ type, name, date: m.date });
        }
      } catch (e: unknown) {
        out.errors.push(`${type} ${m.date}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  return out;
}
