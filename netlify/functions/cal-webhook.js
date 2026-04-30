// POST /.netlify/functions/cal-webhook
//
// Receives Cal.com booking webhooks (BOOKING_CREATED, BOOKING_RESCHEDULED,
// BOOKING_CANCELLED, BOOKING_PAID) and forwards a formatted summary to
// Telegram via the configured bot + chat_id.
//
// On BOOKING_PAID, also collects Vyn Studio's 20% platform fee via a
// connected→platform transfer. Cal.com creates direct charges on Stael's
// connected account (acct_1TEwhkRxG91XHPAc) so the customer's $X lands
// in her balance — to take the platform fee we issue a transfer FROM
// Stael TO Vyn Studio's platform account, sourced from the specific
// charge. Gated behind STAEL_AUTO_SPLIT_ENABLED=true.
//
// Cal.com signs each request with HMAC-SHA256 of the raw body using the
// webhook's "Secret" — we verify it via the X-Cal-Signature-256 header
// to keep this endpoint closed to spoofed calls.

const crypto = require('crypto');
const Stripe = require('stripe');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Cal-Signature-256',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const ok = (b) => ({ statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
const err = (s, b) => ({ statusCode: s, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

function verifySignature(rawBody, signatureHeader, secret) {
  if (!secret) return true; // no secret configured → skip verification
  if (!signatureHeader) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch { return false; }
}

function fmtMoney(cents, currency) {
  if (cents == null) return '';
  const amt = (Number(cents) / 100).toFixed(2);
  return `${(currency || 'USD').toUpperCase()} $${amt}`;
}

function fmtDatetime(iso, tz) {
  if (!iso) return '(unknown)';
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      timeZone: tz || 'America/New_York',
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
      timeZoneName: 'short',
    });
  } catch { return iso; }
}

function buildMessage(event, payload) {
  const p = payload || {};
  const title = p.title || p.eventTitle || '(untitled)';
  const start = fmtDatetime(p.startTime, p.organizer?.timeZone || 'America/New_York');
  const attendee = (p.attendees && p.attendees[0]) || {};
  const attendeeLine = attendee.email
    ? `${attendee.name || 'Guest'} · ${attendee.email}`
    : 'No attendee info';
  const location = typeof p.location === 'string' ? p.location : (p.location?.optionValue || '');
  const locationLine = location
    ? (location.startsWith('http') ? location : `📍 ${location}`)
    : '';
  const payment = Array.isArray(p.payment) && p.payment[0];
  const paymentLine = payment
    ? `💰 ${fmtMoney(payment.amount, payment.currency)}${payment.paymentOption ? ' · ' + payment.paymentOption : ''}`
    : '';
  const emoji = {
    BOOKING_CREATED: '📅',
    BOOKING_RESCHEDULED: '🔁',
    BOOKING_CANCELLED: '❌',
    BOOKING_PAID: '✅',
    BOOKING_PAYMENT_INITIATED: '💳',
    BOOKING_REQUESTED: '⏳',
  }[event] || '🔔';
  const headline = {
    BOOKING_CREATED: 'New booking',
    BOOKING_RESCHEDULED: 'Booking rescheduled',
    BOOKING_CANCELLED: 'Booking cancelled',
    BOOKING_PAID: 'Payment received',
    BOOKING_PAYMENT_INITIATED: 'Payment initiated',
    BOOKING_REQUESTED: 'Booking requested (awaiting approval)',
  }[event] || event;

  const lines = [
    `${emoji} *${headline}*`,
    ``,
    `*${escapeMd(title)}*`,
    `🕐 ${escapeMd(start)}`,
    `👤 ${escapeMd(attendeeLine)}`,
  ];
  if (locationLine) lines.push(`${escapeMd(locationLine)}`);
  if (paymentLine) lines.push(`${escapeMd(paymentLine)}`);
  if (p.uid) lines.push(``, `_Booking ID:_ \`${p.uid}\``);
  return lines.join('\n');
}

function escapeMd(s) {
  if (!s) return '';
  return String(s).replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

// ---------- Vyn Studio platform fee (20% per Cal.com booking) ----------
//
// Cal.com creates direct charges on Stael's connected Stripe account, so
// the customer's $X lands in Stael's balance — Vyn Studio (the platform)
// sees nothing by default. To collect the 20% platform fee on every
// booking, we issue a connected→platform transfer:
//
//   stripe.transfers.create(
//     { amount: feeCents, destination: <vyn_platform_acct>,
//       source_transaction: <charge on stael's acct> },
//     { stripeAccount: STAEL_STRIPE_ACCOUNT_ID }
//   )
//
// The Stripe-Account header makes the call act AS Stael's connected
// account; the platform's secret key authorizes it because Stael's
// account is under the same Connect platform. Stripe pulls the fee
// from the specific charge (source_transaction), so it works even if
// Stael's available balance is low.
//
// Idempotency: idempotencyKey=vyn-fee-<charge_id>. Stripe also rejects
// a second transfer linked to the same source_transaction, so a webhook
// retry can't double-bill Stael.
//
// Required env:
//   STRIPE_SECRET_KEY            platform secret (Toro Movers / Vyn Studio)
//   STAEL_STRIPE_ACCOUNT_ID      acct_1TEwhkRxG91XHPAc
//   STAEL_AUTO_SPLIT_ENABLED     'true' to enable; anything else = dormant
// Optional env:
//   VYN_PLATFORM_FEE_BPS         default 2000 (20% to Vyn, 80% stays Stael)
//   VYN_PLATFORM_ACCOUNT_ID      override the platform acct id; otherwise
//                                fetched dynamically via Account.retrieve()

let _platformAcctIdCache = null;
async function getPlatformAccountId(stripe) {
  if (process.env.VYN_PLATFORM_ACCOUNT_ID) return process.env.VYN_PLATFORM_ACCOUNT_ID;
  if (_platformAcctIdCache) return _platformAcctIdCache;
  const acct = await stripe.accounts.retrieve();
  _platformAcctIdCache = acct.id;
  return _platformAcctIdCache;
}

async function runVynPlatformFee(payload) {
  if (String(process.env.STAEL_AUTO_SPLIT_ENABLED || '').toLowerCase() !== 'true') {
    return { skipped: 'flag_off' };
  }
  const platformKey = process.env.STRIPE_SECRET_KEY;
  const staelAcct = process.env.STAEL_STRIPE_ACCOUNT_ID;
  if (!platformKey || !staelAcct) return { skipped: 'env_missing' };

  const payment = Array.isArray(payload?.payment) && payload.payment[0];
  if (!payment) return { skipped: 'no_payment' };

  const totalCents = Number(payment.amount);
  if (!Number.isFinite(totalCents) || totalCents <= 0) return { skipped: 'bad_amount' };

  const currency = String(payment.currency || 'usd').toLowerCase();
  const bookingUid = payload?.uid || payload?.bookingId || null;
  const externalId = payment.externalId || payment.payment_id || payment.paymentId || null;
  if (!externalId) return { skipped: 'no_external_id', booking_uid: bookingUid };

  const feeBps = Number(process.env.VYN_PLATFORM_FEE_BPS || 2000);
  const feeCents = Math.floor((totalCents * feeBps) / 10000);
  if (feeCents <= 0) return { skipped: 'zero_fee', booking_uid: bookingUid };

  const stripe = Stripe(platformKey);

  let platformAcctId = null;
  try {
    platformAcctId = await getPlatformAccountId(stripe);
  } catch (e) {
    return { skipped: 'platform_acct_lookup_failed', error: e.message };
  }
  if (!platformAcctId) return { skipped: 'platform_acct_missing' };

  // Cal.com's externalId may be ch_, pi_, or cs_. transfers.create needs
  // a charge id, so resolve PI/CS to the underlying charge first.
  // The retrieval runs against Stael's connected account because that's
  // where Cal.com created the charge (direct charge model).
  let chargeId = null;
  try {
    if (externalId.startsWith('ch_')) {
      chargeId = externalId;
    } else if (externalId.startsWith('pi_')) {
      const pi = await stripe.paymentIntents.retrieve(externalId, {}, { stripeAccount: staelAcct });
      chargeId = pi.latest_charge || (pi.charges?.data?.[0]?.id) || null;
    } else if (externalId.startsWith('cs_')) {
      const cs = await stripe.checkout.sessions.retrieve(
        externalId, { expand: ['payment_intent'] }, { stripeAccount: staelAcct }
      );
      const pi = cs.payment_intent;
      chargeId = (pi && pi.latest_charge) || null;
    }
  } catch (e) {
    return { skipped: 'resolve_failed', error: e.message, external_id: externalId, booking_uid: bookingUid };
  }
  if (!chargeId) return { skipped: 'no_charge_id', external_id: externalId, booking_uid: bookingUid };

  try {
    const transfer = await stripe.transfers.create(
      {
        amount: feeCents,
        currency,
        destination: platformAcctId,
        source_transaction: chargeId,
        description: `Vyn Studio platform fee · cal booking ${bookingUid || '(unknown)'}`,
        metadata: {
          cal_booking_uid: bookingUid || '',
          source_charge: chargeId,
          source_external_id: externalId,
          fee_bps: String(feeBps),
          total_cents: String(totalCents),
        },
      },
      {
        idempotencyKey: `vyn-fee-${chargeId}`,
        stripeAccount: staelAcct,
      }
    );
    return { ok: true, transfer_id: transfer.id, fee_cents: feeCents, charge: chargeId, booking_uid: bookingUid };
  } catch (e) {
    return { skipped: 'transfer_failed', error: e.message, code: e.code, charge: chargeId, booking_uid: bookingUid };
  }
}

async function sendTelegram(token, chatId, text) {
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: false,
    }),
  });
  const body = await r.json();
  if (!body.ok) throw new Error('Telegram: ' + (body.description || r.status));
  return body.result;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return err(405, { error: 'Method not allowed' });

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const secret = process.env.CAL_WEBHOOK_SECRET;
  if (!token || !chatId) return err(500, { error: 'Telegram not configured' });

  const rawBody = event.body || '';
  const signature = event.headers['x-cal-signature-256'] || event.headers['X-Cal-Signature-256'];
  if (secret && !verifySignature(rawBody, signature, secret)) {
    console.warn('cal-webhook: bad signature');
    return err(401, { error: 'Invalid signature' });
  }

  let body;
  try { body = JSON.parse(rawBody); }
  catch { return err(400, { error: 'Invalid JSON' }); }

  const trigger = body.triggerEvent || body.type || 'BOOKING_CREATED';
  const payload = body.payload || body;
  const text = buildMessage(trigger, payload);

  // 80/20 split — only on BOOKING_PAID. Runs in parallel with notifications
  // and never throws (returns a status object). Logged to function output
  // for audit + reconciliation against Stripe Connect transfers.
  let splitResult = null;
  if (trigger === 'BOOKING_PAID') {
    try {
      splitResult = await runVynPlatformFee(payload);
    } catch (e) {
      splitResult = { skipped: 'unhandled_error', error: e.message };
    }
    console.log('cal-webhook fee:', JSON.stringify(splitResult));
  }

  // Primary bot (Diler's @Staelbookings_bot). chat_id can be CSV.
  const dispatch = String(chatId).split(',').map(s => s.trim()).filter(Boolean)
    .map(cid => sendTelegram(token, cid, text));

  // Secondary bot (Stael's @StaelbookingsBot). Only fires if both
  // STAEL_TELEGRAM_BOT_TOKEN and STAEL_TELEGRAM_CHAT_ID are set.
  const staelToken = process.env.STAEL_TELEGRAM_BOT_TOKEN;
  const staelChat = process.env.STAEL_TELEGRAM_CHAT_ID;
  if (staelToken && staelChat) {
    String(staelChat).split(',').map(s => s.trim()).filter(Boolean)
      .forEach(cid => dispatch.push(sendTelegram(staelToken, cid, text)));
  }

  try {
    await Promise.all(dispatch);
    return ok({ ok: true, trigger, recipients: dispatch.length, split: splitResult });
  } catch (e) {
    console.error('cal-webhook send failed:', e);
    return err(500, { error: e.message, split: splitResult });
  }
};
