ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS points_per_usd numeric NOT NULL DEFAULT 200;