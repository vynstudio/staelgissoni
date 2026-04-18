const PRICES = {
  'on-site':     { usd: 9500, min_hours: 2, label: 'On-Site Interpretation' },
  'remote':      { usd: 6500, min_hours: 2, label: 'Remote Interpretation' },
  'medical':     { usd: 7500, min_hours: 2, label: 'Medical Interpretation' },
  'legal':       { usd: 8500, min_hours: 2, label: 'Legal Services' },
  'educational': { usd: 7500, min_hours: 2, label: 'Educational' },
  'lessons':     { usd: 5000, min_hours: 1, label: 'Private Lessons' },
};

function priceFor(serviceKey, hours) {
  const cfg = PRICES[serviceKey];
  if (!cfg) throw new Error('Unknown service');
  const requested = Number(hours);
  const safeHours = Number.isFinite(requested) && requested > 0
    ? Math.max(cfg.min_hours, Math.ceil(requested))
    : cfg.min_hours;
  return {
    unit_amount: cfg.usd,
    hours: safeHours,
    total: cfg.usd * safeHours,
    label: cfg.label,
  };
}

module.exports = { PRICES, priceFor };
