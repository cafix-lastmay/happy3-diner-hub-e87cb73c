CREATE OR REPLACE FUNCTION public.get_delivery_order_items(_order_id uuid, _customer_phone text)
RETURNS TABLE(item_id uuid, name text, qty integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_phone text;
BEGIN
  SELECT (delivery_details->>'customer_phone') INTO v_phone FROM public.orders WHERE id = _order_id;
  IF v_phone IS NULL OR btrim(v_phone) <> btrim(_customer_phone) THEN
    RAISE EXCEPTION 'PHONE_MISMATCH';
  END IF;
  RETURN QUERY
    SELECT oi.item_id, oi.name_snapshot, oi.qty::int
    FROM public.order_items oi
    WHERE oi.order_id = _order_id AND oi.item_id IS NOT NULL
    ORDER BY oi.name_snapshot;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_delivery_order_items(uuid, text) TO anon, authenticated;