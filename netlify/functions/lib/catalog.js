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

// USCIS Orlando/Tampa: flat 2-hour minimum, then $75/hr beyond.
// Catalog model is hourly × hours, so booking flow charges the 2-hr base only;
// overage hours are invoiced separately on-site (description states this).
const CATALOG = [
  { slug: 'on-site',       label: 'On-site interpretation',       description: 'In-person English↔Portuguese consecutive interpretation across Central Florida.',                  hourly_usd: 55,  min_hours: 2, step_hours: 0.5, default_hours: 2, mode: 'in-person', active: true, color_accent: 'blue',  sort_order: 10, calendar_url: '' },
  { slug: 'remote',        label: 'Remote interpretation (VRI)',  description: 'Video remote interpretation via Google Meet, Zoom, or phone.',                                       hourly_usd: 45,  min_hours: 2, step_hours: 0.5, default_hours: 2, mode: 'remote',    active: true, color_accent: 'mint',  sort_order: 20, calendar_url: '' },
  { slug: 'medical',       label: 'Medical interpretation',       description: 'HIPAA-aware interpretation for doctor visits, hospitals, mental health.',                            hourly_usd: 55,  min_hours: 2, step_hours: 0.5, default_hours: 2, mode: 'either',    active: true, color_accent: 'lav',   sort_order: 30, calendar_url: '' },
  { slug: 'educational',   label: 'Educational interpretation',   description: 'Classroom support, parent-teacher conferences, student assessments.',                              hourly_usd: 55,  min_hours: 2, step_hours: 0.5, default_hours: 2, mode: 'either',    active: true, color_accent: 'mint',  sort_order: 40, calendar_url: '' },
  { slug: 'conference',    label: 'Conference interpretation',    description: 'Conferences, panels, and large events — English↔Portuguese.',                                        hourly_usd: 100, min_hours: 1, step_hours: 0.5, default_hours: 1, mode: 'either',    active: true, color_accent: 'blue',  sort_order: 50, calendar_url: '' },
  { slug: 'uscis-orlando', label: 'USCIS interview — Orlando',    description: 'Two-hour USCIS appointment in Orlando, FL. Additional time billed at $75/hr on-site.',              hourly_usd: 150, min_hours: 2, step_hours: 0.5, default_hours: 2, mode: 'in-person', active: true, color_accent: 'lav',   sort_order: 60, calendar_url: '' },
  { slug: 'uscis-tampa',   label: 'USCIS interview — Tampa',      description: 'Two-hour USCIS appointment in Tampa, FL. Additional time billed at $75/hr on-site.',                hourly_usd: 250, min_hours: 2, step_hours: 0.5, default_hours: 2, mode: 'in-person', active: true, color_accent: 'lav',   sort_order: 70, calendar_url: '' },
  { slug: 'lessons',       label: 'Conversation EN/PT',           description: 'One-on-one English↔Portuguese conversation, pronunciation, fluency.',                                hourly_usd: 50,  min_hours: 1, step_hours: 0.5, default_hours: 1, mode: 'remote',    active: true, color_accent: 'peach', sort_order: 80, calendar_url: '' },
  { slug: 'citizenship',   label: 'USCIS interview prep (Tutoria EN/PT)', description: 'One-on-one USCIS interview prep — civics, vocabulary, mock interviews.',                    hourly_usd: 50,  min_hours: 1, step_hours: 0.5, default_hours: 1, mode: 'remote',    active: true, color_accent: 'peach', sort_order: 90, calendar_url: '' },
  { slug: 'test-1usd',     label: '$1 test (do not book)',        description: 'End-to-end checkout test — $1 total. Remove after verification.',                                    hourly_usd: 1,   min_hours: 1, step_hours: 1,   default_hours: 1, mode: 'remote',    active: true, hidden: true, color_accent: 'blue', sort_order: 999, calendar_url: '' },
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
