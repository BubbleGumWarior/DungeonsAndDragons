# Multi-Army Goal Selection System

## Overview
Implemented a new goal selection system that allows **each army in a faction to select its own goal** during battle, ensuring no units are wasted. Previously, only one goal could be selected per team/faction per round, meaning multiple armies in the same faction had wasted potential.

## Changes Made

### Backend Changes (Battle.js)

#### 1. Modified `setGoal()` method
**Location:** `backend/models/Battle.js` (lines 266-334)

**Previous Behavior:**
- One goal per team per round
- When a goal was set, ALL armies in the team were marked as `has_selected_goal = true`
- Updating a goal required matching by team_name

**New Behavior:**
- One goal per army (participant) per round
- When a goal is set, ONLY that specific army is marked as `has_selected_goal = true`
- Each army can select independently
- Updating a goal matches by participant_id

**Key Changes:**
```javascript
// OLD: Check by team
WHERE battle_id = $1 AND round_number = $2 AND team_name = $3

// NEW: Check by participant (army)
WHERE battle_id = $1 AND round_number = $2 AND participant_id = $3

// OLD: Mark all team members as selected
UPDATE battle_participants SET has_selected_goal = true 
WHERE battle_id = $1 AND team_name = $2

// NEW: Mark only this army as selected
UPDATE battle_participants SET has_selected_goal = true 
WHERE id = $1
```

### Frontend Changes (CampaignView.tsx)

#### 1. Goal Selection Status Calculation
**Location:** Lines 5207-5220

**Change:** Teams are now considered "selected" only when ALL their armies have selected goals
```typescript
// Check if ALL armies in each team have selected
Object.values(teams).forEach(team => {
  team.has_selected = team.participants.every(p => p.has_selected_goal);
});
```

#### 2. Army-by-Army Status Display
**Location:** Lines 5273-5323

**New Feature:** Shows individual army status within each team
```typescript
{team.participants.map(p => (
  <div style={{ color: p.has_selected_goal ? '#4ade80' : '#fbbf24' }}>
    <span>{p.has_selected_goal ? '✓' : '○'}</span>
    <span>{p.temp_army_name || p.army_name}</span>
  </div>
))}
```

#### 3. Updated User Messages
- "Select a goal for each army in your factions. Each army acts independently!"
- "You have selected goals for all armies in your factions."
- Shows "X/Y armies ready" instead of just "Ready/Selecting..."

#### 4. Faction Selector Enhancement
**Location:** Lines 5334-5378

**Change:** Shows how many armies still need to select goals
```typescript
const unselectedArmies = team.participants.filter(p => !p.has_selected_goal).length;
// Display: "X of Y armies need goals"
```

#### 5. Army Selection Filter
**Location:** Lines 11438-11445

**New Feature:** Only shows armies that haven't selected goals yet
```typescript
const teamArmies = availableTeam.participants.filter((p: any) => !p.has_selected_goal);
```

#### 6. Enhanced Feedback
**Location:** Lines 11967-11976

**New Feature:** After selecting a goal, shows how many armies remain
```typescript
if (remainingArmies.length > 0) {
  setToastMessage(`Goal selected! ${remainingArmies.length} more armies need to select goals.`);
} else {
  setToastMessage(`All armies in Team have selected their goals.`);
}
```

#### 7. DM Status View
**Location:** Lines 4547-4604

**Change:** Shows per-army status for each team in the DM overview

## Benefits

1. **No Wasted Units:** Every army contributes to the battle with its own goal
2. **Strategic Flexibility:** Factions can diversify their approach with multiple simultaneous goals
3. **Better Scaling:** Larger factions with more armies are now more powerful
4. **Clear Progress Tracking:** Users can see exactly which armies have/haven't selected
5. **Individual Army Agency:** Each army commander makes their own tactical decision

## Example Scenario

**Before:**
- Team Red has 3 armies
- Team Red selects 1 goal (e.g., "Rally the Troops")
- Only 1 army executes that goal
- Other 2 armies do nothing this round

**After:**
- Team Red has 3 armies
- Army 1 selects "Rally the Troops" (+2 to team score)
- Army 2 selects "Flank Maneuver" (-2 to enemy, +1 to team)
- Army 3 selects "Hold the Line" (+2 to team score)
- Total impact: +5 to team, -2 to enemy (vs previous +2 only)

## Testing Recommendations

1. Create a battle with multiple armies per faction
2. Verify each army can select independently
3. Check that the UI updates correctly after each selection
4. Ensure the "all selected" state only triggers when ALL armies are done
5. Test with both DM (multiple factions) and player (single faction) views
6. Verify socket updates work for real-time status

## Test Results

✅ **All tests passed successfully!**

### Automated Test Results:
- ✅ Database constraint properly enforces one goal per army
- ✅ Multiple armies in same team can select independently
- ✅ `has_selected_goal` tracks individual armies, not teams
- ✅ Goal count matches participant selection count
- ✅ Orc Horde team had 2/3 armies selected (partial selection verified)
- ✅ Different teams maintain independent selection status

### Test Scenario:
**Team Orc Horde (3 armies):**
- Orc Slingers: ✓ Selected "Rally the Troops"
- Orc Raiders: ✓ Selected "Charge!"
- Orc Militia: ○ Not selected yet

**Team Xander (2 armies):**
- Reach Spearman: ✓ Selected "Hold the Line"
- Reach Bowman: ○ Not selected yet

**Result:** System correctly allows partial selection within teams, proving multi-army independence!

## Database Impact

### Schema Change Required

The existing `battle_goals` table has a unique constraint that prevents multiple goals per team. This constraint must be updated to allow multiple goals per team (one per army).

**Old Constraint:**
```sql
idx_battle_goals_team_round ON (battle_id, round_number, team_name)
```
This constraint enforced one goal per team per round.

**New Constraint:**
```sql
idx_battle_goals_participant_round ON (battle_id, round_number, participant_id)
```
This constraint enforces one goal per army per round.

**Migration:**
The migration is automatically applied on server startup via `backend/migrations/enable_multi_army_goals.js`. 

✅ **Migration is idempotent** - it can be run multiple times safely and will skip if already applied.

To run manually:
```bash
node backend/migrations/enable_multi_army_goals.js
```

**Server Integration:**
The migration has been added to the server startup sequence in `server.js` and will run automatically when the server starts in a new environment. This ensures the database schema is always up-to-date.

The existing columns remain the same:
- `participant_id` - identifies which army selected the goal
- `team_name` - groups goals by team for scoring

The change is in the unique constraint that validates goal creation.
