// Shared input sanitizers + validators for function endpoints.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(v) {
  return typeof v === 'string' && EMAIL_RE.test(v.trim());
}

function sanitize(v, max = 200) {
  return String(v == null ? '' : v).trim().replace(/[\r\n\t]+/g, ' ').slice(0, max);
}

// Multi-line sanitize for notes / long text — preserves \n but strips control chars.
function sanitizeText(v, max = 1200) {
  return String(v == null ? '' : v)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .trim()
    .slice(0, max);
}

function cleanPhone(v) {
  const digits = String(v || '').replace(/\D+/g, '');
  if (!digits) return '';
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return '+' + digits;
}

module.exports = { isValidEmail, sanitize, sanitizeText, cleanPhone };
