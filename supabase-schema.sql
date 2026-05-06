-- ============================================================
-- ServiCore — Complete Supabase Schema
-- Run this in Supabase SQL Editor (one at a time or all together)
-- ============================================================

-- 1. EXTENSIONS
------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA extensions;

-- 2. PROFILES TABLE (synced with auth.users)
------------------------------------------------------------
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'technician')) DEFAULT 'technician',
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), 'technician');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. CLIENTS TABLE
------------------------------------------------------------
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  company_name TEXT,
  phone TEXT NOT NULL,
  address TEXT,
  branch TEXT,
  qr_uuid UUID UNIQUE DEFAULT gen_random_uuid(),
  service_frequency_months INT DEFAULT 6,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. EQUIPMENT TABLE
------------------------------------------------------------
CREATE TABLE public.equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  type TEXT NOT NULL,         -- e.g. 'Camera', 'UPS', 'Battery'
  make TEXT,                  -- e.g. 'Hikvision', 'APC'
  model TEXT,
  serial_number TEXT,
  purchase_date DATE,
  warranty_expiry DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. SERVICE CONTRACTS
------------------------------------------------------------
CREATE TABLE public.service_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  equipment_id UUID REFERENCES public.equipment(id) ON DELETE SET NULL,
  frequency_months INT NOT NULL DEFAULT 6,
  last_service_date DATE,
  next_service_date DATE,
  contract_start DATE,
  contract_end DATE,
  annual_fee DECIMAL(12,2),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. SERVICE VISITS (with GPS proof)
------------------------------------------------------------
CREATE TABLE public.service_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  equipment_id UUID REFERENCES public.equipment(id) ON DELETE SET NULL,
  technician_id UUID REFERENCES public.profiles(id),
  scheduled_date DATE NOT NULL,
  completed_date DATE,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  checkin_source TEXT CHECK (checkin_source IN ('manual', 'qr_code')),
  tech_name TEXT,
  tech_phone TEXT,
  notes TEXT,
  parts_used TEXT,
  hours_spent DECIMAL(4,1),
  gps_latitude DOUBLE PRECISION,
  gps_longitude DOUBLE PRECISION,
  photo_url TEXT,
  signature_data TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7. SERVICE PHOTOS (multiple photos per visit)
------------------------------------------------------------
CREATE TABLE public.service_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES public.service_visits(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  gps_latitude DOUBLE PRECISION,
  gps_longitude DOUBLE PRECISION,
  timestamp TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. EXPENSE CATEGORIES
------------------------------------------------------------
CREATE TABLE public.expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  icon TEXT
);

INSERT INTO public.expense_categories (name, type) VALUES
  ('Service Fee', 'income'),
  ('AMC Contract', 'income'),
  ('Equipment Sale', 'income'),
  ('Installation Charge', 'income'),
  ('Other Income', 'income'),
  ('Parts / Spares', 'expense'),
  ('Travel', 'expense'),
  ('Salary', 'expense'),
  ('Office Rent', 'expense'),
  ('Utilities', 'expense'),
  ('Marketing', 'expense'),
  ('Other Expense', 'expense')
ON CONFLICT DO NOTHING;

-- 9. FINANCIAL TRANSACTIONS
------------------------------------------------------------
CREATE TABLE public.financial_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount DECIMAL(12,2) NOT NULL,
  category TEXT,
  description TEXT,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  payment_method TEXT CHECK (payment_method IN ('cash', 'upi', 'bank', 'cheque')),
  transaction_date DATE DEFAULT CURRENT_DATE,
  receipt_url TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 10. REMINDERS
-------------------------------------------------------------
CREATE TABLE public.reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  scheduled_date DATE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  whatsapp_sent BOOLEAN DEFAULT false,
  whatsapp_message_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 11. STORAGE BUCKETS
-------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public) VALUES
  ('service-photos', 'service-photos', true),
  ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- MIGRATION: Apply to existing databases (safe to re-run)
-- ============================================================

-- Add qr_uuid to clients (if not exists)
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS qr_uuid UUID UNIQUE DEFAULT gen_random_uuid();

-- Add check-in columns to service_visits
ALTER TABLE public.service_visits ADD COLUMN IF NOT EXISTS checkin_source TEXT CHECK (checkin_source IN ('manual', 'qr_code'));
ALTER TABLE public.service_visits ADD COLUMN IF NOT EXISTS tech_name TEXT;
ALTER TABLE public.service_visits ADD COLUMN IF NOT EXISTS tech_phone TEXT;
ALTER TABLE public.service_visits ADD COLUMN IF NOT EXISTS parts_used TEXT;
ALTER TABLE public.service_visits ADD COLUMN IF NOT EXISTS hours_spent DECIMAL(4,1);
ALTER TABLE public.service_visits ADD COLUMN IF NOT EXISTS signature_data TEXT;

-- Allow public QR check-in (no auth required) to create visits
CREATE POLICY visits_public_insert ON public.service_visits
  FOR INSERT WITH CHECK (checkin_source = 'qr_code');

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

-- Policy helper: check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Profiles: users can read their own, admins can read all
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT USING (auth.uid() = id OR is_admin());

CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE USING (auth.uid() = id OR is_admin());

-- Clients: admins full access, technicians read-only
CREATE POLICY clients_admin ON public.clients
  FOR ALL USING (is_admin());

CREATE POLICY clients_tech_read ON public.clients
  FOR SELECT USING (auth.role() = 'authenticated');

-- Equipment: admins full, technicians read
CREATE POLICY equipment_admin ON public.equipment
  FOR ALL USING (is_admin());

CREATE POLICY equipment_tech_read ON public.equipment
  FOR SELECT USING (auth.role() = 'authenticated');

-- Service Visits: admins full, technicians see assigned + update own
CREATE POLICY visits_admin ON public.service_visits
  FOR ALL USING (is_admin());

CREATE POLICY visits_tech_select ON public.service_visits
  FOR SELECT USING (technician_id = auth.uid());

CREATE POLICY visits_tech_update ON public.service_visits
  FOR UPDATE USING (technician_id = auth.uid());

-- Financial: admins only
CREATE POLICY finance_admin ON public.financial_transactions
  FOR ALL USING (is_admin());

-- Reminders: admins full, technicians read
CREATE POLICY reminders_admin ON public.reminders
  FOR ALL USING (is_admin());

CREATE POLICY reminders_tech_read ON public.reminders
  FOR SELECT USING (auth.role() = 'authenticated');

-- Storage: authenticated can upload to service-photos
CREATE POLICY storage_photos_insert ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'service-photos' AND auth.role() = 'authenticated');

CREATE POLICY storage_photos_select ON storage.objects
  FOR SELECT USING (bucket_id = 'service-photos');

-- ============================================================
-- AUTO-TRIGGER: Update next_service_date on visit completion
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_next_service()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    UPDATE public.service_contracts
    SET last_service_date = NEW.completed_date,
        next_service_date = NEW.completed_date + (frequency_months || ' months')::INTERVAL
    WHERE client_id = NEW.client_id AND status = 'active';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_visit_completed
  AFTER UPDATE ON public.service_visits
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION public.update_next_service();

-- ============================================================
-- CRON: Daily check for upcoming services → create reminders
-- ============================================================
SELECT cron.schedule(
  'daily-reminder-check',
  '0 9 * * *',   -- 9 AM daily
  $$
  INSERT INTO public.reminders (client_id, scheduled_date, status)
  SELECT
    sc.client_id,
    sc.next_service_date,
    'pending'
  FROM public.service_contracts sc
  WHERE sc.status = 'active'
    AND sc.next_service_date <= CURRENT_DATE + INTERVAL '7 days'
    AND sc.next_service_date >= CURRENT_DATE
    AND NOT EXISTS (
      SELECT 1 FROM public.reminders r
      WHERE r.client_id = sc.client_id
        AND r.scheduled_date = sc.next_service_date
        AND r.status != 'failed'
    );
  $$
);
