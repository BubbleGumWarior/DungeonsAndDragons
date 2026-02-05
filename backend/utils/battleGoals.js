const GOAL_TYPES = {
  ATTACK: 'attack',
  DEFEND: 'defend',
  LOGISTICS: 'logistics',
  CUSTOM: 'custom',
  COMMANDER: 'commander'
};

const GOAL_CATEGORIES = {
  ATTACKING: 'attacking',
  DEFENDING: 'defending',
  LOGISTICS: 'logistics',
  CUSTOM: 'custom',
  COMMANDER: 'commander'
};

const BATTLE_GOALS = {
  attacking: [
    {
      key: 'basic_attack',
      name: 'Basic Attack',
      description: 'A straightforward frontal assault against the enemy. Available to all units.',
      goal_type: GOAL_TYPES.ATTACK,
      target_type: 'enemy',
      eligible_categories: []
    },
    {
      key: 'cavalry_charge',
      name: 'Cavalry Charge',
      description: 'A devastating mounted charge aimed at breaking enemy lines.',
      goal_type: GOAL_TYPES.ATTACK,
      target_type: 'enemy',
      eligible_categories: ['Knights', 'Shock Cavalry', 'Heavy Cavalry', 'Light Cavalry', 'Lancers', 'Mounted Archers']
    },
    {
      key: 'arrow_barrage',
      name: 'Arrow Barrage',
      description: 'Concentrated ranged volley to thin enemy ranks.',
      goal_type: GOAL_TYPES.ATTACK,
      target_type: 'enemy',
      eligible_categories: ['Longbowmen', 'Crossbowmen', 'Skirmishers', 'Mounted Archers', 'Ballistae']
    },
    {
      key: 'spear_charge',
      name: 'Spear Charge',
      description: 'A disciplined spear thrust against a chosen enemy.',
      goal_type: GOAL_TYPES.ATTACK,
      target_type: 'enemy',
      eligible_categories: ['Spear Wall', 'Pikemen', 'Heavy Infantry']
    },
    {
      key: 'artillery_volley',
      name: 'Artillery Volley',
      description: 'Long-range siege fire directed at a target formation.',
      goal_type: GOAL_TYPES.ATTACK,
      target_type: 'enemy',
      eligible_categories: ['Catapults', 'Trebuchets', 'Ballistae', 'Bombards']
    },
    {
      key: 'flanking_strike',
      name: 'Flanking Strike',
      description: 'Execute a coordinated attack on enemy flanks and weak points.',
      goal_type: GOAL_TYPES.ATTACK,
      target_type: 'enemy',
      eligible_categories: ['Light Cavalry', 'Scouts', 'Light Infantry', 'Lancers']
    },
    {
      key: 'overwhelming_assault',
      name: 'Overwhelming Assault',
      description: 'All-out frontal assault with maximum force deployment.',
      goal_type: GOAL_TYPES.ATTACK,
      target_type: 'enemy',
      eligible_categories: ['Heavy Infantry', 'Knights', 'Shock Cavalry', 'Royal Guard']
    }
  ],
  defending: [
    {
      key: 'hold_the_line',
      name: 'Hold the Line',
      description: 'Fortify your position to blunt enemy assaults.',
      goal_type: GOAL_TYPES.DEFEND,
      target_type: 'self',
      eligible_categories: ['Swordsmen', 'Shield Wall', 'Spear Wall', 'Pikemen', 'Heavy Infantry', 'Royal Guard']
    },
    {
      key: 'brace_for_impact',
      name: 'Brace for Impact',
      description: 'Prepare to absorb the next enemy strike.',
      goal_type: GOAL_TYPES.DEFEND,
      target_type: 'self',
      eligible_categories: ['Swordsmen', 'Shield Wall', 'Heavy Infantry', 'Knights']
    },
    {
      key: 'take_cover',
      name: 'Take Cover',
      description: 'Find cover and minimize casualties from incoming attacks.',
      goal_type: GOAL_TYPES.DEFEND,
      target_type: 'self',
      eligible_categories: ['Longbowmen', 'Crossbowmen', 'Skirmishers', 'Light Infantry', 'Scouts']
    },
    {
      key: 'fortify_position',
      name: 'Fortify Position',
      description: 'Dig in and create defensive works for siege units.',
      goal_type: GOAL_TYPES.DEFEND,
      target_type: 'self',
      eligible_categories: ['Catapults', 'Trebuchets', 'Ballistae', 'Bombards', 'Siege Towers']
    },
    {
      key: 'shield_wall',
      name: 'Shield Wall',
      description: 'Form an impenetrable wall of shields and armor, maximizing defense.',
      goal_type: GOAL_TYPES.DEFEND,
      target_type: 'self',
      eligible_categories: ['Shield Wall', 'Heavy Infantry', 'Royal Guard', 'Pikemen']
    },
    {
      key: 'guerrilla_tactics',
      name: 'Guerrilla Tactics',
      description: 'Use evasion and mobility to avoid and counter enemy attacks.',
      goal_type: GOAL_TYPES.DEFEND,
      target_type: 'self',
      eligible_categories: ['Scouts', 'Light Cavalry', 'Skirmishers', 'Mounted Archers']
    }
  ],
  logistics: [
    {
      key: 'intercept_supply',
      name: 'Intercept Supply Lines',
      description: 'Disrupt enemy logistics to weaken their momentum.',
      goal_type: GOAL_TYPES.LOGISTICS,
      target_type: 'enemy',
      effect: 'decrease_target',
      eligible_categories: ['Scouts', 'Light Cavalry', 'Spies', 'Skirmishers']
    },
    {
      key: 'rally_troops',
      name: 'Rally Our Troops',
      description: 'Boost morale and coordination within your army.',
      goal_type: GOAL_TYPES.LOGISTICS,
      target_type: 'self',
      effect: 'increase_self',
      eligible_categories: ['Royal Guard', 'Knights', 'Swordsmen', 'Shield Wall', 'Heavy Infantry', 'Light Infantry']
    },
    {
      key: 'rapid_resupply',
      name: 'Rapid Resupply',
      description: 'Improve supply efficiency to bolster your battle score.',
      goal_type: GOAL_TYPES.LOGISTICS,
      target_type: 'self',
      effect: 'increase_self',
      eligible_categories: ['Scouts', 'Spies', 'Light Infantry', 'Light Cavalry']
    },
    {
      key: 'disrupt_comms',
      name: 'Disrupt Communications',
      description: 'Confuse enemy command and reduce their effectiveness.',
      goal_type: GOAL_TYPES.LOGISTICS,
      target_type: 'enemy',
      effect: 'decrease_target',
      eligible_categories: ['Spies', 'Scouts']
    },
    {
      key: 'supply_cache',
      name: 'Establish Supply Cache',
      description: 'Create hidden supply stations across the battlefield for sustained operations.',
      goal_type: GOAL_TYPES.LOGISTICS,
      target_type: 'self',
      effect: 'increase_self',
      eligible_categories: ['Scouts', 'Light Cavalry', 'Spies']
    },
    {
      key: 'field_medical',
      name: 'Deploy Field Medical',
      description: 'Set up medical stations to reduce casualty impact and sustain forces.',
      goal_type: GOAL_TYPES.LOGISTICS,
      target_type: 'self',
      effect: 'increase_self',
      eligible_categories: ['Knights', 'Royal Guard', 'Swordsmen', 'Heavy Infantry']
    }
  ],
  custom: [],
  commander: [],
  unique: [
    {
      key: 'assassinate_commander',
      name: 'Assassinate Commander',
      description: 'Send elite assassins to eliminate or severely wound the enemy commander. Deals massive damage equal to half the enemy\'s current battle score. Always results in 1 casualty from your forces due to the extreme danger of the mission.',
      goal_type: 'attack',
      target_type: 'enemy',
      effect: 'decrease_target_half_score',
      eligible_categories: ['Assassins'],
      guaranteed_casualty: 1
    }
  ]
};

const flattenGoals = () => Object.values(BATTLE_GOALS).flat();

const findGoalByKey = (goalKey) => flattenGoals().find(goal => goal.key === goalKey);

const isGoalEligible = (goal, category) => {
  if (!goal) return false;
  if (!goal.eligible_categories || goal.eligible_categories.length === 0) return true;
  return goal.eligible_categories.includes(category);
};

module.exports = {
  GOAL_TYPES,
  GOAL_CATEGORIES,
  BATTLE_GOALS,
  findGoalByKey,
  isGoalEligible
};
