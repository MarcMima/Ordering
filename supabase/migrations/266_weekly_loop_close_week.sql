-- ============================================================================
-- Migration 266: two more loop write functions (follow-up to 265)
--
-- The Tuesday and Wednesday runs close the cockpit week, and the daily cockpit
-- run labels each answered question with a project. Both were raw UPDATEs that
-- trigger the connector's confirmation prompt. Same pattern as 265.
-- ============================================================================
begin;

create or replace function public.loop_close_week(p_id text, p_summary text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare v_old text;
begin
  select status into v_old from cockpit_weeks where id = p_id for update;
  if not found then raise exception 'loop_close_week: week % not found', p_id; end if;
  update cockpit_weeks set status = 'closed', summary = coalesce(p_summary, summary) where id = p_id;
  return jsonb_build_object('id', p_id, 'old', v_old, 'new', 'closed');
end;
$$;

-- Three-argument variant: answer plus project label (the two-argument one stays).
create or replace function public.loop_answer_question(p_id uuid, p_answer text, p_project text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(trim(p_answer),'') = '' then
    raise exception 'loop_answer_question: answer is required';
  end if;
  update cockpit_questions
     set status = 'answered', answer = p_answer, project = coalesce(p_project, project), answered_at = now()
   where id = p_id;
  if not found then raise exception 'loop_answer_question: question % not found', p_id; end if;
  return jsonb_build_object('id', p_id, 'status', 'answered', 'project', p_project);
end;
$$;

revoke all on function public.loop_close_week(text,text)              from public, anon, authenticated;
revoke all on function public.loop_answer_question(uuid,text,text)    from public, anon, authenticated;
grant execute on function public.loop_close_week(text,text)           to service_role;
grant execute on function public.loop_answer_question(uuid,text,text) to service_role;

commit;
