// POST /.netlify/functions/enterprise-inquiry
// Public endpoint — forwards enterprise scoping requests to Stael's inbox.
// No Stripe, no calendar: these leads get a reply + engagement letter, not
// a self-service booking.

const { Resend } = require('resend');
const { preflight, jsonResponse } = require('./lib/cors');
const { isValidEmail, sanitizeHeader, sanitizeText } = require('./lib/validation');

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'hello@staelgissoni.com';
const NOTIFY_TO = (process.env.ENTERPRISE_NOTIFY_TO || 'hello@staelgissoni.com')
  .split(',').map(s => s.trim()).filter(Boolean);

const SERVICE_LABELS = {
  court: 'Court / deposition / legal',
  uscis: 'USCIS / immigration interview',
  medical: 'Medical / hospital on-site',
  conference: 'Conference simultaneous (booth)',
  translation: 'Certified translation',
  retainer: 'Enterprise retainer / multi-engagement',
  other: 'Other',
};
const URGENCY_LABELS = {
  asap: 'ASAP (< 24 hrs)',
  week: 'Within a week',
  month: 'Within a month',
  planning: 'Just planning / no date yet',
};

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

exports.handler = async (event) => {
  const pre = preflight(event);
  if (pre) return pre;
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  if (!process.env.RESEND_API_KEY) return jsonResponse(500, { error: 'Resend not configured' });

  let data;
  try { data = JSON.parse(event.body || '{}'); }
  catch { return jsonResponse(400, { error: 'Invalid JSON' }); }

  const name = sanitizeHeader(data.name || '', 120);
  const email = String(data.email || '').trim();
  const phone = sanitizeHeader(data.phone || '', 40);
  const company = sanitizeHeader(data.company || '', 160);
  const role = sanitizeHeader(data.role || '', 120);
  const service = sanitizeHeader(data.service_type || 'other', 40);
  const urgency = sanitizeHeader(data.urgency || 'planning', 40);
  const est_hours = sanitizeHeader(data.estimated_hours || '', 40);
  const location = sanitizeHeader(data.location || '', 160);
  const notes = sanitizeText(data.notes || '', 1200);

  if (!name || !isValidEmail(email)) return jsonResponse(400, { error: 'Name and valid email required' });
  if (!company) return jsonResponse(400, { error: 'Organization required' });
  if (!SERVICE_LABELS[service]) return jsonResponse(400, { error: 'Invalid service type' });

  const resend = new Resend(process.env.RESEND_API_KEY);

  const rows = [
    ['Organization', company],
    ['Role', role],
    ['Service', SERVICE_LABELS[service]],
    ['Location', location],
    ['Timing', URGENCY_LABELS[urgency] || urgency],
    ['Estimated hours / scope', est_hours],
    ['Email', email],
    ['Phone', phone],
  ].filter(([, v]) => v);

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#FFF8F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2B2B2B">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #F2D9C6;border-radius:14px;overflow:hidden">
<tr><td style="background:#2B2B2B;padding:18px 24px;color:#fff">
<div style="font-family:'Fraunces',Georgia,serif;font-weight:800;font-size:13px;letter-spacing:0.14em;text-transform:uppercase;opacity:.7">Enterprise inquiry</div>
<div style="font-family:'Fraunces',Georgia,serif;font-weight:800;font-size:20px;margin-top:4px">${esc(name)}</div>
</td></tr>
<tr><td style="padding:20px 24px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
${rows.map(([k, v]) => `<tr><td style="padding:7px 12px 7px 0;color:#6B6B6B;font-size:12px;white-space:nowrap;border-bottom:1px solid #F2EFEC">${esc(k)}</td><td style="padding:7px 0;color:#2B2B2B;font-size:13px;font-weight:600;border-bottom:1px solid #F2EFEC">${esc(v)}</td></tr>`).join('')}
</table>
${notes ? `<div style="margin-top:18px"><div style="font-size:11px;font-weight:800;letter-spacing:0.08em;color:#6B6B6B;text-transform:uppercase;margin-bottom:6px">Notes</div><div style="font-size:13px;line-height:1.6;color:#2B2B2B;white-space:pre-wrap">${esc(notes)}</div></div>` : ''}
<div style="margin-top:20px;display:flex;gap:10px;flex-wrap:wrap">
<a href="mailto:${esc(email)}?subject=${encodeURIComponent('Re: interpretation scoping — ' + company)}" style="display:inline-block;background:#F2A07B;color:#fff;text-decoration:none;padding:9px 16px;border-radius:8px;font-weight:800;font-size:12px">Reply by email</a>
${phone ? `<a href="tel:${esc(phone.replace(/[^+\d]/g, ''))}" style="display:inline-block;background:#fff;color:#2B2B2B;text-decoration:none;padding:9px 16px;border-radius:8px;font-weight:800;font-size:12px;border:1px solid #E5E7EB">Call ${esc(phone)}</a>` : ''}
</div>
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  try {
    await resend.emails.send({
      from: `Stael Gissoni <${FROM_EMAIL}>`,
      to: NOTIFY_TO,
      replyTo: email,
      subject: `Enterprise inquiry — ${company} (${SERVICE_LABELS[service]})`,
      html,
    });
  } catch (e) {
    console.error('enterprise-inquiry Resend error:', e);
    return jsonResponse(500, { error: 'Email send failed: ' + e.message });
  }

  return jsonResponse(200, { received: true });
};
