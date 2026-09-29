# Meeting calendar: Google Calendar is the schedule

Since 29-09-2026 the management meetings (MMMM weekly, MMM monthly, QMM quarterly) are planned only in
Marc's Google Calendar. Moving or cancelling a meeting there is all it takes; the apps follow.

```
Google Calendar (marc@mimafood.nl)
  └─ Apps Script "Mima meeting calendar sync"  (docs/apps-script/meeting-calendar.gs)
       on every calendar change + every 15 min
       POST /api/meeting-calendar   (auth: the script's Google token, checked via tokeninfo)
  └─ Supabase public.meeting_calendar (+ meeting_calendar_sync)
       ├─ /api/meeting-reminders   MMM dates and times for the pre-MMM mails; pre-MMMM mail only when an
       │                           MMMM is in the next 4 days; post-MMMM check only after an MMMM
       ├─ Notion meeting records   Date moved to the calendar date (src/lib/meetingRecordSync.ts)
       ├─ /api/plaud-webhook       record on the recording's day wins over the period match
       └─ mima-meetings            "next meeting" on the landing page
```

- Type from the title (`classifyMeetingTitle`): MMMM / Operational → MMMM, QMM / Quarterly / Strategy → QMM,
  MMM / Tactical → MMM. "Missed" and "Manager meeting" titles are ignored.
- The calendar counts as fresh for 26 hours after the last push. Stale → the readers fall back to their
  old logic (Notion records + fixed rules) and the reminder response says so under `agenda.errors.calendar`.
- Notion records: a Planned record within ±3 (MMMM) / ±16 (MMM) / ±45 (QMM) days is moved to the calendar
  date; a record is only created when none exists and the meeting starts within 9 hours (Notion's own
  repeating templates still create the records ahead).
- Check what is stored: `GET /api/meeting-calendar?secret=<MEETING_CALENDAR_SECRET>` (if that env is set).

Install / reinstall the script: script.google.com → New project → paste `meeting-calendar.gs` → run `setup`
→ Allow. The script runs as marc@; its log shows each push (Executions).
