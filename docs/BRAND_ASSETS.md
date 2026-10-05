# BRAND_ASSETS.md — Tunas Pool artwork catalog

> Source of truth for every piece of artwork the commissioner has supplied.
> Originals live in `brand/originals/` (not under `public/` or `src/`, so they are **never bundled or served**).
> Production-ready derivatives go in `public/brand/` or `src/assets/` only after they are cleared here.
> Rules come from `docs/DESIGN_SYSTEM.md` §10 and `CLAUDE.md` principle 9.

Added 2026-10-05 (supplied by Ryan, AI-generated artwork).

## Status key

| Status | Meaning |
|---|---|
| **Cleared** | No third-party marks. Can be used on the site after the technical clean-up listed. |
| **Cleared with edits** | Usable only after the named marks are removed or replaced. |
| **Cleared by commissioner** | Ryan approved it for use (see the decision). Any risk is noted on the asset. |
| **Blocked** | Contains league marks. Keep as reference only. Do not ship. |

## Catalog

| ID | File | Pixels | Status |
|---|---|---|---|
| BA-01 | `brand/originals/wordmark-tunas-pick-em.png` | 1536×1024 | **Cleared** (technical clean-up needed) |
| BA-02 | `brand/originals/badge-tuna-mascot-weekly-pool.png` | 1254×1254 | **Cleared by commissioner** (D-053, accepted risk: carries Ravens and NFL marks) |
| BA-03 | `brand/originals/helmet-pawn-shop-2na.png` | 1536×1024 | **Cleared by commissioner** (D-053) |

### BA-01 · Wordmark lockup "TUNAS / PICK EM"

- **What it is:** slab-serif collegiate wordmark. "TUNAS" in a gold gradient with a white keyline, black outline and purple drop. A football with white laces sits between it and a purple ribbon holding "PICK EM" in white.
- **Palette:** gold, purple, black, white, plus the brown leather of the football. Matches the Ravens-style palette (`tokens.css`).
- **Third-party marks:** none found. No logos, no league wording.
- **Fits the design system:** yes. It is the "slab-serif block wordmark with a pennant ribbon" from `DESIGN_SYSTEM.md` §2, as art.
- **Best uses:** social share card (1200×630), splash or sign-in hero, printable poster, email header.
- **Not for:** the in-app header. §10 says the wordmark is live text (`.wordmark`, `.ribbon`) for sharpness, speed and Extra large text size. Use this art as a hero or a share image.
- **Accessibility:** as an `<img>`, alt text "Tunas Pick Em". Never the only place that text appears.

### BA-02 · Round badge "TUNAS PICK EM · WEEKLY FOOTBALL POOL" with Tuna the mascot

- **What it is:** circular crest. Purple ring with gold stars, white ring text, a gold inner disc with a purple city skyline. Tuna is a grinning white fish in sunglasses, giving a thumbs up, holding a football, in a purple jersey numbered **69**.
- **Marks that block it:**
  1. **NFL shield** on the jersey collar.
  2. **Ravens raven-head "B" logo** on the cap.
  3. **Ravens raven-head "B" logo** on the jersey chest.
  4. The cap and jersey are also Ravens uniform styling.
- **Rule hit:** `DESIGN_SYSTEM.md` §10 and `CLAUDE.md` principle 9 would have blocked it. On 2026-10-05 Ryan decided all supplied logos are fine to use, so **D-053 makes this badge an approved exception**.
- **Accepted risk (recorded once):** the Ravens raven-head and NFL shield are trademarks of third parties. The site is a private friends' pool, but a public share image or app icon is more visible than a page behind a sign-in. If anyone ever objects, the fallback is a recolored Tuna with a neutral "T" or fish emblem.
- **Use:** home hero, About, empty states, winner banner and sharing are all fine. Favicon and app icon are better served by a simple "T" or Tuna's face cropped from it.
- **Still needed:** the technical clean-up below (real transparency, smaller files).
- **Note:** the ring text says "Tunas" with no apostrophe, which matches BA-01 and the site name.

### BA-03 · Football helmet "THE PAWN SHOP · 2NA"

- **What it is:** purple helmet with black facemask, gold stripe, white "2NA" brush lettering, and a sponsor crest on the shell: "THE PAWN SHOP, EST. 2010" with a green cannabis leaf in place of the O, a skull in a feathered headdress, and skeleton hands.
- **Third-party marks:** no NFL or Ravens logo.
- **Meaning:** "2NA" is a short, hip way of writing "Tuna" (Ryan, 2026-10-05).
- **Cleared:** Ryan confirmed the crest, cannabis leaf and headdress imagery are fine (D-053).
- **Likely use:** a "Sponsored by" footer, About page, or a fun alternate hero. Not part of the core Game Day screens.

## Technical state of all three files

- All are **flattened RGB PNGs with no alpha channel**. The grey-and-white checkerboard is baked into the pixels. They are not truly transparent, and will show a checkerboard on any coloured background.
- All are about 2 MB, which is too heavy to ship as is.
- To make them usable, each cleared asset needs a clean background removal (or a regeneration with a real transparent background), then export to WebP or PNG at 1x, 2x and a 1200×630 share variant.
- Ask for **vector or layered originals** whenever possible (already a standing request in `DESIGN_SYSTEM.md` §10).

## Where each asset could go

| Place | Best asset | Ready? |
|---|---|---|
| Sign-in and home hero | BA-01 | After background clean-up |
| Social share image 1200×630 | BA-01 | After background clean-up |
| Favicon and app icon | Tuna's face cropped from BA-02, or a "T" | After crop and clean-up |
| Empty states, winner banner, 404 | Tuna from BA-02 | After background clean-up |
| Sponsor footer or About | BA-03 | After background clean-up |

## Change log

| Date | Change |
|---|---|
| 2026-10-05 | Three originals added and cataloged. |
| 2026-10-05 | Ryan cleared all three (D-053). BA-02 is an approved exception to §10. "2NA" means Tuna. |
