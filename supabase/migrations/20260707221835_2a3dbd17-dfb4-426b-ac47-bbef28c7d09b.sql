
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monthly-free-points-grant') THEN
    PERFORM cron.unschedule('monthly-free-points-grant');
  END IF;
  PERFORM cron.schedule(
    'monthly-free-points-grant',
    '5 0 1 * *',
    $cmd$ SELECT public.monthly_free_points_grant(); $cmd$
  );
END $$;
