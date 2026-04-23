// GET /.netlify/functions/services-list
// Public read — returns the active services catalogue for the /book page.
// Emergency mode: reads from lib/catalog.js (in-memory, no DB round-trip).

const { listActive } = require('./lib/catalog');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};
const json = (s, b) => ({ statusCode: s, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  try {
    const services = listActive().map(s => ({
      slug: s.slug,
      label: s.label,
      description: s.description,
      hourly_usd: s.hourly_usd,
      min_hours: s.min_hours,
      step_hours: s.step_hours,
      default_hours: s.default_hours,
      mode: s.mode,
      color_accent: s.color_accent,
      sort_order: s.sort_order,
    }));
    return json(200, { services });
  } catch (e) {
    console.error('services-list error:', e);
    return json(500, { error: e.message || 'Unknown error' });
  }
};
