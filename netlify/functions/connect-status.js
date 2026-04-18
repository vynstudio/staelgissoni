// Check if Stael's connected account has completed onboarding.
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { preflight, jsonResponse } = require('./lib/cors');

exports.handler = async (event) => {
  const pre = preflight(event);
  if (pre) return pre;

  const accountId = process.env.STAEL_STRIPE_ACCOUNT_ID;
  if (!accountId) {
    console.error('STAEL_STRIPE_ACCOUNT_ID not set');
    return jsonResponse(500, { error: 'Server misconfigured' });
  }

  try {
    const account = await stripe.accounts.retrieve(accountId);
    return jsonResponse(200, {
      accountId: account.id,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      ready: account.charges_enabled && account.payouts_enabled,
    });
  } catch (err) {
    console.error('Status check error:', err);
    return jsonResponse(500, { error: 'Status check failed' });
  }
};
