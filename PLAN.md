# Hardware Service Management System — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Build a complete system for a hardware supply/service company to manage clients (banks with 60+ branches, individuals), track equipment (cameras, UPS, batteries), send automated WhatsApp reminders every 6 months, and collect GPS-tagged photo proof from field technicians.

**Architecture:** Supabase (PostgreSQL + Auth + Storage + Edge Functions + pg_cron) as the single backend. React + Vite SPA deployed on Cloudflare Pages (free tier) for the admin dashboard. React Native Android app for field technicians. WhatsApp Cloud API for messaging. Row Level Security enforces technician access to only their assigned visits.

**Tech Stack:** Supabase JS SDK, React 19 + Vite + Tailwind CSS, React Native + Expo, Deno Edge Functions, WhatsApp Cloud API v20.0, pg_cron extension.

---

## Prerequisites

Before any coding, the user must complete these manual steps (not automatable):

1. **Supabase project** — Create at https://supabase.com (free tier works), note the project URL and anon key
2. **WhatsApp Business** — Create a Meta Business account, verify business, register a phone number, get a permanent access token and phone number ID
3. **Cloudflare** — Add domain to Cloudflare, set up DNS for `app.yourdomain.com` → Cloudflare Pages
4. **Google Play Console** — Developer account for Android app distribution (if publishing to Play Store)

## Phase 1: Project Scaffolding & Supabase Setup

### Task 1.1: Create monorepo structure

**Objective:** Initialize the project with all three packages.

**Files:**
- Create: `hsm/packages/admin/` (React + Vite)
- Create: `hsm/packages/mobile/` (React Native + Expo)
- Create: `hsm/packages/functions/` (Supabase Edge Functions)
- Create: `hsm/pnpm-workspace.yaml`
- Create: `hsm/package.json`

**Step 1: Create root**

```bash
mkdir -p /mnt/d/ServiCore && cd /mnt/d/ServiCore
git init
echo "node_modules/\ndist/\n.env\n.expo/\nandroid/\nios/" > .gitignore
```

**Step 2: Write workspace config**

File: `pnpm-workspace.yaml`
```yaml
packages:
  - 'packages/*'
```

File: `package.json`
```json
{
  "name": "hsm",
  "private": true,
  "scripts": {
    "dev:admin": "pnpm --filter admin dev",
    "dev:mobile": "pnpm --filter mobile start",
    "build:admin": "pnpm --filter admin build"
  }
}
```

**Step 3: Create admin package (React + Vite)**

```bash
cd /mnt/d/ServiCore/packages
pnpm create vite admin --template react-ts
cd admin && pnpm install
pnpm add @supabase/supabase-js react-router-dom tailwindcss @tailwindcss/vite lucide-react
```

**Step 4: Create mobile package (React Native + Expo)**

```bash
cd /mnt/d/ServiCore/packages
npx create-expo-app@latest mobile --template blank-typescript
cd mobile
npx expo install @supabase/supabase-js expo-camera expo-location expo-file-system expo-image-picker
```

**Step 5: Create functions scaffold**

```bash
mkdir -p /mnt/d/ServiCore/packages/functions/supabase/functions
```

**Step 6: Commit**

```bash
cd /mnt/d/ServiCore
git add -A && git commit -m "chore: scaffold monorepo with admin, mobile, functions"
```

---

### Task 1.2: Set up Supabase project with schema

**Objective:** Create the full PostgreSQL schema using Supabase SQL editor.

**Files:**
- Create: `hsm/packages/functions/supabase/migrations/001_schema.sql`

**Step 1: Create migration file**

```sql
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ENUMS
-- ============================================
CREATE TYPE user_role AS ENUM ('admin', 'technician');
CREATE TYPE client_type AS ENUM ('bank', 'individual', 'corporate');
CREATE TYPE equipment_type AS ENUM ('camera', 'ups', 'battery', 'other');
CREATE TYPE service_status AS ENUM ('active', 'paused', 'completed');
CREATE TYPE visit_status AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');
CREATE TYPE reminder_status AS ENUM ('sent', 'delivered', 'read', 'failed');

-- ============================================
-- PROFILES (extends auth.users)
-- ============================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'technician',
  phone TEXT,
  whatsapp_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'technician')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- CLIENTS
-- ============================================
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type client_type NOT NULL DEFAULT 'individual',
  contact_person TEXT,
  whatsapp_number TEXT NOT NULL,
  email TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- EQUIPMENT
-- ============================================
CREATE TABLE equipment (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  type equipment_type NOT NULL,
  brand TEXT,
  model TEXT,
  serial_number TEXT,
  installation_date DATE,
  warranty_expiry DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_equipment_client ON equipment(client_id);

-- ============================================
-- SERVICE CONTRACTS
-- ============================================
CREATE TABLE service_contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  equipment_id UUID REFERENCES equipment(id) ON DELETE SET NULL,
  service_type TEXT NOT NULL,
  frequency_months INTEGER NOT NULL DEFAULT 6,
  last_service_date DATE,
  next_service_date DATE,
  status service_status NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contracts_client ON service_contracts(client_id);
CREATE INDEX idx_contracts_next_date ON service_contracts(next_service_date) WHERE status = 'active';

-- ============================================
-- SERVICE VISITS
-- ============================================
CREATE TABLE service_visits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id UUID NOT NULL REFERENCES service_contracts(id) ON DELETE CASCADE,
  technician_id UUID REFERENCES profiles(id),
  scheduled_date DATE NOT NULL,
  completed_at TIMESTAMPTZ,
  status visit_status NOT NULL DEFAULT 'scheduled',
  technician_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_visits_tech ON service_visits(technician_id);
CREATE INDEX idx_visits_status ON service_visits(status);

-- ============================================
-- SERVICE PHOTOS (proof)
-- ============================================
CREATE TABLE service_photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visit_id UUID NOT NULL REFERENCES service_visits(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  gps_lat DOUBLE PRECISION,
  gps_lng DOUBLE PRECISION,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- REMINDERS LOG
-- ============================================
CREATE TABLE reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES service_contracts(id) ON DELETE CASCADE,
  visit_id UUID REFERENCES service_visits(id) ON DELETE SET NULL,
  whatsapp_number TEXT NOT NULL,
  message_text TEXT NOT NULL,
  wa_message_id TEXT,
  status reminder_status NOT NULL DEFAULT 'sent',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reminders_client ON reminders(client_id);
CREATE INDEX idx_reminders_status ON reminders(status);

-- ============================================
-- EXPENSE CATEGORIES
-- ============================================
CREATE TABLE expense_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'expense' CHECK (type IN ('expense', 'income')),
  icon TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default categories
INSERT INTO expense_categories (name, type, icon) VALUES
  ('Service Fee', 'income', '💰'),
  ('AMC Payment', 'income', '📋'),
  ('Equipment Sale', 'income', '🔧'),
  ('Installation Charge', 'income', '🏗️'),
  ('Other Income', 'income', '📥'),
  ('Parts & Components', 'expense', '🔩'),
  ('Travel & Fuel', 'expense', '🚗'),
  ('Technician Salary', 'expense', '👷'),
  ('Office Rent', 'expense', '🏢'),
  ('Utilities', 'expense', '💡'),
  ('Marketing', 'expense', '📢'),
  ('Misc Expense', 'expense', '📤');

-- ============================================
-- FINANCIAL TRANSACTIONS (income + expenses)
-- ============================================
CREATE TYPE transaction_type AS ENUM ('income', 'expense');
CREATE TYPE payment_method AS ENUM ('cash', 'bank_transfer', 'upi', 'cheque', 'other');

CREATE TABLE financial_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type transaction_type NOT NULL,
  category_id UUID REFERENCES expense_categories(id) ON DELETE SET NULL,
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  description TEXT NOT NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  visit_id UUID REFERENCES service_visits(id) ON DELETE SET NULL,
  payment_method payment_method NOT NULL DEFAULT 'bank_transfer',
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  receipt_url TEXT,
  created_by UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transactions_type ON financial_transactions(type);
CREATE INDEX idx_transactions_date ON financial_transactions(transaction_date DESC);
CREATE INDEX idx_transactions_client ON financial_transactions(client_id);

-- ============================================
-- INVOICES (optional — for formal billing)
-- ============================================
CREATE TYPE invoice_status AS ENUM ('draft', 'sent', 'paid', 'overdue', 'cancelled');

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  visit_id UUID REFERENCES service_visits(id) ON DELETE SET NULL,
  invoice_number TEXT NOT NULL UNIQUE,
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  status invoice_status NOT NULL DEFAULT 'draft',
  due_date DATE,
  paid_date DATE,
  sent_via_whatsapp BOOLEAN DEFAULT false,
  whatsapp_message_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoices_client ON invoices(client_id);
CREATE INDEX idx_invoices_status ON invoices(status);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins can read all profiles" ON profiles
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins can insert profiles" ON profiles
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Clients
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can CRUD clients" ON clients
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Technicians can read assigned clients" ON clients
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM service_visits sv
      JOIN service_contracts sc ON sv.contract_id = sc.id
      WHERE sc.client_id = clients.id
        AND sv.technician_id = auth.uid()
    )
  );

-- Equipment — same pattern
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can CRUD equipment" ON equipment
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Service contracts
ALTER TABLE service_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can CRUD contracts" ON service_contracts
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Service visits
ALTER TABLE service_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can CRUD visits" ON service_visits
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Technicians can read/update own visits" ON service_visits
  FOR ALL USING (technician_id = auth.uid()) WITH CHECK (technician_id = auth.uid());

-- Service photos
ALTER TABLE service_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read all photos" ON service_photos
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Technicians can insert photos for own visits" ON service_photos
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM service_visits
      WHERE id = service_photos.visit_id
        AND technician_id = auth.uid()
    )
  );

-- Reminders
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read all reminders" ON reminders
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Expense categories (admin only)
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can CRUD categories" ON expense_categories
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Technicians can read categories" ON expense_categories
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()));

-- Financial transactions (admin only)
ALTER TABLE financial_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can CRUD transactions" ON financial_transactions
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Invoices (admin only)
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can CRUD invoices" ON invoices
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================
-- TRIGGERS
-- ============================================

-- Update next_service_date on visit completion
CREATE OR REPLACE FUNCTION update_next_service_date()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    UPDATE service_contracts
    SET
      last_service_date = CURRENT_DATE,
      next_service_date = CURRENT_DATE + (frequency_months || ' months')::INTERVAL,
      updated_at = now()
    WHERE id = NEW.contract_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_visit_completed
  AFTER UPDATE ON service_visits
  FOR EACH ROW EXECUTE FUNCTION update_next_service_date();

-- ============================================
-- FULL TEXT SEARCH (for client search in dashboard)
-- ============================================
ALTER TABLE clients ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', COALESCE(name, '') || ' ' || COALESCE(contact_person, '') || ' ' || COALESCE(city, ''))
  ) STORED;
CREATE INDEX idx_clients_search ON clients USING GIN(search_vector);
```

**Step 2: Run in Supabase SQL Editor**

Open https://supabase.com/dashboard → your project → SQL Editor → paste and run.

**Step 3: Enable pg_cron**

In Supabase dashboard → Database → Extensions → search "pg_cron" → enable.

**Step 4: Create storage buckets**

In Supabase dashboard → Storage → New Bucket:

Bucket 1 — `service-photos`:
- Public: off
- File size limit: 10MB
- Allowed MIME types: `image/jpeg, image/png, image/webp`

Bucket 2 — `receipts`:
- Public: off
- File size limit: 10MB
- Allowed MIME types: `image/jpeg, image/png, image/webp, application/pdf`

**Step 5: Set up storage RLS**

SQL Editor:
```sql
-- Allow technicians to upload to their visit folders
CREATE POLICY "Technicians upload own visit photos" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'service-photos'
    AND auth.role() = 'authenticated'
  );
CREATE POLICY "Anyone can read photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'service-photos');
```

**Step 6: Commit**

```bash
cd /mnt/d/ServiCore
git add -A && git commit -m "feat: add database schema with RLS and triggers"
```

---

## Phase 2: Admin Dashboard (React + Vite)

### Task 2.1: Supabase client + Auth UI

**Objective:** Set up Supabase JS client and login/signup page for admins.

**Files:**
- Create: `hsm/packages/admin/src/lib/supabase.ts`
- Create: `hsm/packages/admin/src/lib/auth.tsx`
- Modify: `hsm/packages/admin/src/App.tsx`
- Create: `hsm/packages/admin/src/pages/Login.tsx`

**Step 1: Supabase client**

File: `src/lib/supabase.ts`
```ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase env vars')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

File: `.env`
```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

**Step 2: Auth context**

File: `src/lib/auth.tsx`
```tsx
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { User } from '@supabase/supabase-js'

interface Profile {
  id: string
  full_name: string
  role: 'admin' | 'technician'
}

interface AuthContextType {
  user: User | null
  profile: Profile | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  loading: boolean
}

const AuthContext = createContext<AuthContextType>(null!)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setProfile(null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId: string) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    setProfile(data)
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, profile, signIn, signOut, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
```

**Step 3: Login page**

File: `src/pages/Login.tsx`
```tsx
import { useState } from 'react'
import { useAuth } from '../lib/auth'

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await signIn(email, password)
    } catch (err: any) {
      setError(err.message)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <form onSubmit={handleSubmit} className="bg-gray-900 p-8 rounded-xl border border-gray-800 w-96">
        <h1 className="text-2xl font-bold text-white mb-6">HSM Admin</h1>
        {error && <p className="text-red-400 mb-4 text-sm">{error}</p>}
        <input
          type="email" placeholder="Email" value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 mb-3 text-white"
          required
        />
        <input
          type="password" placeholder="Password" value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 mb-4 text-white"
          required
        />
        <button type="submit" className="w-full bg-cyan-600 hover:bg-cyan-700 text-white py-2 rounded-lg font-semibold">
          Sign In
        </button>
      </form>
    </div>
  )
}
```

**Step 4: Wire up App.tsx**

File: `src/App.tsx`
```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Clients from './pages/Clients'
import Finances from './pages/Finances'
import Layout from './components/Layout'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="text-white p-8">Loading...</div>
  if (!user) return <Navigate to="/login" />
  return <>{children}</>
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
          <Route path="/clients" element={<ProtectedRoute><Layout><Clients /></Layout></ProtectedRoute>} />
          <Route path="/finances" element={<ProtectedRoute><Layout><Finances /></Layout></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
```

**Step 5: Verify**

```bash
cd /mnt/d/ServiCore/packages/admin
echo "VITE_SUPABASE_URL=your_url" >> .env
echo "VITE_SUPABASE_ANON_KEY=your_key" >> .env
pnpm dev
```

Open http://localhost:5173 → should see login page. Test login with a user you create in Supabase Auth dashboard.

**Step 6: Commit**

```bash
git add -A && git commit -m "feat: add Supabase auth with login page"
```

---

### Task 2.2: Layout + Navigation

**Objective:** Build the admin shell with sidebar navigation.

**Files:**
- Create: `hsm/packages/admin/src/components/Layout.tsx`
- Create: `hsm/packages/admin/src/components/Sidebar.tsx`

**Step 1: Layout component**

File: `src/components/Layout.tsx`
```tsx
import Sidebar from './Sidebar'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-gray-950">
      <Sidebar />
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  )
}
```

**Step 2: Sidebar**

File: `src/components/Sidebar.tsx`
```tsx
import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Users, Wrench, CalendarCheck, MessageSquare, DollarSign, LogOut } from 'lucide-react'

const links = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/clients', icon: Users, label: 'Clients' },
  { to: '/equipment', icon: Wrench, label: 'Equipment' },
  { to: '/visits', icon: CalendarCheck, label: 'Visits' },
  { to: '/reminders', icon: MessageSquare, label: 'Reminders' },
  { to: '/finances', icon: DollarSign, label: 'Finances' },
]

export default function Sidebar() {
  const { profile, signOut } = useAuth()

  return (
    <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
      <div className="p-4 border-b border-gray-800">
        <h1 className="text-lg font-bold text-cyan-400">HSM</h1>
        <p className="text-xs text-gray-500">Hardware Service Mgmt</p>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive ? 'bg-gray-800 text-cyan-400' : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t border-gray-800">
        <p className="text-xs text-gray-500 mb-2">{profile?.full_name}</p>
        <button onClick={signOut} className="flex items-center gap-2 text-sm text-gray-400 hover:text-red-400">
          <LogOut size={16} /> Sign Out
        </button>
      </div>
    </aside>
  )
}
```

**Step 3: Create placeholder pages**

Create stub files `src/pages/Dashboard.tsx`, `Equipment.tsx`, `Visits.tsx`, `Reminders.tsx` — each a simple `<div>` with the page title.

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: add layout with sidebar navigation"
```

---

### Task 2.3: Client Management (CRUD)

**Objective:** Full CRUD for clients with search, list, and form.

**Files:**
- Create: `hsm/packages/admin/src/pages/Clients.tsx`
- Create: `hsm/packages/admin/src/components/ClientForm.tsx`

**Step 1: Client list page**

File: `src/pages/Clients.tsx`
```tsx
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Search, Phone, MapPin, Building, User } from 'lucide-react'
import ClientForm from '../components/ClientForm'

interface Client {
  id: string
  name: string
  type: 'bank' | 'individual' | 'corporate'
  contact_person: string | null
  whatsapp_number: string
  city: string | null
  state: string | null
}

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([])
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Client | null>(null)

  useEffect(() => { fetchClients() }, [search])

  async function fetchClients() {
    let query = supabase.from('clients').select('*').order('name')
    if (search) query = query.ilike('name', `%${search}%`)
    const { data } = await query
    if (data) setClients(data)
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-white">
          Clients ({clients.length})
        </h2>
        <button
          onClick={() => { setEditing(null); setShowForm(true) }}
          className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 px-4 py-2 rounded-lg text-sm font-semibold"
        >
          <Plus size={16} /> Add Client
        </button>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="text" placeholder="Search clients..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-10 pr-4 py-2 text-white"
        />
      </div>

      <div className="grid gap-3">
        {clients.map(c => (
          <div
            key={c.id}
            onClick={() => { setEditing(c); setShowForm(true) }}
            className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-cyan-800 cursor-pointer transition-colors"
          >
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold text-white">{c.name}</h3>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                  <span className="flex items-center gap-1"><User size={12} /> {c.contact_person || 'N/A'}</span>
                  <span className="flex items-center gap-1"><Phone size={12} /> {c.whatsapp_number}</span>
                  {(c.city || c.state) && (
                    <span className="flex items-center gap-1"><MapPin size={12} /> {[c.city, c.state].filter(Boolean).join(', ')}</span>
                  )}
                </div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                c.type === 'bank' ? 'bg-amber-900/50 text-amber-400' :
                c.type === 'corporate' ? 'bg-purple-900/50 text-purple-400' :
                'bg-gray-800 text-gray-400'
              }`}>
                {c.type}
              </span>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <ClientForm
          client={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); fetchClients() }}
        />
      )}
    </div>
  )
}
```

**Step 2: Client form modal**

File: `src/components/ClientForm.tsx`
```tsx
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { X } from 'lucide-react'

interface Client {
  id: string
  name: string
  type: 'bank' | 'individual' | 'corporate'
  contact_person: string | null
  whatsapp_number: string
  email: string | null
  address: string | null
  city: string | null
  state: string | null
  notes: string | null
}

export default function ClientForm({ client, onClose, onSaved }: {
  client: Client | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    name: client?.name || '',
    type: client?.type || 'individual',
    contact_person: client?.contact_person || '',
    whatsapp_number: client?.whatsapp_number || '',
    email: client?.email || '',
    address: client?.address || '',
    city: client?.city || '',
    state: client?.state || '',
    notes: client?.notes || '',
  })
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    if (client) {
      await supabase.from('clients').update(form).eq('id', client.id)
    } else {
      await supabase.from('clients').insert(form)
    }
    onSaved()
  }

  async function handleDelete() {
    if (!client) return
    if (!confirm('Delete this client?')) return
    await supabase.from('clients').delete().eq('id', client.id)
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white">
            {client ? 'Edit Client' : 'New Client'}
          </h3>
          <button onClick={onClose}><X size={20} className="text-gray-500" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input name="name" placeholder="Client Name *" required value={form.name}
            onChange={e => setForm({...form, name: e.target.value})}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
          <select value={form.type} onChange={e => setForm({...form, type: e.target.value as any})}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm">
            <option value="individual">Individual</option>
            <option value="bank">Bank</option>
            <option value="corporate">Corporate</option>
          </select>
          <input name="whatsapp_number" placeholder="WhatsApp Number *" required value={form.whatsapp_number}
            onChange={e => setForm({...form, whatsapp_number: e.target.value})}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
          <input name="contact_person" placeholder="Contact Person" value={form.contact_person}
            onChange={e => setForm({...form, contact_person: e.target.value})}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
          <input name="email" placeholder="Email" value={form.email}
            onChange={e => setForm({...form, email: e.target.value})}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
          <input name="address" placeholder="Address" value={form.address}
            onChange={e => setForm({...form, address: e.target.value})}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <input name="city" placeholder="City" value={form.city}
              onChange={e => setForm({...form, city: e.target.value})}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
            <input name="state" placeholder="State" value={form.state}
              onChange={e => setForm({...form, state: e.target.value})}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
          </div>
          <textarea name="notes" placeholder="Notes" value={form.notes}
            onChange={e => setForm({...form, notes: e.target.value})}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />

          <div className="flex justify-between pt-2">
            {client && (
              <button type="button" onClick={handleDelete}
                className="text-red-400 hover:text-red-300 text-sm">Delete</button>
            )}
            <div className="flex gap-2 ml-auto">
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
              <button type="submit" disabled={saving}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-sm font-semibold disabled:opacity-50">
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
```

**Step 3: Verify**

Create a few clients in the UI, verify they appear in Supabase table.

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: add client CRUD with search"
```

---

## Phase 3: WhatsApp Integration (Edge Functions)

### Task 3.1: WhatsApp send message edge function

**Objective:** Deploy a Deno edge function that sends WhatsApp template messages via Meta Cloud API.

**Files:**
- Create: `hsm/packages/functions/supabase/functions/send-whatsapp/index.ts`

**Step 1: Install Supabase CLI**

```bash
# On Linux (WSL)
npm install -g supabase
supabase login
```

**Step 2: Initialize Supabase locally**

```bash
cd /mnt/d/ServiCore/packages/functions
supabase init
supabase link --project-ref YOUR_PROJECT_REF
```

**Step 3: Edge function code**

File: `supabase/functions/send-whatsapp/index.ts`
```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const WHATSAPP_TOKEN = Deno.env.get('WHATSAPP_TOKEN')!
const WHATSAPP_PHONE_ID = Deno.env.get('WHATSAPP_PHONE_ID')!

interface ReminderPayload {
  client_id: string
  contract_id: string
  whatsapp_number: string
  client_name: string
  service_type: string
  next_service_date: string
}

Deno.serve(async (req: Request) => {
  // Only allow authenticated internal calls or cron
  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) {
    // Also accept cron header
    if (req.headers.get('x-supabase-cron') !== 'true') {
      return new Response('Unauthorized', { status: 401 })
    }
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  if (req.method === 'POST') {
    const { client_id, contract_id, whatsapp_number, client_name, service_type, next_service_date } =
      await req.json() as ReminderPayload

    const messageText = `🔧 *Service Reminder*\n\nDear ${client_name},\n\nYour ${service_type} is due on ${next_service_date}.\nPlease schedule a visit at your convenience.\n\n— HSM Team`

    const response = await fetch(
      `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: whatsapp_number.replace(/\D/g, ''),
          type: 'text',
          text: { body: messageText },
        }),
      }
    )

    const result = await response.json()

    // Log the reminder
    const waMessageId = result.messages?.[0]?.id || null
    const status = waMessageId ? 'sent' : 'failed'
    const errorMsg = result.error?.message || null

    await supabase.from('reminders').insert({
      client_id,
      contract_id,
      whatsapp_number,
      message_text: messageText,
      wa_message_id: waMessageId,
      status,
      error_message: errorMsg,
    })

    return new Response(JSON.stringify({ success: status === 'sent', wa_message_id: waMessageId }), {
      headers: { 'Content-Type': 'application/json' },
      status: status === 'sent' ? 200 : 500,
    })
  }

  // GET: check due services and queue reminders (called by pg_cron)
  if (req.method === 'GET') {
    const today = new Date().toISOString().split('T')[0]
    const sevenDaysFromNow = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]

    const { data: contracts } = await supabase
      .from('service_contracts')
      .select('id, client_id, service_type, next_service_date, clients!inner(id, name, whatsapp_number)')
      .eq('status', 'active')
      .lte('next_service_date', sevenDaysFromNow)
      .order('next_service_date')

    if (!contracts || contracts.length === 0) {
      return new Response(JSON.stringify({ message: 'No due services' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const results = []
    for (const c of contracts) {
      const client = Array.isArray(c.clients) ? c.clients[0] : c.clients
      if (!client?.whatsapp_number) continue

      const body: ReminderPayload = {
        client_id: client.id,
        contract_id: c.id,
        whatsapp_number: client.whatsapp_number,
        client_name: client.name,
        service_type: c.service_type,
        next_service_date: c.next_service_date,
      }

      const res = await fetch(req.url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      results.push(await res.json())
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response('Method not allowed', { status: 405 })
})
```

**Step 4: Set secrets and deploy**

```bash
supabase secrets set WHATSAPP_TOKEN=your_permanent_token
supabase secrets set WHATSAPP_PHONE_ID=your_phone_number_id
supabase functions deploy send-whatsapp --no-verify-jwt
```

**Step 5: Verify**

```bash
curl -X POST "https://YOUR_PROJECT.supabase.co/functions/v1/send-whatsapp" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"whatsapp_number":"+919XXXXXXXXX","client_name":"Test","service_type":"Camera Maintenance","next_service_date":"2026-06-01"}'
```

**Step 6: Commit**

```bash
git add -A && git commit -m "feat: add WhatsApp send edge function"
```

---

### Task 3.2: WhatsApp webhook for delivery status

**Objective:** Create webhook to receive delivery/read receipts from WhatsApp.

**Files:**
- Create: `hsm/packages/functions/supabase/functions/whatsapp-webhook/index.ts`

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req: Request) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // WhatsApp verification (GET with hub.challenge)
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')

    if (mode === 'subscribe' && token === Deno.env.get('WHATSAPP_VERIFY_TOKEN')) {
      return new Response(challenge, { status: 200 })
    }
    return new Response('Verification failed', { status: 403 })
  }

  // Handle incoming webhook
  const body = await req.json()

  if (body.object === 'whatsapp_business_account') {
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue

        const statuses = change.value?.statuses || []
        for (const status of statuses) {
          const waMessageId = status.id
          const newStatus = status.status // 'delivered' | 'read' | 'failed'

          if (newStatus === 'delivered') {
            await supabase.from('reminders')
              .update({ status: 'delivered', delivered_at: new Date().toISOString() })
              .eq('wa_message_id', waMessageId)
          } else if (newStatus === 'read') {
            await supabase.from('reminders')
              .update({ status: 'read', read_at: new Date().toISOString() })
              .eq('wa_message_id', waMessageId)
          } else if (newStatus === 'failed') {
            await supabase.from('reminders')
              .update({ status: 'failed', error_message: JSON.stringify(status.errors) })
              .eq('wa_message_id', waMessageId)
          }
        }
      }
    }
  }

  return new Response('OK', { status: 200 })
})
```

**Deploy:**
```bash
supabase functions deploy whatsapp-webhook --no-verify-jwt
```

Note the URL: `https://YOUR_PROJECT.supabase.co/functions/v1/whatsapp-webhook`

Set this as the webhook URL in Meta WhatsApp Business settings with verify token.

---

## Phase 4: Cron Reminder System

### Task 4.1: pg_cron job to trigger reminders

**Objective:** Schedule a daily job that calls the edge function to check for due services.

Run in Supabase SQL Editor:

```sql
-- Schedule: every day at 9:00 AM IST (3:30 AM UTC)
SELECT cron.schedule(
  'daily-service-reminders',
  '30 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/send-whatsapp',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'x-supabase-cron', 'true'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

(Note: pg_cron with `net.http_post` requires the `pg_net` extension. In Supabase, use the `http` extension instead.)

Alternative using Supabase's built-in cron:

```sql
SELECT cron.schedule(
  'daily-service-reminders',
  '30 3 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://YOUR_PROJECT.supabase.co/functions/v1/send-whatsapp',
      headers := '{"Authorization":"Bearer YOUR_SERVICE_ROLE_KEY","Content-Type":"application/json","x-supabase-cron":"true"}'::jsonb,
      body := '{}'::jsonb
    )
  $$
);
```

---

## Phase 5: Service Contracts & Visit Management

### Task 5.1: Service contracts CRUD in admin dashboard

**Objective:** Add equipment and service contract management pages.

(Same pattern as client CRUD — list page + form modal. Omitted for brevity but follows identical structure.)

### Task 5.2: Visit assignment dashboard

**Objective:** Page to view all visits, assign technicians, filter by status.

---

### Task 5.3: Financial Management (Income & Expenses)

**Objective:** Full financial module — record income/expenses, upload receipts, view profit/loss reports, generate invoices.

**Files:**
- Create: `hsm/packages/admin/src/pages/Finances.tsx`
- Create: `hsm/packages/admin/src/components/TransactionForm.tsx`
- Create: `hsm/packages/admin/src/components/InvoiceForm.tsx`

**Step 1: Finances page with tabs**

File: `src/pages/Finances.tsx`

```tsx
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Upload, TrendingUp, TrendingDown, FileText, Receipt, X } from 'lucide-react'
import TransactionForm from '../components/TransactionForm'
import InvoiceForm from '../components/InvoiceForm'

interface Transaction {
  id: string
  type: 'income' | 'expense'
  amount: number
  description: string
  transaction_date: string
  payment_method: string
  category_id: string
  client_id: string | null
  receipt_url: string | null
}

interface Invoice {
  id: string
  invoice_number: string
  client_id: string
  amount: number
  status: string
  due_date: string | null
}

export default function Finances() {
  const [tab, setTab] = useState<'transactions' | 'reports' | 'invoices'>('transactions')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [showTxForm, setShowTxForm] = useState(false)
  const [showInvoiceForm, setShowInvoiceForm] = useState(false)
  const [editingTx, setEditingTx] = useState<Transaction | null>(null)
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null)

  // Summary stats
  const [stats, setStats] = useState({ income: 0, expense: 0 })

  useEffect(() => {
    if (tab === 'transactions') fetchTransactions()
    if (tab === 'invoices') fetchInvoices()
    fetchStats()
  }, [tab])

  async function fetchTransactions() {
    const { data } = await supabase
      .from('financial_transactions')
      .select('*, expense_categories:category_id(name, icon), clients:client_id(name)')
      .order('transaction_date', { ascending: false })
      .limit(100)
    if (data) setTransactions(data as any)
  }

  async function fetchInvoices() {
    const { data } = await supabase
      .from('invoices')
      .select('*, clients:client_id(name)')
      .order('created_at', { ascending: false })
      .limit(50)
    if (data) setInvoices(data as any)
  }

  async function fetchStats() {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]

    const { data: income } = await supabase
      .from('financial_transactions')
      .select('amount')
      .eq('type', 'income')
      .gte('transaction_date', monthStart)

    const { data: expense } = await supabase
      .from('financial_transactions')
      .select('amount')
      .eq('type', 'expense')
      .gte('transaction_date', monthStart)

    setStats({
      income: income?.reduce((sum, r) => sum + Number(r.amount), 0) || 0,
      expense: expense?.reduce((sum, r) => sum + Number(r.amount), 0) || 0,
    })
  }

  const profit = stats.income - stats.expense

  const tabs = [
    { key: 'transactions' as const, label: 'Transactions', icon: Receipt },
    { key: 'reports' as const, label: 'Reports', icon: TrendingUp },
    { key: 'invoices' as const, label: 'Invoices', icon: FileText },
  ]

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">Finances</h2>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-400 mb-1">Income (This Month)</p>
          <p className="text-2xl font-bold text-green-400">₹{stats.income.toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-400 mb-1">Expenses (This Month)</p>
          <p className="text-2xl font-bold text-red-400">₹{stats.expense.toLocaleString('en-IN')}</p>
        </div>
        <div className={`bg-gray-900 border rounded-xl p-5 ${profit >= 0 ? 'border-green-800' : 'border-red-800'}`}>
          <p className="text-xs text-gray-400 mb-1">Profit / Loss</p>
          <p className={`text-2xl font-bold ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            ₹{Math.abs(profit).toLocaleString('en-IN')}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-900 rounded-lg p-1 w-fit">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm transition-colors ${
              tab === key ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* Transactions Tab */}
      {tab === 'transactions' && (
        <>
          <div className="flex justify-end mb-4">
            <button
              onClick={() => { setEditingTx(null); setShowTxForm(true) }}
              className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 px-4 py-2 rounded-lg text-sm font-semibold"
            >
              <Plus size={16} /> Add Transaction
            </button>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400">
                  <th className="text-left p-3">Date</th>
                  <th className="text-left p-3">Description</th>
                  <th className="text-left p-3">Category</th>
                  <th className="text-left p-3">Client</th>
                  <th className="text-left p-3">Method</th>
                  <th className="text-right p-3">Amount</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx: any) => (
                  <tr key={tx.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="p-3 text-gray-400">
                      {new Date(tx.transaction_date).toLocaleDateString('en-IN')}
                    </td>
                    <td className="p-3 text-white">{tx.description}</td>
                    <td className="p-3">
                      <span className="text-gray-400 text-xs">
                        {tx.expense_categories?.icon} {tx.expense_categories?.name || '—'}
                      </span>
                    </td>
                    <td className="p-3 text-gray-400 text-xs">{tx.clients?.name || '—'}</td>
                    <td className="p-3">
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-400 capitalize">
                        {tx.payment_method?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className={`p-3 text-right font-semibold ${tx.type === 'income' ? 'text-green-400' : 'text-red-400'}`}>
                      {tx.type === 'income' ? '+' : '-'}₹{Number(tx.amount).toLocaleString('en-IN')}
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => { setEditingTx(tx); setShowTxForm(true) }}
                        className="text-gray-500 hover:text-cyan-400 text-xs"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-500">
                      No transactions yet. Click "Add Transaction" to start.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Reports Tab */}
      {tab === 'reports' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Monthly Summary</h3>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-gray-800 rounded-full h-4 overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full"
                  style={{ width: `${stats.income > 0 ? (stats.income / (stats.income + stats.expense)) * 100 : 0}%` }}
                />
              </div>
              <span className="text-green-400 text-sm w-32 text-right">Income: ₹{stats.income.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-gray-800 rounded-full h-4 overflow-hidden">
                <div
                  className="h-full bg-red-500 rounded-full"
                  style={{ width: `${stats.expense > 0 ? (stats.expense / (stats.income + stats.expense)) * 100 : 0}%` }}
                />
              </div>
              <span className="text-red-400 text-sm w-32 text-right">Expenses: ₹{stats.expense.toLocaleString('en-IN')}</span>
            </div>
          </div>

          <div className="mt-6 p-4 bg-gray-800 rounded-lg">
            <p className="text-sm text-gray-400">Net Profit This Month</p>
            <p className={`text-3xl font-bold mt-1 ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              ₹{profit.toLocaleString('en-IN')}
            </p>
            <p className="text-xs text-gray-500 mt-2">
              Margin: {stats.income > 0 ? ((profit / stats.income) * 100).toFixed(1) : 0}%
            </p>
          </div>

          <p className="text-xs text-gray-600 mt-6">
            💡 Future: Add monthly comparison charts, category breakdown, export to PDF/Excel
          </p>
        </div>
      )}

      {/* Invoices Tab */}
      {tab === 'invoices' && (
        <>
          <div className="flex justify-end mb-4">
            <button
              onClick={() => { setEditingInvoice(null); setShowInvoiceForm(true) }}
              className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 px-4 py-2 rounded-lg text-sm font-semibold"
            >
              <Plus size={16} /> New Invoice
            </button>
          </div>

          <div className="grid gap-3">
            {invoices.map((inv: any) => (
              <div
                key={inv.id}
                onClick={() => { setEditingInvoice(inv); setShowInvoiceForm(true) }}
                className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-cyan-800 cursor-pointer transition-colors flex justify-between items-center"
              >
                <div>
                  <p className="text-white font-semibold text-sm">{inv.invoice_number}</p>
                  <p className="text-gray-400 text-xs mt-1">
                    {inv.clients?.name} {inv.due_date && ` · Due: ${new Date(inv.due_date).toLocaleDateString('en-IN')}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-white font-semibold">₹{Number(inv.amount).toLocaleString('en-IN')}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    inv.status === 'paid' ? 'bg-green-900/50 text-green-400' :
                    inv.status === 'overdue' ? 'bg-red-900/50 text-red-400' :
                    inv.status === 'sent' ? 'bg-blue-900/50 text-blue-400' :
                    'bg-gray-800 text-gray-400'
                  }`}>
                    {inv.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Transaction Form Modal */}
      {showTxForm && (
        <TransactionForm
          transaction={editingTx}
          onClose={() => setShowTxForm(false)}
          onSaved={() => { setShowTxForm(false); fetchTransactions(); fetchStats() }}
        />
      )}

      {/* Invoice Form Modal */}
      {showInvoiceForm && (
        <InvoiceForm
          invoice={editingInvoice}
          onClose={() => setShowInvoiceForm(false)}
          onSaved={() => { setShowInvoiceForm(false); fetchInvoices() }}
        />
      )}
    </div>
  )
}
```

**Step 2: Transaction form modal (income/expense entry)**

File: `src/components/TransactionForm.tsx`

```tsx
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { X, Upload } from 'lucide-react'

interface Category {
  id: string
  name: string
  type: 'income' | 'expense'
  icon: string | null
}

interface Client {
  id: string
  name: string
}

export default function TransactionForm({ transaction, onClose, onSaved }: {
  transaction: any | null
  onClose: () => void
  onSaved: () => void
}) {
  const [categories, setCategories] = useState<Category[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [form, setForm] = useState({
    type: transaction?.type || 'income',
    category_id: transaction?.category_id || '',
    amount: transaction?.amount?.toString() || '',
    description: transaction?.description || '',
    client_id: transaction?.client_id || '',
    payment_method: transaction?.payment_method || 'bank_transfer',
    transaction_date: transaction?.transaction_date || new Date().toISOString().split('T')[0],
    receipt_url: transaction?.receipt_url || '',
    notes: transaction?.notes || '',
  })
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('expense_categories').select('*').eq('is_active', true).order('name')
      .then(({ data }) => data && setCategories(data))
    supabase.from('clients').select('id, name').order('name')
      .then(({ data }) => data && setClients(data))
  }, [])

  const filteredCategories = categories.filter(c => c.type === form.type)

  async function handleUploadReceipt() {
    if (!receiptFile) return null
    const filename = `receipts/${Date.now()}_${receiptFile.name}`
    const { error } = await supabase.storage.from('receipts').upload(filename, receiptFile)
    if (error) throw error
    const { data } = supabase.storage.from('receipts').getPublicUrl(filename)
    return data.publicUrl
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    let receiptUrl = form.receipt_url
    if (receiptFile) {
      receiptUrl = await handleUploadReceipt() || ''
    }

    const payload = {
      type: form.type,
      category_id: form.category_id || null,
      amount: parseFloat(form.amount),
      description: form.description,
      client_id: form.client_id || null,
      payment_method: form.payment_method,
      transaction_date: form.transaction_date,
      receipt_url: receiptUrl,
      notes: form.notes,
    }

    if (transaction) {
      await supabase.from('financial_transactions').update(payload).eq('id', transaction.id)
    } else {
      await supabase.from('financial_transactions').insert(payload)
    }
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white">
            {transaction ? 'Edit' : 'New'} Transaction
          </h3>
          <button onClick={onClose}><X size={20} className="text-gray-500" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Type toggle */}
          <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
            {(['income', 'expense'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setForm({ ...form, type: t, category_id: '' })}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                  form.type === t
                    ? t === 'income' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {t === 'income' ? '💰 Income' : '📤 Expense'}
              </button>
            ))}
          </div>

          <input
            placeholder="Amount *" type="number" step="0.01" required
            value={form.amount}
            onChange={e => setForm({ ...form, amount: e.target.value })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
          />

          <input
            placeholder="Description *" required
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
          />

          <select
            value={form.category_id}
            onChange={e => setForm({ ...form, category_id: e.target.value })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
          >
            <option value="">Select Category</option>
            {filteredCategories.map(c => (
              <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
            ))}
          </select>

          <select
            value={form.client_id}
            onChange={e => setForm({ ...form, client_id: e.target.value })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
          >
            <option value="">No Client</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-2">
            <select
              value={form.payment_method}
              onChange={e => setForm({ ...form, payment_method: e.target.value })}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
            >
              <option value="bank_transfer">Bank Transfer</option>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="cheque">Cheque</option>
              <option value="other">Other</option>
            </select>
            <input
              type="date"
              value={form.transaction_date}
              onChange={e => setForm({ ...form, transaction_date: e.target.value })}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>

          {/* Receipt upload */}
          <div>
            <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer hover:text-cyan-400">
              <Upload size={14} />
              {receiptFile ? receiptFile.name : form.receipt_url ? 'Receipt uploaded ✓' : 'Upload Receipt (optional)'}
              <input
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={e => setReceiptFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>

          <textarea
            placeholder="Notes"
            value={form.notes}
            onChange={e => setForm({ ...form, notes: e.target.value })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
            rows={2}
          />

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-sm font-semibold disabled:opacity-50">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

**Step 3: Invoice form modal**

File: `src/components/InvoiceForm.tsx`

```tsx
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { X } from 'lucide-react'

interface Client {
  id: string
  name: string
}

export default function InvoiceForm({ invoice, onClose, onSaved }: {
  invoice: any | null
  onClose: () => void
  onSaved: () => void
}) {
  const [clients, setClients] = useState<Client[]>([])
  const [form, setForm] = useState({
    client_id: invoice?.client_id || '',
    invoice_number: invoice?.invoice_number || `INV-${Date.now().toString(36).toUpperCase()}`,
    amount: invoice?.amount?.toString() || '',
    status: invoice?.status || 'draft',
    due_date: invoice?.due_date || '',
    paid_date: invoice?.paid_date || '',
    notes: invoice?.notes || '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('clients').select('id, name').order('name')
      .then(({ data }) => data && setClients(data))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    const payload = {
      client_id: form.client_id,
      invoice_number: form.invoice_number,
      amount: parseFloat(form.amount),
      status: form.status,
      due_date: form.due_date || null,
      paid_date: form.status === 'paid' ? (form.paid_date || new Date().toISOString().split('T')[0]) : form.paid_date || null,
      notes: form.notes,
    }

    if (invoice) {
      await supabase.from('invoices').update(payload).eq('id', invoice.id)
    } else {
      await supabase.from('invoices').insert(payload)
    }
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white">
            {invoice ? 'Edit Invoice' : 'New Invoice'}
          </h3>
          <button onClick={onClose}><X size={20} className="text-gray-500" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            placeholder="Invoice Number *" required
            value={form.invoice_number}
            onChange={e => setForm({ ...form, invoice_number: e.target.value })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono"
          />

          <select required value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm">
            <option value="">Select Client</option>
            {clients.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </select>

          <input
            type="number" step="0.01" placeholder="Amount *" required
            value={form.amount}
            onChange={e => setForm({ ...form, amount: e.target.value })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
          />

          <div className="grid grid-cols-2 gap-2">
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm">
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <input
              type="date"
              value={form.due_date}
              onChange={e => setForm({ ...form, due_date: e.target.value })}
              placeholder="Due Date"
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>

          {form.status === 'paid' && (
            <input type="date" value={form.paid_date}
              onChange={e => setForm({ ...form, paid_date: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
          )}

          <textarea placeholder="Notes" value={form.notes}
            onChange={e => setForm({ ...form, notes: e.target.value })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" rows={2} />

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-sm font-semibold disabled:opacity-50">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

**Step 4: Verify**

```bash
cd /mnt/d/ServiCore/packages/admin
pnpm dev
```

Navigate to http://localhost:5173/finances → should see 3 tabs (Transactions, Reports, Invoices) with summary cards at top. Test adding income/expense entries, uploading receipts.

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: add financial management with transactions, invoices, and reports"
```

---

## Phase 6: Android App (React Native)

### Task 6.1: Auth flow for technicians

**Objective:** Login screen using Supabase SDK.

File: `hsm/packages/mobile/App.tsx`

```tsx
import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native'

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
)

export default function App() {
  const [session, setSession] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    supabase.auth.onAuthStateChange((_event, session) => setSession(session))
  }, [])

  if (!session) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>HSM Technician</Text>
        <TextInput style={styles.input} placeholder="Email" value={email} onChangeText={setEmail} placeholderTextColor="#666" />
        <TextInput style={styles.input} placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry placeholderTextColor="#666" />
        <TouchableOpacity style={styles.button} onPress={() => supabase.auth.signInWithPassword({ email, password })}>
          <Text style={styles.buttonText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Visits</Text>
      {/* Visit list goes here */}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', padding: 20 },
  title: { color: '#22d3ee', fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 30 },
  input: { backgroundColor: '#1e293b', color: 'white', padding: 14, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: '#334155' },
  button: { backgroundColor: '#0891b2', padding: 14, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
})
```

### Task 6.2: Visit list + GPS photo capture

**Objective:** Show assigned visits, tap to capture photo with EXIF GPS.

```tsx
import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location'

async function captureProofPhoto(visitId: string) {
  // Request permissions
  const { status: camStatus } = await ImagePicker.requestCameraPermissionsAsync()
  const { status: locStatus } = await Location.requestForegroundPermissionsAsync()
  if (camStatus !== 'granted' || locStatus !== 'granted') {
    alert('Camera and location permissions required')
    return
  }

  const location = await Location.getCurrentPositionAsync({})
  const photo = await ImagePicker.launchCameraAsync({
    quality: 0.8,
    exif: true,
  })

  if (!photo.canceled) {
    const file = photo.assets[0]
    const filename = `visits/${visitId}/${Date.now()}.jpg`

    // Upload to Supabase Storage
    const formData = new FormData()
    formData.append('file', {
      uri: file.uri,
      name: filename,
      type: 'image/jpeg',
    } as any)

    const { error: uploadError } = await supabase.storage
      .from('service-photos')
      .upload(filename, formData as any)

    if (uploadError) throw uploadError

    // Save photo record with GPS
    const { error: dbError } = await supabase.from('service_photos').insert({
      visit_id: visitId,
      storage_path: filename,
      gps_lat: location.coords.latitude,
      gps_lng: location.coords.longitude,
    })

    if (dbError) throw dbError

    // Mark visit as completed
    await supabase.from('service_visits')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', visitId)

    alert('✅ Visit completed!')
  }
}
```

---

## Phase 7: Deployment

### Task 7.1: Deploy admin dashboard to Cloudflare Pages

```bash
cd /mnt/d/ServiCore/packages/admin
pnpm build

# Install wrangler
pnpm add -D wrangler

# Deploy
npx wrangler pages deploy dist --project-name=hsm-admin
```

Set env vars in Cloudflare dashboard:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Add custom domain: `app.yourdomain.com`

### Task 7.2: Build Android APK

```bash
cd /mnt/d/ServiCore/packages/mobile
npx expo prebuild
cd android && ./gradlew assembleRelease
```

APK output: `android/app/build/outputs/apk/release/app-release.apk`

---

## Database: Seed Sample Data

Run in Supabase SQL Editor to create test data:

```sql
-- Create admin user (via Supabase Auth dashboard first, then)
INSERT INTO clients (name, type, contact_person, whatsapp_number, city, state) VALUES
  ('SBI Bank - Main Branch', 'bank', 'Mr. Sharma', '+919876543210', 'Mumbai', 'Maharashtra'),
  ('HDFC Bank - Andheri', 'bank', 'Ms. Patel', '+919876543211', 'Mumbai', 'Maharashtra'),
  ('Ravi Electronics', 'individual', 'Ravi Kumar', '+919876543212', 'Pune', 'Maharashtra');

-- Add equipment
INSERT INTO equipment (client_id, type, brand, model) VALUES
  ((SELECT id FROM clients WHERE name = 'SBI Bank - Main Branch'), 'camera', 'Hikvision', 'DS-2CD2043G2-I'),
  ((SELECT id FROM clients WHERE name = 'SBI Bank - Main Branch'), 'ups', 'APC', 'BR1500G-IN'),
  ((SELECT id FROM clients WHERE name = 'HDFC Bank - Andheri'), 'battery', 'Exide', '150AH');

-- Create service contracts
INSERT INTO service_contracts (client_id, equipment_id, service_type, frequency_months, next_service_date) VALUES
  ((SELECT id FROM clients WHERE name = 'SBI Bank - Main Branch'), (SELECT id FROM equipment WHERE model = 'DS-2CD2043G2-I'), 'Camera Maintenance', 6, CURRENT_DATE + INTERVAL '7 days'),
  ((SELECT id FROM clients WHERE name = 'SBI Bank - Main Branch'), (SELECT id FROM equipment WHERE model = 'BR1500G-IN'), 'UPS Service', 6, CURRENT_DATE + INTERVAL '14 days');
```

---

## Summary: File Structure

```
hsm/
├── pnpm-workspace.yaml
├── package.json
└── packages/
    ├── admin/                          # React + Vite (Cloudflare Pages)
    │   ├── src/
    │   │   ├── lib/
    │   │   │   ├── supabase.ts         # Supabase client
    │   │   │   └── auth.tsx            # Auth context + provider
    │   │   ├── components/
    │   │   │   ├── Layout.tsx          # App shell with sidebar
    │   │   │   ├── Sidebar.tsx         # Navigation
    │   │   │   ├── ClientForm.tsx      # Client CRUD modal
    │   │   │   ├── TransactionForm.tsx # Income/expense entry modal
    │   │   │   └── InvoiceForm.tsx     # Invoice create/edit modal
    │   │   ├── pages/
    │   │   │   ├── Login.tsx           # Admin login
    │   │   │   ├── Dashboard.tsx       # Stats + overview
    │   │   │   ├── Clients.tsx         # Client list + search
    │   │   │   ├── Equipment.tsx       # Equipment management
    │   │   │   ├── Visits.tsx          # Visit assignment + tracking
    │   │   │   ├── Reminders.tsx       # Reminder log
    │   │   │   └── Finances.tsx        # Income/expenses, invoices, reports
    │   │   └── App.tsx                 # Router + auth guard
    │   └── .env                        # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
    ├── mobile/                         # React Native (Android)
    │   ├── App.tsx                     # Auth + visit list + photo capture
    │   └── .env                        # EXPO_PUBLIC_SUPABASE_*
    └── functions/                      # Supabase Edge Functions
        └── supabase/
            ├── functions/
            │   ├── send-whatsapp/
            │   │   └── index.ts        # Send reminders + cron processor
            │   └── whatsapp-webhook/
            │       └── index.ts        # Delivery status webhook
            └── migrations/
                └── 001_schema.sql      # Full DB schema
```

---

## Next Steps (What To Code First)

1. ✅ Architecture plan — done
2. Task 1.1 — Scaffold monorepo
3. Task 1.2 — Deploy schema to Supabase
4. Task 2.1 — Admin auth (login + Supabase client)
5. Task 2.2 — Layout + navigation
6. Task 2.3 — Client CRUD
7. Repeat CRUD pattern for Equipment, Contracts, Visits
8. Task 3.1 — WhatsApp edge function
9. Task 4.1 — pg_cron reminder job
10. Task 6.1–6.2 — Android app
11. Task 7.1–7.2 — Deploy both

**Estimated effort:** ~3–4 days for a solo developer, ~1–2 days with subagents running in parallel.
