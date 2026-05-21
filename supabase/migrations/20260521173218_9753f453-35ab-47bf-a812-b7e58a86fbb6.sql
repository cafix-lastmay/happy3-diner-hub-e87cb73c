
CREATE OR REPLACE FUNCTION public.get_delivery_order_status(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE ord RECORD; dd RECORD; drv RECORD; cafe RECORD; driver_info jsonb := NULL; driver_id_out uuid := NULL;
BEGIN
  SELECT * INTO ord FROM public.orders WHERE id = _order_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO dd FROM public.delivery_details WHERE order_id = _order_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO cafe FROM public.cafeterias WHERE ref_code = ord.cafeteria_ref_code;
  IF dd.driver_id IS NOT NULL AND dd.status IN ('accepted','picked_up','on_the_way','delivered') THEN
    SELECT * INTO drv FROM public.drivers WHERE id = dd.driver_id;
    IF FOUND THEN
      driver_id_out := drv.id;
      driver_info := jsonb_build_object('name', drv.full_name, 'phone', drv.phone,
        'photo_url', drv.photo_url, 'vehicle_type', drv.vehicle_type, 'rating_avg', drv.rating_avg);
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'order_id', ord.id, 'short_code', ord.table_label, 'order_status', ord.status,
    'delivery_status', dd.status, 'fee_amount', dd.fee_amount, 'total', ord.total,
    'eta_minutes', cafe.estimated_delivery_minutes,
    'requested_at', dd.requested_at, 'responded_at', dd.responded_at,
    'picked_up_at', dd.picked_up_at, 'on_the_way_at', dd.on_the_way_at,
    'delivered_at', dd.delivered_at, 'driver', driver_info, 'driver_id', driver_id_out
  );
END $$;
