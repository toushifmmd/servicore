-- ============================================================
-- ServiCore — Seed Data (fixed: handles profiles FK constraint)
-- Run in Supabase SQL Editor AFTER the schema is deployed
-- ============================================================

-- ============================================================
-- 0. PREP: Temporarily drop FK so we can seed demo profiles
-- ============================================================
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

-- Migration: add columns if schema is older (safe to re-run)
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS qr_uuid UUID UNIQUE DEFAULT gen_random_uuid();
ALTER TABLE public.service_visits ADD COLUMN IF NOT EXISTS checkin_source TEXT CHECK (checkin_source IN ('manual', 'qr_code'));
ALTER TABLE public.service_visits ADD COLUMN IF NOT EXISTS tech_name TEXT;
ALTER TABLE public.service_visits ADD COLUMN IF NOT EXISTS tech_phone TEXT;
ALTER TABLE public.service_visits ADD COLUMN IF NOT EXISTS parts_used TEXT;
ALTER TABLE public.service_visits ADD COLUMN IF NOT EXISTS hours_spent DECIMAL(4,1);
ALTER TABLE public.service_visits ADD COLUMN IF NOT EXISTS signature_data TEXT;
-- Allow public QR check-in (no auth required)
CREATE POLICY IF NOT EXISTS visits_public_insert ON public.service_visits FOR INSERT WITH CHECK (checkin_source = 'qr_code');

-- ============================================================
-- 1. TEST USERS (demo profiles — no real auth.users needed)
-- ============================================================
INSERT INTO public.profiles (id, email, full_name, role, phone) VALUES
  ('00000000-0000-0000-0000-000000000001', 'admin@servicore.com', 'Admin User', 'admin', '+919876543210'),
  ('00000000-0000-0000-0000-000000000002', 'rajesh@servicore.com', 'Rajesh Kumar', 'technician', '+919876543211'),
  ('00000000-0000-0000-0000-000000000003', 'suresh@servicore.com', 'Suresh Patel', 'technician', '+919876543212'),
  ('00000000-0000-0000-0000-000000000004', 'vikram@servicore.com', 'Vikram Singh', 'technician', '+919876543213'),
  ('00000000-0000-0000-0000-000000000005', 'arif@servicore.com', 'Arif Hussain', 'technician', '+919876543214')
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, role = EXCLUDED.role, phone = EXCLUDED.phone;

-- ============================================================
-- 2. CLIENTS — 30 realistic Indian businesses
-- ============================================================
INSERT INTO public.clients (id, name, company_name, phone, address, branch, service_frequency_months, notes) VALUES
  -- Banks (multi-branch)
  ('10000000-0000-0000-0000-000000000001', 'SBI Main Branch', 'State Bank of India', '+911126811111', '11 Parliament Street', 'Delhi HQ', 6, 'Main branch — 12 CCTV cameras, 2 UPS systems'),
  ('10000000-0000-0000-0000-000000000002', 'SBI Connaught Place', 'State Bank of India', '+911126811112', 'Connaught Place', 'CP', 6, '8 cameras, 1 UPS'),
  ('10000000-0000-0000-0000-000000000003', 'SBI Karol Bagh', 'State Bank of India', '+911126811113', 'Karol Bagh', 'Karol Bagh', 6, '6 cameras'),
  ('10000000-0000-0000-0000-000000000004', 'SBI Lajpat Nagar', 'State Bank of India', '+911126811114', 'Lajpat Nagar', 'Lajpat Nagar', 6, '10 cameras, 1 UPS'),
  ('10000000-0000-0000-0000-000000000005', 'SBI Rohini', 'State Bank of India', '+911126811115', 'Rohini Sector 8', 'Rohini', 6, '8 cameras'),
  ('10000000-0000-0000-0000-000000000006', 'HDFC Nehru Place', 'HDFC Bank Ltd', '+911140420001', 'Nehru Place', 'Nehru Place', 6, '14 cameras, 2 UPS, battery bank'),
  ('10000000-0000-0000-0000-000000000007', 'HDFC Saket', 'HDFC Bank Ltd', '+911140420002', 'Saket', 'Saket', 6, '10 cameras, 1 UPS'),
  ('10000000-0000-0000-0000-000000000008', 'HDFC Dwarka', 'HDFC Bank Ltd', '+911140420003', 'Dwarka Sector 12', 'Dwarka', 6, '8 cameras'),
  ('10000000-0000-0000-0000-000000000009', 'ICICI Gurgaon', 'ICICI Bank Ltd', '+911244440001', 'Cyber City', 'Gurgaon', 6, '20 cameras, 3 UPS, dual battery'),
  ('10000000-0000-0000-0000-000000000010', 'ICICI Noida', 'ICICI Bank Ltd', '+911204440002', 'Sector 62', 'Noida', 6, '16 cameras, 2 UPS'),
  ('10000000-0000-0000-0000-000000000011', 'Axis Bank Pitampura', 'Axis Bank Ltd', '+911127310001', 'Pitampura', 'Pitampura', 6, '12 cameras, 1 UPS'),
  ('10000000-0000-0000-0000-000000000012', 'PNB Janakpuri', 'Punjab National Bank', '+911128550001', 'Janakpuri', 'Janakpuri', 6, '8 cameras, 1 UPS'),

  -- Corporate / Commercial
  ('10000000-0000-0000-0000-000000000013', 'Infosys DC', 'Infosys Ltd', '+918088880001', 'Electronic City Phase 1', 'Bangalore DC', 4, '50+ cameras, 10 UPS, large battery room — quarterly service'),
  ('10000000-0000-0000-0000-000000000014', 'TCS Noida', 'Tata Consultancy Services', '+911206660001', 'Sector 125', 'Noida Campus', 6, '30 cameras, 5 UPS'),
  ('10000000-0000-0000-0000-000000000015', 'DLF Mall', 'DLF Ltd', '+911244450001', 'DLF Phase 1', 'Gurgaon', 4, 'Entire mall — 40 cameras, 6 UPS systems'),
  ('10000000-0000-0000-0000-000000000016', 'Apollo Hospital', 'Apollo Hospitals', '+911129850001', 'Sarita Vihar', 'Delhi', 4, 'Critical care — 25 cameras, 8 UPS, backup batteries'),
  ('10000000-0000-0000-0000-000000000017', 'Marriott Hotel', 'Marriott International', '+911145670001', 'Aerocity', 'Delhi', 6, '15 cameras, 3 UPS'),
  ('10000000-0000-0000-0000-000000000018', 'L&T Office', 'Larsen & Toubro', '+912266560001', 'Powai', 'Mumbai HQ', 6, 'Corporate office — 22 cameras, 4 UPS'),

  -- Individual / Small Business
  ('10000000-0000-0000-0000-000000000019', 'Sharma General Store', 'Sharma General Store', '+919819876543', 'Shop 4, Sadar Bazaar', 'Delhi', 6, '2 cameras'),
  ('10000000-0000-0000-0000-000000000020', 'Gupta Electronics', 'Gupta Electronics', '+919818765432', 'Shop 15, Nehru Place', 'Delhi', 6, '4 cameras, 1 UPS'),
  ('10000000-0000-0000-0000-000000000021', 'Patel Medical Store', 'Patel Medical Store', '+919817654321', 'Opp. Metro Hospital', 'Noida', 6, '3 cameras'),
  ('10000000-0000-0000-0000-000000000022', 'Singh Auto Garage', 'Singh Auto Garage', '+919816543210', 'GT Karnal Road', 'Delhi', 6, '2 cameras'),
  ('10000000-0000-0000-0000-000000000023', 'Khan Jewellers', 'Khan Jewellers', '+919815432109', 'Chandni Chowk', 'Delhi', 4, 'High security — 8 cameras, 2 UPS, quarterly'),
  ('10000000-0000-0000-0000-000000000024', 'Reddy Sweets', 'Reddy Sweets & Snacks', '+919814321098', 'Kukatpally', 'Hyderabad', 6, '4 cameras'),
  ('10000000-0000-0000-0000-000000000025', 'Mehta Hardware', 'Mehta Hardware & Paints', '+919813210987', 'Lajpat Nagar Market', 'Delhi', 6, '2 cameras'),
  ('10000000-0000-0000-0000-000000000026', 'Kumar Associates', 'Kumar & Associates', '+919812109876', 'Sector 18', 'Noida', 6, 'Chartered accountants — 4 cameras, 1 UPS'),
  ('10000000-0000-0000-0000-000000000027', 'Shah Impex', 'Shah Impex Pvt Ltd', '+919811098765', 'Andheri East', 'Mumbai', 6, 'Import/export — 6 cameras, 1 UPS'),
  ('10000000-0000-0000-0000-000000000028', 'Das Bakery', 'Das Bakery & Confectionery', '+919810987654', 'Park Street', 'Kolkata', 6, '3 cameras'),
  ('10000000-0000-0000-0000-000000000029', 'Nair Clinic', 'Nair Dental Clinic', '+919809876543', 'MG Road', 'Bangalore', 6, '2 cameras'),
  ('10000000-0000-0000-0000-000000000030', 'Verma Residence', 'Mr. Anil Verma', '+919808765432', 'A-14, Vasant Kunj', 'Delhi', 6, 'Residential — 4 cameras, 1 UPS')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 3. EQUIPMENT — Cameras, UPS, Batteries per client
-- ============================================================
DO $$
DECLARE
    c RECORD;
    eq_count INT;
    i INT;
    tech_id INT;
BEGIN
    tech_id := 0;
    FOR c IN SELECT id, name FROM public.clients LOOP
        IF EXISTS (SELECT 1 FROM public.equipment WHERE client_id = c.id LIMIT 1) THEN
            CONTINUE;
        END IF;

        eq_count := CASE
            WHEN c.name LIKE 'SBI%' THEN 8 + (random() * 4)::INT
            WHEN c.name LIKE 'HDFC%' THEN 10 + (random() * 4)::INT
            WHEN c.name LIKE 'ICICI%' THEN 14 + (random() * 4)::INT
            WHEN c.name IN ('Infosys DC', 'TCS Noida') THEN 20 + (random() * 10)::INT
            WHEN c.name IN ('DLF Mall', 'Apollo Hospital') THEN 20 + (random() * 10)::INT
            ELSE 2 + (random() * 6)::INT
        END CASE;

        FOR i IN 1..eq_count LOOP
            tech_id := tech_id + 1;
            INSERT INTO public.equipment (id, client_id, type, make, model, serial_number, purchase_date, warranty_expiry)
            VALUES (
                ('20000000-0000-0000-0000-' || LPAD(tech_id::TEXT, 12, '0'))::UUID,
                c.id,
                (ARRAY['Camera','Camera','Camera','Camera','UPS','UPS','Battery','Battery'])[1 + floor(random() * 8)],
                (ARRAY['Hikvision','Dahua','CP Plus','Samsung','Bosch'])[1 + floor(random() * 5)],
                (ARRAY['DS-2CD2043G2','IPC-HFW2431S','CP-UNC-TA20','SND-L6013R','DINION 5000','SMX1500','Cruze 2KVA','RT 2KVA'])[1 + floor(random() * 8)],
                'SN-' || LPAD(tech_id::TEXT, 8, '0'),
                CURRENT_DATE - (random() * 730)::INT,
                CURRENT_DATE + (random() * 365 + 180)::INT
            );
        END LOOP;
    END LOOP;
END $$;

-- ============================================================
-- 4. SERVICE CONTRACTS — per client-equipment
-- ============================================================
INSERT INTO public.service_contracts (client_id, equipment_id, frequency_months, next_service_date, contract_start, contract_end, annual_fee, status)
SELECT
    c.id,
    e.id,
    c.service_frequency_months,
    CURRENT_DATE + (random() * 180)::INT,
    CURRENT_DATE - (random() * 365)::INT,
    (CURRENT_DATE - (random() * 365)::INT) + 365,
    CASE 
        WHEN c.name LIKE 'SBI%' THEN 5000 + (random() * 2000)::INT
        WHEN c.name LIKE 'HDFC%' THEN 6000 + (random() * 3000)::INT
        WHEN c.name LIKE 'ICICI%' THEN 8000 + (random() * 4000)::INT
        WHEN c.name IN ('Infosys DC', 'TCS Noida') THEN 25000 + (random() * 15000)::INT
        WHEN c.name IN ('DLF Mall', 'Apollo Hospital') THEN 20000 + (random() * 10000)::INT
        ELSE 2000 + (random() * 3000)::INT
    END,
    CASE floor(random() * 10) WHEN 0 THEN 'expired' ELSE 'active' END
FROM public.clients c
JOIN public.equipment e ON e.client_id = c.id
WHERE NOT EXISTS (
    SELECT 1 FROM public.service_contracts sc WHERE sc.client_id = c.id AND sc.equipment_id = e.id
)
AND random() < 0.5;

-- ============================================================
-- 5. SERVICE VISITS — past completed + upcoming scheduled
-- ============================================================
DO $$
DECLARE
    rec RECORD;
    n INT;
    note_options TEXT[] := ARRAY[
        'Routine maintenance — all OK',
        'Cleaned camera lenses, checked DVR storage',
        'Replaced faulty power supply for one camera',
        'UPS battery replaced, tested load',
        'Camera recalibrated, firmware updated',
        'Annual inspection completed, no issues found'
    ];
    part_options TEXT[] := ARRAY[
        '12V Power Adapter',
        'BNC Connector, RG59 Cable 10m',
        'SMF Battery 7AH',
        NULL
    ];
BEGIN
    -- Completed visits (past 90 days)
    FOR rec IN
        SELECT c.id, c.name, sc.frequency_months
        FROM public.clients c
        JOIN public.service_contracts sc ON sc.client_id = c.id
        WHERE sc.status = 'active' LIMIT 60
    LOOP
        n := 1 + floor(random() * 3)::INT;
        FOR i IN 1..n LOOP
            INSERT INTO public.service_visits (
                client_id, technician_id, scheduled_date, completed_date,
                status, checkin_source, tech_name, tech_phone,
                notes, parts_used, hours_spent,
                gps_latitude, gps_longitude
            ) VALUES (
                rec.id,
                ('00000000-0000-0000-0000-00000000000' || (2 + floor(random() * 4)))::UUID,
                CURRENT_DATE - (random() * 90)::INT,
                CURRENT_DATE - (random() * 90 + 1)::INT,
                'completed',
                CASE floor(random() * 3) WHEN 0 THEN 'qr_code' ELSE 'manual' END,
                (ARRAY['Rajesh Kumar','Suresh Patel','Vikram Singh','Arif Hussain'])[1 + floor(random() * 4)],
                (ARRAY['+919876543211','+919876543212','+919876543213','+919876543214'])[1 + floor(random() * 4)],
                note_options[1 + floor(random() * 6)],
                part_options[1 + floor(random() * 4)],
                (1 + random() * 4)::DECIMAL(4,1),
                28.60 + random() * 0.15,
                77.20 + random() * 0.15
            );
        END LOOP;
    END LOOP;

    -- Upcoming scheduled visits (next 30 days)
    FOR rec IN
        SELECT c.id, c.name, sc.next_service_date
        FROM public.clients c
        JOIN public.service_contracts sc ON sc.client_id = c.id
        WHERE sc.status = 'active' AND sc.next_service_date <= CURRENT_DATE + 30
        LIMIT 20
    LOOP
        INSERT INTO public.service_visits (
            client_id, technician_id, scheduled_date,
            status, checkin_source, tech_name, tech_phone
        ) VALUES (
            rec.id,
            ('00000000-0000-0000-0000-00000000000' || (2 + floor(random() * 4)))::UUID,
            rec.next_service_date,
            'scheduled',
            'manual',
            (ARRAY['Rajesh Kumar','Suresh Patel','Vikram Singh','Arif Hussain'])[1 + floor(random() * 4)],
            (ARRAY['+919876543211','+919876543212','+919876543213','+919876543214'])[1 + floor(random() * 4)]
        );
    END LOOP;
END $$;

-- ============================================================
-- 6. FINANCIAL TRANSACTIONS — last 6 months
-- ============================================================
INSERT INTO public.financial_transactions (type, amount, category, description, client_id, payment_method, transaction_date)
SELECT
    'income',
    (3000 + random() * 20000)::DECIMAL(12,2),
    cat.name,
    'Service visit — ' || c.name,
    c.id,
    (ARRAY['upi', 'bank', 'cash', 'cheque'])[1 + floor(random() * 4)],
    CURRENT_DATE - (random() * 180)::INT
FROM public.clients c
CROSS JOIN LATERAL (
    SELECT name FROM public.expense_categories WHERE type = 'income' ORDER BY random() LIMIT 1
) cat
WHERE random() < 0.3
LIMIT 20;

INSERT INTO public.financial_transactions (type, amount, category, description, payment_method, transaction_date)
SELECT
    'expense',
    (500 + random() * 5000)::DECIMAL(12,2),
    cat.name,
    CASE cat.name
        WHEN 'Parts / Spares' THEN (ARRAY['HDD 2TB for DVR', 'Camera power supply', 'BNC connectors bulk', 'IR illuminator', 'UPS battery 12V 7AH', 'RG59 cable 100m'])[1 + floor(random() * 6)]
        WHEN 'Travel' THEN (ARRAY['Fuel — Delhi NCR', 'Toll tax', 'Parking fee', 'Inter-city bus fare'])[1 + floor(random() * 4)]
        WHEN 'Salary' THEN 'Monthly salary — ' || (ARRAY['Rajesh', 'Suresh', 'Vikram', 'Arif'])[1 + floor(random() * 4)]
        WHEN 'Office Rent' THEN 'Office rent — ' || (ARRAY['January', 'February', 'March', 'April', 'May'])[1 + floor(random() * 5)]
        WHEN 'Utilities' THEN (ARRAY['Electricity bill', 'Internet', 'Phone bill'])[1 + floor(random() * 3)]
        WHEN 'Marketing' THEN (ARRAY['Google Ads', 'Banner printing', 'Facebook campaign'])[1 + floor(random() * 3)]
        ELSE cat.name || ' expense'
    END,
    (ARRAY['upi', 'bank', 'cash'])[1 + floor(random() * 3)],
    CURRENT_DATE - (random() * 180)::INT
FROM public.expense_categories cat
WHERE cat.type = 'expense' AND random() < 0.5
LIMIT 15;

-- ============================================================
-- 7. REMINDERS — upcoming services
-- ============================================================
INSERT INTO public.reminders (client_id, scheduled_date, status, whatsapp_sent)
SELECT
    sc.client_id,
    sc.next_service_date,
    CASE WHEN sc.next_service_date <= CURRENT_DATE THEN 'sent' ELSE 'pending' END,
    sc.next_service_date <= CURRENT_DATE
FROM public.service_contracts sc
WHERE sc.status = 'active'
  AND sc.next_service_date BETWEEN CURRENT_DATE - 7 AND CURRENT_DATE + 30
  AND NOT EXISTS (
      SELECT 1 FROM public.reminders r
      WHERE r.client_id = sc.client_id AND r.scheduled_date = sc.next_service_date
  )
LIMIT 25;

-- ============================================================
-- 8. RESTORE — Re-add FK + RLS
-- ============================================================
ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
  NOT VALID;  -- NOT VALID: existing rows are exempted from validation
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 9. VERIFY COUNTS
-- ============================================================
SELECT 'clients' as tbl, count(*) FROM public.clients
UNION ALL SELECT 'equipment', count(*) FROM public.equipment
UNION ALL SELECT 'service_contracts', count(*) FROM public.service_contracts
UNION ALL SELECT 'service_visits', count(*) FROM public.service_visits
UNION ALL SELECT 'financial_transactions', count(*) FROM public.financial_transactions
UNION ALL SELECT 'reminders', count(*) FROM public.reminders
UNION ALL SELECT 'profiles', count(*) FROM public.profiles;
