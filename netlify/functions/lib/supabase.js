// Server-side Supabase admin client. Uses service role — never expose to the browser.
const { createClient } = require('@supabase/supabase-js');

let cached = null;
function getAdminClient() {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  cached = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return cached;
}

module.exports = { getAdminClient };
