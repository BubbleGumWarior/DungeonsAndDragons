# Village Tier 1-2 Implementation Plan

## 1. Scope
Implement a complete kingdom village loop for Tier 1 and Tier 2 using the existing campaign day system.

Included:
- DM grants kingdom to one or many players.
- Player kingdom naming flow.
- Initial capital village creation (Tier 1).
- Worker assignment and daily production.
- Building queue and completion logic.
- Tier 2 upgrade and unlock flow.
- Seasonal effects based on a 365-day cycle.
- Research and faith unlocks at Tier 2.
- Full API + socket + UI integration.

Excluded for this phase:
- Tier 3+ content.
- Building destruction and disasters.
- Advanced diplomacy/trade systems.
- Seasonal weather events beyond production modifiers.

## 2. Current Baseline (As Of This Plan)
Already implemented in codebase:
- Seasonal day metadata and day-based season cycle in backend campaign progression.
- Seasonal fields returned by day endpoints and advance-days summary.
- Season display in campaign UI day/rest area.
- Legacy kingdom drop migration removed from startup path.

Still required for full Tier 1-2 village gameplay:
- Kingdom model and routes.
- Naming flow -> capital fief bootstrap with default buildings/workers.
- Worker assignment endpoint with server validation.
- Building catalog and queue endpoints.
- Full production/build/research integration into daily loop.
- Tier upgrade endpoint and unlock state transitions.

## 3. Core Design Decisions
- Source of truth for time: campaigns.current_day.
- One deterministic season function, no separate season table.
- All schema changes through idempotent migrations.
- Server-authoritative simulation for workers, production, build progress, and unlocks.
- UI is optimistic where safe, but always reconciles with server responses/socket updates.
- Tier 1 and Tier 2 only; all formulas and content explicitly capped.

## 4. Data Model Plan

### 4.1 Required Tables/Columns
Reuse existing tables where present:
- kingdoms
- fiefs
- fief_buildings
- fief_research_queue
- fief_research_levels

Ensure/extend columns (migration-driven):
- fiefs.worker_assignments JSONB
- fiefs.stored_resources JSONB
- fiefs.storage_capacity INT
- fiefs.available_resources JSONB
- fiefs.unlocked_resources JSONB
- fiefs.max_workers_per_resource JSONB
- fiefs.tier_upgrade_days_remaining INT
- fief_buildings.queue_position INT

### 4.2 JSON Defaults
worker_assignments:
- {"food":0,"wood":0,"stone":0,"iron":0,"research":0,"faith":0,"building":0}

unlocked_resources (Tier 1 initial):
- {"food":true,"wood":true,"stone":false,"iron":false,"research":false,"faith":false,"building":true}

max_workers_per_resource (Tier 1 default):
- {"food":10,"wood":10,"stone":10,"iron":10,"research":10,"faith":10,"building":10}

stored_resources initial:
- {"wood":0,"stone":0,"minerals":0,"meat":0,"vegetables":0,"faith":0,"research":0}

## 5. Content Design (Tier 1-2)

### 5.1 Tier 1 Buildings
1) Tent
- type: housing
- cost: wood 8
- time: 1 day
- effect: +2 population cap

2) Storage Tent
- type: storage
- cost: wood 12, stone 4
- time: 2 days
- effect: +50 storage_capacity

3) Forester's Hut
- type: lumber_mill
- cost: wood 14, stone 6
- time: 2 days
- effect: wood worker cap +100% of tier base

4) Hunters Cabin
- type: hunters_guild
- cost: wood 10, stone 4
- time: 2 days
- effect: food worker cap +100% of tier base

5) Vegetable Patch
- type: farm
- cost: wood 8
- time: 1 day
- effect: +25% food output multiplier

6) Quarry Camp
- type: quarry
- cost: wood 16, stone 4
- time: 3 days
- effect: unlock stone worker lane

### 5.2 Tier 2 Buildings
1) Granary
- type: granary
- prereq: Storage Tent x1
- cost: wood 24, stone 14
- time: 3 days
- effect: +100 storage_capacity

2) Lumber Yard
- type: lumber_yard
- prereq: Forester's Hut x1
- cost: wood 20, stone 12
- time: 3 days
- effect: additional +100% wood cap bonus

3) Hunting Lodge
- type: hunting_lodge
- prereq: Hunters Cabin x1
- cost: wood 18, stone 10
- time: 3 days
- effect: additional +100% food cap bonus

4) Irrigated Fields
- type: irrigated_farm
- prereq: Vegetable Patch x1
- cost: wood 16, stone 12
- time: 2 days
- effect: additional +25% food output multiplier

5) Mine Shaft
- type: mine
- prereq: Quarry Camp x1
- cost: wood 20, stone 16
- time: 4 days
- effect: unlock iron worker lane

6) Research Lab
- type: research_lab
- prereq: any 3 completed Tier 1 buildings
- cost: wood 22, stone 18, iron 6
- time: 4 days
- effect: unlock research lane and research queue UI

7) Faith Temple
- type: faith_temple
- prereq: Tent x4 and Storage Tent x1
- cost: wood 18, stone 20, iron 4
- time: 4 days
- effect: unlock faith lane

## 6. Formula Plan

### 6.1 Worker Caps
- Tier 1 base cap per lane: 10
- Tier 2 base cap per lane: 20
- Formula: max_lane = base + (base * bonus_building_count)

### 6.2 Seasonal Production
Use day-based season effects in the daily simulation loop:
- Spring: vegetables +20%, wood +5%
- Summer: vegetables +30%, meat +10%, wood -5%
- Autumn: wood +20%, stone +10%, food +10%
- Winter: vegetables -40%, wood -10%, meat -15%, faith +15%

Rules:
- apply modifiers per simulated day, not only final day.
- clamp per-resource production to minimum 0.
- apply storage cap after production.

### 6.3 Build Progress
- Builder workers reduce active queue entry days_remaining each day.
- When a queue item completes, next queued item becomes active.
- Upgrade completions trigger unlock/cap recalculation hooks.

## 7. API Plan
Create kingdom route module and mount under /kingdoms.

Endpoints:
1) GET /kingdoms/campaign/:id
- returns kingdom + fiefs + summarized status

2) POST /kingdoms/grant
- dm-only, supports multi-select player ids
- emits kingdomNameRequest to targeted players

3) POST /kingdoms/:id/name
- player names kingdom and capital fief
- creates initial capital state

4) GET /fiefs/:id
- full fief details: resources, workers, buildings, queue, unlocks

5) PATCH /fiefs/:id/workers
- validates unlocked lanes, total workers, lane caps

6) POST /fiefs/:id/buildings
- validates tier, prereqs, costs, queue capacity
- deducts resources, inserts queue item

7) POST /fiefs/:id/research/start
- validates research lab + prereqs

8) POST /fiefs/:id/upgrade-tier
- starts or completes Tier 2 upgrade flow

## 8. Socket/Event Plan
Keep existing campaign room pattern.

Events:
- createKingdom
- kingdomNameRequest
- kingdomActivated
- kingdomDataChanged
- dayAdvanced

Event policy:
- emit kingdomDataChanged after worker updates, build queue changes, completions, research progression, and tier upgrades.
- include season/day metadata in dayAdvanced payload.

## 9. Frontend Plan

### 9.1 Navigation
- Add Kingdom tab before Scores in campaign navigation.
- DM always sees Kingdom tab.
- Player sees Kingdom tab only if they own a kingdom.

### 9.2 Kingdom Tab UX
Sections:
1) Header
- kingdom name, fief tier, day + season

2) Resources
- storage usage, per-resource values, near-capacity warning

3) Workers
- per-lane controls: -100 -50 -10 -5 -1 | count | +1 +5 +10 +50 +100
- disabled states for invalid operations

4) Buildings
- available catalog (filtered by tier/prereqs)
- queue with active/waiting states

5) Research (Tier 2 unlock)
- visible only when research lane unlocked

6) Faith (Tier 2 unlock)
- visible only when unlocked

### 9.3 Rest/Day UI
- Keep existing day panel and season display.
- Show season transition message when skip crosses boundary.

## 10. Migration Plan

Order:
1) add_kingdom_worker_resources.js
- add unlocked_resources + max_workers_per_resource columns if missing

2) add_kingdom_indexes.js
- add indexes for performance:
  - kingdoms(campaign_id)
  - fiefs(kingdom_id)
  - fief_buildings(fief_id, is_complete, queue_position)
  - fief_research_queue(fief_id, status)

3) add_kingdom_constraints.js
- optional JSON shape checks and sane defaults

All migrations:
- begin/commit/rollback
- idempotent checks via information_schema
- no destructive drops

## 11. Validation and Security Plan
- DM authorization for grant and reset-level actions.
- Player ownership checks for fief mutation endpoints.
- Worker assignment hard validation on backend.
- Resource deduction and queue insertion in one transaction.
- Prevent negative resources and invalid tier transitions.

## 12. Test Plan

### 12.1 Unit
- season mapping boundaries
- cap formula correctness
- prereq evaluation
- queue progression

### 12.2 Integration
- grant -> name -> initial capital creation
- worker updates + daily production
- build queue completion over multi-day skips
- tier upgrade unlock transitions

### 12.3 Edge Cases
- day 365 -> 366 rollover
- custom skip crossing 2+ seasons
- storage full behavior
- race conditions on rapid worker updates

## 13. Rollout Plan

Phase A: Foundation
- finalize migrations
- add routes/model layer

Phase B: Core Loop
- worker updates
- build queue and completion
- production with seasonal effects

Phase C: Tier 2
- upgrade flow
- research and faith unlocks

Phase D: UX Polish + QA
- toasts, labels, error states
- full regression and boundary tests

## 14. Definition Of Done
Complete when all are true:
1) DM can grant kingdoms to multiple players.
2) Players name kingdom/capital and receive Tier 1 starting state.
3) Worker assignment works with caps and validation.
4) Building queue works end-to-end with resource costs and completion.
5) Tier 2 upgrades unlock research/faith features correctly.
6) Seasonal effects apply correctly across day skips and boundaries.
7) All required endpoints and socket updates are live and synchronized.
8) No destructive startup migrations remain.
9) Tests for boundary days and queue progression pass.

## 15. Execution Checklist
1) Build/verify kingdom model and route files.
2) Add and run new migrations.
3) Implement backend endpoint transactions.
4) Wire socket events for kingdom data refresh.
5) Build Kingdom tab and modals.
6) Add worker/building/research panels.
7) Integrate day + season UI details.
8) Run test scenarios and fix edge cases.
9) Final QA sweep and deployment check.
