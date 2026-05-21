-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('owner','marketer','cafeteria_admin','waiter','chef');
CREATE TYPE public.signup_type AS ENUM ('created_by_parent','self_signup');
CREATE TYPE public.recharge_status AS ENUM ('pending','approved','rejected');
CREATE TYPE public.commission_status AS ENUM ('frozen','available','withdrawn');
CREATE TYPE public.withdrawal_status AS ENUM ('pending','approved','rejected','paid');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  whatsapp TEXT,
  address TEXT,
  language TEXT NOT NULL DEFAULT 'ar' CHECK (language IN ('ar','en')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ USER_ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  entity_ref_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============ COUNTRIES & CURRENCIES ============
CREATE TABLE public.currencies (
  code TEXT PRIMARY KEY,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  symbol TEXT NOT NULL
);

CREATE TABLE public.countries (
  code TEXT PRIMARY KEY,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  default_currency TEXT REFERENCES public.currencies(code),
  default_language TEXT NOT NULL DEFAULT 'ar' CHECK (default_language IN ('ar','en'))
);
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;

-- ============ MARKETERS ============
CREATE TABLE public.marketers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  ref_code TEXT NOT NULL UNIQUE,
  parent_ref_code TEXT,
  level INT NOT NULL CHECK (level BETWEEN 1 AND 4),
  signup_type public.signup_type NOT NULL,
  name TEXT NOT NULL,
  country_code TEXT REFERENCES public.countries(code),
  currency_code TEXT REFERENCES public.currencies(code),
  language TEXT NOT NULL DEFAULT 'ar' CHECK (language IN ('ar','en')),
  address TEXT,
  phone TEXT,
  whatsapp TEXT,
  email TEXT,
  commission_balance_available NUMERIC(14,4) NOT NULL DEFAULT 0,
  commission_balance_frozen NUMERIC(14,4) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.marketers ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_marketers_parent ON public.marketers(parent_ref_code);
CREATE INDEX idx_marketers_user ON public.marketers(user_id);

-- ============ CAFETERIAS ============
CREATE TABLE public.cafeterias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  ref_code TEXT NOT NULL UNIQUE,
  parent_ref_code TEXT NOT NULL,
  signup_type public.signup_type NOT NULL,
  name TEXT NOT NULL,
  country_code TEXT REFERENCES public.countries(code),
  currency_code TEXT REFERENCES public.currencies(code),
  language TEXT NOT NULL DEFAULT 'ar' CHECK (language IN ('ar','en')),
  address TEXT,
  phone TEXT,
  whatsapp TEXT,
  email TEXT,
  points_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  free_trial_until TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cafeterias ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_cafeterias_parent ON public.cafeterias(parent_ref_code);

-- ============ COMMISSION RATES ============
CREATE TABLE public.commission_rates (
  level_distance INT PRIMARY KEY CHECK (level_distance BETWEEN 1 AND 3),
  percentage NUMERIC(5,2) NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.commission_rates ENABLE ROW LEVEL SECURITY;

-- ============ REF CODE COUNTERS ============
CREATE TABLE public.ref_code_counters (
  parent_ref_code TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('marketer','cafeteria','marketer_self','cafeteria_self')),
  last_number INT NOT NULL DEFAULT 0,
  PRIMARY KEY (parent_ref_code, entity_type)
);
ALTER TABLE public.ref_code_counters ENABLE ROW LEVEL SECURITY;

-- ============ RECHARGE REQUESTS ============
CREATE TABLE public.recharge_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafeteria_ref_code TEXT NOT NULL REFERENCES public.cafeterias(ref_code),
  amount_usd NUMERIC(14,2) NOT NULL CHECK (amount_usd >= 5),
  exchange_rate_to_usd NUMERIC(14,6) NOT NULL DEFAULT 1,
  points_to_credit NUMERIC(14,2) NOT NULL,
  local_currency TEXT NOT NULL,
  receipt_url TEXT NOT NULL,
  status public.recharge_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.recharge_requests ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_recharges_cafeteria ON public.recharge_requests(cafeteria_ref_code);
CREATE INDEX idx_recharges_status ON public.recharge_requests(status);

-- ============ COMMISSION TRANSACTIONS ============
CREATE TABLE public.commission_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recharge_id UUID NOT NULL REFERENCES public.recharge_requests(id) ON DELETE CASCADE,
  marketer_ref_code TEXT NOT NULL REFERENCES public.marketers(ref_code),
  source_cafeteria_ref_code TEXT NOT NULL,
  level_distance INT NOT NULL,
  percentage NUMERIC(5,2) NOT NULL,
  amount_usd NUMERIC(14,4) NOT NULL,
  status public.commission_status NOT NULL DEFAULT 'frozen',
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.commission_transactions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_commission_marketer ON public.commission_transactions(marketer_ref_code);
CREATE INDEX idx_commission_status ON public.commission_transactions(status);

-- ============ WITHDRAWAL REQUESTS ============
CREATE TABLE public.withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketer_ref_code TEXT NOT NULL REFERENCES public.marketers(ref_code),
  amount_usd NUMERIC(14,2) NOT NULL CHECK (amount_usd > 0),
  status public.withdrawal_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  processed_by UUID REFERENCES auth.users(id),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

-- ============ SECURITY DEFINER FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.get_my_marketer_ref_code()
RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ref_code FROM public.marketers WHERE user_id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_my_cafeteria_ref_code()
RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ref_code FROM public.cafeterias WHERE user_id = auth.uid() LIMIT 1
$$;

-- Check if marketer A is ancestor of code B (B starts with A's code as prefix)
CREATE OR REPLACE FUNCTION public.is_ancestor_of(_ancestor_code TEXT, _descendant_code TEXT)
RETURNS BOOLEAN LANGUAGE SQL IMMUTABLE AS $$
  SELECT _descendant_code LIKE (_ancestor_code || '%') AND _descendant_code <> _ancestor_code
$$;

-- ============ GENERATE REF CODE ============
CREATE OR REPLACE FUNCTION public.generate_ref_code(_parent_ref_code TEXT, _entity_type TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  next_num INT;
  new_code TEXT;
BEGIN
  -- Lock and increment counter
  INSERT INTO public.ref_code_counters (parent_ref_code, entity_type, last_number)
  VALUES (_parent_ref_code, _entity_type, 1)
  ON CONFLICT (parent_ref_code, entity_type)
  DO UPDATE SET last_number = ref_code_counters.last_number + 1
  RETURNING last_number INTO next_num;

  IF _entity_type = 'marketer' THEN
    -- 2-digit per level: 01..99
    IF next_num > 99 THEN RAISE EXCEPTION 'Marketer slots exhausted under %', _parent_ref_code; END IF;
    new_code := _parent_ref_code || lpad(next_num::TEXT, 2, '0');
  ELSIF _entity_type = 'cafeteria' THEN
    IF next_num > 99 THEN RAISE EXCEPTION 'Cafeteria slots exhausted under %', _parent_ref_code; END IF;
    new_code := _parent_ref_code || 'B' || lpad(next_num::TEXT, 2, '0');
  ELSIF _entity_type = 'marketer_self' THEN
    -- 10N#### up to 9999
    IF next_num > 9999 THEN RAISE EXCEPTION 'Self-signup marketer slots exhausted'; END IF;
    new_code := _parent_ref_code || 'N' || lpad(next_num::TEXT, 4, '0');
  ELSIF _entity_type = 'cafeteria_self' THEN
    IF next_num > 9999 THEN RAISE EXCEPTION 'Self-signup cafeteria slots exhausted'; END IF;
    new_code := _parent_ref_code || 'B' || lpad(next_num::TEXT, 4, '0');
  ELSE
    RAISE EXCEPTION 'Unknown entity_type %', _entity_type;
  END IF;

  RETURN new_code;
END;
$$;

-- ============ COMMISSION ENGINE: distribute on recharge approval ============
-- Walk up parents from cafeteria's parent_ref_code based on the ref_code prefix structure.
-- Simple approach: get cafeteria.parent_ref_code (the marketer who created it), then walk that
-- marketer's chain via parent_ref_code field.
CREATE OR REPLACE FUNCTION public.approve_recharge(_recharge_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  current_marketer RECORD;
  rate RECORD;
  distance INT := 1;
  commission_amt NUMERIC(14,4);
  prev_frozen RECORD;
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner') THEN
    RAISE EXCEPTION 'Only owner can approve recharges';
  END IF;

  SELECT * INTO r FROM public.recharge_requests WHERE id = _recharge_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Recharge not found or already processed'; END IF;

  -- 1. Credit cafeteria points
  UPDATE public.cafeterias
  SET points_balance = points_balance + r.points_to_credit, updated_at = now()
  WHERE ref_code = r.cafeteria_ref_code;

  -- 2. Mark recharge approved
  UPDATE public.recharge_requests
  SET status = 'approved', approved_by = auth.uid(), approved_at = now()
  WHERE id = _recharge_id;

  -- 3. Walk marketer chain upward (parent of cafeteria, then its parent, etc.)
  SELECT m.* INTO current_marketer
  FROM public.cafeterias c
  JOIN public.marketers m ON m.ref_code = c.parent_ref_code
  WHERE c.ref_code = r.cafeteria_ref_code;

  WHILE current_marketer.ref_code IS NOT NULL AND distance <= 3 LOOP
    SELECT * INTO rate FROM public.commission_rates WHERE level_distance = distance;
    IF FOUND AND rate.percentage > 0 THEN
      commission_amt := round(r.amount_usd * rate.percentage / 100, 4);

      -- Insert new frozen commission
      INSERT INTO public.commission_transactions
        (recharge_id, marketer_ref_code, source_cafeteria_ref_code, level_distance, percentage, amount_usd, status)
      VALUES
        (_recharge_id, current_marketer.ref_code, r.cafeteria_ref_code, distance, rate.percentage, commission_amt, 'frozen');

      UPDATE public.marketers
      SET commission_balance_frozen = commission_balance_frozen + commission_amt, updated_at = now()
      WHERE ref_code = current_marketer.ref_code;

      -- Release the second-most-recent frozen commission for this marketer (keep latest frozen)
      FOR prev_frozen IN
        SELECT id, amount_usd FROM public.commission_transactions
        WHERE marketer_ref_code = current_marketer.ref_code AND status = 'frozen'
        ORDER BY created_at DESC
        OFFSET 1
      LOOP
        UPDATE public.commission_transactions
        SET status = 'available', released_at = now()
        WHERE id = prev_frozen.id;

        UPDATE public.marketers
        SET commission_balance_frozen = commission_balance_frozen - prev_frozen.amount_usd,
            commission_balance_available = commission_balance_available + prev_frozen.amount_usd,
            updated_at = now()
        WHERE ref_code = current_marketer.ref_code;
      END LOOP;
    END IF;

    -- Move up
    IF current_marketer.parent_ref_code IS NULL THEN EXIT; END IF;
    SELECT * INTO current_marketer FROM public.marketers WHERE ref_code = current_marketer.parent_ref_code;
    distance := distance + 1;
  END LOOP;
END;
$$;

-- ============ REJECT RECHARGE ============
CREATE OR REPLACE FUNCTION public.reject_recharge(_recharge_id UUID, _notes TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner') THEN
    RAISE EXCEPTION 'Only owner can reject recharges';
  END IF;
  UPDATE public.recharge_requests
  SET status = 'rejected', notes = _notes, approved_by = auth.uid(), approved_at = now()
  WHERE id = _recharge_id AND status = 'pending';
END;
$$;

-- ============ TRIGGERS ============
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_marketers_updated BEFORE UPDATE ON public.marketers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_cafeterias_updated BEFORE UPDATE ON public.cafeterias
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ RLS POLICIES ============

-- profiles: users can see/update their own; owner sees all
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Owner views all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(),'owner'));

-- user_roles: users see own; owner sees all
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Owner views all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(),'owner'));
CREATE POLICY "Owner manages roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'owner'));

-- countries / currencies: public read
CREATE POLICY "Anyone reads countries" ON public.countries FOR SELECT USING (true);
CREATE POLICY "Anyone reads currencies" ON public.currencies FOR SELECT USING (true);
CREATE POLICY "Owner manages countries" ON public.countries FOR ALL USING (public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'owner'));
CREATE POLICY "Owner manages currencies" ON public.currencies FOR ALL USING (public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'owner'));

-- marketers
CREATE POLICY "Marketer views self" ON public.marketers FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Marketer views descendants" ON public.marketers FOR SELECT
  USING (public.is_ancestor_of(public.get_my_marketer_ref_code(), ref_code));
CREATE POLICY "Owner views all marketers" ON public.marketers FOR SELECT
  USING (public.has_role(auth.uid(),'owner'));
CREATE POLICY "Owner manages marketers" ON public.marketers FOR ALL
  USING (public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'owner'));
CREATE POLICY "Marketer updates self" ON public.marketers FOR UPDATE
  USING (auth.uid() = user_id);

-- cafeterias
CREATE POLICY "Cafeteria views self" ON public.cafeterias FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Marketer views own cafeterias" ON public.cafeterias FOR SELECT
  USING (
    parent_ref_code = public.get_my_marketer_ref_code()
    OR public.is_ancestor_of(public.get_my_marketer_ref_code(), parent_ref_code)
  );
CREATE POLICY "Owner views all cafeterias" ON public.cafeterias FOR SELECT
  USING (public.has_role(auth.uid(),'owner'));
CREATE POLICY "Owner manages cafeterias" ON public.cafeterias FOR ALL
  USING (public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'owner'));

-- commission_rates: public read, owner write
CREATE POLICY "Anyone reads commission rates" ON public.commission_rates FOR SELECT USING (true);
CREATE POLICY "Owner manages commission rates" ON public.commission_rates FOR ALL
  USING (public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'owner'));

-- ref_code_counters: owner only
CREATE POLICY "Owner reads counters" ON public.ref_code_counters FOR SELECT
  USING (public.has_role(auth.uid(),'owner'));

-- recharge_requests
CREATE POLICY "Cafeteria views own recharges" ON public.recharge_requests FOR SELECT
  USING (cafeteria_ref_code = public.get_my_cafeteria_ref_code());
CREATE POLICY "Cafeteria creates own recharges" ON public.recharge_requests FOR INSERT
  WITH CHECK (cafeteria_ref_code = public.get_my_cafeteria_ref_code());
CREATE POLICY "Owner views all recharges" ON public.recharge_requests FOR SELECT
  USING (public.has_role(auth.uid(),'owner'));
CREATE POLICY "Owner updates recharges" ON public.recharge_requests FOR UPDATE
  USING (public.has_role(auth.uid(),'owner'));

-- commission_transactions
CREATE POLICY "Marketer views own commissions" ON public.commission_transactions FOR SELECT
  USING (marketer_ref_code = public.get_my_marketer_ref_code());
CREATE POLICY "Owner views all commissions" ON public.commission_transactions FOR SELECT
  USING (public.has_role(auth.uid(),'owner'));

-- withdrawal_requests
CREATE POLICY "Marketer views own withdrawals" ON public.withdrawal_requests FOR SELECT
  USING (marketer_ref_code = public.get_my_marketer_ref_code());
CREATE POLICY "Marketer creates own withdrawals" ON public.withdrawal_requests FOR INSERT
  WITH CHECK (marketer_ref_code = public.get_my_marketer_ref_code());
CREATE POLICY "Owner views all withdrawals" ON public.withdrawal_requests FOR SELECT
  USING (public.has_role(auth.uid(),'owner'));
CREATE POLICY "Owner updates withdrawals" ON public.withdrawal_requests FOR UPDATE
  USING (public.has_role(auth.uid(),'owner'));

-- ============ STORAGE BUCKETS ============
INSERT INTO storage.buckets (id, name, public) VALUES ('recharge-receipts', 'recharge-receipts', false)
ON CONFLICT DO NOTHING;

CREATE POLICY "Cafeteria uploads own receipts" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'recharge-receipts' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Cafeteria reads own receipts" ON storage.objects FOR SELECT
  USING (bucket_id = 'recharge-receipts' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Owner reads all receipts" ON storage.objects FOR SELECT
  USING (bucket_id = 'recharge-receipts' AND public.has_role(auth.uid(),'owner'));

-- ============ SEED DATA ============
INSERT INTO public.currencies (code, name_en, name_ar, symbol) VALUES
  ('USD','US Dollar','دولار أمريكي','$'),
  ('SAR','Saudi Riyal','ريال سعودي','﷼'),
  ('AED','UAE Dirham','درهم إماراتي','د.إ'),
  ('EGP','Egyptian Pound','جنيه مصري','ج.م'),
  ('EUR','Euro','يورو','€'),
  ('KWD','Kuwaiti Dinar','دينار كويتي','د.ك'),
  ('QAR','Qatari Riyal','ريال قطري','ر.ق'),
  ('JOD','Jordanian Dinar','دينار أردني','د.أ'),
  ('MAD','Moroccan Dirham','درهم مغربي','د.م'),
  ('TRY','Turkish Lira','ليرة تركية','₺')
ON CONFLICT DO NOTHING;

INSERT INTO public.countries (code, name_en, name_ar, default_currency, default_language) VALUES
  ('SA','Saudi Arabia','المملكة العربية السعودية','SAR','ar'),
  ('AE','United Arab Emirates','الإمارات العربية المتحدة','AED','ar'),
  ('EG','Egypt','مصر','EGP','ar'),
  ('KW','Kuwait','الكويت','KWD','ar'),
  ('QA','Qatar','قطر','QAR','ar'),
  ('JO','Jordan','الأردن','JOD','ar'),
  ('MA','Morocco','المغرب','MAD','ar'),
  ('TR','Türkiye','تركيا','TRY','en'),
  ('US','United States','الولايات المتحدة','USD','en')
ON CONFLICT DO NOTHING;

-- Default commission rates (Owner can edit later)
INSERT INTO public.commission_rates (level_distance, percentage) VALUES
  (1, 10.00),
  (2, 2.00),
  (3, 1.00)
ON CONFLICT DO NOTHING;

-- Default commission rates accessible to all authenticated users for transparency
-- (already covered by "Anyone reads commission rates" policy)