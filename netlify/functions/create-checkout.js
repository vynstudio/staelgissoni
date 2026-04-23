// POST /.netlify/functions/create-checkout
//   Body: { service, hours, name, email, phone?, mode?, notes? }
// Server-validates against public.services (Supabase), creates a Stripe
// Checkout Session with Connect split — 20% platform fee (Vyn), rest
// transfers to Stael's connected account.

const Stripe = require('stripe');
const { findBySlug } = require('./lib/catalog');
const { priceFromService } = require('./lib/prices');
const { isValidEmail, sanitize, sanitizeText, cleanPhone } = require('./lib/validation');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (s, b) => ({ statusCode: s, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!process.env.STRIPE_SECRET_KEY) return json(500, { error: 'Stripe not configured' });
  if (!process.env.STAEL_STRIPE_ACCOUNT_ID) return json(500, { error: 'Connect account not configured' });

  let data;
  try { data = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'Invalid JSON' }); }

  const slug = sanitize(data.service, 40);
  const email = sanitize(data.email, 120);
  const name = sanitize(data.name, 120);
  const phone = cleanPhone(data.phone);
  const mode = sanitize(data.mode, 20) || '';
  const notes = sanitizeText(data.notes, 800);
  const hoursInput = data.hours;
  const startIso = sanitize(data.start_at, 40);
  const timezone = sanitize(data.timezone, 60) || 'America/New_York';

  if (!slug) return json(400, { error: 'Service required' });
  if (!name) return json(400, { error: 'Name required' });
  if (!isValidEmail(email)) return json(400, { error: 'Valid email required' });

  // Validate start_at: must be a real future datetime at least 2h out so
  // Stael has time to react. 90-day cap keeps people from booking years away.
  if (!startIso) return json(400, { error: 'Start time required' });
  const startDate = new Date(startIso);
  if (isNaN(startDate.getTime())) return json(400, { error: 'Invalid start time' });
  const now = Date.now();
  const leadMs = startDate.getTime() - now;
  if (leadMs < 2 * 60 * 60 * 1000) return json(400, { error: 'Pick a time at least 2 hours from now' });
  if (leadMs > 90 * 24 * 60 * 60 * 1000) return json(400, { error: 'Pick a time within the next 90 days' });

  const svc = findBySlug(slug);
  if (!svc) return json(404, { error: 'Service not found' });

  let pricing;
  try { pricing = priceFromService(svc, hoursInput); }
  catch (e) { return json(400, { error: e.message }); }

  if (pricing.total_cents < 50) return json(400, { error: 'Amount below Stripe minimum' });

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const baseUrl = process.env.SITE_BASE_URL || 'https://staelgissoni.com';

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: email,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: pricing.service_label,
            description: `${pricing.hours} hour(s) × $${pricing.hourly_usd}/hr${mode ? ' · ' + mode : ''}`,
          },
          unit_amount: pricing.total_cents,
        },
        quantity: 1,
      }],
      payment_intent_data: {
        // Platform fee = 20% of gross. Rest transfers to Stael's account.
        application_fee_amount: pricing.platform_fee_cents,
        transfer_data: { destination: process.env.STAEL_STRIPE_ACCOUNT_ID },
        // on_behalf_of makes the charge settle as if on Stael's account —
        // card statements show Stael's descriptor, not the platform's.
        on_behalf_of: process.env.STAEL_STRIPE_ACCOUNT_ID,
        statement_descriptor_suffix: 'STAEL GISSONI',
      },
      metadata: {
        purpose: 'booking',
        service_slug: pricing.service_key,
        service_label: pricing.service_label,
        hours: String(pricing.hours),
        hourly_usd: String(pricing.hourly_usd),
        customer_name: name,
        customer_phone: phone,
        customer_mode: mode,
        start_at: startDate.toISOString(),
        timezone,
        notes: notes.slice(0, 380),
      },
      success_url: `${baseUrl}/confirmed?session={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/book?canceled=1&service=${encodeURIComponent(slug)}`,
    });

    return json(200, { checkout_url: session.url });
  } catch (e) {
    console.error('create-checkout error:', e);
    return json(500, { error: 'Checkout failed: ' + e.message });
  }
};
