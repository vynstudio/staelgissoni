// POST /.netlify/functions/enterprise-inquiry
// Public endpoint — forwards B2B scoping requests to Stael's inbox via Resend.

const { Resend } = require('resend');

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'hello@staelgissoni.com';
const NOTIFY_TO = (process.env.ENTERPRISE_NOTIFY_TO || 'hello@staelgissoni.com')
  .split(',').map(s => s.trim()).filter(Boolean);

const SERVICE_LABELS = {
  'on-site': 'On-site interpretation',
  remote: 'Remote interpretation (VRI)',
  medical: 'Medical / hospital interpretation',
  educational: 'Educational interpretation (school)',
  conference: 'Conference / panel interpretation',
  uscis: 'USCIS / immigration interview',
  retainer: 'Enterprise retainer / multi-engagement',
  other: 'Other',
};
const URGENCY_LABELS = {
  asap: 'ASAP (< 24 hrs)',
  week: 'Within a week',
  month: 'Within a month',
  planning: 'Just planning / no date yet',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (s, b) => ({ statusCode: s, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cleanEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim()) ? String(e).trim() : '';
const sanitize = (v, max) => String(v == null ? '' : v).trim().replace(/[\r\n\t]+/g, ' ').slice(0, max);

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!process.env.RESEND_API_KEY) return json(500, { error: 'Resend not configured' });

  let data;
  try { data = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'Invalid JSON' }); }

  const name = sanitize(data.name, 120);
  const email = cleanEmail(data.email);
  const phone = sanitize(data.phone, 40);
  const company = sanitize(data.company, 160);
  const role = sanitize(data.role, 120);
  const service = sanitize(data.service_type, 40).toLowerCase();
  const urgency = sanitize(data.urgency, 40).toLowerCase();
  const est_hours = sanitize(data.estimated_hours, 80);
  const location = sanitize(data.location, 160);
  const notes = String(data.notes || '').trim().slice(0, 1200);

  if (!name || !email) return json(400, { error: 'Name and valid email required' });
  if (!company) return json(400, { error: 'Organization required' });
  if (!SERVICE_LABELS[service]) return json(400, { error: 'Invalid service type' });

  const rows = [
    ['Organization', company],
    ['Role', role],
    ['Service', SERVICE_LABELS[service]],
    ['Location', location],
    ['Timing', URGENCY_LABELS[urgency] || urgency],
    ['Estimated scope', est_hours],
    ['Email', email],
    ['Phone', phone],
  ].filter(([, v]) => v);

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#FFF8F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2B2B2B">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 16px"><tr><td align="center">
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
<div style="margin-top:20px">
<a href="mailto:${esc(email)}?subject=${encodeURIComponent('Re: interpretation scoping — ' + company)}" style="display:inline-block;background:#F2A07B;color:#fff;text-decoration:none;padding:9px 16px;border-radius:8px;font-weight:800;font-size:12px">Reply by email</a>
${phone ? `<a href="tel:${esc(phone.replace(/[^+\d]/g, ''))}" style="display:inline-block;margin-left:8px;background:#fff;color:#2B2B2B;text-decoration:none;padding:9px 16px;border-radius:8px;font-weight:800;font-size:12px;border:1px solid #E5E7EB">Call ${esc(phone)}</a>` : ''}
</div></td></tr></table>
</td></tr></table></body></html>`;

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: `Stael Gissoni <${FROM_EMAIL}>`,
      to: NOTIFY_TO,
      replyTo: email,
      subject: `Enterprise inquiry — ${company} (${SERVICE_LABELS[service]})`,
      html,
    });
  } catch (e) {
    console.error('enterprise-inquiry Resend error:', e);
    return json(500, { error: 'Email send failed' });
  }

  return json(200, { received: true });
};
