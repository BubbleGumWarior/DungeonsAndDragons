# Goal Selection UI - Visual Guide

## Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ 🎯 Goal Selection                              [✕ Close Button] │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  [Left Panel]        [Center Panel]           [Right Panel]      │
│  
│  Your Armies         🎯 Defending             Waiting On         │
│  ────────           ─────────────────         ──────────         │
│  ├─ [Army 1]        ✅ Selected:              Team A             │
│  │  ⏳ Needs goal     Hold Line                2/3 ready         │
│  │                                                                │
│  ├─ [Army 2]        [Tab Navigation]         Team B             │
│  │  ✅ Goal selected ⚔️ Attacking           1/2 ready          │
│  │                 🛡️ Defending (active)                       │
│  └─ [Army 3]        📦 Logistics                                 │
│     ✅ Goal selected                                             │
│                    [Goal List - Scrollable]                      │
│                    ├─ ✓ Hold the Line                            │
│                    │  Maintain positions                         │
│                    ├─ Brace for Impact                           │
│                    │  Prepare to absorb                          │
│                    ├─ Take Cover 🔒                              │
│                    │  Find shelter                               │
│                    │  (Not eligible)                             │
│                    ├─ Fortify Position 🔒                        │
│                    │  Create defensive works                     │
│                    │  (Requires siege)                           │
│                    └─ Shield Wall                                │
│                       Form wall of shields                       │
│                                                                   │
│                    [Target Selection]                            │
│                    Target Army: [Select...]                      │
│                                                                   │
│                    [🔒 Lock Goal Button]                         │
└─────────────────────────────────────────────────────────────────┘
```

## Color Scheme

### Active Tab
- Background: `rgba(234, 179, 8, 0.15)` (gold-tinted)
- Text: `var(--text-gold)` (bright gold)
- Border: `var(--border-gold)` (gold outline)
- Font: Bold

### Inactive Tab
- Background: Transparent
- Text: `var(--text-muted)` (muted gray)
- Border: None

### Eligible Goal
- Border: `rgba(212, 193, 156, 0.3)` (subtle tan)
- Background: `rgba(255, 255, 255, 0.03)` (slight transparency)
- Text: `#e2e8f0` (light gray)

### Selected Goal (Eligible)
- Border: `rgba(234, 179, 8, 0.9)` (gold)
- Background: `rgba(234, 179, 8, 0.1)` (gold tint)
- Text: `#e2e8f0` (light gray)
- Prefix: ✓ (checkmark)

### Locked Goal (Ineligible)
- Border: `rgba(139, 92, 246, 0.3)` (purple tint)
- Background: `rgba(139, 92, 246, 0.08)` (purple-tinted)
- Text: `rgba(226, 232, 240, 0.6)` (muted light)
- Icon: 🔒 (lock emoji)
- Opacity: 0.7
- Cursor: not-allowed

## Interactions

### Switching Armies
1. Click an army in left panel
2. Center panel updates with that army's category
3. Active tab resets to "Attacking"
4. Goals list updates
5. Target selection clears

### Switching Categories
1. Click tab (⚔️/🛡️/📦)
2. Goals list transitions to new category
3. Previous selections preserved in state
4. Tab highlighting updates

### Selecting a Goal
1. Click goal button (must be eligible)
2. Goal highlights with gold border and checkmark
3. Previous selection deselected
4. If goal requires target (attacking), dropdown appears

### Selecting a Target
1. Target dropdown appears only for attack goals
2. Populate with enemy armies with troops > 0
3. Select target from dropdown
4. Lock Goal button becomes active

### Locking the Goal
1. Click "🔒 Lock Goal" button
2. Goal sent to backend via setGoal API
3. Modal may close or reset for next army
4. Real-time updates via socket event

## Accessibility Features

- Locked goals have `title` attribute with reason
- Disabled buttons prevent accidental clicks
- Clear visual hierarchy with gold highlighting
- Emojis provide quick visual cues
- Status badges (✅/⏳) on army list
- Scrollable goals prevent layout overflow

## Responsive Behavior

- Left panel: `flex: '1 1 260px'` (flexible, min 220px)
- Center panel: `flex: '2 1 520px'` (flexible, min 320px)
- Right panel: `flex: '1 1 220px'` (flexible, min 200px)
- Wraps on small screens with `flexWrap: 'wrap'`
- Goals list: max-height 300px with scrollbar
- Tab buttons: `flex: 1` (equal width distribution)

## Goal Categories

### ⚔️ Attacking (6 Goals)
- Cavalry Charge
- Arrow Barrage
- Spear Charge
- Artillery Volley
- Flanking Strike
- Overwhelming Assault

### 🛡️ Defending (6 Goals)
- Hold the Line
- Brace for Impact
- Take Cover
- Fortify Position
- Shield Wall
- Guerrilla Tactics

### 📦 Logistics (6 Goals)
- Intercept Supply Lines
- Rally Our Troops
- Rapid Resupply
- Disrupt Communications
- Establish Supply Cache
- Deploy Field Medical

## Lock Reasons by Category

### Attacking Goals
- Cavalry Charge: "Requires mounted units"
- Arrow Barrage: "Requires ranged units"
- Spear Charge: "Requires heavy infantry"
- Artillery Volley: "Requires siege weapons"
- Flanking Strike: "Requires fast, mobile units"

### Defending Goals
- Take Cover: "Better suited for light units and ranged troops"
- Fortify Position: "Requires siege equipment"
- Shield Wall: "Requires heavily armored melee units"
- Guerrilla Tactics: "Requires fast, mobile units"

### Logistics Goals
- Intercept Supply Lines: "Requires scouts or spies"
- Disrupt Communications: "Requires intelligence specialists"
- Establish Supply Cache: "Limited to scouts and spies"
- Deploy Field Medical: "Requires heavy units for support"
