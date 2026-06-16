-- Schedule Van Gelder sync jobs:
-- - Hourly mutation-like check (stale/inactive/error mappings only)
-- - Nightly full refresh
--
-- Uses pg_cron + pg_net to call Edge Function /functions/v1/sync-van-gelder
-- with anon key from app.settings.anon_key.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  project_ref TEXT := 'olcqzhxirqhkfgzgjnnw';
  fn_url TEXT := 'https://' || project_ref || '.supabase.co/functions/v1/sync-van-gelder';
  anon_key TEXT := current_setting('app.settings.anon_key', true);
  hdrs JSONB;
  existing_job_id BIGINT;
BEGIN
  IF anon_key IS NULL OR length(trim(anon_key)) = 0 THEN
    RAISE NOTICE 'Skipping cron schedule: app.settings.anon_key unavailable.';
    RETURN;
  END IF;

  hdrs := jsonb_build_object(
    'Content-Type', 'application/json',
    'apikey', anon_key,
    'Authorization', 'Bearer ' || anon_key
  );

  SELECT jobid INTO existing_job_id FROM cron.job WHERE jobname = 'vg_sync_hourly' LIMIT 1;
  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;

  SELECT jobid INTO existing_job_id FROM cron.job WHERE jobname = 'vg_sync_nightly' LIMIT 1;
  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;

  -- Every hour at minute 17: check stale/inactive/error rows, max 200 codes.
  PERFORM cron.schedule(
    'vg_sync_hourly',
    '17 * * * *',
    format(
      $cmd$SELECT net.http_post(url := %L, headers := %L::jsonb, body := %L::jsonb);$cmd$,
      fn_url,
      hdrs::text,
      '{"dryRun":false,"mode":"hourly","staleAfterHours":3,"maxCodes":200}'
    )
  );

  -- Nightly full refresh at 02:13 server time.
  PERFORM cron.schedule(
    'vg_sync_nightly',
    '13 2 * * *',
    format(
      $cmd$SELECT net.http_post(url := %L, headers := %L::jsonb, body := %L::jsonb);$cmd$,
      fn_url,
      hdrs::text,
      '{"dryRun":false,"mode":"full"}'
    )
  );
END $$;
