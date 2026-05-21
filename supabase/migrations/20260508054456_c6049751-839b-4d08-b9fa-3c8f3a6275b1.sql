ALTER TABLE public.cafeterias
  ADD COLUMN IF NOT EXISTS tax_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_apply_dine_in boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS tax_apply_takeaway boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tax_apply_delivery boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mode_dine_in boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS mode_takeaway boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mode_delivery boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_instructions text,
  ADD COLUMN IF NOT EXISTS bank_details text,
  ADD COLUMN IF NOT EXISTS google_maps_url text,
  ADD COLUMN IF NOT EXISTS opening_hours jsonb NOT NULL DEFAULT '{
    "sun":{"open":true,"from":"09:00","to":"23:00"},
    "mon":{"open":true,"from":"09:00","to":"23:00"},
    "tue":{"open":true,"from":"09:00","to":"23:00"},
    "wed":{"open":true,"from":"09:00","to":"23:00"},
    "thu":{"open":true,"from":"09:00","to":"23:00"},
    "fri":{"open":true,"from":"09:00","to":"23:00"},
    "sat":{"open":true,"from":"09:00","to":"23:00"}
  }'::jsonb;