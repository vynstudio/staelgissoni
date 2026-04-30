// POST /.netlify/functions/cal-webhook
//
// Receives Cal.com booking webhooks (BOOKING_CREATED, BOOKING_RESCHEDULED,
// BOOKING_CANCELLED, BOOKING_PAID) and forwards a formatted summary to
// Telegram via the configured bot + chat_id.
//
// Cal.com signs each request with HMAC-SHA256 of the raw body using the
// webhook's "Secret" — we verify it via the X-Cal-Signature-256 header
// to keep this endpoint closed to spoofed calls.

const crypto = require('crypto');

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
    return ok({ ok: true, trigger, recipients: dispatch.length });
  } catch (e) {
    console.error('cal-webhook send failed:', e);
    return err(500, { error: e.message });
  }
};
