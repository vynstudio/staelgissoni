// Stripe Connect — onboard Stael as an Express connected account.
//
// Admin-only. Requires `Authorization: Bearer <ADMIN_SECRET>` header matching
// the ADMIN_SECRET env var. Creates a new Express account and returns an
// onboarding link. Onboarding arbitrary caller-supplied account IDs is NOT
// permitted — use `?existing=true` to reuse the configured STAEL_STRIPE_ACCOUNT_ID.

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { preflight, jsonResponse, corsHeaders } = require('./lib/cors');

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function isAuthorized(event) {
  const expected = process.env.ADMIN_SECRET;
  if (!expected) return false;
  const header = event.headers?.authorization || event.headers?.Authorization || '';
  const m = /^Bearer\s+(.+)$/.exec(header);
  if (!m) return false;
  return timingSafeEqual(m[1], expected);
}

exports.handler = async (event) => {
  const pre = preflight(event);
  if (pre) return pre;

  if (!process.env.ADMIN_SECRET) {
    console.error('ADMIN_SECRET not set; refusing to run connect-onboard');
    return jsonResponse(500, { error: 'Server misconfigured' });
  }

  if (!isAuthorized(event)) {
    return jsonResponse(401, { error: 'Unauthorized' });
  }

  try {
    const params = event.queryStringParameters || {};

    // Only two modes are permitted:
    //   - ?existing=true → reuse the configured STAEL_STRIPE_ACCOUNT_ID
    //   - (nothing)      → create a brand new Express account
    // Caller-supplied ?account=acct_XXX is explicitly rejected.
    if (params.account) {
      return jsonResponse(400, { error: 'Arbitrary account IDs are not allowed' });
    }

    let accountId;
    if (params.existing === 'true') {
      accountId = process.env.STAEL_STRIPE_ACCOUNT_ID;
      if (!accountId) {
        return jsonResponse(500, { error: 'STAEL_STRIPE_ACCOUNT_ID not set' });
      }
      console.log('Using existing account:', accountId);
    } else {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        email: 'hello@staelfogarty.com',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: 'individual',
        business_profile: {
          name: 'Stael Gissoni',
          mcc: '7299',
          url: 'https://staelfogarty.com',
        },
      });
      accountId = account.id;
      console.log('Created new account:', accountId);
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${process.env.URL || 'https://staelfogarty.com'}/.netlify/functions/connect-onboard?existing=true`,
      return_url: `${process.env.URL || 'https://staelfogarty.com'}/connect-success.html`,
      type: 'account_onboarding',
    });

    if (event.httpMethod === 'GET') {
      return {
        statusCode: 302,
        headers: { ...corsHeaders(), Location: accountLink.url },
        body: '',
      };
    }

    return jsonResponse(200, {
      url: accountLink.url,
      accountId,
      message: `Add to Netlify env vars: STAEL_STRIPE_ACCOUNT_ID = ${accountId}`,
    });
  } catch (err) {
    console.error('Stripe Connect error:', err);
    return jsonResponse(500, { error: 'Stripe Connect failed' });
  }
};
