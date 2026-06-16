-- Ensure Java Bakery queued WhatsApp orders are always flushed after 18:00 Amsterdam time.
-- We run every 10 minutes; function itself only flushes after 18:00 Europe/Amsterdam.

DO $$
DECLARE
  fn_url TEXT := 'https://olcqzhxirqhkfgzgjnnw.supabase.co/functions/v1/dispatch-order';
  hdrs JSONB := jsonb_build_object('Content-Type', 'application/json');
  existing_job_id BIGINT;
BEGIN
  SELECT jobid INTO existing_job_id FROM cron.job WHERE jobname = 'java_bakery_flush_queue' LIMIT 1;
  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'java_bakery_flush_queue',
    '*/10 * * * *',
    format(
      $cmd$SELECT net.http_post(url := %L, headers := %L::jsonb, body := %L::jsonb);$cmd$,
      fn_url,
      hdrs::text,
      '{"action":"flush_java_queue"}'
    )
  );
END $$;
