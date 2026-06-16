-- Ensure VG sync cron jobs are scheduled using project anon publishable key.
-- Needed because app.settings.anon_key can be unavailable in some projects.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  fn_url TEXT := 'https://olcqzhxirqhkfgzgjnnw.supabase.co/functions/v1/sync-van-gelder';
  anon_key TEXT := 'sb_publishable_Xd6i1yV5VKNbYb9fz5eHyw_wRV7IYqu';
  hdrs JSONB;
  existing_job_id BIGINT;
BEGIN
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
