-- ============================================================
-- STAEL FOGARTY — shop schema (digital downloads)
-- ============================================================
-- Phase 1: digital products only. No cart, no physical inventory,
-- one product per checkout.
--
-- Products live at public.shop_products, orders at public.shop_orders.
-- The actual files live in Supabase Storage bucket `shop-products`
-- (private). Download tokens in shop_orders.download_token are used
-- to generate signed URLs for the customer.
-- ============================================================

create extension if not exists pgcrypto;

-- Products ----------------------------------------------------
create table if not exists public.shop_products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  subtitle text,
  description text,
  price_cents int not null check (price_cents >= 0),
  language text check (language in ('en','pt','bilingual')) default 'en',
  cover_image_url text,
  file_path text not null,          -- path inside Supabase Storage bucket
  preview_path text,                -- optional free preview inside same bucket
  active boolean not null default true,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shop_products_active_idx
  on public.shop_products(active, sort_order);

-- Orders ------------------------------------------------------
create table if not exists public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.shop_products(id),
  stripe_session_id text unique,
  stripe_payment_intent_id text,
  customer_email text not null,
  customer_name text,
  amount_paid_cents int not null,
  currency text not null default 'usd',
  status text not null default 'pending' check (status in ('pending','paid','refunded','failed')),
  download_token uuid not null default gen_random_uuid() unique,
  download_expires_at timestamptz not null default (now() + interval '7 days'),
  download_count int not null default 0,
  first_downloaded_at timestamptz,
  last_downloaded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shop_orders_email_idx on public.shop_orders(customer_email);
create index if not exists shop_orders_status_idx on public.shop_orders(status);

-- RLS ---------------------------------------------------------
-- Everything is server-mediated via the service role (Netlify
-- Functions). Customers never hit Postgres directly. So RLS is
-- on but restrictive — no public policies at all.
alter table public.shop_products enable row level security;
alter table public.shop_orders   enable row level security;

-- Allow the anon key to READ active products (powers /shop listing
-- and product-detail pages without a function round-trip).
drop policy if exists shop_products_read_active on public.shop_products;
create policy shop_products_read_active on public.shop_products
  for select using (active = true);
