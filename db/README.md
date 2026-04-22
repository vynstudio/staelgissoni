# Supabase setup — services catalogue

One table (`public.services`) drives `/book`. Edit rows in Supabase Studio to change prices, descriptions, order, or activation without a deploy.

## One-time setup

1. Create a Supabase project (free tier is fine).
2. Paste `001_services.sql` into the **SQL Editor** → Run. That creates the table, RLS policies, and seeds the current price list.
3. Add these env vars to the Netlify site (`stael-fogarty`):
   - `SUPABASE_URL` — `https://<project-ref>.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` — service role JWT (server-only)
   - `STRIPE_SECRET_KEY` — live secret key (or test for staging)
   - `STRIPE_WEBHOOK_SECRET` — set after adding the webhook endpoint (below)
   - `STAEL_STRIPE_ACCOUNT_ID` — `acct_...` from Stripe Connect
   - `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (defaults to `hello@staelgissoni.com`)
   - `BOOKING_NOTIFY_TO` (comma-separated; defaults to `hello@staelgissoni.com`)
   - `SITE_BASE_URL` — `https://staelgissoni.com`
4. In Stripe Dashboard → Developers → Webhooks, add:
   - **URL** `https://staelgissoni.com/.netlify/functions/stripe-webhook`
   - **Events** `checkout.session.completed`
   - Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

## Managing services

- **Edit a price**: Supabase Studio → Table editor → `services` → change `hourly_usd` → save. Change is live on `/book` within seconds.
- **Hide a service**: set `active = false`. Stays in the DB, hidden from the form.
- **Add a service**: Insert a new row. Required fields: `slug` (URL-safe, unique), `label`, `hourly_usd`. Sensible defaults: `min_hours=1`, `step_hours=0.5`, `default_hours=1`, `mode='remote'`, `color_accent='blue'` (or `peach` / `mint` / `lav`).
- **Reorder**: change `sort_order` (ascending). Default is 100.

## Revenue split

- Customer pays: `hourly_usd × hours` (no processing fee added on top in this build).
- Stripe deducts its processing fee (~2.9% + $0.30 for US cards).
- Of the remainder, **20%** is the platform fee (Vyn Studio) and **80%** transfers to Stael's connected account — enforced server-side in `create-checkout.js` via `application_fee_amount` + `transfer_data.destination`.

## Files

```
db/
├── 001_services.sql    ← paste into Supabase SQL editor
└── README.md            (this file)
netlify/functions/
├── services-list.js     ← GET active services (public; anon-safe)
├── create-checkout.js   ← POST → Stripe Checkout w/ Connect split
├── stripe-webhook.js    ← checkout.session.completed → Resend emails
└── lib/
    ├── supabase.js      admin client
    ├── prices.js        hours→total math, validation
    └── validation.js    sanitizers
```
