const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(v) {
  return typeof v === 'string' && v.length <= 254 && EMAIL_RE.test(v);
}

function isPositiveNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
}

function isValidDateString(v) {
  if (typeof v !== 'string' || !v) return false;
  const d = new Date(v);
  return !isNaN(d.getTime());
}

function isValidIsoDate(v) {
  if (typeof v !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}/.test(v) && !isNaN(new Date(v).getTime());
}

// Strip newlines/CR and control chars — prevents email header injection when
// user input is interpolated into subjects / from fields / display names.
function sanitizeHeader(v, maxLen = 120) {
  if (v == null) return '';
  return String(v)
    .replace(/[\r\n\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function sanitizeText(v, maxLen = 450) {
  if (v == null) return '';
  return String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, maxLen);
}

module.exports = {
  isValidEmail,
  isPositiveNumber,
  isValidDateString,
  isValidIsoDate,
  sanitizeHeader,
  sanitizeText,
};
