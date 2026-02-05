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
      eligible_categories: [],
      casualty_multiplier: 0.6,
      score_multiplier: 0.6,
      attack_bonus: 0
    },
    {
      key: 'cavalry_charge',
      name: 'Cavalry Charge',
      description: 'A devastating mounted charge aimed at breaking enemy lines.',
      goal_type: GOAL_TYPES.ATTACK,
      target_type: 'enemy',
      eligible_categories: ['Knights', 'Shock Cavalry', 'Heavy Cavalry', 'Light Cavalry', 'Lancers', 'Mounted Archers'],
      casualty_multiplier: 1.4,
      score_multiplier: 1.2,
      attack_bonus: 8
    },
    {
      key: 'arrow_barrage',
      name: 'Arrow Barrage',
      description: 'Concentrated ranged volley to thin enemy ranks.',
      goal_type: GOAL_TYPES.ATTACK,
      target_type: 'enemy',
      eligible_categories: ['Longbowmen', 'Crossbowmen', 'Skirmishers', 'Mounted Archers', 'Ballistae'],
      casualty_multiplier: 1.1,
      score_multiplier: 1,
      attack_bonus: 4
    },
    {
      key: 'spear_charge',
      name: 'Spear Charge',
      description: 'A disciplined spear thrust against a chosen enemy.',
      goal_type: GOAL_TYPES.ATTACK,
      target_type: 'enemy',
      eligible_categories: ['Spear Wall', 'Pikemen', 'Heavy Infantry'],
      casualty_multiplier: 1.1,
      score_multiplier: 1,
      attack_bonus: 5
    },
    {
      key: 'artillery_volley',
      name: 'Artillery Volley',
      description: 'Long-range siege fire directed at a target formation.',
      goal_type: GOAL_TYPES.ATTACK,
      target_type: 'enemy',
      eligible_categories: ['Catapults', 'Trebuchets', 'Ballistae', 'Bombards'],
      casualty_multiplier: 1.3,
      score_multiplier: 1.1,
      attack_bonus: 6
    },
    {
      key: 'flanking_strike',
      name: 'Flanking Strike',
      description: 'Execute a coordinated attack on enemy flanks and weak points.',
      goal_type: GOAL_TYPES.ATTACK,
      target_type: 'enemy',
      eligible_categories: ['Light Cavalry', 'Scouts', 'Light Infantry', 'Lancers'],
      casualty_multiplier: 1.2,
      score_multiplier: 1.1,
      attack_bonus: 7
    },
    {
      key: 'overwhelming_assault',
      name: 'Overwhelming Assault',
      description: 'All-out frontal assault with maximum force deployment.',
      goal_type: GOAL_TYPES.ATTACK,
      target_type: 'enemy',
      eligible_categories: ['Heavy Infantry', 'Knights', 'Shock Cavalry', 'Royal Guard'],
      casualty_multiplier: 1.4,
      score_multiplier: 1.2,
      attack_bonus: 6
    }
  ],
  defending: [
    {
      key: 'hold_the_line',
      name: 'Hold the Line',
      description: 'Fortify your position to blunt enemy assaults.',
      goal_type: GOAL_TYPES.DEFEND,
      target_type: 'self',
      eligible_categories: ['Swordsmen', 'Shield Wall', 'Spear Wall', 'Pikemen', 'Heavy Infantry', 'Royal Guard'],
      casualty_multiplier: 0.7,
      score_multiplier: 0.8,
      defense_bonus: 5
    },
    {
      key: 'brace_for_impact',
      name: 'Brace for Impact',
      description: 'Prepare to absorb the next enemy strike.',
      goal_type: GOAL_TYPES.DEFEND,
      target_type: 'self',
      eligible_categories: ['Swordsmen', 'Shield Wall', 'Heavy Infantry', 'Knights'],
      casualty_multiplier: 0.6,
      score_multiplier: 0.7,
      defense_bonus: 10
    },
    {
      key: 'take_cover',
      name: 'Take Cover',
      description: 'Find cover and minimize casualties from incoming attacks.',
      goal_type: GOAL_TYPES.DEFEND,
      target_type: 'self',
      eligible_categories: ['Longbowmen', 'Crossbowmen', 'Skirmishers', 'Light Infantry', 'Scouts'],
      casualty_multiplier: 0.5,
      score_multiplier: 0.6,
      defense_bonus: 12
    },
    {
      key: 'fortify_position',
      name: 'Fortify Position',
      description: 'Dig in and create defensive works for siege units.',
      goal_type: GOAL_TYPES.DEFEND,
      target_type: 'self',
      eligible_categories: ['Catapults', 'Trebuchets', 'Ballistae', 'Bombards', 'Siege Towers'],
      casualty_multiplier: 0.6,
      score_multiplier: 0.8,
      defense_bonus: 8
    },
    {
      key: 'shield_wall',
      name: 'Shield Wall',
      description: 'Form an impenetrable wall of shields and armor, maximizing defense.',
      goal_type: GOAL_TYPES.DEFEND,
      target_type: 'self',
      eligible_categories: ['Shield Wall', 'Heavy Infantry', 'Royal Guard', 'Pikemen'],
      casualty_multiplier: 0.5,
      score_multiplier: 0.9,
      defense_bonus: 15
    },
    {
      key: 'guerrilla_tactics',
      name: 'Guerrilla Tactics',
      description: 'Use evasion and mobility to avoid and counter enemy attacks.',
      goal_type: GOAL_TYPES.DEFEND,
      target_type: 'self',
      eligible_categories: ['Scouts', 'Light Cavalry', 'Skirmishers', 'Mounted Archers'],
      casualty_multiplier: 0.4,
      score_multiplier: 0.7,
      defense_bonus: 14
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
      eligible_categories: ['Scouts', 'Light Cavalry', 'Spies', 'Skirmishers'],
      score_multiplier: 1.1
    },
    {
      key: 'rally_troops',
      name: 'Rally Our Troops',
      description: 'Boost morale and coordination within your army.',
      goal_type: GOAL_TYPES.LOGISTICS,
      target_type: 'self',
      effect: 'increase_self',
      eligible_categories: ['Royal Guard', 'Knights', 'Swordsmen', 'Shield Wall', 'Heavy Infantry', 'Light Infantry'],
      score_multiplier: 0.9
    },
    {
      key: 'rapid_resupply',
      name: 'Rapid Resupply',
      description: 'Improve supply efficiency to bolster your battle score.',
      goal_type: GOAL_TYPES.LOGISTICS,
      target_type: 'self',
      effect: 'increase_self',
      eligible_categories: ['Scouts', 'Spies', 'Light Infantry', 'Light Cavalry'],
      score_multiplier: 1.2
    },
    {
      key: 'disrupt_comms',
      name: 'Disrupt Communications',
      description: 'Confuse enemy command and reduce their effectiveness.',
      goal_type: GOAL_TYPES.LOGISTICS,
      target_type: 'enemy',
      effect: 'decrease_target',
      eligible_categories: ['Spies', 'Scouts'],
      score_multiplier: 1.3
    },
    {
      key: 'supply_cache',
      name: 'Establish Supply Cache',
      description: 'Create hidden supply stations across the battlefield for sustained operations.',
      goal_type: GOAL_TYPES.LOGISTICS,
      target_type: 'self',
      effect: 'increase_self',
      eligible_categories: ['Scouts', 'Light Cavalry', 'Spies'],
      score_multiplier: 1.1
    },
    {
      key: 'field_medical',
      name: 'Deploy Field Medical',
      description: 'Set up medical stations to reduce casualty impact and sustain forces.',
      goal_type: GOAL_TYPES.LOGISTICS,
      target_type: 'self',
      effect: 'increase_self',
      eligible_categories: ['Knights', 'Royal Guard', 'Swordsmen', 'Heavy Infantry'],
      score_multiplier: 1
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
      guaranteed_casualty: 1,
      casualty_multiplier: 2,
      score_multiplier: 2.5,
      attack_bonus: 10
    },
    {
      key: 'crusade_charge',
      name: 'Holy Crusade',
      description: 'A devastating righteous charge that combines elite knight training with overwhelming force. Deals significant damage to enemies while bolstering the courage of allied forces.',
      goal_type: GOAL_TYPES.ATTACK,
      target_type: 'enemy',
      effect: 'decrease_target_half_score',
      eligible_categories: ['Knights'],
      casualty_multiplier: 1.8,
      score_multiplier: 2,
      attack_bonus: 12
    },
    {
      key: 'scout_strike',
      name: 'Reconnaissance Strike',
      description: 'Execute a precision strike based on scouted intelligence, targeting enemy weaknesses. Quick, accurate, and devastating to unprepared foes.',
      goal_type: GOAL_TYPES.ATTACK,
      target_type: 'enemy',
      effect: 'decrease_target_half_score',
      eligible_categories: ['Scouts'],
      casualty_multiplier: 1.6,
      score_multiplier: 1.8,
      attack_bonus: 14
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
