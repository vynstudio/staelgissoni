// GET /.netlify/functions/shop-list[?slug=xxx]
// Public read — returns active products for the storefront.
// Passing ?slug=xxx returns a single product (404 if not active).
const { getAdminClient } = require('./lib/supabase');
const { preflight, jsonResponse } = require('./lib/cors');

exports.handler = async (event) => {
  const pre = preflight(event);
  if (pre) return pre;
  if (event.httpMethod !== 'GET') return jsonResponse(405, { error: 'Method not allowed' });

  const admin = getAdminClient();
  const slug = event.queryStringParameters?.slug;

  if (slug) {
    const { data, error } = await admin
      .from('shop_products')
      .select('id, slug, title, subtitle, description, price_cents, language, cover_image_url, preview_path')
      .eq('slug', slug)
      .eq('active', true)
      .maybeSingle();
    if (error) return jsonResponse(500, { error: error.message });
    if (!data) return jsonResponse(404, { error: 'Product not found' });
    return jsonResponse(200, { product: data });
  }

  const { data, error } = await admin
    .from('shop_products')
    .select('id, slug, title, subtitle, price_cents, language, cover_image_url')
    .eq('active', true)
    .order('sort_order', { ascending: true });
  if (error) return jsonResponse(500, { error: error.message });
  return jsonResponse(200, { products: data || [] });
};
