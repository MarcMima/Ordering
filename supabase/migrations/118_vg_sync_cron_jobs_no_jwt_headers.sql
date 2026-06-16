-- Re-schedule VG sync jobs for a no-verify-jwt function deployment.
-- `sync-van-gelder` will be deployed with --no-verify-jwt.

DO $$
DECLARE
  fn_url TEXT := 'https://olcqzhxirqhkfgzgjnnw.supabase.co/functions/v1/sync-van-gelder';
  hdrs JSONB := jsonb_build_object('Content-Type', 'application/json');
  existing_job_id BIGINT;
BEGIN
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
