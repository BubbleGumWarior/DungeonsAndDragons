import { BattleGoalDefinition } from '../types/campaignTypes';

// Battle Goals Data Structure for the campaign battle system
export const BATTLE_GOALS: BattleGoalDefinition[] = [
  // Command Goals (5) - Character-based leadership
  {
    name: 'Rally the Troops',
    category: 'Command',
    requirement: 'None',
    test_type: 'CHA',
    uses_character_stat: true,
    uses_army_stat: false,
    targets_enemy: false,
    reward: '+2 to your team\'s total score',
    fail: 'No effect',
    description: 'Use your personal charisma to inspire your forces with a rousing speech.',
    can_kill: false
  },
  {
    name: 'Disrupt Enemy Commands',
    category: 'Command',
    requirement: 'None',
    test_type: 'WIS',
    army_stat: 'command',
    uses_character_stat: true,
    uses_army_stat: true,
    targets_enemy: true,
    reward: '-3 to target enemy\'s total score',
    fail: '-1 to your team\'s total score',
    description: 'Combine tactical awareness with command expertise to interfere with enemy communications.',
    can_kill: false
  },
  {
    name: 'Tactical Retreat',
    category: 'Command',
    requirement: 'None',
    test_type: 'WIS',
    army_stat: 'discipline',
    uses_character_stat: true,
    uses_army_stat: true,
    targets_enemy: false,
    reward: '+2 to your team, negate up to -2 penalties',
    fail: 'No effect',
    description: 'Use wisdom and army discipline to execute an organized withdrawal.',
    min_round: 2,
    is_defensive: true,
    can_kill: true,
    defensive_kill_only: true
  },
  {
    name: 'Overwhelming Command',
    category: 'Command',
    requirement: 'None',
    test_type: 'CHA',
    army_stat: 'command',
    uses_character_stat: true,
    uses_army_stat: true,
    targets_enemy: false,
    reward: '+4 to your team\'s total score',
    fail: '-2 to your team\'s total score',
    description: 'Combine personal leadership with military authority for bold, decisive orders. High risk, high reward!',
    can_kill: false
  },
  {
    name: 'Demoralize Enemy',
    category: 'Command',
    requirement: 'None',
    test_type: 'CHA',
    uses_character_stat: true,
    uses_army_stat: false,
    targets_enemy: true,
    reward: '-4 to target enemy',
    fail: '-1 to your team\'s total score',
    description: 'Use personal intimidation to break the enemy\'s will to fight.',
    can_kill: false
  },
  {
    name: 'Elite Vanguard',
    category: 'Command',
    requirement: 'Elite',
    required_army_category: ['Royal Guard', 'Knights'],
    test_type: 'CHA',
    army_stat: 'discipline',
    uses_character_stat: true,
    uses_army_stat: true,
    targets_enemy: true,
    reward: '-6 to target enemy, +3 to your team',
    fail: '-1 to your team\'s total score',
    description: 'Lead battle-hardened elite troops in a devastating coordinated strike that showcases their superior training and unbreakable resolve. Veterans of countless battles execute flawlessly.',
    can_kill: true
  },

  // Strategy Goals (9) - Mix of tactical planning
  {
    name: 'Coordinate Attack',
    category: 'Strategy',
    requirement: 'None',
    test_type: 'INT',
    army_stat: 'command',
    uses_character_stat: false,
    uses_army_stat: true,
    targets_enemy: false,
    reward: '+3 to your team\'s total score',
    fail: 'No effect',
    description: 'Use military command structure to synchronize units for a combined assault.',
    can_kill: false
  },
  {
    name: 'Shield Wall',
    category: 'Strategy',
    requirement: 'Shield',
    required_army_category: ['Royal Guard', 'Shield Wall'],
    test_type: 'CON',
    army_stat: 'equipment',
    uses_character_stat: false,
    uses_army_stat: true,
    targets_enemy: false,
    reward: '+4 to your team, resist 2 enemy penalties',
    fail: 'No effect',
    description: 'Elite shield-equipped infantry forms an impenetrable defensive wall with overlapping shields.',
    is_defensive: true,
    can_kill: true,
    defensive_kill_only: true
  },
  {
    name: 'Spear Wall',
    category: 'Strategy',
    requirement: 'Spear',
    required_army_category: ['Royal Guard', 'Spear Wall', 'Pikemen'],
    test_type: 'CON',
    army_stat: 'equipment',
    uses_character_stat: false,
    uses_army_stat: true,
    targets_enemy: false,
    reward: '+4 to your team, resist 2 enemy penalties',
    fail: 'No effect',
    description: 'Elite spear or pike formation creates a wall of pointed death that repels enemy advances.',
    is_defensive: true,
    can_kill: true,
    defensive_kill_only: true
  },
  {
    name: 'Flank Maneuver',
    category: 'Strategy',
    requirement: 'None',
    test_type: 'DEX',
    army_stat: 'discipline',
    uses_character_stat: false,
    uses_army_stat: true,
    targets_enemy: true,
    reward: '-2 to target enemy, +1 to your team',
    fail: 'No effect',
    description: 'Use army discipline to position units for a flanking attack.',
    can_kill: true
  },
  {
    name: 'Hold the Line',
    category: 'Strategy',
    requirement: 'None',
    test_type: 'CON',
    army_stat: 'discipline',
    uses_character_stat: false,
    uses_army_stat: true,
    targets_enemy: false,
    reward: '+2 to your team',
    fail: 'No effect',
    description: 'Army discipline maintains defensive positions against overwhelming odds.',
    is_defensive: true,
    can_kill: true,
    defensive_kill_only: true
  },
  {
    name: 'Feint and Strike',
    category: 'Strategy',
    requirement: 'None',
    test_type: 'DEX',
    uses_character_stat: true,
    uses_army_stat: false,
    targets_enemy: true,
    reward: '-4 to target enemy\'s total score',
    fail: '-2 to your team\'s total score',
    description: 'Use your tactical cunning to fake a retreat and spring a trap.',
    min_round: 2,
    can_kill: true
  },
  {
    name: 'Siege Tactics',
    category: 'Strategy',
    requirement: 'Siege',
    required_army_category: ['Ballistae', 'Catapults', 'Trebuchets'],
    test_type: 'INT',
    army_stat: 'equipment',
    uses_character_stat: true,
    uses_army_stat: true,
    use_highest_modifier: true,
    targets_enemy: true,
    reward: '-5 to target enemy, +2 to your team',
    fail: '-1 to your team\'s total score',
    description: 'Combine engineering knowledge with siege equipment to shatter fortifications and enemy morale.',
    can_kill: true
  },
  {
    name: 'Rapid Deployment',
    category: 'Strategy',
    requirement: 'None',
    test_type: 'DEX',
    army_stat: 'logistics',
    uses_character_stat: false,
    uses_army_stat: true,
    use_highest_modifier: true,
    targets_enemy: false,
    reward: '+2 to your team',
    fail: 'No effect',
    description: 'Army logistics quickly moves troops to critical positions.',
    can_kill: false
  },
  {
    name: 'Fortified Defense',
    category: 'Strategy',
    requirement: 'None',
    test_type: 'INT',
    uses_character_stat: true,
    uses_army_stat: false,
    targets_enemy: false,
    reward: '+3 to your team, reduce next enemy penalty by 1',
    fail: 'No effect',
    description: 'Use your intelligence to design strong defensive positions.',
    is_defensive: true,
    can_kill: true,
    defensive_kill_only: true
  },
  {
    name: 'Overwhelming Strategy',
    category: 'Strategy',
    requirement: 'None',
    test_type: 'INT',
    army_stat: 'command',
    uses_character_stat: true,
    uses_army_stat: true,
    targets_enemy: true,
    reward: '-5 to target enemy, +2 to your team',
    fail: '-3 to your team\'s total score',
    description: 'Execute a masterful tactical maneuver combining genius and military coordination. High risk, high reward!',
    can_kill: false
  },

  // Assault Goals (7) - Mix of army strength and personal prowess
  {
    name: 'Charge!',
    category: 'Assault',
    requirement: 'None',
    test_type: 'Numbers',
    army_stat: 'numbers',
    uses_character_stat: false,
    uses_army_stat: true,
    targets_enemy: true,
    reward: '-2 to target enemy\'s total score',
    fail: 'No effect',
    description: 'Army numbers launch a frontal assault on enemy positions.',
    can_kill: true
  },
  {
    name: 'Concentrated Fire',
    category: 'Assault',
    requirement: 'Ranged',
    required_army_category: ['Longbowmen', 'Crossbowmen', 'Ballistae', 'Catapults'],
    test_type: 'Equipment',
    army_stat: 'equipment',
    uses_character_stat: false,
    uses_army_stat: true,
    targets_enemy: true,
    reward: '-5 to target enemy\'s total score',
    fail: 'No effect',
    description: 'Ranged army focuses all projectiles on a single enemy unit with devastating precision.',
    can_kill: true
  },
  {
    name: 'Berserker Rage',
    category: 'Assault',
    requirement: 'None',
    test_type: 'STR',
    uses_character_stat: true,
    uses_army_stat: false,
    targets_enemy: true,
    reward: '-8 to target enemy, -3 to your own team',
    fail: '-3 to your team\'s total score',
    description: 'Lead your forces in unbridled fury, sacrificing safety for devastating power. High risk, high reward!',
    can_kill: true
  },
  {
    name: 'Ambush',
    category: 'Assault',
    requirement: 'None',
    test_type: 'DEX',
    uses_character_stat: true,
    uses_army_stat: false,
    targets_enemy: true,
    reward: '-4 to target enemy, +1 to your team',
    fail: '-1 to your team\'s total score',
    description: 'Use your stealth to set up a hidden trap and strike when vulnerable.',
    max_round: 1,
    can_kill: true
  },
  {
    name: 'Cavalry Charge',
    category: 'Assault',
    requirement: 'Cavalry',
    required_army_category: ['Light Cavalry', 'Heavy Cavalry', 'Knights', 'Lancers'],
    test_type: 'STR',
    army_stat: 'equipment',
    uses_character_stat: true,
    uses_army_stat: true,
    targets_enemy: true,
    reward: '-7 to target enemy\'s total score',
    fail: '-2 to your team\'s total score',
    description: 'Lead mounted cavalry in a devastating charge that shatters enemy lines. High risk, extremely high reward!',
    can_kill: true
  },
  {
    name: 'Guerrilla Tactics',
    category: 'Assault',
    requirement: 'None',
    test_type: 'DEX',
    uses_character_stat: true,
    uses_army_stat: false,
    targets_enemy: true,
    reward: '-3 to target enemy',
    fail: 'No effect',
    description: 'Use your agility to lead hit-and-run attacks harassing enemy forces.',
    can_kill: true
  },
  {
    name: 'All-Out Attack',
    category: 'Assault',
    requirement: 'None',
    test_type: 'STR',
    army_stat: 'numbers',
    uses_character_stat: true,
    uses_army_stat: true,
    targets_enemy: true,
    reward: '-8 to target enemy\'s total score',
    fail: '-5 to your team\'s total score',
    description: 'Lead everything in a devastating assault, leaving no reserves. Extremely high risk, extremely high reward!',
    can_kill: true
  },

  // Combat Goals (4) - Player character fights (character stats only)
  {
    name: 'Duel Enemy Commander',
    category: 'Combat',
    requirement: 'None',
    test_type: 'Combat',
    uses_character_stat: true,
    uses_army_stat: false,
    targets_enemy: true,
    reward: '-10 to target enemy\'s total score',
    fail: '-10 to your team\'s total score',
    description: 'Challenge the enemy commander to single combat (1v1). Winner determined by actual combat in Combat Area.',
    requires_combat: true,
    can_kill: true
  },
  {
    name: 'Fight Elite Guard',
    category: 'Combat',
    requirement: 'None',
    test_type: 'Combat',
    uses_character_stat: true,
    uses_army_stat: false,
    targets_enemy: true,
    reward: '-5 to target enemy\'s total score',
    fail: '-5 to your team\'s total score',
    description: 'Engage the enemy\'s elite guards in squad combat (XvX). Winner determined by actual combat in Combat Area.',
    requires_combat: true,
    can_kill: true
  },
  {
    name: 'Disable War Creature',
    category: 'Combat',
    requirement: 'None',
    test_type: 'Combat',
    uses_character_stat: true,
    uses_army_stat: false,
    targets_enemy: true,
    reward: '-4 to target enemy, +2 to your team',
    fail: '-2 to your team\'s total score',
    description: 'Take down the enemy\'s war beast or siege creature (XvX). Winner determined by actual combat in Combat Area.',
    requires_combat: true,
    can_kill: true
  },
  {
    name: 'Breach the Gates',
    category: 'Combat',
    requirement: 'None',
    test_type: 'Combat',
    uses_character_stat: true,
    uses_army_stat: false,
    targets_enemy: true,
    reward: '-5 to target enemy, +1 to your team',
    fail: '-2 to your team\'s total score',
    description: 'Storm the enemy fortifications with a strike team (XvX). Winner determined by actual combat in Combat Area.',
    requires_combat: true,
    can_kill: true
  },

  // Miscellaneous Goals (5) - Mix of support actions
  {
    name: 'Supply Line Raid',
    category: 'Misc',
    requirement: 'None',
    test_type: 'DEX',
    uses_character_stat: true,
    uses_army_stat: false,
    targets_enemy: true,
    reward: '-3 to target enemy, +1 to your team',
    fail: 'No effect',
    description: 'Use your stealth to personally raid enemy supply chains.',
    can_kill: false
  },
  {
    name: 'Fortify Position',
    category: 'Misc',
    requirement: 'None',
    test_type: 'INT',
    army_stat: 'logistics',
    uses_character_stat: false,
    uses_army_stat: true,
    targets_enemy: false,
    reward: '+3 to your team',
    fail: 'No effect',
    description: 'Army logistics constructs defensive works to strengthen positions.',
    can_kill: false
  },
  {
    name: 'Desperate Gambit',
    category: 'Misc',
    requirement: 'None',
    test_type: 'DEX',
    uses_character_stat: true,
    uses_army_stat: false,
    targets_enemy: true,
    reward: '-7 to target enemy, +3 to your team',
    fail: '-5 to your team\'s total score',
    description: 'Risk everything on a daring personal maneuver. Extremely high risk, extremely high reward!',
    only_when_losing: true,
    can_kill: true
  },
  {
    name: 'Scouting Report',
    category: 'Misc',
    requirement: 'None',
    test_type: 'WIS',
    uses_character_stat: true,
    uses_army_stat: false,
    targets_enemy: false,
    reward: '+2 to your team',
    fail: 'No effect',
    description: 'Use your perception to scout and gather intelligence on enemy movements.',
    can_kill: false
  },
  {
    name: 'Sabotage',
    category: 'Misc',
    requirement: 'None',
    test_type: 'DEX',
    army_stat: 'discipline',
    uses_character_stat: true,
    uses_army_stat: true,
    targets_enemy: true,
    reward: '-5 to target enemy',
    fail: '-2 to your team\'s total score',
    description: 'Lead operatives to damage enemy equipment and infrastructure.',
    can_kill: false
  }
];

// Helper function to parse goal reward/fail text and extract PRIMARY modifier value
export const parseGoalModifier = (text: string): number => {
  if (text === 'No effect') return 0;
  
  const matches = text.match(/([+-]\d+)/g);
  if (!matches || matches.length === 0) return 0;
  
  const numbers = matches.map(m => parseInt(m));
  
  if (numbers.length === 1) return numbers[0];
  
  // If multiple numbers, use the one with the largest absolute value
  return numbers.reduce((max, num) => 
    Math.abs(num) > Math.abs(max) ? num : max
  , numbers[0]);
};

// Helper function to get color based on modifier value
export const getModifierColor = (modifier: number): string => {
  if (modifier >= 5) return '#10b981';
  if (modifier >= 3) return '#22c55e';
  if (modifier >= 2) return '#4ade80';
  if (modifier >= 1) return '#86efac';
  if (modifier === 0) return '#9ca3af';
  if (modifier >= -1) return '#fca5a5';
  if (modifier >= -2) return '#f87171';
  if (modifier >= -3) return '#ef4444';
  return '#dc2626';
};
