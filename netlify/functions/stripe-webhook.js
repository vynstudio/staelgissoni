// Stripe webhook — fires after checkout payment succeeds.
// Sends two emails via Resend:
//   1. Customer receipt + "pick your time" CTA (mailto for now; swap in
//      a scheduling link when one exists).
//   2. Internal notification to hello@staelgissoni.com.
//
// Dashboard setup:
//   URL    https://staelgissoni.com/.netlify/functions/stripe-webhook
//   Events checkout.session.completed

const Stripe = require('stripe');
const { Resend } = require('resend');

const HANDLED = new Set(['checkout.session.completed']);
const seen = new Set();
const SEEN_MAX = 500;
const remember = (id) => {
  if (seen.size >= SEEN_MAX) seen.delete(seen.values().next().value);
  seen.add(id);
};

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'hello@staelgissoni.com';
const NOTIFY_TO = (process.env.BOOKING_NOTIFY_TO || 'hello@staelgissoni.com')
  .split(',').map(s => s.trim()).filter(Boolean);

const fmtMoney = (cents) => '$' + (cents / 100).toFixed(2);
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function customerEmail({ firstName, svcLabel, hours, total, notes, mode }) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#FFF8F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2B2B2B">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #F2D9C6;border-radius:16px;overflow:hidden">
<tr><td style="background:#F2A07B;padding:22px 28px;color:#ffffff">
<div style="font-family:'Fraunces',Georgia,serif;font-weight:800;font-size:22px;letter-spacing:-0.01em">stael<span style="color:#2A2A3A">.</span></div>
<div style="font-size:12px;margin-top:4px;opacity:0.9">EN ↔ PT · Interpretation &amp; language services</div>
</td></tr>
<tr><td style="padding:28px 28px 18px">
<p style="margin:0 0 10px;font-size:16px"><strong>Hi ${esc(firstName)},</strong></p>
<p style="margin:0 0 18px;font-size:15px;line-height:1.55">Thanks — your payment is in and your session is reserved.</p>
<table role="presentation" width="100%" style="background:#FFF2EB;border:1px solid #FADBC8;border-radius:10px;margin:0 0 20px">
<tr><td style="padding:18px">
<div style="font-family:'Fraunces',Georgia,serif;font-weight:700;font-size:18px;color:#2B2B2B">${esc(svcLabel)}</div>
<div style="margin-top:6px;font-size:13px;color:#6B6B6B">${esc(hours)} hour(s)${mode ? ' · ' + esc(mode) : ''}</div>
<div style="margin-top:10px;font-size:13px;color:#6B6B6B">Paid: <strong style="color:#2B2B2B">${esc(total)}</strong></div>
</td></tr></table>
<h3 style="margin:0 0 8px;font-family:'Fraunces',Georgia,serif;font-size:17px">Next: pick your time</h3>
<p style="margin:0 0 14px;font-size:14px;line-height:1.55;color:#3D3D50">Reply to this email with 2–3 time windows that work for you, or email <a href="mailto:hello@staelgissoni.com" style="color:#F2A07B;font-weight:700">hello@staelgissoni.com</a> directly. I'll confirm with a calendar invite (Google Meet link included for remote sessions) within a few business hours.</p>
${notes ? `<div style="margin-top:16px;padding:12px 14px;background:#F9FAFB;border-radius:8px;font-size:13px;color:#3D3D50"><strong style="color:#2A2A3A">Your note:</strong><br>${esc(notes)}</div>` : ''}
<p style="margin:24px 0 0;font-size:13px;color:#6B6B6B">Questions? <a href="mailto:hello@staelgissoni.com" style="color:#F2A07B;font-weight:700">hello@staelgissoni.com</a> · <a href="tel:+13216752003" style="color:#F2A07B;font-weight:700">(321) 675-2003</a></p>
</td></tr>
<tr><td style="background:#FFF8F3;padding:14px 28px;text-align:center;color:#6B6B6B;font-size:11px">STAEL GISSONI · Orlando, FL · staelgissoni.com</td></tr>
</table></td></tr></table></body></html>`;
}

function internalEmail(meta) {
  const rows = Object.entries(meta).filter(([,v]) => v).map(([k,v]) =>
    `<tr><td style="padding:6px 12px 6px 0;color:#6B6B6B;font-size:12px">${esc(k)}</td><td style="padding:6px 0;color:#2B2B2B;font-size:13px;font-weight:600">${esc(v)}</td></tr>`
  ).join('');
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#FFF8F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2B2B2B">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #F2D9C6;border-radius:14px;overflow:hidden">
<tr><td style="background:#2B2B2B;padding:18px 24px;color:#fff">
<div style="font-family:'Fraunces',Georgia,serif;font-weight:800;font-size:13px;letter-spacing:0.14em;text-transform:uppercase;opacity:.7">New booking</div>
</td></tr>
<tr><td style="padding:20px 24px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows}</table>
</td></tr></table></td></tr></table></body></html>`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return { statusCode: 500, body: 'Server misconfigured' };

  const sig = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
  if (!sig) return { statusCode: 400, body: 'Missing Stripe-Signature' };

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  let evt;
  try { evt = stripe.webhooks.constructEvent(event.body, sig, secret); }
  catch (e) { return { statusCode: 400, body: `Webhook Error: ${e.message}` }; }

  if (evt.id && seen.has(evt.id)) return { statusCode: 200, body: JSON.stringify({ received: true, duplicate: true }) };

  if (!HANDLED.has(evt.type)) {
    if (evt.id) remember(evt.id);
    return { statusCode: 200, body: JSON.stringify({ received: true, handled: false }) };
  }

  const session = evt.data.object || {};
  const meta = session.metadata || {};
  if (meta.purpose !== 'booking') {
    if (evt.id) remember(evt.id);
    return { statusCode: 200, body: JSON.stringify({ received: true, unhandled_purpose: meta.purpose || null }) };
  }

  const email = session.customer_email || session.customer_details?.email;
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set; skipping booking emails');
    if (evt.id) remember(evt.id);
    return { statusCode: 200, body: JSON.stringify({ received: true, emailed: false }) };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const firstName = (meta.customer_name || '').trim().split(/\s+/)[0] || 'there';
  const totalFmt = fmtMoney(Number(session.amount_total || 0));

  try {
    // 1. Customer receipt
    await resend.emails.send({
      from: `Stael Gissoni <${FROM_EMAIL}>`,
      to: [email],
      replyTo: FROM_EMAIL,
      subject: `Booking confirmed — ${meta.service_label || 'Session'} (${meta.hours || ''}h)`,
      html: customerEmail({
        firstName,
        svcLabel: meta.service_label,
        hours: meta.hours,
        total: totalFmt,
        notes: meta.notes || '',
        mode: meta.customer_mode || '',
      }),
    });

    // 2. Internal notification
    await resend.emails.send({
      from: `stael. bookings <${FROM_EMAIL}>`,
      to: NOTIFY_TO,
      replyTo: email,
      subject: `New booking — ${meta.service_label} · ${totalFmt}`,
      html: internalEmail({
        Service: meta.service_label,
        Hours: meta.hours,
        'Rate / hr': '$' + meta.hourly_usd,
        Total: totalFmt,
        Mode: meta.customer_mode || '',
        Customer: meta.customer_name,
        Email: email,
        Phone: meta.customer_phone || '',
        Notes: meta.notes || '',
        'Stripe session': session.id,
      }),
    });
  } catch (e) {
    console.error('webhook email send failed:', e);
    // Return 500 so Stripe retries — do NOT remember the event yet.
    return { statusCode: 500, body: JSON.stringify({ error: 'Email dispatch failed' }) };
  }

  if (evt.id) remember(evt.id);
  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
