// Stripe webhook — fires after payment succeeds
// Creates Zoom meeting + sends confirmation emails automatically
//
// Setup in Stripe Dashboard:
//   Developers → Webhooks → Add endpoint
//   URL: https://staelfogarty.com/.netlify/functions/stripe-webhook
//   Events: checkout.session.completed

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const HANDLED_EVENT_TYPES = new Set(['checkout.session.completed']);

// In-memory idempotency cache. Netlify function instances are short-lived, so
// this only protects against retry storms on a warm instance. Stripe event IDs
// are unique; we also key the decision on event type so unexpected types exit
// early with 200 (acknowledged, no-op) instead of being retried.
const seenEventIds = new Set();
const SEEN_MAX = 500;

function rememberEvent(id) {
  if (seenEventIds.size >= SEEN_MAX) {
    const oldest = seenEventIds.values().next().value;
    seenEventIds.delete(oldest);
  }
  seenEventIds.add(id);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not set; refusing to process webhook');
    return { statusCode: 500, body: 'Server misconfigured' };
  }

  const sig = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
  if (!sig) {
    return { statusCode: 400, body: 'Missing Stripe-Signature header' };
  }

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  // Idempotency: Stripe retries on non-2xx responses and may also redeliver
  // successful events. Drop duplicates we've already processed.
  if (stripeEvent.id && seenEventIds.has(stripeEvent.id)) {
    console.log('Duplicate event ignored:', stripeEvent.id);
    return { statusCode: 200, body: JSON.stringify({ received: true, duplicate: true }) };
  }

  // Acknowledge event types we don't care about so Stripe stops retrying.
  if (!HANDLED_EVENT_TYPES.has(stripeEvent.type)) {
    if (stripeEvent.id) rememberEvent(stripeEvent.id);
    return { statusCode: 200, body: JSON.stringify({ received: true, handled: false }) };
  }

  const session = stripeEvent.data.object;
  const meta = session.metadata || {};

  // ── Shop (digital download) dispatch ──────────────────────────
  // When the checkout was created by shop-checkout.js we stamp
  // metadata.purpose = 'shop_digital'. Route those to the shop
  // fulfillment handler instead of the booking/Zoom flow.
  if (meta.purpose === 'shop_digital') {
    try {
      const { fulfillShopOrder } = require('./lib/shop-fulfill');
      const result = await fulfillShopOrder(session);
      if (stripeEvent.id) rememberEvent(stripeEvent.id);
      return { statusCode: 200, body: JSON.stringify({ received: true, shop: true, ...result }) };
    } catch (e) {
      console.error('shop fulfillment failed:', e);
      return { statusCode: 500, body: JSON.stringify({ error: 'Shop fulfillment failed' }) };
    }
  }

  const bookingData = {
    service:   meta.service    || 'Session',
    price:     meta.price      || '0',
    unit:      meta.unit       || 'hr',
    date:      meta.date       || '',
    time:      meta.time       || '',
    fname:     meta.fname      || '',
    lname:     meta.lname      || '',
    email:     meta.client_email || session.customer_email || '',
    phone:     meta.client_phone || '',
    notes:     meta.notes      || '',
    sessionId: session.id,
  };

  console.log('Payment confirmed for:', bookingData.service, '—', bookingData.fname, bookingData.lname);

  // Trigger Zoom + notification function. On downstream failure we return 500
  // so Stripe retries the webhook — do NOT mark the event as seen in that case.
  try {
    const baseUrl = process.env.URL || 'https://staelfogarty.com';
    const res = await fetch(`${baseUrl}/.netlify/functions/create-zoom-meeting`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bookingData),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error('Zoom/email downstream non-2xx:', res.status, errBody);
      return { statusCode: 500, body: JSON.stringify({ error: 'Downstream failure' }) };
    }
    const result = await res.json();
    if (result && result.success === false) {
      console.error('Zoom/email reported failure:', JSON.stringify(result));
      return { statusCode: 500, body: JSON.stringify({ error: 'Downstream reported failure' }) };
    }
    console.log('Zoom + email result:', JSON.stringify(result));
  } catch (err) {
    console.error('Failed to trigger Zoom/email:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: 'Downstream error' }) };
  }

  if (stripeEvent.id) rememberEvent(stripeEvent.id);
  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
