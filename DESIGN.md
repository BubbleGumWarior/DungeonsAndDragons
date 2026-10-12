---
name: Dungeons and Dragons Campaign Companion
description: A dim-room campaign companion in warm charcoal and seasonal brass, where the Battlefield map is the war table and every control is a staff instrument at its edge.
colors:
  accent-brass: "#d4c19c"
  accent-gold: "#c9a961"
  accent-gold-bright: "#ddbf5f"
  accent-gold-deep: "#b8941f"
  accent-highlight-cyan: "#00d9ff"
  ground-black: "#0f0f0f"
  surface-black: "#1a1a1a"
  surface-raised-black: "#2d2d2d"
  bf-ground: "#1a160f"
  bf-panel: "#1f1a12"
  bf-drawer: "#1c1710"
  bf-board-void: "#070706"
  ink-primary: "#ffffff"
  ink-secondary: "#e8e8e8"
  ink-muted: "#b8b8b8"
  bf-ink-quiet: "#a29d90"
  phase-plan-steel: "rgb(132, 168, 204)"
  phase-resolve-crimson: "rgb(226, 108, 98)"
  status-good: "rgb(124, 205, 143)"
  status-bad: "rgb(238, 116, 106)"
  ring-move: "rgb(188, 246, 204)"
  ring-reach: "rgb(255, 214, 120)"
  faction-a-fallback: "#3b82f6"
  faction-b-fallback: "#ef4444"
  on-accent-ink: "#14110a"
typography:
  display:
    fontFamily: "Cinzel, serif"
    fontSize: "1.7rem"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "normal"
  headline:
    fontFamily: "Cinzel, serif"
    fontSize: "1.4rem"
    fontWeight: 700
    lineHeight: 1.2
  title:
    fontFamily: "Segoe UI, Tahoma, Geneva, Verdana, sans-serif"
    fontSize: "0.98rem"
    fontWeight: 800
    lineHeight: 1.2
  body:
    fontFamily: "Segoe UI, Tahoma, Geneva, Verdana, sans-serif"
    fontSize: "0.84rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Segoe UI, Tahoma, Geneva, Verdana, sans-serif"
    fontSize: "0.74rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0.04em"
rounded:
  xs: "2px"
  sm: "4px"
  counter: "6px"
  md: "8px"
  panel: "9px"
  lg: "12px"
  dialog: "14px"
  pill: "999px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
  xxl: "3rem"
  rail-pane: "1.1rem"
components:
  button-default:
    backgroundColor: "rgba(14, 13, 10, 0.82)"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.md}"
    padding: "0.35rem 0.8rem"
    height: "2.15rem"
  button-primary:
    backgroundColor: "{colors.accent-brass}"
    textColor: "{colors.on-accent-ink}"
    rounded: "{rounded.md}"
    padding: "0.35rem 0.8rem"
    height: "2.15rem"
  button-primary-lg:
    backgroundColor: "{colors.accent-brass}"
    textColor: "{colors.on-accent-ink}"
    rounded: "10px"
    height: "2.6rem"
  button-danger:
    textColor: "{colors.status-bad}"
    rounded: "{rounded.md}"
  rail:
    backgroundColor: "{colors.bf-panel}"
    rounded: "{rounded.lg}"
  stage:
    backgroundColor: "{colors.bf-ground}"
    rounded: "{rounded.lg}"
  counter-face:
    backgroundColor: "#15130e"
    textColor: "#f1ede2"
    rounded: "{rounded.counter}"
    width: "3.7rem"
  drawer-dialog:
    backgroundColor: "{colors.bf-drawer}"
    textColor: "{colors.ink-secondary}"
    width: "34rem"
  chip:
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.pill}"
    height: "2.1rem"
    padding: "0.3rem 0.8rem"
  chip-selected:
    textColor: "{colors.accent-brass}"
    rounded: "{rounded.pill}"
---

# Design System: Dungeons and Dragons Campaign Companion

## Overview

**Creative North Star: "The War Table"**

The app is a dark, warm-charcoal companion used in dim rooms, with one seasonal accent threaded through every border, focus ring and active state. The Battlefield tab is the clearest expression of it: the map is the table, and everything else (round track, phases, orders, dialogs) is a staff instrument at its edge. Colour is restrained; the accent means "active", steel means "planning", crimson means "resolution", and green/red are reserved for good/bad state. Numerals are tabular everywhere so troop counts and distances do not jitter.

Density is moderate to high: small type (0.7 to 0.98rem) on 1px brass hairlines, with generous reading space only in the empty-state field manual and dialogs. Cinzel is rationed to names and titles; all working text is the system sans stack. Surfaces are tinted charcoal, not black, and the accent tint lives in lines and fills at low alpha.

**Key Characteristics:**
- One seasonal accent via `--theme-accent-rgb` (Brass by default; the theme file swaps it per season/theme). Never hard-code the accent hex.
- 1px accent-tinted hairlines (16% rest, 36% strong) instead of filled borders.
- Cinzel only for battle name, phase/dialog titles, and manual headings.
- Armies are square wargame counters (faction band, lucide unit glyph, troop count, movement bar).
- Cartographic details are drawn from real data: scale bar in feet, dashed movement ring, solid range ring.
- Drawer dialogs keep the map visible; only catalogues and interruptions are centred.

## Colors

A warm charcoal field with a single seasonal metal accent, three fixed state hues, and per-army faction colours supplied by data.

### Primary
- **Seasonal Brass** (#d4c19c, default theme; `--theme-accent-rgb: 212, 193, 156`): the only accent. Primary buttons, selected rows and tabs, focus rings, round-track "done" segments, grid and dot-field tints at low alpha. It changes with the theme (olive, rose, steel-blue and other variants exist in theme.css), so reference the variable, not the hex.
- **Gold ladder** (#c9a961, #ddbf5f, #b8941f, plus `--text-gold` = metallic gold): used by the wider app for headings and gradients; in the Battlefield only `--text-gold` is used, for titles, selected tab text and link-buttons.

### Secondary
- **Planning Steel** (rgb 132, 168, 204): the Planning phase tone, info notes and info tags.
- **Resolution Crimson** (rgb 226, 108, 98): the Resolution phase tone in the rail (status banner, current phase step, alert counts).

### Tertiary
- **Good Green** (rgb 124, 205, 143): locked orders, completed state, healthy movement, "good" tags.
- **Bad Coral** (rgb 238, 116, 106): spent movement, low troops, danger buttons, over-range readout.
- **Move Mint** (rgb 188, 246, 204) and **Reach Amber** (rgb 255, 214, 120): map overlays only (movement ring and trace; range ring and legend).
- **Faction colours**: data-driven per army (`faction_color`, fallback #3b82f6 for team A and #ef4444 for team B); text on a faction fill is chosen by contrast between #14110a and #ffffff.

### Neutral
- **Ground Black** (#0f0f0f), **Surface Black** (#1a1a1a), **Raised Black** (#2d2d2d): app-wide base layers.
- **Battlefield Ground** (#1a160f), **Rail Panel** (rgba 31, 26, 18 at 0.97, about #1f1a12), **Drawer** (#1c1710), **Board Void** (#070706): the warm, brown-tinted charcoal stack of the Battlefield.
- **Ink** (#ffffff primary, #e8e8e8 secondary) and **Quiet Ink** (#a29d90): the Battlefield's tertiary text, a warm grey for descriptions and metadata. `--text-muted` (#b8b8b8) is the app-wide equivalent.
- **Ink on Accent** (#14110a): text and check marks on any accent or state fill.

### Named Rules
**The One Voice Rule.** The accent is the single decorative colour. Phase tones, good/bad and faction colours are information, never ornament.

**The Variable Accent Rule.** Accent colour is always `rgb(var(--theme-accent-rgb))` or an alpha of it, so the season can re-tint the surface.

**The No Gradient Buttons Rule.** Buttons are flat fills. The theme's gold gradients exist for the wider app and do not appear on Battlefield controls.

## Typography

**Display Font:** Cinzel (serif fallback), via `--font-fantasy`
**Body Font:** Segoe UI, Tahoma, Geneva, Verdana, sans-serif, via `--font-primary`

**Character:** an engraved-name serif over a plain operating sans; the serif says "the story", the sans says "the numbers". Tabular numerals are on for the whole Battlefield.

### Hierarchy
- **Display** (700, 1.7rem, 1.12): the battle title in the rail head; balanced wrap.
- **Display, manual** (700, clamp(1.7rem, 3vw, 2.4rem), 1.1): the empty-state field manual heading.
- **Headline** (700, 1.4rem, 1.2): dialog titles; 1.12rem for sub-headings inside dialogs (invites).
- **Title** (800, 0.98rem): team names, result names, field-manual subheads; 0.9 to 0.95rem for goal and army names.
- **Body** (400 to 600, 0.78 to 0.88rem, 1.45 to 1.5): descriptions, notes, form text; manual lead copy is 0.98rem at 1.6, max 52ch; dialog descriptions cap at 56ch.
- **Label** (700 to 800, 0.7 to 0.76rem): counter band (0.72rem, +0.04em tracking), tags, counts, fact captions. Sentence case; the Battlefield does not use uppercase labels.

### Named Rules
**The Cinzel Ration Rule.** Cinzel appears only on names and titles (battle, dialog, manual, invite headings, empty-board caption). Never on buttons, tabs, table cells or figures.

**The Tabular Figures Rule.** Any number that changes (troops, feet, scores, rounds) sits in a tabular-numeral context.

## Layout

A two-column war table: a flexible map stage and a command rail of `clamp(23.5rem, 29vw, 28rem)`, 1rem gap, total height `clamp(36rem, 100vh - 9.5rem, 64rem)`. Below 1080px it stacks, with the stage at `min(70vh, 46rem)` and the rail natural height. The rail is fixed-order: head (title, terrain, round track, phase steps, one primary action), tab strip (Roster, Orders, Resolution), scrolling body, optional foot.

Spacing follows `--spacing-*` (0.25, 0.5, 1, 1.5, 2, 3rem) at the app level; the Battlefield works mostly in 0.1 to 1.3rem steps, with 1.1rem as the pane gutter and 1.35rem in dialogs. Lists are separated by hairlines and gaps rather than nested cards. Phones (max 720px): hint and map-tool labels hide (icon-only tools), scale bar hides, legend centres along the bottom, counters shrink to 2.7rem and hide names except when selected or hovered, drawers become bottom sheets (max 92vh).

The empty state is a two-column field manual (phases steps and a reach table) on the rail panel colour with a faint dot field, collapsing at 860px.

## Elevation & Depth

Hybrid: tonal layering by default, with soft black shadows only where an object physically sits above another. The stage has an inset vignette (`inset 0 0 90px rgba(0,0,0,0.65)`); the board floats on it (`0 18px 50px rgba(0,0,0,0.6)`); the rail carries a soft drop plus a 6% white inset top highlight. Counters lift on hover and drag. Dialogs use a one-sided shadow (`-24px 0 60px rgba(0,0,0,0.55)` for drawers, `0 30px 80px rgba(0,0,0,0.75)` centred). All shadows are blurred and black; none are offset hard shadows or glows (the theme's `--shadow-gold` is not used here).

### Shadow Vocabulary
- **Counter rest** (`0 7px 14px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.1)`): army counters; hover deepens to 11px/18px and translates -2px, drag scales 1.07.
- **Readout** (`0 8px 22px rgba(0,0,0,0.6)`): the floating distance pill.
- **Rail** (`0 14px 40px rgba(0,0,0,0.45)` plus inset top highlight).

### Named Rules
**The Seated Shadow Rule.** Shadows are black, blurred and vertical; they say "this sits on the table". Colour glows are not used for depth.

## Shapes

Soft-cornered rectangles with a few exact silhouettes: counters 6px, small tags and swatches 2 to 4px, controls and rows 8 to 10px, panels (rail, stage, manual) 12px (`--radius-lg`), centred dialog 14px, bottom sheet 16px top corners, and pills (999px) for hints, chips, legends and the readout. Faction swatches are 2px squares, never circles; circles are reserved for radio marks and light nodes on the map. Borders are always 1px hairlines at accent alpha (1.5px on counters and chips marks); dashed borders mean tentative or placeholder (ghost counter, dashed chip, upload zone, movement ring).

## Components

### Buttons (Battlefield `.bf-btn`)
- **Shape:** 8px corners, 2.15rem tall (sm 1.8rem, lg 2.6rem at 10px radius and full width).
- **Default:** near-black translucent fill, 36% accent hairline, secondary ink, 0.8rem 600.
- **Primary:** flat solid seasonal accent, ink-on-accent text, 0.9rem 800; hover brightens 8%. One per phase.
- **Quiet:** transparent, quiet ink, hairline appears on hover. **Danger:** coral text and 40% coral border; tinted fill on hover.
- **States:** hover shifts border to 60% accent; active nudges 1px down; disabled 40% opacity; all transitions 0.18s on the `cubic-bezier(0.16, 1, 0.3, 1)` ease.

### Chips and Tags
- Chips are pills with a 36% accent border; selected is a 20% accent fill, full accent border, gold text. Tags are 4px-radius outlined labels with a tone (good, bad, warn, info).

### Inputs and Steppers
- Text inputs and textareas: 8px radius, 40% black fill, 36% accent border, accent outline on focus. Numbers are entered with the shared Kingdom `Stepper` (`.kt-ui-stepper`: pill, minus / readout / plus), never bare number fields or dropdowns; picking among options uses chip rows and pressed-state list buttons.

### Counter (army token)
Square wargame piece: 3.7rem wide (2.7rem compact), 6px corners, 1.5px faction border, faction-coloured name band with auto-contrast text, lucide unit glyph in the faction colour, bold troop count (coral when low), and a 4px movement bar (green, coral when empty) along the bottom. Name label floats beneath. Selected shows a 2px white outline; hovered shows an accent outline; silhouettes (fogged enemies) are grey, dimmed and non-interactive.

### Command Rail
Panel with a head (Cinzel title, collapsible terrain line, round track, phase steps, action area), a tab strip with an accent underline on the selected tab and count badges (phase-toned when alerting), and a thin-scrollbar body. The rail takes a `--phase-rgb` from its phase (steel plan, accent orders, crimson resolution, green completed) that tints the current segment, current phase step and status banner.

### Round Track and Phase Steps
Round track: a row of 6px-high segments, 2px radius; done at 55% accent, current in the phase tone with a 1px halo. Phase steps: three equal labels over a 2px underline that fills accent when done and the phase tone when current (800 weight).

### Rings and Overlays
SVG overlays on the map with non-scaling strokes: move ring dashed mint (coral when spent), reach ring solid amber, a black 5px casing ring beneath, dashed coral links, a dashed mint trace. Grid is accent hairlines at 7.5% spacing. A distance readout pill and bottom-left scale bar in feet are drawn on the stage.

### Drawer Dialog
Right-hand drawer, `min(34rem, 100vw)`, drawer-brown fill, strong left hairline, head / scrolling body / foot with hairline dividers, 0.2s scrim, 0.32s slide-in. Wide dialogs (map picker, final scores) are centred at `min(52rem, 100vw - 2rem)`; under 720px drawers become bottom sheets. Motion collapses under `prefers-reduced-motion`.

### Roster and Goal Rows
Pressed-state list buttons: hairline border on a 3.5% white fill; hover raises border to strong; selected is a 12 to 13% accent fill with a full accent border. Army rows add a 2.1rem faction glyph square, a name, subline and right-aligned figures, with a 3px health bar.

## Do's and Don'ts

### Do:
- **Do** colour with `rgb(var(--theme-accent-rgb))` and alphas of it; keep hairlines at 0.16 (rest) and 0.36 (strong).
- **Do** keep one flat primary button per phase, with ink-on-accent text (#14110a).
- **Do** use lucide icons at 11 to 19px, always paired with text or an accessible label.
- **Do** use Cinzel for names and titles only, and the system sans for everything operational.
- **Do** put task dialogs in the right drawer so the map stays visible; centre only catalogues and interruptions.
- **Do** use steppers and pressed-state chips or list buttons for numeric and choice input.
- **Do** show the state that decides a move (movement left, range, lock status) and respect the fog layer above the map.

### Don't:
- **Don't** use emoji discs or circles for armies or factions; counters and swatches are square.
- **Don't** use gradients on buttons or hard-offset shadows; shadows are soft, black and vertical.
- **Don't** add new hues for status; use steel, crimson, green and coral as established.
- **Don't** use bare number inputs or dropdowns where a stepper or chip row fits.
- **Don't** hard-code the accent hex or the season; read it from the variable.

## Not canonized (carried defects and drift)

- Battlefield buttons use 8px radius while the shared Kingdom controls (`.kt-ui-btn`, steppers, chips) are pills, so the Stepper sits in a differently shaped family from adjacent `.bf-btn`s; recorded as drift, not a rule.
- An inline hard-coded `#0f1a12` background on the "On the table" tag in the map picker bypasses tokens.
- Battlefield state hues (green rgb 124, 205, 143; coral rgb 238, 116, 106) differ slightly from the Kingdom controls' (74, 222, 128; 248, 113, 113); two near-duplicate semantic palettes coexist.
