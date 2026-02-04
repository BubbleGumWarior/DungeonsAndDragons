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
      eligible_categories: ['Spear Wall', 'Pikemen', 'Heavy Infantry', 'Swordsmen']
    },
    {
      key: 'artillery_volley',
      name: 'Artillery Volley',
      description: 'Long-range siege fire directed at a target formation.',
      goal_type: GOAL_TYPES.ATTACK,
      target_type: 'enemy',
      eligible_categories: ['Catapults', 'Trebuchets', 'Ballistae', 'Bombards']
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
    }
  ],
  custom: [],
  commander: []
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
