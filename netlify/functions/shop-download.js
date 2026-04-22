// GET /.netlify/functions/shop-download?token=xxx
// Validates the token against shop_orders, checks it's paid + not expired,
// then 302-redirects the browser to a short-lived Supabase Storage signed URL.
const { getAdminClient, SHOP_BUCKET } = require('./lib/supabase');
const { preflight, jsonResponse } = require('./lib/cors');

exports.handler = async (event) => {
  const pre = preflight(event);
  if (pre) return pre;
  if (event.httpMethod !== 'GET') return jsonResponse(405, { error: 'Method not allowed' });

  const token = event.queryStringParameters?.token;
  if (!token) return jsonResponse(400, { error: 'token required' });

  const admin = getAdminClient();
  const { data: order, error } = await admin
    .from('shop_orders')
    .select('id, product_id, status, download_expires_at, download_count')
    .eq('download_token', token)
    .maybeSingle();
  if (error) return jsonResponse(500, { error: error.message });
  if (!order) return jsonResponse(404, { error: 'Invalid token' });
  if (order.status !== 'paid') return jsonResponse(403, { error: 'Order not paid' });
  if (new Date(order.download_expires_at) < new Date()) {
    return jsonResponse(410, { error: 'Download link expired. Reply to the order email for a new one.' });
  }

  const { data: product } = await admin
    .from('shop_products').select('file_path, title').eq('id', order.product_id).maybeSingle();
  if (!product?.file_path) return jsonResponse(500, { error: 'File not configured' });

  // 60-second signed URL — enough for the browser to start the download.
  const { data: signed, error: sErr } = await admin.storage
    .from(SHOP_BUCKET)
    .createSignedUrl(product.file_path, 60, { download: product.title });
  if (sErr || !signed?.signedUrl) return jsonResponse(500, { error: 'Could not sign URL' });

  await admin.from('shop_orders').update({
    download_count: (order.download_count || 0) + 1,
    first_downloaded_at: order.download_count ? undefined : new Date().toISOString(),
    last_downloaded_at: new Date().toISOString(),
  }).eq('id', order.id);

  return { statusCode: 302, headers: { Location: signed.signedUrl }, body: '' };
};
