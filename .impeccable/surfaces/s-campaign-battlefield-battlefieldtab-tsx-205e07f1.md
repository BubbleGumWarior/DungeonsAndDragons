---
version: 1
slug: "s-campaign-battlefield-battlefieldtab-tsx-205e07f1"
primary_target: "frontend/src/components/campaign/battlefield/BattlefieldTab.tsx"
related_targets: []
---

# Battlefield tab

Mode: Operate. Redesign of an existing surface inside the established app world (dark base, seasonal accent, Cinzel, lucide). User picked: scope = tab + panels + modals; layout = map stage + command rail; pain points = cluttered DM button row, army tokens, centered modal panels, overall look.

## Direction contract

THESIS: The map is the war table and the rest is staff instruments at its edge: a single command rail replaces the rainbow button row and the centered modals. Refuses the card-grid-plus-modal arrangement.

OWN-WORLD: Warm charcoal field tinted toward the app accent, 1px brass hairlines, Cinzel only for battle name and phase titles, tabular numerals everywhere. Armies are square wargame counters (faction band, lucide unit glyph, troop count, movement bar), not emoji discs. Cartographic details drawn from real data: a scale bar in feet, live range and movement rings. Status colour is restrained: accent = active, steel = planning, crimson = resolution; no gradients on buttons.

STORY: A player glances at the rail and knows the round, the phase, what they owe (lock a goal, move) and what is blocking the DM. The DM advances the battle with one clear button and finds map, lighting, invite and AI-army tools where they are used.

FIRST VIEWPORT: Left ~70%: the map filling the stage, thin top scrim with map tools (DM) and scale bar bottom-left; counters on the map; selected army shows dashed movement ring and solid range ring. Right 380-440px rail: battle title and terrain, round track (segments), phase steps, one primary action, then Roster and Orders tabs. Empty state is a field manual (phases + reach table), not a dashed box.

FORM: Map stage + command rail (option 1 of 3 offered, user-chosen). Seed key: none. WAIVER: the user chose this structure from three offered, so no concept roll was run (disclosed, not skipped silently). Dialogs: task dialogs are a right-hand drawer (bottom sheet on phones) so the map stays visible; only the map picker and final scores stay centred.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
