-- Applied to the Ordering Supabase project on 29-09-2026 via the Supabase MCP (migration meeting_calendar).
-- Google Calendar is the schedule of the management meetings; see docs/meeting-calendar.md.
create table if not exists public.meeting_calendar (
  instance_id text primary key,              -- Google Calendar event id of the instance
  meeting_type text not null check (meeting_type in ('MMMM','MMM','QMM')),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  meeting_date date not null,                -- Europe/Amsterdam date of starts_at
  synced_at timestamptz not null default now()
);
create index if not exists meeting_calendar_date_idx on public.meeting_calendar (meeting_date);

create table if not exists public.meeting_calendar_sync (
  id int primary key default 1 check (id = 1),
  synced_at timestamptz not null,
  window_start timestamptz not null,
  window_end timestamptz not null,
  events int not null,
  note text
);

alter table public.meeting_calendar enable row level security;
alter table public.meeting_calendar_sync enable row level security;
create policy meeting_calendar_read on public.meeting_calendar for select
  using ((public.meeting_me()).role = 'management');
create policy meeting_calendar_sync_read on public.meeting_calendar_sync for select
  using ((public.meeting_me()).role = 'management');
grant select on public.meeting_calendar, public.meeting_calendar_sync to authenticated;
