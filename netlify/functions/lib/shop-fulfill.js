// Shop fulfillment — called from stripe-webhook when a shop checkout
// completes. Flips the pre-created order row to "paid" and sends the
// download email.
const { Resend } = require('resend');
const { getAdminClient } = require('./supabase');

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'hello@staelgissoni.com';

function fmtMoney(cents, currency = 'usd') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format((cents || 0) / 100);
}

function renderDownloadEmail({ name, product, downloadUrl, amountCents, expiresOn }) {
  const firstName = String(name || '').trim().split(/\s+/)[0] || 'there';
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your download — Stael Gissoni</title></head>
<body style="margin:0;padding:0;background:#FFF8F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2B2B2B">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFF8F3;padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #F2D9C6;border-radius:16px;overflow:hidden">
<tr><td style="background:#F2A07B;padding:22px 28px;color:#ffffff">
<div style="font-family:'Fraunces',Georgia,serif;font-weight:800;font-size:22px;letter-spacing:-0.01em">Stael Gissoni</div>
<div style="font-size:12px;margin-top:4px;opacity:0.9">Languages · Lessons · Connection</div>
</td></tr>
<tr><td style="padding:28px 28px 16px;color:#2B2B2B">
<p style="margin:0 0 10px;font-size:16px"><strong>Hi ${firstName},</strong></p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.55">Thanks for your order — your download is ready below.</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFF2EB;border:1px solid #FADBC8;border-radius:10px;margin:0 0 20px">
<tr><td style="padding:18px">
<div style="font-family:'Fraunces',Georgia,serif;font-weight:700;font-size:18px;color:#2B2B2B">${product.title}</div>
${product.subtitle ? `<div style="margin-top:4px;font-size:13px;color:#6B6B6B">${product.subtitle}</div>` : ''}
<div style="margin-top:10px;font-size:13px;color:#6B6B6B">Paid: <strong style="color:#2B2B2B">${fmtMoney(amountCents)}</strong></div>
</td></tr>
</table>

<div style="text-align:center;margin:24px 0">
<a href="${downloadUrl}" style="display:inline-block;background:#F2A07B;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:800;font-size:15px">Download your file</a>
</div>

<p style="margin:16px 0 0;font-size:13px;color:#6B6B6B;line-height:1.55">
Your link works until <strong>${expiresOn}</strong>. If you run into any trouble, just reply to this email and I'll help you out.
</p>
</td></tr>
<tr><td style="background:#FFF8F3;padding:14px 28px;text-align:center;color:#6B6B6B;font-size:11px">
STAEL GISSONI · Orlando, FL · staelgissoni.com
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

async function fulfillShopOrder(session) {
  const admin = getAdminClient();
  const sessionId = session.id;
  const email = session.customer_email || session.customer_details?.email;
  const amount = Number(session.amount_total || 0);

  // Mark the order paid by session id. We pre-inserted it in shop-checkout.
  const { data: order, error: findErr } = await admin
    .from('shop_orders')
    .update({
      status: 'paid',
      stripe_payment_intent_id: session.payment_intent || null,
      amount_paid_cents: amount || undefined,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_session_id', sessionId)
    .select('id, product_id, download_token, download_expires_at, customer_email, customer_name')
    .maybeSingle();

  if (findErr || !order) {
    // Pre-insert missed (e.g. direct Stripe checkout w/o our function). Create it now.
    const meta = session.metadata || {};
    const { data: newOrder, error: insErr } = await admin
      .from('shop_orders')
      .insert({
        product_id: meta.product_id,
        stripe_session_id: sessionId,
        stripe_payment_intent_id: session.payment_intent || null,
        customer_email: email,
        customer_name: meta.customer_name || null,
        amount_paid_cents: amount,
        status: 'paid',
      })
      .select('id, product_id, download_token, download_expires_at, customer_email, customer_name')
      .single();
    if (insErr) throw new Error('Order insert failed: ' + insErr.message);
    return sendDownloadEmail(newOrder, email);
  }

  return sendDownloadEmail(order, email);
}

async function sendDownloadEmail(order, fallbackEmail) {
  const admin = getAdminClient();
  const { data: product } = await admin
    .from('shop_products').select('*').eq('id', order.product_id).maybeSingle();
  if (!product) return { ok: false, reason: 'product missing' };

  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set; skipping download email');
    return { ok: true, emailed: false };
  }

  const base = process.env.SITE_BASE_URL || 'https://staelgissoni.com';
  const downloadUrl = `${base}/download?token=${order.download_token}`;
  const expiresOn = new Date(order.download_expires_at).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });

  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: `Stael Gissoni <${FROM_EMAIL}>`,
    to: [order.customer_email || fallbackEmail],
    replyTo: FROM_EMAIL,
    subject: `Your download — ${product.title}`,
    html: renderDownloadEmail({
      name: order.customer_name,
      product,
      downloadUrl,
      amountCents: order.amount_paid_cents ?? product.price_cents,
      expiresOn,
    }),
  });

  return { ok: true, emailed: true, order_id: order.id };
}

module.exports = { fulfillShopOrder };
