// Stael — split + validation helpers for checkout.
// Services catalogue lives in Supabase (public.services); this file only
// owns the math: derive totals from a Supabase row + validate hours.

// 20% platform fee (Vyn) · 80% to Stael (minus Stripe's own processing cut).
const PLATFORM_FEE_RATE = 0.20;

function priceFromService(service, hoursInput) {
  if (!service) throw new Error('Unknown service');
  const min = Number(service.min_hours ?? 1);
  const h = Number(hoursInput);
  if (!Number.isFinite(h)) throw new Error('Invalid hours');
  if (h < min) throw new Error(`Minimum for ${service.label} is ${min} hour(s)`);
  const step = Number(service.step_hours ?? 0.5);
  const rounded = Math.round(h / step) * step;
  const totalUsd = Math.round(Number(service.hourly_usd) * rounded * 100) / 100;
  const totalCents = Math.round(totalUsd * 100);
  return {
    service_key: service.slug,
    service_label: service.label,
    hourly_usd: Number(service.hourly_usd),
    hours: rounded,
    total_usd: totalUsd,
    total_cents: totalCents,
    platform_fee_cents: Math.round(totalCents * PLATFORM_FEE_RATE),
  };
}

module.exports = { priceFromService, PLATFORM_FEE_RATE };
