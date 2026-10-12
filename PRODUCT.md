# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
A Dungeon Master and their players running a D&D campaign together, usually in one session with the app on a shared or personal screen in a dim room. The DM drives phases, fog and enemy armies; players command the armies they brought and lock orders each round.

## Product Purpose
A campaign companion: character sheets, kingdom management, combat, world map and a mass-combat "Battlefield" tab. The Battlefield runs armies on a map across rounds: Planning (setup, invites, AI armies), Goal selection (each army locks one goal), and Resolution (goals rolled, results adjusted by the DM and applied). Success is a table that reads the state of a battle at a glance and moves it forward without friction.

## Capabilities and Constraints
- Realtime over Socket.IO: army moves, goal locks, round advances and map changes broadcast to everyone.
- Positions are stored as % of the map; distances use a fixed 20/3 ft per percent in both axes. Melee range 20 ft, archers 150 ft, artillery 300 ft; army movement 100 ft (cavalry 300, artillery 50, covert 150) per round. Non-DMs cannot exceed remaining movement.
- Darkness/fog and lighting nodes hide enemy armies from players (full, partial silhouette, hidden). The fog canvas must stay over the map.
- Maps are uploaded per campaign and picked by the DM.

## Brand Commitments
The app theme (dark base, seasonal accent via `--theme-accent-rgb`, Cinzel display via `--font-fantasy`, lucide icons, shared Kingdom controls `.kt-ui-*`) is the established world; new surfaces inherit it. The user prefers steppers and click-to-adjust controls over dropdowns and bare number inputs.

## Product Principles
- The map is the table; everything else is a staff instrument at its edge.
- One primary action per phase; secondary controls appear where they are needed.
- Never hide state that decides a move: movement left, range, who has locked orders.
- Respect the fog: players must never learn what the darkness hides.
