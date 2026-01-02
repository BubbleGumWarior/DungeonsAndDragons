# CampaignView Refactoring Guide

## Problem
The `CampaignView.tsx` file has grown to **11,183 lines**, making it:
- Difficult to maintain and debug
- Hard to test individual features
- Prone to merge conflicts
- Challenging for new developers to understand
- Performance issues due to re-rendering the entire component

## Solution: Component Modularization

We're breaking down the monolithic CampaignView into smaller, focused components.

---

## New Directory Structure

```
frontend/src/
├── components/
│   ├── campaign/               # Campaign-specific components
│   │   ├── CharacterList.tsx           ✅ Created
│   │   ├── EquipmentManager.tsx        🔄 To create
│   │   ├── InventoryPanel.tsx          🔄 To create
│   │   ├── BattleSetup.tsx             🔄 To create
│   │   ├── BattleGoalSelector.tsx      🔄 To create
│   │   ├── BattleMap.tsx               🔄 To create
│   │   ├── BattlefieldView.tsx         🔄 To create
│   │   ├── ArmyManager.tsx             🔄 To create
│   │   ├── ArmyList.tsx                🔄 To create
│   │   ├── MonsterManager.tsx          🔄 To create
│   │   ├── CampaignMap.tsx             🔄 To create
│   │   └── TabNavigation.tsx           🔄 To create
│   ├── CampaignView.tsx        # Main orchestrator (refactored)
│   └── ...
├── types/
│   └── campaignTypes.ts        ✅ Created - All TypeScript interfaces
├── utils/
│   ├── battleGoals.ts          ✅ Created - Battle goals data & helpers
│   ├── armyCategories.ts       ✅ Created - Army presets & utilities
│   ├── equipmentUtils.ts       ✅ Created - Equipment helpers
│   └── characterUtils.ts       ✅ Created - Character calculations
└── ...
```

---

## Component Breakdown

### 1. **CharacterList** ✅ COMPLETED
**File**: `components/campaign/CharacterList.tsx`
- Displays list of characters with health bars
- Handles character selection
- Shows character level, race, class
- Keyboard navigation support

### 2. **EquipmentManager** 🔄 NEXT
**File**: `components/campaign/EquipmentManager.tsx`
- Character figure with equipment slots
- Drag-and-drop equipment
- Equipment tooltips
- Slot management (head, chest, hands, main/off hand, feet)

### 3. **InventoryPanel** 🔄 NEXT
**File**: `components/campaign/InventoryPanel.tsx`
- Item list with filters (weapon/armor/tool)
- Add/remove items (DM only)
- Custom item creation
- Drag items to equipment slots

### 4. **BattleSetup** 🔄 TO CREATE
**File**: `components/campaign/BattleSetup.tsx`
- Create new battle interface
- Set battle name, terrain, rounds
- Invite players
- Manage participants

### 5. **BattleGoalSelector** 🔄 TO CREATE
**File**: `components/campaign/BattleGoalSelector.tsx`
- Display available battle goals by category
- Filter goals based on army type
- Show goal requirements and rewards
- Handle goal selection and execution

### 6. **BattleMap** 🔄 TO CREATE
**File**: `components/campaign/BattleMap.tsx`
- Combat battle map display
- Initiative order tracking
- Character/monster tokens
- Movement and positioning

### 7. **BattlefieldView** 🔄 TO CREATE
**File**: `components/campaign/BattlefieldView.tsx`
- Mass combat battlefield
- Army positioning
- Round-by-round goal selection
- Battle resolution and scoring

### 8. **ArmyManager** 🔄 TO CREATE
**File**: `components/campaign/ArmyManager.tsx`
- Create/edit armies
- Set army stats (equipment, discipline, morale, command, logistics)
- Select army categories
- Manage troop counts

### 9. **ArmyList** 🔄 TO CREATE
**File**: `components/campaign/ArmyList.tsx`
- Display player's armies
- Show army stats and troop counts
- Quick army selection for battles

### 10. **MonsterManager** 🔄 TO CREATE
**File**: `components/campaign/MonsterManager.tsx`
- Encyclopedia/monster list
- Add monsters to combat
- Monster creation interface
- Monster stat management

### 11. **CampaignMap** 🔄 TO CREATE
**File**: `components/campaign/CampaignMap.tsx`
- World map display
- Character positioning
- Drag-and-drop movement
- Visual distance indicators

### 12. **TabNavigation** 🔄 TO CREATE
**File**: `components/campaign/TabNavigation.tsx`
- Main campaign tab switcher (Map, Combat, Battlefield, etc.)
- View switcher (Character/Campaign)
- Tab state management

---

## Utility Files Created

### ✅ `types/campaignTypes.ts`
Contains all TypeScript interfaces:
- `BattleGoalDefinition`
- `ArmyStats`
- `EquipmentSlot`
- `CharacterPosition`
- `Combatant`
- And more...

### ✅ `utils/battleGoals.ts`
- `BATTLE_GOALS` array (all 30+ battle goals)
- `parseGoalModifier()` - Extract modifier from text
- `getModifierColor()` - Color coding for goal effects

### ✅ `utils/armyCategories.ts`
- `ARMY_CATEGORIES` - Organized by type (Elite, Infantry, etc.)
- `getArmyCategoryIcon()` - Emoji icons for armies
- `getArmyCategoryPresets()` - Default stats per category
- `getArmyMovementSpeed()` - Movement speeds

### ✅ `utils/equipmentUtils.ts`
- `equipmentSlots` - Slot definitions
- `getSlotIcon()` - Dynamic icons
- `getSubcategoryOptions()` - Item subcategories
- `getAvailableProperties()` - Weapon/armor properties
- `getDamageTypes()` - Damage type list

### ✅ `utils/characterUtils.ts`
- `paginateBackstory()` - Smart text pagination
- `calculateCharacterHealth()` - Health calculations

---

## Migration Strategy

### Phase 1: Setup ✅ COMPLETE
- [x] Create directory structure
- [x] Extract types to `campaignTypes.ts`
- [x] Extract utility functions
- [x] Create data files (battle goals, army categories)

### Phase 2: Core Components 🔄 IN PROGRESS
- [x] CharacterList component
- [ ] EquipmentManager component
- [ ] InventoryPanel component
- [ ] TabNavigation component

### Phase 3: Battle System Components
- [ ] BattleSetup component
- [ ] BattleGoalSelector component
- [ ] BattleMap component
- [ ] BattlefieldView component

### Phase 4: Army & Monster Components
- [ ] ArmyManager component
- [ ] ArmyList component
- [ ] MonsterManager component
- [ ] CampaignMap component

### Phase 5: Integration
- [ ] Refactor CampaignView to use new components
- [ ] Update imports
- [ ] Test all functionality
- [ ] Remove old code

---

## Benefits of Refactoring

1. **Maintainability**: Each component is < 500 lines
2. **Testability**: Components can be tested in isolation
3. **Reusability**: Components can be used elsewhere
4. **Performance**: Better React memoization and optimization
5. **Collaboration**: Less merge conflicts, clearer ownership
6. **Onboarding**: New developers can understand smaller pieces

---

## Usage Examples

### Before (Monolithic):
```tsx
// Everything in one 11,183-line file
const CampaignView: React.FC = () => {
  // 200+ lines of state
  // 300+ lines of functions
  // 10,000+ lines of JSX
  // ...
};
```

### After (Modular):
```tsx
import CharacterList from './campaign/CharacterList';
import EquipmentManager from './campaign/EquipmentManager';
import BattleGoalSelector from './campaign/BattleGoalSelector';
// ... more imports

const CampaignView: React.FC = () => {
  // Orchestration logic only
  
  return (
    <>
      <CharacterList 
        characters={characters}
        selectedCharacter={selectedCharacter}
        onSelectCharacter={setSelectedCharacter}
      />
      
      {activeTab === 'equipment' && (
        <EquipmentManager 
          character={selectedChar}
          onEquip={handleEquip}
        />
      )}
      
      {activeTab === 'battlefield' && (
        <BattlefieldView 
          battle={activeBattle}
          onGoalSelect={handleGoalSelect}
        />
      )}
    </>
  );
};
```

---

## Next Steps

1. Create EquipmentManager component
2. Create InventoryPanel component
3. Create TabNavigation component
4. Continue with battle and army components
5. Gradually migrate CampaignView to use new components
6. Test thoroughly after each migration step

---

## Notes

- Keep original CampaignView.tsx as reference until migration is complete
- Each component should handle its own state where possible
- Share global state via props and context
- Socket.io events should be handled in CampaignView and passed down
- Maintain backward compatibility during migration
