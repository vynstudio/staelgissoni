// Booking notification logger. The actual email send happens in
// create-zoom-meeting.js which runs after Stripe webhook confirms payment.
// This function is kept for direct-invocation logging of bookings.

const { preflight, jsonResponse } = require('./lib/cors');
const { isValidEmail, sanitizeHeader, sanitizeText } = require('./lib/validation');

exports.handler = async (event) => {
  const pre = preflight(event);
  if (pre) return pre;
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  let data;
  try {
    data = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON' });
  }

  const { service, price, date, time, fname, lname, email, phone, notes, sessionId } = data;

  if (!service || !fname || !date || !time) {
    return jsonResponse(400, { error: 'Missing required fields' });
  }
  if (!isValidEmail(email)) {
    return jsonResponse(400, { error: 'Invalid email' });
  }
  if (price != null && (!Number.isFinite(Number(price)) || Number(price) < 0)) {
    return jsonResponse(400, { error: 'Invalid price' });
  }
  if (notes && String(notes).length > 450) {
    return jsonResponse(400, { error: 'Notes too long (max 450 chars)' });
  }

  const safeService = sanitizeHeader(service, 80);
  const safeFname = sanitizeHeader(fname, 80);
  const safeLname = sanitizeHeader(lname, 80);
  const safePhone = sanitizeHeader(phone, 40);
  const safeDate = sanitizeHeader(date, 40);
  const safeTime = sanitizeHeader(time, 20);
  const safeNotes = sanitizeText(notes, 450);
  const safeSessionId = sanitizeHeader(sessionId, 80);

  const clientName = `${safeFname} ${safeLname}`.trim();
  const staelEmail = process.env.STAEL_EMAIL || 'hello@staelfogarty.com';

  const staelSubject = `New Booking: ${safeService} — ${clientName}`;
  const clientSubject = `Booking Confirmed — ${safeService} with Stael Gissoni`;

  console.log('=== NEW BOOKING ===');
  console.log('To Stael:', staelEmail, '| Subject:', staelSubject);
  console.log('To Client:', email, '| Subject:', clientSubject);
  console.log('Details:', { service: safeService, price, date: safeDate, time: safeTime, phone: safePhone, notes: safeNotes, sessionId: safeSessionId });

  return jsonResponse(200, {
    success: true,
    message: 'Booking notification logged',
  });
};
