// POST /.netlify/functions/shop-checkout
//   Body: { slug, email, name? }
// Creates a Stripe Checkout session for a single digital product. Reuses
// the existing Connect account (20% split to Stael) so revenue flows the
// same way as service bookings.
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { preflight, jsonResponse } = require('./lib/cors');
const { isValidEmail, sanitizeHeader } = require('./lib/validation');
const { getAdminClient } = require('./lib/supabase');

exports.handler = async (event) => {
  const pre = preflight(event);
  if (pre) return pre;
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  const staelAccountId = process.env.STAEL_STRIPE_ACCOUNT_ID;
  if (!staelAccountId) return jsonResponse(500, { error: 'Server misconfigured' });

  let data;
  try { data = JSON.parse(event.body || '{}'); }
  catch { return jsonResponse(400, { error: 'Invalid JSON' }); }

  const { slug, email } = data;
  if (!slug) return jsonResponse(400, { error: 'slug required' });
  if (!isValidEmail(email)) return jsonResponse(400, { error: 'Valid email required' });
  const safeName = sanitizeHeader(data.name || '', 120);

  const admin = getAdminClient();
  const { data: product, error } = await admin
    .from('shop_products')
    .select('id, slug, title, subtitle, price_cents, currency:language')
    .eq('slug', slug).eq('active', true).maybeSingle();
  if (error) return jsonResponse(500, { error: 'DB error: ' + error.message });
  if (!product) return jsonResponse(404, { error: 'Product not found' });

  const priceCents = Number(product.price_cents);
  if (!priceCents || priceCents < 50) return jsonResponse(400, { error: 'Invalid product price' });

  // 20% commission split (same as services) — goes to Stael's Connect account.
  const commission = Math.round(priceCents * 0.20);

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
            name: product.title,
            description: product.subtitle || `${product.title} — digital download`,
          },
          unit_amount: priceCents,
        },
        quantity: 1,
      }],
      payment_intent_data: {
        application_fee_amount: priceCents - commission, // Vyn keeps the rest
        transfer_data: { destination: staelAccountId },
      },
      metadata: {
        purpose: 'shop_digital',
        product_id: product.id,
        product_slug: product.slug,
        customer_name: safeName,
      },
      success_url: `${baseUrl}/download?session={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/shop/${product.slug}?canceled=1`,
    });

    // Pre-create the order row in pending state so the webhook can update it
    // via stripe_session_id. Download token is pre-minted so we don't have to
    // worry about race conditions between webhook + success-page landing.
    await admin.from('shop_orders').insert({
      product_id: product.id,
      stripe_session_id: session.id,
      customer_email: email,
      customer_name: safeName || null,
      amount_paid_cents: priceCents,
      status: 'pending',
    });

    return jsonResponse(200, { checkout_url: session.url });
  } catch (e) {
    console.error('shop-checkout error:', e);
    return jsonResponse(500, { error: 'Checkout failed: ' + e.message });
  }
};
