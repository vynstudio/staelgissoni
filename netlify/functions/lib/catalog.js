// Emergency fallback catalog — in-memory service list so /book keeps
// working if Supabase is misconfigured/unavailable. Matches the shape
// of the Supabase public.services row so priceFromService + the rest
// of the flow stay identical. Source of truth for prices lives here
// until Supabase is wired back in.
//
// Keep in sync with db/001_services.sql.

const CATALOG = [
  { slug: 'remote',      label: 'Remote interpretation',          description: 'Professional English↔Portuguese via Google Meet, Zoom, or phone.',        hourly_usd: 95,  min_hours: 0.5, step_hours: 0.5, default_hours: 1, mode: 'remote',    active: true, color_accent: 'blue',  sort_order: 10 },
  { slug: 'on-site',     label: 'On-site interpretation',         description: 'Real-time consecutive interpretation in Central Florida.',                hourly_usd: 125, min_hours: 2,   step_hours: 0.5, default_hours: 2, mode: 'in-person', active: true, color_accent: 'blue',  sort_order: 20 },
  { slug: 'medical',     label: 'Medical interpretation',         description: 'HIPAA-aware interpretation for doctor visits, hospitals, mental health.', hourly_usd: 110, min_hours: 2,   step_hours: 0.5, default_hours: 2, mode: 'either',    active: true, color_accent: 'lav',   sort_order: 30 },
  { slug: 'legal',       label: 'Legal / deposition',             description: 'Depositions, USCIS hearings, citizenship interviews.',                    hourly_usd: 150, min_hours: 2,   step_hours: 0.5, default_hours: 2, mode: 'either',    active: true, color_accent: 'blue',  sort_order: 40 },
  { slug: 'lessons',     label: 'One-on-one English lesson',      description: 'Conversation, pronunciation, accent — personalized sessions.',             hourly_usd: 50,  min_hours: 1,   step_hours: 0.5, default_hours: 1, mode: 'remote',    active: true, color_accent: 'peach', sort_order: 50 },
  { slug: 'citizenship', label: 'Citizenship / green-card prep',  description: 'Mock interviews, civics test, USCIS vocabulary.',                          hourly_usd: 75,  min_hours: 1,   step_hours: 0.5, default_hours: 1, mode: 'remote',    active: true, color_accent: 'peach', sort_order: 60 },
];

function listActive() {
  return CATALOG.filter(s => s.active).sort((a, b) => a.sort_order - b.sort_order);
}

function findBySlug(slug) {
  return CATALOG.find(s => s.slug === slug && s.active) || null;
}

module.exports = { CATALOG, listActive, findBySlug };
