# staelgissoni.com

Professional English–Portuguese interpreter website for Stael Gissoni.

## Stack
- **Hosting:** Netlify (staelgissoni.com)
- **Payments:** Stripe Connect (Vyn Studio account → 20% split to Stael)
- **Email:** Resend (hello@staelgissoni.com)
- **Calendar:** Google Calendar API (stgissoni@gmail.com project)
- **Meetings:** Google Meet (auto-created for virtual services)

## Services
| Service | Price | Min |
|---|---|---|
| On-Site Interpretation | $95/hr | 2hrs |
| Remote Interpretation | $65/hr | 2hrs |
| Medical Interpretation | $75/hr | 2hrs |
| Legal Services | $85/hr | 2hrs |
| Educational Interpretation | $75/hr | 2hrs |
| One-on-One Private Lessons | $50/hr | None |

## Key Pages
- `/` — Homepage
- `/services` — All services
- `/lessons` — English lessons landing page
- `/interpretation` — Interpretation landing page
- `/contact` — Booking form (3-step)
- `/about` — About Stael
- `/blog` — Blog
- `/changes` — Stael's site change request form

## Netlify Functions
- `create-checkout.js` — Stripe checkout with 3% fee + 20% Connect split
- `stripe-webhook.js` — Fires on payment → creates calendar event + sends emails
- `create-zoom-meeting.js` — Creates Google Calendar event + Google Meet link
- `get-availability.js` — Reads Stael's Google Calendar freebusy
- `send-notification.js` — Sends email notifications via Resend

## Env Vars (Netlify)
- `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` — Vyn Studio Stripe keys
- `STAEL_STRIPE_ACCOUNT_ID` — Stael's Connect account
- `STRIPE_WEBHOOK_SECRET` — Webhook signing secret
- `RESEND_API_KEY` — Resend API key
- `GOOGLE_SERVICE_ACCOUNT_JSON` — Service account key (stgissoni@gmail.com project)
- `GOOGLE_IMPERSONATE` — hello@staelgissoni.com
- `STAEL_EMAIL` — hello@staelgissoni.com
- `VYN_EMAIL` — hello@vyn.studio

## Change Requests
Stael submits changes via staelgissoni.com/changes → emails hello@vyn.studio

## Managed by
Vyn Studio — hello@vyn.studio
