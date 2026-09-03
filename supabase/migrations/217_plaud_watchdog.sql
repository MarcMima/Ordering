-- 217: Plaud-watchdog transport.
-- De geplande Claude-taak (Plaud-watchdog) kan vanuit de Claude-cloud geen HTTP naar Vercel
-- doen, maar wél SQL op dit project draaien (Supabase MCP). Deze twee functies zijn de brug:
--   plaud_watchdog_post(payload)  -> POST naar /api/plaud-webhook met het secret uit Vault
--   plaud_watchdog_response(id)   -> antwoord van die call (pg_net is asynchroon)
-- Het webhook-secret staat in Vault onder de naam 'mmmm_webhook_secret' (NIET in deze
-- migratie; zet het met: select vault.create_secret('<secret>', 'mmmm_webhook_secret')).
-- SECURITY DEFINER + revoke: alleen de postgres/service-rol (de MCP) kan dit aanroepen;
-- anon/authenticated (de app) niet.

create or replace function public.plaud_watchdog_post(payload jsonb)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault, net
as $$
declare
  s   text;
  rid bigint;
begin
  select decrypted_secret into s
  from vault.decrypted_secrets
  where name = 'mmmm_webhook_secret'
  limit 1;
  if s is null then
    raise exception 'vault secret mmmm_webhook_secret ontbreekt';
  end if;

  select net.http_post(
    url                  := 'https://ordering-alpha.vercel.app/api/plaud-webhook',
    body                 := payload,
    headers              := jsonb_build_object('Content-Type', 'application/json', 'x-mmmm-secret', s),
    timeout_milliseconds := 60000
  ) into rid;
  return rid;
end;
$$;

create or replace function public.plaud_watchdog_response(rid bigint)
returns table (status_code integer, content text, error_msg text, timed_out boolean, created timestamptz)
language sql
security definer
set search_path = public, extensions, net
as $$
  select r.status_code, r.content::text, r.error_msg, r.timed_out, r.created
  from net._http_response r
  where r.id = rid;
$$;

revoke all on function public.plaud_watchdog_post(jsonb) from public, anon, authenticated;
revoke all on function public.plaud_watchdog_response(bigint) from public, anon, authenticated;

comment on function public.plaud_watchdog_post(jsonb) is
  'Plaud-watchdog: POST payload naar /api/plaud-webhook (secret uit Vault). Alleen voor de Supabase MCP / service-rol.';
comment on function public.plaud_watchdog_response(bigint) is
  'Plaud-watchdog: haal het pg_net-antwoord op van een eerdere plaud_watchdog_post.';
