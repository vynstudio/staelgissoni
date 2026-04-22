// GET /.netlify/functions/services-list
// Public read — returns the active services catalogue for the /book page.

const { getAdminClient } = require('./lib/supabase');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};
const json = (s, b) => ({ statusCode: s, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  try {
    const admin = getAdminClient();
    const { data, error } = await admin
      .from('services')
      .select('slug, label, description, hourly_usd, min_hours, step_hours, default_hours, mode, color_accent, sort_order')
      .eq('active', true)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return json(200, { services: data || [] });
  } catch (e) {
    console.error('services-list error:', e);
    return json(500, { error: e.message || 'Unknown error' });
  }
};
