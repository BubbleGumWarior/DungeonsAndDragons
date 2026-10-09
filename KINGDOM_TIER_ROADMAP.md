# Kingdom Tier Roadmap (Tiers 1–10)

Companion to BUILDING_TIER_MATRIX.md. The matrix says *which buildings* exist at each tier; this says *what new mechanic* each tier introduces. Tiers 1–5 are documented from what is shipped. Tiers 6–10 are the agreed design (revised after review).

Guiding rule for tiers 6–10: **the DM handles anything narrative or inter-kingdom by hand.** The game only automates what is purely a kingdom-internal economy loop; everything else is a request/approval flow or a manually-managed record.

## The pattern: one new system per tier

| Tier | New mechanic | What it adds | Status |
|---|---|---|---|
| 1 | Food & survival | Housing, storage, hunter/vegetable worker lanes, worker assignment | Shipped |
| 2 | Raw resource lanes | Stone, iron and research lanes (Quarry, Mine, Research Lab) and a faith lane (Faith Temple). Barracks and Palisades appear | Shipped |
| 3 | Infrastructure & military | Builder's Hut, the six military production chains and support buildings, Trade Post, animals, prisons and slaves, Migrant Camp. Legendary slot #1 | Shipped |
| 4 | Gold economy | Gold becomes its own pool (Bank chain, Tavern gold lane). Soldiers and population draw daily gold upkeep | Shipped |
| 5 | Civic stability & docks | Unrest, production penalty and revolts, countered by civic chains. Boat Yard plus Trading and Migration Docks. Military Dock stays a placeholder | Shipped |
| 6 | **Industry & refined goods** | Workshops turn raw resources into refined goods that later builds require | Proposed |
| 7 | **Espionage missions** | Player requests a mission, DM resolves it, player watches a progress bar | Proposed |
| 8 | **Mana & powered buildings** | Mana pool and worker lane; tier 8+ buildings draw mana per long rest or go unpowered | Proposed |
| 9 | **Provinces & governors** | Satellite provinces run by governors | Proposed (as originally written) |
| 10 | **Wonders** | One per campaign, one per fief, DM-managed and DM-placeable on NPC kingdoms | Proposed |

---

## Tier 6 — Industry & refined goods
*(Replaces the naval proposal. Naval stuff, including the Boat Yard and Military Dock, stays placeholder and DM-managed.)*

**Why this fits:** the matrix already names the tier 6 buildings in industrial terms: *Industrial Sawmill*, *Industrial Quarry*, *Industrial Mine*, *Heavy Quarry Works*, *Construction Guildhall*, *Manor House*. Tier 6 is where the economy stops being raw extraction.

**Mechanic:** a refining layer on top of the existing lanes.
- New **Workshop** chain (e.g. Sawyer's Workshop → Foundry → Stonecutter's Yard) with a worker lane, like the other production lanes.
- Workers there convert raw stock into three **refined goods**: *Planks* (from wood), *Steel* (from iron), *Dressed Stone* (from stone). Conversion costs a ratio, for example 3 raw → 1 refined.
- Refined goods are stored in their own pools and are **required in part by tier 7+ upgrade costs and tier 6+ building costs**. This is what makes tier 6 matter: the player cannot skip it by stockpiling raw materials.
- Industrial Sawmill, Industrial Quarry and Industrial Mine get a throughput bonus when a matching Workshop is staffed.

**Pressure:** workshops draw raw stock and add a gold upkeep, so over-converting starves normal building.

**Unlocks:** industry research, tier 6 buildings, legendary slot #4.

---

## Tier 7 — Espionage missions

**Mechanic:** a player-requested, DM-resolved mission. No other functionality: it is a request, a hidden timer and an outcome message.

### Player flow
1. A **Request Espionage** button appears in the Kingdom tab once the fief is tier 7.
2. The player fills in:
   - **Target name** (free text, typed by hand)
   - **Number of spies** to send, per spy type (see below)
3. On submit, the spies are **removed from the reserve** immediately and a mission is created in a *Pending* state.

### DM flow
1. A modal opens for the DM: *"{Player} wants to send {N} spies to {target}."*
2. The DM enters:
   - **Days** the mission will take
   - **Success rate** (percent)
3. On submit the mission becomes *In progress*. The success roll is made when the timer finishes (server-side, using the DM's rate), not shown to anyone.

### Player-facing progress
- The player sees **only a progress bar**, never the day count or success rate. They have to guess how long it will take from how fast the bar moves.
- **Failure:** the bar stops where it is and turns **red**, with a message that the spies were caught and killed.
- **Success:** the bar fills and turns **green**, with a message that the mission succeeded.
- Nothing else happens automatically; the DM narrates any result.

### Spies and the reserve
- Spies come from the reserve for **every spy-type unit, across all rank tiers**, not only the unit named "spy". The Thieves' Den lines already define Scout, Spy and Assassin chains (`thieves_den` → `scout_lodge`, `spy_network`, `assassin_den` and their upgrades in [kingdoms.js](backend/routes/kingdoms.js)), so the picker lists each spy-line unit type the player has in reserve and lets them choose a count for each.
- On **failure**, the sent spies are gone (killed).
- On **success**, the spies **stay at the target location** (status *Stationed*). They are not returned automatically.
- While stationed, the player can press **Recall Spies**. This starts a fixed **30-day** return trip (status *Returning*); when it finishes the spies go back into the reserve. The player is told the 30 days up front, since this timer is not secret.
- A mission that the DM cancels refunds the spies.

### Data
A `espionage_missions` record: fief, target text, spies sent (JSON by unit type), status (`pending` / `in_progress` / `failed` / `stationed` / `returning` / `returned` / `cancelled`; `stationed` is the "succeeded" state shown as green), recall start day, days total, days elapsed, success rate, created and resolved timestamps. The progress percentage is computed from days elapsed over days total and is the only timing value the player-facing API returns.

**Unlocks:** espionage research, tier 7 buildings, legendary slot #5.

---

## Tier 8 — Mana & powered buildings

### Mana pool
- Mana is a dedicated pool with its own storage cap, like gold's Bank pool at tier 4.
- It is generated by **Mana Wells**: a new building chain that adds a **Mana worker lane**, so people are assigned to mana generation the same way they are to stone or faith. Each assigned worker adds mana per day; the Well also has a small passive trickle. Upgraded wells raise the per-worker rate and the lane's worker cap, following the usual "+1 per upgrade step and +worker efficiency" matrix rule.

### Powered buildings
- Once a fief reaches tier 8, any building that is itself **tier 8 or higher** (the BUILDING_TIER_MATRIX column, i.e. a level 8 house or above) draws mana **every day**, equal to its own tier. A level 6 house in a tier 8 fief draws nothing. Mana Wells are exempt.
- If there is **not enough mana** for a building at the long rest, that building is **Unpowered** and **does not produce its benefit** until it can be powered again. This covers production, capacity bonus, stability bonus and any other effect.
- **Power priority when mana is short:**
  1. **Housing and food buildings first**: housing, hunter, vegetable/farm, granary and animal chains. Within this group, highest level first.
  2. **Everything else**, in order of **building level, highest first**.
  Ties are broken by oldest building.
- Mana Wells are exempt from drawing mana, otherwise a shortage could shut off the thing that fixes it.
- A consequence to be aware of: with highest-level-first, a mana shortage hits the lowest-level buildings (Tents, early Lodges) first, which switches off housing capacity and can push population into emigration. See open questions.

### UI
- **Unpowered buildings are clearly marked in the building list** with a distinct icon, a "No mana" badge and dimmed styling. Hovering explains what it is missing and how much mana it needs per long rest.
- The resource bar shows mana stored, daily production, and daily draw so the player can see a shortfall before it happens.
- Opening the fief when anything is unpowered shows a banner.

**Storage jumps ×10 at tier 8.** Because storage now runs on magic, the Vaulted Warehouse (tier 8 storage form) gives **10× the tier 7 upgrade's capacity**. The tier 7 Advanced Warehouse (`storage_advanced`) gives +700 today, so:

| Tier | Storage building | Capacity per building |
|---|---|---|
| 7 | Advanced Warehouse | +700 (unchanged) |
| 8 | Vaulted Warehouse | **+7,000** (currently 800 in [Campaign.js:733](backend/models/Campaign.js:733)) |
| 9 | new tier 9 storage form | **+70,000** |
| 10 | new tier 10 storage form | **+700,000** |

The same ×10 step carries through tiers 9 and 10. At tier 10 about 8 storage buildings hold 5M of one resource. The matrix has blank tier 9–10 cells in the Storage row, so those two forms need names (for example *Arcane Vault* and *Dimensional Depository*).

**Pressure:** mana is a recurring cost on top of the build cost. Every building costs mana at tier 8, and workers placed in the mana lane are not working elsewhere.

**Unlocks:** mana research, tier 8 buildings, legendary slot #6.

---

## Tier 9 — Provinces & governors
*(Approved concept; the details below are what was built.)*

**Hook:** at tier 9 housing is *Noble Residence* and a single fief starts to be unmanageable. Population keeps rising, which is the tier 5 unrest problem at scale.

- **Founding:** a tier 9 fief can have up to 3 provinces. Founding one costs 150,000 wood, 100,000 stone, 100,000 gold and 10,000 steel, and the player sends citizens (free adults only) to settle it. A province holds up to 2,000 people.
- **Governor:** the player names a governor and picks a specialty: Steward (+25% tribute), Warden (+12 loyalty) or Scholar (sends research). A province with no governor sends half the tribute and has lower loyalty.
- **Tribute:** the player sets what share of the province's output (food, gold, wood) is sent to the fief each day. Higher tribute lowers loyalty.
- **Loyalty:** moves 2 a day toward a target (70, minus tribute/2, minus 30% of the fief's unrest, plus garrison and Warden bonuses). Below 15 there is a daily chance (up to 10%) that the province breaks away and its people are lost.
- **Improvements:** Garrison (+8 loyalty per level), Market (+25% output per level), Granary (+30% food per level), three levels each, paid in gold.
- **Moving people** out of the capital eases its unrest and housing pressure; they can be brought home again.
- **DM:** can set loyalty directly and declare a province broken away or restored.

---

## Tier 10 — Wonders

**Mechanic:** Wonders are large, unique, hand-managed buildings. **They have no automated functionality at all.** Building one records that it exists; the DM decides and applies what it does, manually.

### Initial Wonder list
Names and flavor only. No mechanical effect in code.

| Wonder | Flavor |
|---|---|
| Pantheon of the Gods | A great shrine to every faith in the realm |
| Grand Academy of Sciences | A city-sized center of learning and invention |
| Titan Forge | A forge on a scale no mortal smith should need |
| Colossus of the Realm | A monumental statue and a symbol of rule |
| Eternal Library | A vault of all written knowledge |
| Spire of the Archmage | A tower anchored in the ley lines |
| Hanging Gardens | A terraced paradise of impossible harvests |
| Imperial Mausoleum | A tomb-city for kings and heroes |

More can be added by the DM.

### Rules
1. **One of each Wonder per campaign.** If player 1 builds the Pantheon, no one else can start or finish it. Player 2 must pick a different Wonder.
2. **One Wonder per fief.** A fief that already holds a Wonder cannot build or be given a second.
3. **DM can set a Wonder as built** on any fief, including **NPC kingdoms**. A Wonder placed this way counts as existing for rule 1.
4. **Players must destroy it to claim it.** If an NPC kingdom (or another player) holds the Pantheon, a player who wants one cannot build it until the DM marks it destroyed. Destruction is done by the DM after the players have taken it down in play.
5. When a Wonder is destroyed it frees up, and can be built again, by anyone.
6. Building one is a long multi-stage project at tier 10 cost (see below). While it is being built it **reserves** the Wonder, so another player cannot start the same one.

### DM controls
- A Wonders panel listing every Wonder across the campaign, with its owner, status (*Available / Under construction / Built / Destroyed*) and fief.
- Buttons to **Set as built** on a chosen fief (including NPC kingdoms), **Mark destroyed**, and **Clear** an under-construction reservation.
- A free-text notes field on each Wonder where the DM records what it does.

**Unlocks:** legacy research and the last legendary slot (#8).

---

## Upgrade costs: exponential growth

Tiers 1–5 are unchanged. The new tiers follow a **geometric curve** so each tier is a much larger commitment than the last. Tier 10 is anchored at roughly **5,000,000 each of wood, stone and iron**.

Between tier 5 and tier 10 each resource grows by a fixed ratio per tier (derived from tier 5 and the tier 10 target), so wood is about ×3.0 per tier, stone about ×3.5 and iron about ×4.1. Iron grows fastest because it is the scarcest and the hardest to scale.

Refined goods now scale as a large share of the raw cost, so the workshops stay busy and the player cannot buy their way past tier 6. Each refined good is tied to its raw partner: **Planks** ↔ wood, **Dressed Stone** ↔ stone, **Steel** ↔ iron. The refined requirement is a percentage of that tier's raw requirement, rising each tier (15% → 25% → 35% → 50%).

| Tier | Time | Wood | Stone | Iron | Gold | Planks | Dressed Stone | Steel |
|---|---|---|---|---|---|---|---|---|
| 2 | 14 days | 200 | — | — | — | — | — | — |
| 3 | 20 days | 300 | 100 | 50 | — | — | — | — |
| 4 | 28 days | 4,500 | 2,000 | 1,000 | (shipped) | — | — | — |
| 5 | 35 days | 19,500 | 9,000 | 4,500 | 6,000 | — | — | — |
| **6** | 45 days | 59,000 | 32,000 | 18,000 | 20,000 | — (workshops unlock here) | — | — |
| **7** | 60 days | 179,000 | 113,000 | 74,000 | 67,000 | 27,000 | 17,000 | 11,000 |
| **8** | 80 days | 544,000 | 399,000 | 302,000 | 224,000 | 136,000 | 100,000 | 75,000 |
| **9** | 105 days | 1,649,000 | 1,413,000 | 1,230,000 | 748,000 | 577,000 | 495,000 | 430,000 |
| **10** | 140 days | 5,000,000 | 5,000,000 | 5,000,000 | 2,500,000 | 2,500,000 | 2,500,000 | 2,500,000 |

Tier 9 also needs 10,000 mana and tier 10 needs 100,000 mana in stock when the upgrade starts. Tier 8 needs none, since Mana Wells are tier 8 buildings. Mana Wells hold 5,000, Deep Mana Wells 25,000 and Ley Fonts 125,000.

Because conversion is 3 raw → 1 refined, the tier 10 refined requirement alone represents about 7.5M raw of each type on top of the 5M raw cost, so reaching tier 10 takes roughly 12.5M of each raw resource in total.

Tier 6 buildings and tier 7+ buildings should draw refined goods in their own build costs too, so workshops stay in use after the upgrades.

Wonders themselves should cost on the order of the tier 10 upgrade again per project, so the end of the tree is a second large investment, not a free reward.

### Notes on tuning
- Gold is scaled on its own curve (6,000 at tier 5 up to 2.5M at tier 10) because gold income is a different system. Revisit it against real daily gold income at tier 8+.
- Storage is handled by the ×10 jumps at tiers 8, 9 and 10 (see Tier 8). Until tier 8, storage is still small (+700 at best), so tier 6 and 7 costs of 100k+ need enough storage buildings. Check that tier 6 and 7 costs are payable with the storage a player can realistically have by then, since the ×10 jump only arrives at tier 8. Each refined good also needs a pool and a cap, probably sharing the same general storage.
- Days follow a gentler curve than resources (+10 to +35 per tier) so a tier takes weeks, not forever.

---

## Decisions made

1. **Housing under a mana shortage:** housing is powered first, together with the food buildings, so a shortage hits other high-level buildings first.
2. **Mana draw:** only buildings that are tier 8 or higher draw mana. Draw per day equals the building's own tier.
3. **Spy recall:** fully automatic 30-day return, no DM approval.
4. **Storage names:** Arcane Vault (tier 9) and Dimensional Depository (tier 10).
5. **Spy types:** Spy and Master Spy can be sent. Edit `SPY_UNIT_TYPES` in `backend/utils/espionage.js` to widen that.

## Known balance problem: storage before tier 8

Storage only jumps ×10 at tier 8. Before that the best single building holds +700, and the general warehouse holds wood, stone, iron and the refined goods together. The tier 6 to tier 8 upgrade costs (about 110,000 up to 1,200,000 of raw resources in the warehouse at once) therefore need hundreds to thousands of storage buildings. Decide whether to scale the tier 5–7 storage buildings up as well, or to let upgrade costs be paid from a separate pool.

## Implementation status

Built and tested on a scratch database:
- Generic tier upgrade for tiers 6–10 (`backend/utils/kingdomTiers.js`, `POST /kingdoms/fiefs/:id/upgrade-tier-next`) and the player Tier Guide (info button).
- Tier 6: three refining lanes (Planks, Dressed Stone, Steel) and their workshops.
- Tier 7: espionage requests, DM approval modal, progress bars, 30-day recall.
- Tier 8: Mana Wells (lane, pool, capacity), daily power check, Unpowered marking, magic storage ×10.
- Tier 9: provinces and governors.
- Tier 10: Wonders (catalog, one per campaign, one per fief, DM placement on NPC holders, destroy, notes).

Not changed: tiers 2–5 keep their original hand-written upgrade routes and columns.
