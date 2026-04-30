// Emergency fallback catalog — in-memory service list so /book keeps
// working if Supabase is misconfigured/unavailable. Matches the shape
// of the Supabase public.services row so priceFromService + the rest
// of the flow stay identical. Source of truth for prices lives here
// until Supabase is wired back in.
//
// Keep in sync with db/001_services.sql.
//
// calendar_url: Each service should point to its own Google Calendar
// appointment-schedule share link (calendar.app.google/...). Stael
// creates one schedule per service in her Google Calendar so duration,
// buffer, and Meet link match. UNIVERSAL_CALENDAR_URL is the fallback
// used when a service-specific link hasn't been provided yet.

const UNIVERSAL_CALENDAR_URL = 'https://calendar.app.google/hbPeTZrQ6LhFVU8VA';

// Each row is one singular product — do not combine, group, or reword.
// USCIS Orlando/Tampa: flat 2-hour minimum, then $75/hr beyond.
// Catalog model is hourly × hours, so booking flow charges the 2-hr base only;
// overage hours are invoiced separately on-site.
const CATALOG = [
  { slug: 'on-site',       label: 'On-site interpretation',         description: 'Interpretação presencial',                                              hourly_usd: 55,  min_hours: 2, step_hours: 0.5, default_hours: 2, mode: 'in-person', active: true, color_accent: 'blue',  sort_order: 10, calendar_url: '' },
  { slug: 'remote',        label: 'Remote interpretation (VRI)',    description: 'Interpretação remota (VRI)',                                            hourly_usd: 45,  min_hours: 2, step_hours: 0.5, default_hours: 2, mode: 'remote',    active: true, color_accent: 'mint',  sort_order: 20, calendar_url: '' },
  { slug: 'medical',       label: 'Medical interpretation',         description: 'Interpretação médica',                                                  hourly_usd: 55,  min_hours: 2, step_hours: 0.5, default_hours: 2, mode: 'either',    active: true, color_accent: 'lav',   sort_order: 30, calendar_url: '' },
  { slug: 'educational',   label: 'Educational interpretation (classroom support, parent-teacher meeting)', description: 'Interpretação educacional', hourly_usd: 55,  min_hours: 2, step_hours: 0.5, default_hours: 2, mode: 'either',    active: true, color_accent: 'mint',  sort_order: 40, calendar_url: '' },
  { slug: 'conference',    label: 'Conferences',                    description: 'Conferências',                                                          hourly_usd: 100, min_hours: 1, step_hours: 0.5, default_hours: 1, mode: 'either',    active: true, color_accent: 'blue',  sort_order: 50, calendar_url: '' },
  { slug: 'uscis-orlando', label: 'USCIS interview — Orlando, FL',  description: 'Entrevista USCIS em Orlando, FL — 2-hr minimum, $75/hr additional',     hourly_usd: 150, min_hours: 2, step_hours: 0.5, default_hours: 2, mode: 'in-person', active: true, color_accent: 'lav',   sort_order: 60, calendar_url: '' },
  { slug: 'uscis-tampa',   label: 'USCIS interview — Tampa, FL',    description: 'Entrevista USCIS em Tampa, FL — 2-hr minimum, $75/hr additional',       hourly_usd: 250, min_hours: 2, step_hours: 0.5, default_hours: 2, mode: 'in-person', active: true, color_accent: 'lav',   sort_order: 70, calendar_url: '' },
  { slug: 'lessons',       label: 'Tutoring classes focusing on conversation and grammar', description: 'Conversação + gramática EN/PT',                                hourly_usd: 50,  min_hours: 1, step_hours: 0.5, default_hours: 1, mode: 'remote',    active: true, color_accent: 'peach', sort_order: 80, calendar_url: '' },
  { slug: 'citizenship',   label: 'USCIS interview prep',           description: 'Tutoria EN/PT',                                                         hourly_usd: 50,  min_hours: 1, step_hours: 0.5, default_hours: 1, mode: 'remote',    active: true, color_accent: 'peach', sort_order: 90, calendar_url: '' },
  { slug: 'test-1usd',     label: '$1 test (do not book)',          description: 'End-to-end checkout test — $1 total. Remove after verification.',      hourly_usd: 1,   min_hours: 1, step_hours: 1,   default_hours: 1, mode: 'remote',    active: true, hidden: true, color_accent: 'blue', sort_order: 999, calendar_url: '' },
];

function resolveCalendarUrl(svc) {
  return (svc && svc.calendar_url) ? svc.calendar_url : UNIVERSAL_CALENDAR_URL;
}

// Public listing hides internal-only services (e.g. the $1 end-to-end test).
// findBySlug does NOT filter by `hidden`, so direct checkouts still work.
function listActive() {
  return CATALOG.filter(s => s.active && !s.hidden).sort((a, b) => a.sort_order - b.sort_order);
}

function findBySlug(slug) {
  return CATALOG.find(s => s.slug === slug && s.active) || null;
}

module.exports = { CATALOG, listActive, findBySlug, resolveCalendarUrl, UNIVERSAL_CALENDAR_URL };
