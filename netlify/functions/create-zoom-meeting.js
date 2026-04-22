// On every confirmed booking:
// 1. Creates a Google Calendar event with Google Meet link (virtual services)
// 2. Sends confirmation emails via Resend
// 3. Notifies Vyn Studio with commission amount

const { google } = require('googleapis');
const { Resend } = require('resend');
const { preflight, jsonResponse } = require('./lib/cors');
const { isValidEmail, sanitizeHeader, sanitizeText } = require('./lib/validation');

const VIRTUAL_SERVICES = ['Remote Interpretation', 'One-on-One Private Lessons', 'Educational Interpretation', 'Legal Interpretation'];
const STAEL_EMAIL = process.env.STAEL_EMAIL || 'hello@staelgissoni.com';

let cachedSaKey = null;
function getSaKey() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) return null;
  if (!cachedSaKey) cachedSaKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  return cachedSaKey;
}

exports.handler = async (event) => {
  const pre = preflight(event);
  if (pre) return pre;
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  let data;
  try {
    data = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON' });
  }

  const { service, price, date, time, fname, lname, email, notes, sessionId } = data;

  if (!service || !date || !time || !fname) {
    return jsonResponse(400, { error: 'Missing required fields' });
  }
  if (!isValidEmail(email)) {
    return jsonResponse(400, { error: 'Invalid email' });
  }
  if (price == null || !Number.isFinite(Number(price)) || Number(price) <= 0) {
    return jsonResponse(400, { error: 'Invalid price' });
  }
  if (notes && String(notes).length > 450) {
    return jsonResponse(400, { error: 'Notes too long (max 450 chars)' });
  }

  const safeFname = sanitizeHeader(fname, 80);
  const safeLname = sanitizeHeader(lname, 80);
  const safeService = sanitizeHeader(service, 80);
  const safeDate = sanitizeHeader(date, 40);
  const safeTime = sanitizeHeader(time, 20);
  const safeNotes = sanitizeText(notes, 450);
  const safeSessionId = sanitizeHeader(sessionId, 80);
  const clientName = `${safeFname} ${safeLname}`.trim();
  const isVirtual = VIRTUAL_SERVICES.includes(safeService);

  const startISO = parseDateTime(date, time);
  if (!startISO) {
    return jsonResponse(400, { error: 'Invalid date/time' });
  }

  let meetLink = null;
  let calendarEventLink = null;

  // ── Google Auth ──
  let googleAuth = null;
  const saKey = getSaKey();
  if (saKey) {
    try {
      const impersonate = process.env.GOOGLE_IMPERSONATE || STAEL_EMAIL;
      googleAuth = new google.auth.JWT({
        email: saKey.client_email,
        key: saKey.private_key,
        scopes: [
          'https://www.googleapis.com/auth/calendar',
          'https://www.googleapis.com/auth/gmail.send',
        ],
        subject: impersonate,
      });
      googleAuth.projectId = saKey.project_id;
      await googleAuth.authorize();
      console.log('✓ Google auth OK — impersonating', impersonate);
    } catch (e) {
      console.error('Google auth error:', e.message);
      return jsonResponse(500, { error: 'Google auth failed' });
    }
  } else {
    return jsonResponse(500, { error: 'Google service account not configured' });
  }

  // ── Create Google Calendar event ──
  try {
    const calendar = google.calendar({ version: 'v3', auth: googleAuth });
    const duration = safeService === 'One-on-One Private Lessons' ? 60 : 90;
    const endISO = new Date(new Date(startISO).getTime() + duration * 60000).toISOString();

    const eventBody = {
      summary: `${safeService} — ${clientName}`,
      description: [
        `Service: ${safeService}`,
        `Price: $${Number(price)}`,
        safeNotes ? `Notes: ${safeNotes}` : '',
        `Stripe: ${safeSessionId || 'N/A'}`,
        'staelgissoni.com',
      ].filter(Boolean).join('\n'),
      start: { dateTime: startISO, timeZone: 'America/New_York' },
      end: { dateTime: endISO, timeZone: 'America/New_York' },
      attendees: [
        { email: STAEL_EMAIL, displayName: 'Stael Gissoni', organizer: true },
        { email, displayName: clientName },
      ],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 30 },
        ],
      },
      sendUpdates: 'all',
    };

    if (isVirtual) {
      eventBody.conferenceData = {
        createRequest: {
          requestId: `stael-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }

    const calEvent = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: eventBody,
      conferenceDataVersion: isVirtual ? 1 : 0,
      sendUpdates: 'all',
    });

    calendarEventLink = calEvent.data.htmlLink;

    if (isVirtual && calEvent.data.conferenceData) {
      const ep = calEvent.data.conferenceData.entryPoints?.find(e => e.entryPointType === 'video');
      if (ep) meetLink = ep.uri;
    }

    console.log(`✓ Calendar event created${meetLink ? ' with Meet link: ' + meetLink : ''}`);
  } catch (e) {
    console.error('Google Calendar error:', e.message);
    return jsonResponse(500, { error: 'Calendar event creation failed' });
  }

  // ── Build email content ──
  const meetSection = meetLink
    ? `\nGoogle Meet link: ${meetLink}\n`
    : isVirtual ? '\nGoogle Meet link: Stael will send this before your session.\n' : '';

  const staelBody = `Hi Stael,\n\nNew booking confirmed!\n\nSERVICE: ${safeService}\nCLIENT: ${clientName}\nEMAIL: ${email}\nDATE: ${safeDate}\nTIME: ${safeTime} ET\nPRICE: $${Number(price)}${meetSection}\nNOTES: ${safeNotes || 'None'}\nSTRIPE: ${safeSessionId || 'N/A'}\n${calendarEventLink ? '\nCalendar: ' + calendarEventLink : ''}\n\n— staelgissoni.com`;

  const clientBody = `Hi ${safeFname},\n\nYour session with Stael is confirmed!\n\nSERVICE: ${safeService}\nDATE: ${safeDate}\nTIME: ${safeTime} ET\nPRICE: $${Number(price)}${meetSection}\n${isVirtual && meetLink ? 'Click the Google Meet link above to join at the scheduled time.' : isVirtual ? 'Stael will send your Google Meet link before the session.' : 'Stael will meet you in person and confirm the location details.'}\n\nCANCELLATION: Free cancellation up to 24 hours before your session.\nContact: hello@staelgissoni.com\n\nThank you for choosing Stael Gissoni!\n\n— staelgissoni.com`;

  const vynBody = `New booking on staelgissoni.com!\n\nSERVICE: ${safeService}\nCLIENT: ${clientName}\nEMAIL: ${email}\nDATE: ${safeDate}\nTIME: ${safeTime} ET\nPRICE: $${Number(price)}\nCOMMISSION (20%): $${Math.round(Number(price) * 0.20 * 100) / 100}${meetSection}\nNOTES: ${safeNotes || 'None'}\nSTRIPE: ${safeSessionId || 'N/A'}\n${calendarEventLink ? '\nCalendar: ' + calendarEventLink : ''}\n\n— staelgissoni.com`;

  // ── Send emails via Resend ──
  let emailsSent = false;
  if (!process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY not set');
    return jsonResponse(500, { error: 'Email provider not configured' });
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const vynEmail = process.env.VYN_EMAIL || 'hello@vyn.studio';

    const results = await Promise.allSettled([
      resend.emails.send({
        from: 'Stael Gissoni <noreply@staelgissoni.com>',
        to: STAEL_EMAIL,
        subject: `New Booking: ${safeService} — ${clientName}`,
        text: staelBody,
      }),
      resend.emails.send({
        from: 'Stael Gissoni <noreply@staelgissoni.com>',
        to: email,
        subject: `Your session is confirmed — ${safeService} with Stael Gissoni`,
        text: clientBody,
      }),
      resend.emails.send({
        from: 'Stael Gissoni Site <noreply@staelgissoni.com>',
        to: vynEmail,
        subject: `New Booking: ${safeService} — ${clientName} — $${Number(price)}`,
        text: vynBody,
      }),
    ]);

    const failures = results.filter(r => r.status === 'rejected');
    if (failures.length === results.length) {
      console.error('All emails failed:', failures.map(f => f.reason?.message));
      return jsonResponse(500, { error: 'Email send failed' });
    }
    if (failures.length > 0) {
      console.error('Some emails failed:', failures.map(f => f.reason?.message));
    }
    emailsSent = true;
    console.log('✓ Emails sent via Resend');
  } catch (e) {
    console.error('Email error:', e.message);
    return jsonResponse(500, { error: 'Email send failed' });
  }

  const gcalLink = buildGCalLink({ service: safeService, clientName, date: safeDate, time: safeTime, meetLink, isVirtual, startISO });

  return jsonResponse(200, { success: true, meetLink, calendarEventLink, gcalLink, emailsSent, isVirtual });
};

// Parse "Fri, Oct 25" + "3:00 PM" into an ISO timestamp. Uses the current year
// as a best-effort when the input lacks one — callers must pre-validate the
// date is within the 21-day availability window, so year rollover is rare.
// Returns null on failure (caller treats that as a 400, not a silent fallback).
function parseDateTime(dateStr, timeStr) {
  if (typeof dateStr !== 'string' || typeof timeStr !== 'string') return null;
  try {
    const year = new Date().getFullYear();
    const clean = dateStr.replace(/^[A-Za-z]+,\s*/, '').trim();
    const d = new Date(`${clean} ${year} ${timeStr}`);
    if (isNaN(d.getTime())) return null;
    // Treat dates >60 days in the past as year-rollover: bump to next year.
    const now = Date.now();
    if (d.getTime() < now - 60 * 24 * 60 * 60 * 1000) {
      const bumped = new Date(`${clean} ${year + 1} ${timeStr}`);
      if (isNaN(bumped.getTime())) return null;
      return bumped.toISOString();
    }
    return d.toISOString();
  } catch {
    return null;
  }
}

function buildGCalLink({ service, clientName, date, time, meetLink, isVirtual, startISO }) {
  try {
    const start = startISO ? new Date(startISO) : new Date();
    const end = new Date(start.getTime() + 60 * 60000);
    const fmt = d => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const title = encodeURIComponent(`${service} — Stael Gissoni`);
    const details = encodeURIComponent([
      meetLink ? `Google Meet: ${meetLink}` : isVirtual ? 'Meet link to be sent by Stael' : 'In-person session',
      'hello@staelgissoni.com | staelgissoni.com',
    ].join('\n'));
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmt(start)}/${fmt(end)}&details=${details}`;
  } catch {
    return 'https://calendar.google.com';
  }
}
