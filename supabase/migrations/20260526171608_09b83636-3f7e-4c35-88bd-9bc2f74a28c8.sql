CREATE OR REPLACE FUNCTION public.handle_order_points_on_paid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  trial_ok boolean;
  cafe RECORD;
  cafe_user uuid;
  owner_user uuid;
  old_settled boolean;
  new_settled boolean;
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;

  old_settled := OLD.status IN ('paid'::order_status, 'paid_at_counter'::order_status);
  new_settled := NEW.status IN ('paid'::order_status, 'paid_at_counter'::order_status);

  -- Transition into a settled state: deduct points
  IF new_settled AND NOT old_settled THEN
    trial_ok := public.cafeteria_trial_active(NEW.cafeteria_ref_code);
    IF NOT trial_ok THEN
      UPDATE public.cafeterias
         SET points_balance = points_balance - NEW.total, updated_at = now()
       WHERE ref_code = NEW.cafeteria_ref_code
       RETURNING * INTO cafe;

      IF cafe.points_balance <= 0 AND cafe.grace_period_active = false THEN
        UPDATE public.cafeterias
           SET grace_period_active = true,
               grace_period_started_at = now()
         WHERE ref_code = NEW.cafeteria_ref_code;

        cafe_user := cafe.user_id;
        IF cafe_user IS NOT NULL THEN
          PERFORM public.create_notification(
            cafe_user, 'cafeteria.grace_started',
            'رصيد النقاط نفد',
            'لديك 72 ساعة لشحن الرصيد قبل إيقاف الكافيتريا.',
            jsonb_build_object('route','/cafeteria/recharge','ref_code', NEW.cafeteria_ref_code));
        END IF;
        FOR owner_user IN SELECT user_id FROM public.user_roles WHERE role = 'owner' LOOP
          PERFORM public.create_notification(
            owner_user, 'cafeteria.grace_started',
            'كافيتريا دخلت فترة السماح',
            'الكافيتريا ' || NEW.cafeteria_ref_code || ' نفد رصيدها — 72 ساعة متبقية.',
            jsonb_build_object('route','/owner/cafeterias','ref_code', NEW.cafeteria_ref_code));
        END LOOP;
      END IF;
    END IF;
  END IF;

  -- Transition out of settled (e.g. cancellation/refund): credit back
  IF old_settled AND NOT new_settled AND NEW.status = 'cancelled'::order_status THEN
    trial_ok := public.cafeteria_trial_active(NEW.cafeteria_ref_code);
    IF NOT trial_ok THEN
      UPDATE public.cafeterias
         SET points_balance = points_balance + OLD.total, updated_at = now()
       WHERE ref_code = NEW.cafeteria_ref_code;
    END IF;
  END IF;

  RETURN NEW;
END $function$;