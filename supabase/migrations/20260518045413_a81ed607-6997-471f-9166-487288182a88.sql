
-- 1. Enum additions
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'awaiting_payment';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'paid_at_counter';

-- 2. New columns
ALTER TABLE public.cafeterias
  ADD COLUMN IF NOT EXISTS takeaway_qr_token text UNIQUE DEFAULT replace((gen_random_uuid())::text, '-', '');

UPDATE public.cafeterias SET takeaway_qr_token = replace((gen_random_uuid())::text, '-', '')
 WHERE takeaway_qr_token IS NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_phone text;
