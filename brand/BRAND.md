# Stael Gissoni — Brand Guide

Quick reference for designing creative assets (Meta ads, social graphics, print, partner packets).

## Logo

Location: `brand/logo/`

| File | Use |
|---|---|
| `logo-primary-{512,1024,2048}.png` | **Default** — charcoal "stael" + peach period on light/neutral backgrounds. |
| `logo-white-{512,1024,2048}.png` | White "stael" + peach period — for dark/photo backgrounds. |
| `logo-mono-charcoal-{512,1024,2048}.png` | Single-colour charcoal (including the period) — for print / one-colour contexts. |
| `logo-mono-white-{512,1024,2048}.png` | Single-colour white (including the period). |
| `logo-mark-{512,1024,2048}.png` | **Favicon / app icon / social avatar** — charcoal rounded square with "s." (peach dot). |
| `logo-stacked-{512,1024,2048}.png` | Square composition with the tagline "EN ↔ PT INTERPRETER" underneath. Good for IG profile squares. |
| `*.svg` | Vector source for every variant — resize without quality loss; hand off to a printer at any size. |

**Clearspace:** keep at least `1x` the height of the "s" letterform on every side of the wordmark. Don't place other text or edges inside that margin.

**Minimum size:** wordmark ≥ 80px tall on screen, ≥ 0.4" on print. Mark ≥ 40px on screen.

**Don't:**
- Stretch or distort the wordmark.
- Change the period colour — it's always peach `#F2A07B` (or full mono in the `logo-mono-*` variants).
- Swap Fraunces for a similar serif; the wordmark is the Fraunces letterforms.

---

## Colours

Palette sheet: `brand/color/palette.png` (and `@2x`)

### Primary
| Role | Hex | Note |
|---|---|---|
| Peach | `#F2A07B` | The brand colour. Use for the period in the logo, accents, CTAs on light backgrounds. |
| Peach deep | `#E08A60` | Hover / pressed states on peach buttons. |
| Peach light | `#FADBC8` | Light backgrounds, badge fills. |
| Peach wash | `#FFF2EB` | Softest wash — panel backgrounds, cards. |

### Secondary
| Role | Hex | Note |
|---|---|---|
| Blue | `#5B8EC9` | The "Book now" CTA colour. Accent blocks, links on light. |
| Blue deep | `#4A78B0` | Hover on blue buttons. |
| Blue light | `#A3C4E9` | Badges, decorative. |
| Blue wash | `#EBF2FA` | Panel backgrounds. |

### Accents (sparingly)
| Role | Hex |
|---|---|
| Mint | `#8FC5B5` · deep `#6BAA97` · wash `#EFF9F5` |
| Lavender | `#B8A9D4` · light `#E6DFF3` · wash `#F5F1FB` |

### Neutrals
| Role | Hex |
|---|---|
| Dark (headlines) | `#2A2A3A` |
| Text (body) | `#3D3D50` |
| Muted (subdued text) | `#7C7C96` |
| Border | `#EDECF0` |
| Background (site) | `#FEFBF6` |
| Background (warm) | `#FFF9F2` |
| White | `#FFFFFF` |

---

## Typography

Specimen sheet: `brand/type/type-specimen.png`

### Fraunces (serif)
- **Use:** headlines, display, pull quotes, editorial numerals.
- **Weights shipped:** 400 / 600 / 700 / 800 · italic 400 / 600 / 700.
- **Download:** Google Fonts — https://fonts.google.com/specimen/Fraunces
- **Feel:** editorial, warm, confident. The italic is the signature look — use it for accent words (e.g. *"without barriers."*).

### Nunito (sans)
- **Use:** body copy, UI labels, buttons, captions.
- **Weights shipped:** 400 / 500 / 600 / 700 / 800.
- **Download:** Google Fonts — https://fonts.google.com/specimen/Nunito
- **Feel:** friendly, geometric, reads clean at small sizes.

### Size scale (web default)
| Element | Size | Weight | Font |
|---|---|---|---|
| Display (hero) | clamp(2.4rem, 5vw, 3.8rem) | 800 | Fraunces |
| H2 | clamp(1.8rem, 3.4vw, 2.4rem) | 700–800 | Fraunces |
| H3 | 1.25rem | 700 | Fraunces |
| Body | 1rem | 400–600 | Nunito |
| Eyebrow / label | 0.72–0.78rem | 800 | Nunito (uppercase, 0.1–0.14em tracking) |

---

## Voice

**Professional services, not casual ESL.** Stael sells to law firms, hospitals, and procurement teams. Copy is:
- Specific (rates, minimums, turnaround times on the surface)
- Credential-forward (OSCA, ATA, CCHI, insurance numbers)
- Warm in the micro-copy (italics, "I" voice), formal in the terms
- Bilingual-aware — English default, Portuguese ready. Never broken English as a joke.

**Don't:** emojis in headlines, flag clichés in hero copy, "learn English with a friendly Brazilian" tonal register, stock photos of handshakes.

---

## Files index

```
brand/
├── BRAND.md              ← you are here
├── logo/
│   ├── logo-primary.svg           + .png @ 512/1024/2048
│   ├── logo-white.svg             + .png @ 512/1024/2048
│   ├── logo-mono-charcoal.svg     + .png @ 512/1024/2048
│   ├── logo-mono-white.svg        + .png @ 512/1024/2048
│   ├── logo-mark.svg              + .png @ 512/1024/2048   (square icon)
│   └── logo-stacked.svg           + .png @ 512/1024/2048   (square w/ tagline)
├── color/
│   ├── palette.svg
│   ├── palette.png
│   └── palette-2x.png
└── type/
    ├── type-specimen.svg
    ├── type-specimen.png
    └── type-specimen-2x.png
```
