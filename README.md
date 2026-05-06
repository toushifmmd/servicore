# ServiCore — Hardware Service Management Platform

A complete system for hardware supply & service companies to manage clients, track equipment, automate WhatsApp reminders, and collect GPS-tagged photo proof from field technicians.

## Architecture

```
┌──────────┐     ┌──────────────────┐     ┌────────────────────────────┐
│  Admins  │────▶│  Cloudflare Pages │────▶│        Supabase            │
│ (Browser)│     │  React Dashboard  │     │  ┌──────┐ ┌──────────────┐│
└──────────┘     └──────────────────┘     │  │ Auth │ │Edge Functions││──▶ WhatsApp API
                                          │  └──────┘ │ (send msg)   ││◀── (webhook)
┌──────────┐                              │           │ (cron check)  ││
│Field Tech│──────▶ Supabase ────────────▶│  ┌──────┐ └──────────────┘│
│(Android) │       Auth + Storage         │  │  DB  │ ┌──────────────┐│
│ 📸+📍    │                              │  │      │ │  pg_cron     ││
└──────────┘                              │  └──────┘ └──────────────┘│
                                          └────────────────────────────┘
```

## Tech Stack

| Component | Tech | Hosting |
|-----------|------|---------|
| Admin Dashboard | React 19 + Vite + Tailwind CSS 4 | Cloudflare Pages (free) |
| Android App | React Native + Expo | APK / Play Store |
| Backend + DB | Supabase (PostgreSQL + Auth + Storage) | Free tier |
| Messaging | WhatsApp Cloud API v20.0 | Meta |
| Cron Jobs | pg_cron | Supabase |

## Project Structure

```
ServiCore/
├── supabase-schema.sql          # Full DB schema, RLS, triggers, cron
├── PLAN.md                      # Detailed implementation plan
├── architecture.html            # Visual architecture diagram
├── packages/
│   ├── admin/                   # React + Vite admin dashboard
│   │   └── src/
│   │       ├── auth/AuthProvider.tsx
│   │       ├── lib/supabase.ts
│   │       └── pages/
│   │           ├── LoginPage.tsx
│   │           ├── Layout.tsx
│   │           ├── DashboardPage.tsx
│   │           ├── ClientsPage.tsx
│   │           ├── ClientDetailPage.tsx
│   │           ├── FinancesPage.tsx
│   │           ├── TechniciansPage.tsx
│   │           └── RemindersPage.tsx
│   ├── mobile/                  # React Native Android app
│   │   └── src/
│   │       ├── auth/AuthProvider.tsx
│   │       ├── lib/supabase.ts
│   │       └── screens/
│   │           ├── LoginScreen.tsx
│   │           ├── HomeScreen.tsx
│   │           └── VisitDetailScreen.tsx
│   └── functions/               # Supabase Edge Functions
│       ├── send-whatsapp/index.ts
│       └── whatsapp-webhook/index.ts
```

## Setup

### 1. Supabase (Database + Auth)

Create a project at [supabase.com](https://supabase.com), then:

```bash
# Copy the SQL schema
cat supabase-schema.sql
# Paste into Supabase SQL Editor → Run
```

Set Edge Function secrets:
```bash
supabase secrets set WHATSAPP_TOKEN=your_meta_token WHATSAPP_PHONE_ID=your_phone_id
supabase functions deploy send-whatsapp
supabase functions deploy whatsapp-webhook
```

### 2. Admin Dashboard

```bash
cd packages/admin
cp .env.example .env
# Edit .env with your Supabase URL + Anon Key
pnpm install
pnpm dev
```

Deploy to Cloudflare Pages:
- Connect GitHub repo
- Build command: `cd packages/admin && pnpm install && pnpm build`
- Output directory: `packages/admin/dist`

### 3. Android App

```bash
cd packages/mobile
# Edit src/lib/supabase.ts with your Supabase URL + Anon Key
npx expo install
npx expo start
# Scan QR code with Expo Go app, or build APK
```

### 4. WhatsApp API

1. Create Meta Business account at [developers.facebook.com](https://developers.facebook.com)
2. Create WhatsApp app → get Phone Number ID + Permanent Token
3. Set webhook URL: `https://your-project.supabase.co/functions/v1/whatsapp-webhook`
4. Verify token: `servicore-webhook`

## Features

- ✅ Client CRUD (name, phone, company, branch, service frequency)
- ✅ Equipment tracking (cameras, UPS, batteries)
- ✅ Financial management (income/expense tracking, reports, payment methods)
- ✅ Automated WhatsApp reminders every 6 months (configurable)
- ✅ Field technician Android app with GPS + camera proof
- ✅ Visit completion auto-triggers next service date
- ✅ Admin dashboard with revenue MTD, upcoming visits
- ✅ Row Level Security (admins see all, technicians see assigned only)
- ✅ pg_cron daily check for upcoming services

## License

Private — your company's proprietary software.
