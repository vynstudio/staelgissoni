# staelfogarty — database

Supabase migrations for the shop (digital downloads) feature. Run in order.

## Setup (one-time)

1. Create a Supabase project for Stael (free tier is fine).
2. In the SQL editor, run `001_shop_init.sql`.
3. In **Storage**, create a **private** bucket named `shop-products`.
4. Upload your product files (PDFs, audio, etc.) to that bucket. Note each file's path — you'll set it on the product row.
5. Add these env vars to the Netlify site:
   - `SUPABASE_URL` — https://<project-ref>.supabase.co
   - `SUPABASE_SERVICE_ROLE_KEY` — service role (server-only)
   - `SHOP_BUCKET` — `shop-products` (or whatever you named the bucket; defaults to this)
   - `SITE_BASE_URL` — `https://staelgissoni.com`

## Adding a product

Run this in the Supabase SQL editor (replace values):

```sql
insert into public.shop_products (slug, title, subtitle, description, price_cents, language, file_path, cover_image_url, sort_order)
values (
  'citizenship-prep-pack',
  'US Citizenship Test Prep',
  '100 civics questions + audio pronunciations',
  'A complete study pack for the US naturalization test. 100 civics questions, audio pronunciation of every answer, and a short-answer practice guide.',
  2900,
  'bilingual',
  'citizenship-pack-v1.pdf',
  null,
  10
);
```

- `slug` ends up in the URL (`/shop/<slug>`). Keep it lowercase + hyphens.
- `price_cents` — $29.00 = 2900.
- `file_path` — the path inside the `shop-products` Supabase Storage bucket.
- `language` — `en` / `pt` / `bilingual`.
- `cover_image_url` — optional, any public URL (or leave null for the peach gradient fallback).

## Checkout → download flow

1. Customer visits `/shop/<slug>`, fills name + email, clicks Buy.
2. `shop-checkout.js` creates a Stripe Checkout session (reuses the Connect account, 20% split to Stael) and pre-inserts a `shop_orders` row in `pending` state with a minted `download_token`.
3. After payment, Stripe webhook → `stripe-webhook.js` dispatches on `metadata.purpose = 'shop_digital'` and `lib/shop-fulfill.js` flips the order to `paid`, then emails the customer a link like `/download?token=<uuid>`.
4. The customer clicks the link → `shop-download.js` verifies token + expiry, then 302-redirects to a 60-second Supabase Storage signed URL for the file.

Links expire 7 days after purchase (configurable on `shop_orders.download_expires_at`).
