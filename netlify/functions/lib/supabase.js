// Shared Supabase admin client for shop functions.
// Uses the service role — server-only, bypasses RLS. Never expose to browser.
const { createClient } = require('@supabase/supabase-js');

let cached = null;
function getAdminClient() {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }
  cached = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}

const SHOP_BUCKET = process.env.SHOP_BUCKET || 'shop-products';

module.exports = { getAdminClient, SHOP_BUCKET };
