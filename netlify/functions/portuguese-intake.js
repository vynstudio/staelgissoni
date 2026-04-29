// portuguese-intake.js
// Stael's Portuguese-localization intake form posts here. Token-gated; on
// success sends a formatted Telegram message to Diler with her variant/
// tone/word preferences/accent notes/translated brand phrases so he can
// translate the site to PT correctly.
//
// Env: STAEL_STAFF_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function escapeMd(s) {
  if (!s) return '';
  return String(s).replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

async function sendTelegram(token, chatId, text) {
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
    }),
  });
  const body = await r.json();
  if (!body.ok) throw new Error('Telegram: ' + (body.description || r.status));
  return body.result;
}

const VARIANT_LABEL = {
  'pt-BR': 'Brazilian Portuguese (pt-BR)',
  'pt-PT': 'European Portuguese (pt-PT)',
  both: 'Both — language switcher',
};
const PRONOUN_LABEL = {
  voce: '"Você" — neutral / professional',
  tu: '"Tu" — informal / regional',
  senhor: '"O senhor / a senhora" — formal',
};
const TONE_LABEL = {
  'warm-pro': 'Warm but professional',
  formal: 'Formal / corporate',
  casual: 'Casual / familiar',
};

const SERVICE_LABELS = [
  ['onsite', 'On-site interpretation'],
  ['remote', 'Remote (VRI)'],
  ['medical', 'Medical interpretation'],
  ['educational', 'Educational interpretation'],
  ['conference', 'Conference interpretation'],
  ['uscisOrlando', 'USCIS — Orlando'],
  ['uscisTampa', 'USCIS — Tampa'],
  ['conversation', 'Conversation EN/PT'],
  ['tutoria', 'USCIS interview prep'],
];

function block(lines, label, value) {
  if (!value || !String(value).trim()) return;
  lines.push(`*${escapeMd(label)}*`);
  // Multi-line free-text values render as quoted blocks
  String(value).split(/\r?\n/).forEach(ln => {
    if (ln.trim()) lines.push(`> ${escapeMd(ln)}`);
  });
  lines.push('');
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const expected = process.env.STAEL_STAFF_KEY;
  if (!expected || payload.k !== expected) {
    return { statusCode: 403, headers: CORS, body: JSON.stringify({ error: 'Forbidden' }) };
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Telegram not configured' }) };
  }

  const lines = [];
  lines.push('🇧🇷 *Stael — Portuguese voice intake*');
  lines.push('');

  lines.push(`*Variant:* ${escapeMd(VARIANT_LABEL[payload.variant] || payload.variant || '—')}`);
  lines.push(`*Pronoun:* ${escapeMd(PRONOUN_LABEL[payload.pronoun] || payload.pronoun || '—')}`);
  lines.push(`*Tone:* ${escapeMd(TONE_LABEL[payload.tone] || payload.tone || '—')}`);
  lines.push('');

  block(lines, 'Words to use', payload.preferWords);
  block(lines, 'Words to avoid', payload.avoidWords);
  block(lines, 'Accent / spelling notes', payload.accentNotes);

  block(lines, 'Bio (PT)', payload.bioPt);
  block(lines, 'Hero headline', payload.heroHeadline);
  block(lines, 'Hero subheadline', payload.heroSub);

  const svc = payload.services || {};
  const svcLines = SERVICE_LABELS
    .map(([k, label]) => svc[k] ? `${escapeMd(label)}: *${escapeMd(svc[k])}*` : null)
    .filter(Boolean);
  if (svcLines.length) {
    lines.push('*Service names (PT)*');
    svcLines.forEach(l => lines.push(`· ${l}`));
    lines.push('');
  }

  if (payload.ctaButton) {
    lines.push(`*CTA button:* ${escapeMd(payload.ctaButton)}`);
    lines.push('');
  }

  if (payload.notes) {
    lines.push('📝 _Notes from Stael:_');
    String(payload.notes).split(/\r?\n/).forEach(ln => {
      if (ln.trim()) lines.push(escapeMd(ln));
    });
    lines.push('');
  }

  lines.push(`_Submitted ${escapeMd(new Date().toISOString())}_`);

  try {
    await sendTelegram(token, chatId, lines.join('\n'));
    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('portuguese-intake error:', err.message);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
