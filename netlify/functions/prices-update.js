// prices-update.js
// Stael's self-service price update form posts here. Token-gated; on success
// sends a formatted Telegram message to Diler with the new prices so he can
// review and apply them to services.html + Cal.com.
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

const STATUS_MARKER = {
  added: '➕',
  removed: '❌',
  changed: '🔸',
  unchanged: '·',
};

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

  const services = Array.isArray(payload.services) ? payload.services : [];
  const notes = (payload.notes || '').trim();

  // Summary counts
  const counts = { added: 0, removed: 0, changed: 0, unchanged: 0 };
  services.forEach(s => { if (counts[s.status] !== undefined) counts[s.status]++; });

  const lines = [];
  lines.push('💰 *Stael — Price update*');
  const summaryBits = [];
  if (counts.changed) summaryBits.push(`${counts.changed} changed`);
  if (counts.added) summaryBits.push(`${counts.added} added`);
  if (counts.removed) summaryBits.push(`${counts.removed} removed`);
  if (summaryBits.length === 0) summaryBits.push('no changes');
  lines.push(`_${escapeMd(summaryBits.join(' · '))}_`);
  lines.push('');

  let currentCategory = null;
  for (const s of services) {
    if (s.category && s.category !== currentCategory) {
      currentCategory = s.category;
      lines.push(`\n*${escapeMd(currentCategory)}*`);
    }
    const marker = STATUS_MARKER[s.status] || '·';
    const name = escapeMd(s.name || '(unnamed)');
    const price = escapeMd(s.price || '—');
    const min = s.min ? ` _\\(${escapeMd(s.min)}\\)_` : '';

    if (s.status === 'removed') {
      lines.push(`${marker} ~${name}~`);
    } else if (s.status === 'changed' && s.origName && s.origName !== s.name) {
      lines.push(`${marker} ${escapeMd(s.origName)} → *${name}*: *${price}*${min}`);
    } else {
      lines.push(`${marker} ${name}: *${price}*${min}`);
    }
  }

  if (notes) {
    lines.push('');
    lines.push(`📝 _Notes from Stael:_`);
    lines.push(escapeMd(notes));
  }

  lines.push('');
  lines.push(`_Submitted ${escapeMd(new Date().toISOString())}_`);

  try {
    await sendTelegram(token, chatId, lines.join('\n'));
    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('prices-update error:', err.message);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
