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
| **Blocked** | Contains league marks. Keep as reference only. Do not ship. |
| **Needs a decision** | Commissioner call required before use. |

## Catalog

| ID | File | Pixels | Status |
|---|---|---|---|
| BA-01 | `brand/originals/wordmark-tunas-pick-em.png` | 1536×1024 | **Cleared** (technical clean-up needed) |
| BA-02 | `brand/originals/badge-tuna-mascot-weekly-pool.png` | 1254×1254 | **Blocked** until the NFL and Ravens marks are removed |
| BA-03 | `brand/originals/helmet-pawn-shop-2na.png` | 1536×1024 | **Needs a decision** (sponsor logo, imagery) |

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
- **Rule hit:** `DESIGN_SYSTEM.md` §10 and `CLAUDE.md` principle 9. The mascot is used "only recolored, with all NFL marks removed", with a neutral emblem (a "T" or fish) in their place.
- **What is worth keeping:** the pose, sunglasses, grin, number 69, the ring layout, stars and the skyline. Those are all Tuna and the pool.
- **Work needed (Sprint 5 design pass, `PROJECT_PLAN.md` Parked):**
  - Replace the cap logo and chest logo with a neutral "T" or fish emblem.
  - Delete the NFL shield.
  - Ask for a clean re-generation or the layered original (see §10), because painting over a flattened raster usually looks poor.
- **Until then:** reference only. Do not put it in `public/` and do not use it as an app icon, favicon or share image.
- **Note:** the ring text says "Tunas" with no apostrophe, which matches BA-01 and the site name.

### BA-03 · Football helmet "THE PAWN SHOP · 2NA"

- **What it is:** purple helmet with black facemask, gold stripe, white "2NA" brush lettering, and a sponsor crest on the shell: "THE PAWN SHOP, EST. 2010" with a green cannabis leaf in place of the O, a skull in a feathered headdress, and skeleton hands.
- **Third-party marks:** no NFL or Ravens logo. It is a generic purple helmet, so it passes §10 on league IP.
- **Open questions for Ryan:**
  1. **Sponsor or business use.** This is a business logo. Confirm it is yours or that the pawn shop has agreed to appear on the site.
  2. **Cannabis leaf.** It is in the logo, so a shared public page carries it. The Responsible-Play and Welcome persona tests (`PERSONAS.md` §0) should say whether that is fine for every player, including the seniors, and for sharing with people from the US side.
  3. **Headdress and skull.** The feathered war-bonnet and the skull are imagery some people find disrespectful or off-putting. This is a "stop and ask" item, not a ban.
  4. **"2NA"** is not explained anywhere in the docs. Is it a team name, a league name, or a sub-pool? Tell me and I will record it.
- **Likely use if cleared:** a "Sponsored by" footer or an About page. Not part of the core Game Day screens.

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
| Favicon and app icon | A "T" or fish mark, or Tuna's face from BA-02 | No, BA-02 must be recolored first |
| Empty states, winner banner, 404 | Tuna (BA-02 after recolor) | No |
| Sponsor footer or About | BA-03 | Needs Ryan's decision |

## Change log

| Date | Change |
|---|---|
| 2026-10-05 | Three originals added and cataloged. BA-02 blocked on league marks. BA-03 awaiting a decision. |
