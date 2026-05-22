ALTER TABLE public.cafeterias DISABLE TRIGGER trg_protect_cafeteria_sensitive;

UPDATE public.cafeterias SET parent_ref_code = '1001' WHERE ref_code = '10B01';
UPDATE public.cafeterias SET parent_ref_code = '1002' WHERE ref_code = '10B02';
UPDATE public.cafeterias SET parent_ref_code = '1006' WHERE ref_code = '10B03';

UPDATE public.cafeterias AS c
SET points_balance = (
  SELECT COALESCE(SUM(r.points_to_credit), 0)
  FROM public.recharge_requests AS r
  WHERE r.cafeteria_ref_code = c.ref_code
    AND r.status = 'approved'
)
WHERE c.ref_code = '10B01';

ALTER TABLE public.cafeterias ENABLE TRIGGER trg_protect_cafeteria_sensitive;