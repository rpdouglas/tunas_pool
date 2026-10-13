# DESIGN_SYSTEM.md — Tunas Pick 'Em

Design system for the Tunas Weekly Football Pool site: **the Week 4 sheet's layout language, in Baltimore Ravens colors.**
Source files: `src/styles/tokens.css` (tokens), `src/styles/brand.css` (signature components), `tailwind.preset.cjs` (Tailwind v3 wiring).
If this doc and the token files disagree, the token files win. Fix the doc.

**Method.**
- **Color:** the Ravens' four official colors, confirmed against published team color codes. These replace the Bills blue and red that appear on the paper sheet.
- **Layout and devices:** the sheet's structure (red-bar-style section headers, keyline panels, numbered table, stat tiles, icon circles, streaks, wordmark) is kept and recolored.
- **Derived tokens** (ramps, status colors, a brighter UI gold) are not official. They're flagged in `tokens.css` as DERIVED.
- Fonts are my closest open match to the sheet's lettering. Confirm with whoever produced the artwork.

---

## 1. Palette

### 1.1 Official Ravens colors

| Token | Hex | Role |
|---|---|---|
| `purple-700` **Ravens purple** | `#241773` | Structure: section bars, panel borders, selected picks, icon circles, secondary buttons, wordmark fill |
| `black` **Black** | `#000000` | Ground: bottom of the Game Day gradient, panel title strips, hard shadows, text on gold |
| `gold-600` **Metallic gold** | `#9E7C0C` | Brand anchor: large accents, borders, graphics, the winner crown on white |
| `red-700` **Ravens red** | `#C60C30` | **Urgency and errors only**: lock state, deadline, error messages, missed picks |
| `white` | `#FFFFFF` | Panels and surfaces |

### 1.2 The one deliberate departure: UI gold

The official metallic gold `#9E7C0C` is a dark, muddy gold, and it only reaches **3.9 : 1 on white**. That fails WCAG AA for normal text, and white text on it fails too. Used for buttons, it would look dull and be hard to read.

So there are two golds:

| Token | Hex | Use |
|---|---|---|
| `gold-600` (official) | `#9E7C0C` | Brand anchor. Large numerals (3:1 is enough), borders, icons, graphics |
| `gold-400` **UI gold** (derived) | `#D9AF26` | Primary buttons, ribbon, sticker, panel-title text on black. Black text on it is **10.1 : 1** |
| `gold-300` (derived) | `#DEBE54` | Gold text on purple or black backgrounds |
| `gold-700` (derived) | `#765D0A` | Small gold text on white (6.3 : 1) |

**Decision for you:** if you want the buttons to match the Ravens' dull gold exactly, we can swap `gold-400` for the official value and switch button text to black on `#9E7C0C` (5.3 : 1, passes). It will look darker and flatter. I recommend the brighter UI gold.

### 1.3 Roles (what changed from the sheet)

The sheet pairs **navy (structure)** with **red (energy)**. The Ravens palette pairs **purple (structure)** with **gold (energy)**, with black as the ground.

| Job | Sheet (Bills) | Now (Ravens) |
|---|---|---|
| Structure, text on white, selected pick | Navy | **Purple** |
| Primary action, ribbon, highlights | Red | **Gold** (black text) |
| Page ground | Navy + stadium | **Purple fading to black** |
| Panel title strip | Navy, white text | **Black, gold text** |
| Section bar | Red, white text | **Purple, white text, gold underline** |
| Urgency and errors | Red (same as brand) | **Red** (now only this, which removes the old brand/error ambiguity) |
| Winner crown | Red | **Gold** |

**Usage ratio (Game Day screens):** about 50% purple/black, 35% white panels, 15% gold. Red appears only when something needs urgent attention.

### 1.4 Derived colors

| Group | Tokens | Why |
|---|---|---|
| Purple, gold, red ramps | `purple-50…950`, `gold-50…900`, `red-50…900` | Tints and shades for hover, pressed, tinted backgrounds |
| Neutrals | `neutral-50…900` | Slightly purple-tinted grays for the admin and muted text |
| Success | `success-50/300/600/800` | **Paid**, correct picks. There's no green in the Ravens palette. |
| Warning | Aliased to gold tints | **Unpaid / pending** reads as "needs attention" in brand gold, with a word or icon |

### 1.5 Contrast (WCAG 2.2, measured)

| Pair | Ratio | Passes |
|---|---|---|
| White on `purple-700` | 14.5 : 1 | AA + AAA |
| White on `purple-800` | 16.8 : 1 | AA + AAA |
| `purple-500` on white (emphasis text, focus ring) | 8.8 : 1 | AA + AAA |
| `purple-700` on `purple-100` | 11.1 : 1 | AA + AAA |
| **Black on `gold-400`** (primary button) | 10.1 : 1 | AA + AAA |
| `gold-400` on black (panel titles) | 10.1 : 1 | AA + AAA |
| `gold-400` on `purple-800` | 8.1 : 1 | AA + AAA |
| `gold-300` on `purple-700` | 8.0 : 1 | AA + AAA |
| `gold-700` on white | 6.3 : 1 | AA |
| `gold-800` on `gold-50` | 8.8 : 1 | AA + AAA |
| **Official `gold-600` on white** | **3.9 : 1** | **Large text and graphics only** |
| Black on official `gold-600` | 5.3 : 1 | AA |
| White on `red-700` | 6.0 : 1 | AA |
| `red-800` on `red-50` | 7.6 : 1 | AA + AAA |
| `neutral-600` on white (muted text) | 6.9 : 1 | AA + AAA |
| `neutral-500` on white | 5.2 : 1 | AA |
| White on `success-600` | 5.1 : 1 | AA |

**Never:** white text on any gold. Official gold as normal-size text on white. `gold-400` as text on white.

---

## 2. What we keep from the sheet

The sheet is a **game-day program, not a spreadsheet**. These traits stay, and are recolored:

- Heavy keylines: 2–3px borders and rounded corners everywhere, no hairlines.
- Condensed, italic, uppercase headings over a calm, readable body.
- A slab-serif block **wordmark** with a white keyline and a hard drop.
- A pennant **ribbon** under the wordmark.
- Diagonal **speed streaks** over the page background.
- A structured, scannable **table** with numbered cells and a clearly marked "Your pick" column.
- **Stat tiles** (Week, Entry fee, Winner).
- **Icons as white glyphs in colored circles.**
- **Key rules highlighted in bold italic** (now purple).
- A **mascot**, Tuna, number 69.

### Design principles

1. **Game Day, not dashboard.** Player screens feel like the paper sheet: bold, branded, a little loud.
2. **Spend the boldness in two places:** the wordmark and the pick buttons. Everything around them stays quiet.
3. **One tap, one decision.** Big targets (56px picks, 48px minimum), plain words. Many players are older.
4. **Purple for structure, gold for action, red only for trouble.**
5. **Never color alone.** Every state also has an icon or word.
6. **Back Office is calm.** Same tokens, no streaks, no drama (§7).

---

## 3. Typography

| Role | Font | Why |
|---|---|---|
| **Wordmark and hero only** | **Alfa Slab One** | Closest open match to the sheet's heavy slab lettering. "TUNAS" and "PICK 'EM" only. |
| **Headings, labels, numbers, buttons, team names** | **Barlow Condensed** (600/700/800, italic 700/800) | Matches the condensed athletic headings and big numerals. |
| **Body, forms, long text** | **Barlow** (400/500/600/700) | Same family feel, more readable at small sizes. |
| **Brush-script flourishes** ("Go Bills!", "Bills Mafia") | **Not carried over** | Team-specific. Replace with a neutral flourish ("Let's go!") using the sticker style. |

```bash
npm i @fontsource/alfa-slab-one @fontsource/barlow @fontsource/barlow-condensed
```
```ts
// src/main.tsx
import '@fontsource/alfa-slab-one';
import '@fontsource/barlow/400.css';  import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';  import '@fontsource/barlow/700.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800.css';
import '@fontsource/barlow-condensed/700-italic.css';
import '@fontsource/barlow-condensed/800-italic.css';
```

### Type scale (mobile first; rem so large-text mode scales everything)

| Token (Tailwind) | Size / line-height | Font | Use |
|---|---|---|---|
| `text-wordmark` | clamp(3rem, 14vw, 5.5rem) / 0.9 | Alfa Slab One | TUNAS, PICK 'EM |
| `text-stat-xl` | 4rem / 0.9, 800 | Barlow Condensed | Week number, $20 |
| `text-h1` | 2.5rem / 1, 800 | Barlow Condensed | Screen titles |
| `text-h2` | 1.75rem / 1.1, 700 | Barlow Condensed, *italic* | Panel titles |
| `text-h3` | 1.375rem / 1.2, 700 | Barlow Condensed | Card headings |
| `text-bar` | 1.375rem / 1, 700, +0.02em | Barlow Condensed, UPPERCASE | Section bars |
| `text-colhead` | 0.875rem / 1, 700, +0.05em | Barlow Condensed, UPPERCASE | Column headers, badges |
| `text-team` | 1.375rem / 1.1, 700 | Barlow Condensed, sentence case | Pick buttons |
| `text-body` | 1rem / 1.5 | Barlow | Everything else |
| `text-body-sm` | 0.875rem / 1.25rem | Barlow | Hints, timestamps |

**Case rules.** Caps are kept for section bars, column headers, badges, the wordmark, and stat labels. **Sentence case** for buttons, form labels, body copy, and team names. Keep body lines under ~60 characters (`max-w-player` is 30rem).

---

## 4. Shape, elevation, spacing, motion

- **Spacing:** Tailwind's 4px scale. Page gutter 16px, panel padding 16px, section gap 24px, game-card gap 12px.
- **Radius:** `sm 6` · `md 10` (buttons, picks, inputs) · `lg 14` (panels, tiles) · `xl 20` (modals) · `pill` (badges).
- **Borders:** `2px` for inputs, buttons, picks · `3px` purple for panels and stat tiles.
- **Elevation:** hard **"sticker" shadows**: `0 3px 0` in deep purple (secondary buttons, selected picks) or deep gold (primary buttons). Buttons **press down** 2px when tapped. Soft `shadow-raised` is only for floating things (toasts, modals).
- **Motion:** 120ms press feedback, 200ms for state changes. **One orchestrated moment:** the winner reveal, where the gold crown drops in (`animate-crown-drop`, 600ms). `prefers-reduced-motion` turns everything off.
- **Touch targets:** 48px minimum, 56px for picks. `inputmode="tel"` for phone, `inputmode="numeric"` for the tiebreaker.

---

## 5. Signature devices

| Device | Class | Ravens treatment |
|---|---|---|
| Slab wordmark | `.wordmark` | Purple fill, white keyline, black drop |
| Pennant ribbon | `.ribbon` | UI gold, black text, black drop |
| Section bar | `.section-bar` | Purple, white caps text, 3px gold underline |
| Panel + title strip | `.panel`, `.panel-title` | Purple keyline; black strip with gold italic caps title |
| Icon circle | `.icon-badge` | Purple circle, white glyph |
| Stat tile | `.stat-tile` | Purple keyline; large numerals in purple or official gold |
| Emphasis | `.emphasis` | Bold italic purple |
| Sticker | `.sticker` | UI gold, black text, black keyline, tilted |
| Streak backdrop | `.bg-gameday` | Purple to black gradient with gold and white streaks |

---

## 6. Components

All use semantic tokens. Build in `src/components/ui/`, each shown in the dev-only `/styleguide` route.

| Component | Spec | States |
|---|---|---|
| **Button** | `.btn-primary` (**gold, black text**: submit, main action) · `.btn-secondary` (purple, white text) · `.btn-ghost` (purple outline). One primary per screen. 48px min. Sentence-case verb ("Submit picks"). | default · hover · pressed · focus · disabled · loading |
| **Section bar** | `.section-bar` | n/a |
| **Panel** | `.panel` with optional `.panel-title` | n/a |
| **Game card** | Kickoff time on top, two **Pick buttons** (away | home) with "at" between. Venue note (London) under the time. | unpicked · picked · locked · correct · missed · tie |
| **Pick button** | `.pick`, 56px. Selected = purple fill, white text, gold check, hard shadow. Tap again to deselect. `aria-pressed`. | default · selected · pressed · locked · correct (green) · missed (red tint + ✕) |
| **Sticky progress bar** | Under the safe area. Gold fill on a pale purple track on a purple/black bar. "9 of 14 picked", tap to jump to the next unpicked game. | n/a |
| **Text field** | `.field` + label above. 16px minimum. Inline errors with icon. | default · focus · filled · invalid · disabled |
| **Segmented choice** | Two big options (Cash | e-Transfer; Will do | Already did). Selected = same as a selected pick. | default · selected |
| **Copy field** | Read-only value (e-Transfer email) + "Copy". Confirms with "Copied". | default · copied |
| **Status badge** | `.badge-*`: paid (green), unpaid/pending (gold), open (purple), locked (red), final (solid purple), draft (gray). Word or icon always. | n/a |
| **Stat tile** | `.stat-tile` | n/a |
| **Countdown** | "1d 04h 12m to lock". Turns red-800 under 1 hour. | normal · urgent · locked |
| **Leaderboard row** | Place ("1", or "Tied 3") · name · record ("11 – 4") · best possible while games remain. Opens to that player's picks. "You", the winner's crown, and "Late entry" are words or icons, never color alone. Paid badge is admin only. | default · you · winner · tied · late |
| **Share bar** | How the pool split on one game: each team with its count and percent over a two-part bar. The winner gets a check and the word "Won". | undecided · decided |
| **Winner banner** | Gold crown, name, record, tiebreaker points, pot. The only animated element. | n/a |
| **Payments queue row** (admin) | Name, phone, declared method, one-tap **Paid** with undo. 56px. | unpaid · paid · flagged duplicate |
| **Pick row** (admin) | One numbered line of the paper sheet: number, away, home. Two Pick buttons with no kickoff time, for copying a sheet top to bottom. Long team names wrap. | unpicked · picked |
| **Photo field** (admin) | "Add a photo" opens the phone's camera or files. Shows that a photo is ready or saved, with Retake, View, and Remove. | empty · chosen · saved · error |
| **Roster row** (admin) | Name, Entered or Not yet, paid badge, how it came in, phone, note. One button: **Enter picks** (gold) when not in, **Edit picks** (outline) when in, **Late entry** after the lock. | not yet · entered · late · inactive |
| **Claim request** (admin) | Who is asking (typed name, phone, email), the likely roster matches as radio buttons with the best one chosen, then **Link to …** (gold) and Reject. Gold "Check" notes for a merge or a shared match. Reject opens an optional friendly note. | suggested · no match · already linked · rejecting |
| **Share card** | Purple card with the pool name and week, the player's display name, a "Picks locked in" sticker, and good-luck copy. Made to be screenshotted: never a pick, phone, email, or payment. | before lock · locked |
| **Paper sheet** (print) | Black on white, no backgrounds: the wordmark as text, week, fee, and lock time, numbered games with a tick box per team, tiebreaker, name, phone, and payment boxes. Large print raises the type one step. Controls are hidden when printing. | regular · large |
| **Player menu** (D-093) | A slim bar with a gold-outlined **Menu** button (the word, never only an icon) and a gold initials avatar that opens the profile, or sign-in for a guest. The button opens a left drawer (`.app-drawer`, native `<dialog>`: focus trapped, Escape and a tap on the dark area close it, focus returns to Menu). Rows are 48px: This week, Your profile, Season standings, Your history, Print a paper sheet (while a week is open), Link your history (unless already linked), then Text size, Share this pool, and for the commissioner Admin dashboard with an Admin badge. Sign out shows only for signed-in players, never guests. | guest · player · commissioner · open · closed
| **Counter screen** (D-095) | Back Office look with its own slim bar (Counter, The pool, Sign out), for Devon. A search box, three filters (Everyone, Not yet in, In), and one card per player: name, In or Not yet, Paid cash or Unpaid in words, and at most one primary button (**Enter picks** or **Paid cash**, with **Undo cash** when cash was taken). e-Transfers say "Paid by e-Transfer. The commissioner confirms those." instead of a button. Anything he can't do says "Ask the commissioner." No phone, email, note, or pick is ever shown. | not yet in · in, unpaid · in, paid cash · in, paid e-Transfer · locked · inactive |
| **Text size control** | Three pill buttons: Normal, Large, Extra large. Sets `data-text-size` on `<html>` and remembers it on the device. Lives in the player menu, so it works on every screen. In a light and an on-dark version. | normal · large · extra large |
| **Error screen** | Game Day backdrop, a panel titled "Something went wrong", one sentence, Reload the page, and Back to this week. | n/a |
| **Toast** | Bottom, `shadow-raised`. Same verb as the button. | success · error |
| **Empty state** | `.icon-badge` + one sentence + one action | n/a |

---

## 7. Two surfaces, one system

| | **Game Day** (players) | **Back Office** (admin) |
|---|---|---|
| Page background | `.bg-gameday` (purple to black, streaks) | `bg-page-backoffice` (`neutral-50`) |
| Surfaces | White panels, 3px purple keylines | White cards, 2px `line-subtle` borders |
| Headings | Italic condensed, caps bars, wordmark | Plain condensed, no italic, no wordmark |
| Gold used for | Primary button, ribbon, highlights | Primary action and pending badges |
| Red used for | Lock, deadline, errors | Errors and locked badges |
| Density | Roomy, one thing at a time | Denser rows (56px), tables, filters |
| Max width | `max-w-player` (30rem) | `max-w-backoffice` (72rem) |

---

## 8. Voice and microcopy

Friendly, plain, a bit of football-fan warmth. Exclamation marks only in the hero and winner reveal.

- **Sentence case** except the caps devices in §3.
- **Active verbs, same name through the whole flow.** Button "Submit picks", toast "Picks submitted".
- **Progress as a countdown to done:** "2 games left".
- **Errors say what happened and how to fix it. They don't apologize.**
- **Empty states are invitations:** "No picks yet. Tap a team to start."
- **Money and deadlines are explicit:** "$20 · Picks lock Saturday 11:59 PM".

| Moment | Copy |
|---|---|
| Incomplete submit | `2 games left` |
| Submit | `Submit picks` → toast `Picks submitted` |
| After submit | `You're in. Payment pending until confirmed.` |
| Returning, still open | `Edit picks until Saturday 11:59 PM` |
| Locked | `Picks are locked. See what everyone picked.` |
| e-Transfer | `Send $20 to [email]. Put your name in the message.` |
| Pending claim | `Pending approval` |
| Rejected claim | `We couldn't match you. Contact the pool.` |

---

## 9. Accessibility (non-negotiable)

- **Contrast:** all text pairs meet WCAG AA (§1.5). The official gold is restricted to large text and graphics.
- **Focus:** two-tone ring (white inner, purple outer), visible on white, purple, and black.
- **Targets:** 48px minimum, 56px for picks.
- **Text size:** body never below 16px. A **Text size** setting (Normal / Large / Extra large) sets `data-text-size` on `<html>` (112.5% and 125%). Test every screen at Extra large.
- **Not color alone:** statuses pair color with a word or icon. This matters more now that unpaid/pending and brand highlights are both gold.
- **Forms:** real `<label>`s, `aria-describedby` on errors, `aria-invalid` on bad fields.
- **Pick buttons** are `<button aria-pressed>`.
- **Motion:** respects `prefers-reduced-motion`.
- **Senior-friendly:** no hover-only controls, no tiny close buttons, no timed interactions.

---

## 10. Assets and IP

- **Colors are fine to use.** Team colors aren't ownable, and the pool is a fan community.
- **Don't use Ravens, Bills, or any NFL logos, helmets, raven-head marks, or uniform marks** on the website. That includes the Ravens' raven-head logo, which would be the obvious temptation now. This is my judgment call, not legal advice.
- **Exception (D-053):** the commissioner approved the supplied artwork in `docs/BRAND_ASSETS.md` as is, including the round Tuna badge with Ravens and NFL marks. The rules in this section still apply to any other artwork.
- **The mascot needs a recolor** (unless using the approved badge). On the paper sheet Tuna wears a Bills cap and jersey with Bills logos. For the site, redraw or re-export him in **purple, black, and gold with a neutral emblem** (a "T" or fish), keeping the sunglasses, grin, number 69, and TUNA belt buckle.
- Team names on game cards are plain text, with no logos.
- Ask whoever produced the sheet for layered or vector originals. The file on hand is a flattened raster.

| Asset | Format | Notes |
|---|---|---|
| Tuna mascot (bust + full body) | SVG or transparent PNG @2x/@3x | Ravens palette, neutral marks |
| Wordmark lockup | SVG | Live text via `.wordmark` and `.ribbon`, SVG for social cards |
| Favicon / app icon | SVG + 512 PNG | Tuna face or "T" on purple |
| Social share image 1200×630 | PNG | Wordmark, week number, "Make your picks" |
| Icon set | `lucide-react` + custom football glyph | Rendered in `.icon-badge` |

---

## 11. Implementation

```
src/styles/tokens.css      <- variables (single source of truth)
src/styles/brand.css       <- signature components (.wordmark, .panel, .pick, ...)
tailwind.preset.cjs        <- Tailwind v3 preset reading the tokens
```

```js
// tailwind.config.cjs
module.exports = {
  presets: [require('./tailwind.preset.cjs')],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
};
```
```css
/* src/index.css */
@import './styles/tokens.css';
@tailwind base;
@tailwind components;
@tailwind utilities;
@import './styles/brand.css';
```

- `theme.colors` is **replaced**, so only brand and semantic colors exist. A stray `bg-blue-500` won't compile.
- Prefer **semantic** utilities (`bg-surface`, `text-ink-muted`, `border-line-strong`, `bg-action-primary text-action-primary-text`) over raw ramp steps.
- **Always pair `bg-action-primary` with `text-action-primary-text`** (black). White text on gold fails contrast.
- Add a dev-only **`/styleguide` route** rendering every component in every state, with one **axe** accessibility check against it in CI.

### Where this lands in the plan

- **Sprint 0:** token files, fonts, preset, `/styleguide` with Button, Panel, Section bar, Badge, Field.
- **Sprint 2:** Game card, Pick button, Progress bar, Segmented choice, Copy field, Stat tile, `.bg-gameday`, wordmark lockup.
- **Sprint 3:** Back Office shell, Payments queue row, Toast.
- **Sprint 6:** Winner banner and crown reveal.
- **Sprint 9:** accessibility audit against §9.

---

## 12. Open decisions

1. **UI gold vs. official gold on buttons** (§1.2). Default: brighter UI gold `#D9AF26`.
2. **Ravens red.** Some sources list only purple, black, and gold as the Ravens' official colors, and others include red `#C60C30`. I kept red, but only for urgency and errors. Drop or keep?
3. **Mascot recolor.** Needs layered or vector art (§10).
4. **Exact typefaces.** Confirm against the original artwork.
5. **Game Day background.** Streaks only (default, fast) or add a blurred stadium photo?
6. **Dark mode.** Not in v1. Game Day is already dark, and Back Office is a light tool.
