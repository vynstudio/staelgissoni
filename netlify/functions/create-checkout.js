const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { preflight, jsonResponse } = require('./lib/cors');
const { priceFor, PRICES } = require('./lib/prices');
const { isValidEmail, sanitizeHeader, sanitizeText } = require('./lib/validation');

exports.handler = async (event) => {
  const pre = preflight(event);
  if (pre) return pre;

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const staelAccountId = process.env.STAEL_STRIPE_ACCOUNT_ID;
  if (!staelAccountId) {
    console.error('STAEL_STRIPE_ACCOUNT_ID not set');
    return jsonResponse(500, { error: 'Server misconfigured' });
  }

  let data;
  try {
    data = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON' });
  }

  const { serviceKey, hours, unit, date, time, fname, lname, email, phone, notes } = data;

  if (!serviceKey || !PRICES[serviceKey]) {
    return jsonResponse(400, { error: 'Unknown service' });
  }
  if (!fname || !isValidEmail(email)) {
    return jsonResponse(400, { error: 'Invalid or missing email / name' });
  }
  if (!date || !time) {
    return jsonResponse(400, { error: 'Missing date or time' });
  }
  if (notes && String(notes).length > 450) {
    return jsonResponse(400, { error: 'Notes too long (max 450 chars)' });
  }

  let pricing;
  try {
    pricing = priceFor(serviceKey, hours);
  } catch (err) {
    return jsonResponse(400, { error: err.message });
  }

  const safeFname = sanitizeHeader(fname, 80);
  const safeLname = sanitizeHeader(lname, 80);
  const safeDate = sanitizeHeader(date, 40);
  const safeTime = sanitizeHeader(time, 20);
  const safeNotes = sanitizeText(notes, 450);
  const safePhone = sanitizeHeader(phone, 40);

  // Unit amount (cents) derived from the server-side table. Use Math.round to
  // guard against any upstream change that produces a non-integer.
  const unitAmountCents = Math.round(pricing.total);
  const commissionAmount = Math.round(unitAmountCents * 0.20);

  // 3% processing fee passed to client
  const processingFeeRate = 0.03;
  const processingFee = Math.round(unitAmountCents * processingFeeRate);

  try {
    const sessionParams = {
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: pricing.label,
              description: `${pricing.label} — ${safeDate} at ${safeTime} ET`,
            },
            unit_amount: unitAmountCents,
          },
          quantity: 1,
        },
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Processing Fee',
              description: '3% payment processing fee',
            },
            unit_amount: processingFee,
          },
          quantity: 1,
        },
      ],
      metadata: {
        service: pricing.label,
        service_key: serviceKey,
        price: String(pricing.total / 100),
        hours: String(pricing.hours),
        unit: unit || 'hr',
        date: safeDate,
        time: safeTime,
        fname: safeFname,
        lname: safeLname,
        client_email: email,
        client_phone: safePhone,
        notes: safeNotes,
      },
      payment_intent_data: {
        application_fee_amount: commissionAmount,
        transfer_data: { destination: staelAccountId },
      },
      success_url: `${process.env.URL || 'https://staelfogarty.com'}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.URL || 'https://staelfogarty.com'}/contact.html`,
    };

    const session = await stripe.checkout.sessions.create(sessionParams);

    console.log(
      `✓ Checkout created: ${session.id} | ${pricing.label} $${pricing.total / 100} | commission $${commissionAmount / 100}`
    );

    return jsonResponse(200, { url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Stripe error:', err.message);
    return jsonResponse(500, { error: 'Checkout creation failed' });
  }
};
