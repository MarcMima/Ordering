-- 258: app feedback gets a status and is readable on /admin/feedback.
-- Until 19-10-2026 nothing read app_feedback: 20 messages (13 from Pijp on 09-10) were never seen.
alter table app_feedback
  add column if not exists status text not null default 'new',
  add column if not exists response text,
  add column if not exists resolved_at timestamptz;

do $$ begin
  alter table app_feedback add constraint app_feedback_status_check
    check (status in ('new', 'in_progress', 'done', 'wont_fix'));
exception when duplicate_object then null; end $$;

-- Production runs with logins (migration 209); admins and Marc (owner, no app role) read and update.
drop policy if exists app_feedback_select on app_feedback;
create policy app_feedback_select on app_feedback for select to authenticated
  using (public.has_role('admin') or lower(auth.jwt() ->> 'email') = 'marc@mimafood.nl');
drop policy if exists app_feedback_update on app_feedback;
create policy app_feedback_update on app_feedback for update to authenticated
  using (public.has_role('admin') or lower(auth.jwt() ->> 'email') = 'marc@mimafood.nl')
  with check (public.has_role('admin') or lower(auth.jwt() ->> 'email') = 'marc@mimafood.nl');

select status, count(*) from app_feedback group by 1;
