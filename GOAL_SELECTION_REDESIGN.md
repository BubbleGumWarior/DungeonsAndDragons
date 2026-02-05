# Goal Selection Menu Redesign - Complete

## Overview
The battle goals selection menu has been completely redesigned with a tab-based interface and expanded goal categories. All goals are now visible to all units, with locked state indicators for ineligible army types.

## Changes Made

### 1. Battle Goals Expansion (frontend/src/utils/battleGoals.ts)

**Added `lock_reason` field to BattleGoalDefinition interface**
- Stores explanation for why a goal is locked for ineligible units

**Expanded goal definitions:**

#### Attacking Category (6 goals)
- **Cavalry Charge** - Devastating mounted charge (Knights, Shock Cavalry, Heavy Cavalry, Light Cavalry, Lancers, Mounted Archers)
- **Arrow Barrage** - Concentrated ranged volley (Longbowmen, Crossbowmen, Skirmishers, Mounted Archers, Ballistae)
- **Spear Charge** - Disciplined spear thrust (Spear Wall, Pikemen, Heavy Infantry, Swordsmen)
- **Artillery Volley** - Long-range siege fire (Catapults, Trebuchets, Ballistae, Bombards)
- **Flanking Strike** - Coordinated attack on flanks (Light Cavalry, Scouts, Skirmishers, Lancers)
- **Overwhelming Assault** - All-out frontal assault (Heavy Infantry, Knights, Shock Cavalry, Royal Guard)

#### Defending Category (6 goals)
- **Hold the Line** - Fortify position to blunt assaults (Swordsmen, Shield Wall, Spear Wall, Pikemen, Heavy Infantry, Royal Guard)
- **Brace for Impact** - Prepare to absorb strikes (Swordsmen, Shield Wall, Heavy Infantry, Knights)
- **Take Cover** - Find shelter from ranged attacks (Longbowmen, Crossbowmen, Skirmishers, Light Infantry, Scouts)
- **Fortify Position** - Create defensive works (Catapults, Trebuchets, Ballistae, Bombards, Siege Towers)
- **Shield Wall** - Impenetrable wall of shields (Shield Wall, Heavy Infantry, Royal Guard, Pikemen)
- **Guerrilla Tactics** - Evasion and mobility tactics (Scouts, Light Cavalry, Skirmishers, Mounted Archers)

#### Logistics Category (6 goals)
- **Intercept Supply Lines** - Disrupt enemy logistics (Scouts, Light Cavalry, Spies, Skirmishers)
- **Rally Our Troops** - Boost morale and coordination (Royal Guard, Knights, Swordsmen, Shield Wall, Heavy Infantry, Light Infantry)
- **Rapid Resupply** - Improve supply efficiency (Scouts, Spies, Light Infantry, Light Cavalry)
- **Disrupt Communications** - Confuse enemy command (Spies, Scouts)
- **Establish Supply Cache** - Create hidden supply stations (Scouts, Light Cavalry, Spies)
- **Deploy Field Medical** - Set up medical stations (Knights, Royal Guard, Swordsmen, Heavy Infantry)

### 2. Goal Selection UI Redesign (frontend/src/components/CampaignView.tsx)

**Tab-Based Navigation**
- Three tabs for categories: ⚔️ Attacking, 🛡️ Defending, 📦 Logistics
- Tabs remember active selection per army
- Gold highlighting for active tab
- Smooth transitions between categories

**Goal Display**
- All goals visible within selected tab (scrollable container)
- Goals display name and description
- Selected goal highlighted with gold border and checkmark
- Max height of 300px with vertical scrolling

**Locked State Indicators**
- Locked goals display with 🔒 icon on the right
- Locked goals have muted appearance (70% opacity)
- Lock reason visible on hover via title attribute
- Disabled state prevents accidental clicks on locked goals

**Visual Hierarchy**
- Selected status shows ✓ prefix on goal name
- Eligible goals: normal styling with light borders
- Locked goals: purple-tinted styling with lock icon
- Current selection shown in green box at top

**Selection Flow**
1. User selects an army from left panel
2. Goal category tabs appear (defaulting to Attacking)
3. User clicks tabs to browse all categories
4. All goals visible with lock indicators
5. User selects eligible goal with click
6. For attack goals: target selection dropdown appears
7. User clicks "🔒 Lock Goal" to confirm

### 3. State Management Updates

**goalSelections state type updated:**
```typescript
Record<number, { 
  goalKey?: string; 
  targetId?: number | null; 
  activeTab?: 'attacking' | 'defending' | 'logistics' 
}>
```
- Tracks active tab per army for smooth UX
- Preserves tab selection across interactions

## User Experience Improvements

✅ **Organized Interface** - Categories grouped in tabs for easier browsing
✅ **Complete Visibility** - All 18 goals visible at once (per tab)
✅ **Clear Eligibility** - Lock icons immediately show ineligible goals
✅ **Contextual Help** - Hover over lock icon to see reason
✅ **Better Scrolling** - Goals list scrollable within modal
✅ **Consistent Styling** - Matches dark blue + gold theme

## Technical Details

- No breaking changes to backend API
- Socket events continue to work as-is
- Goal eligibility logic reuses existing `isGoalEligible()` function
- Tab state persists only during active selection session
- All goals included in BATTLE_GOALS export for frontend filtering

## Next Steps (Optional)

- Add Commander category (empty currently)
- Add Unique category (empty currently)
- Add animated transitions between tabs
- Add goal difficulty ratings
- Add strategic hints for goal selection
