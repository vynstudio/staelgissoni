const ALLOWED_ORIGIN = 'https://staelgissoni.com';

function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
    ...extra,
  };
}

function preflight(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }
  return null;
}

function jsonResponse(statusCode, payload, extraHeaders = {}) {
  return {
    statusCode,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify(payload),
  };
}

module.exports = { ALLOWED_ORIGIN, corsHeaders, preflight, jsonResponse };
