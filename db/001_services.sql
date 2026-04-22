-- ============================================================
-- Stael Gissoni — Services catalogue
-- ============================================================
-- One table, one job: what can the customer buy, how much per hour,
-- and what's the minimum booking. Everything else (customer details,
-- time slot, calendar link) stays in Stripe + the confirmation email.
--
-- Checkout is *always* server-validated: /create-checkout re-reads
-- the row by slug + recomputes the total. Clients can't tamper.
--
-- Safe to re-run.
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  description text,
  hourly_usd numeric(10,2) not null check (hourly_usd > 0),
  min_hours numeric(4,1) not null default 1 check (min_hours > 0),
  step_hours numeric(4,1) not null default 0.5 check (step_hours > 0),
  default_hours numeric(4,1) not null default 1,
  mode text not null default 'remote' check (mode in ('remote','in-person','either')),
  active boolean not null default true,
  sort_order int not null default 100,
  color_accent text default 'blue',        -- maps to CSS var (blue / peach / mint / lav)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists services_active_sort_idx on public.services (active, sort_order);

alter table public.services enable row level security;

-- Public read of active services only (anon key powers the /book page).
drop policy if exists services_public_read on public.services;
create policy services_public_read on public.services
  for select using (active = true);

-- Seed with the current price list (edit rows in Supabase Studio anytime).
insert into public.services (slug, label, description, hourly_usd, min_hours, default_hours, mode, color_accent, sort_order)
values
  ('remote',      'Remote interpretation',          'Professional English↔Portuguese via Google Meet, Zoom, or phone.',        95, 0.5, 1, 'remote',    'blue',  10),
  ('on-site',     'On-site interpretation',         'Real-time consecutive interpretation in Central Florida.',              125, 2,   2, 'in-person', 'blue',  20),
  ('medical',     'Medical interpretation',         'HIPAA-aware interpretation for doctor visits, hospitals, mental health.', 110, 2,   2, 'either',    'lav',   30),
  ('legal',       'Legal / deposition',             'Depositions, USCIS hearings, citizenship interviews.',                  150, 2,   2, 'either',    'blue',  40),
  ('lessons',     'One-on-one English lesson',      'Conversation, pronunciation, accent — personalized sessions.',           50, 1,   1, 'remote',    'peach', 50),
  ('citizenship', 'Citizenship / green-card prep',  'Mock interviews, civics test, USCIS vocabulary.',                        75, 1,   1, 'remote',    'peach', 60)
on conflict (slug) do nothing;
