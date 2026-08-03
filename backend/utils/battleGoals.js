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
      eligible_categories: ['Knight', 'Heavy Cavalry', 'Royal Lancer', 'Lancer', 'Man-at-Arms', 'Mounted Archer', 'Horse Archer'],
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
      eligible_categories: ['Longbowman', 'Crossbowman', 'Arbalest', 'Skirmisher', 'Ranger', 'Mounted Archer', 'Horse Archer', 'Ballista Crew', 'Heavy Ballista'],
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
      eligible_categories: ['Spearman', 'Pikeman', 'Shield Guard', 'Greatsword Master'],
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
      eligible_categories: ['Catapult Crew', 'Trebuchet Crew', 'Ballista Crew', 'Heavy Ballista', 'Bombard Crew', 'Grand Bombard'],
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
      eligible_categories: ['Lancer', 'Royal Lancer', 'Man-at-Arms', 'Scout', 'Master Scout', 'Recruit', 'Soldier'],
      casualty_multiplier: 1.2,
      score_multiplier: 1.1,
      attack_bonus: 7,
      score_requirement: { method: 'ahead', delta: 6 }
    },
    {
      key: 'desperation_raid',
      name: 'Desperation Raid',
      description: 'A risky raid launched when you are outmatched, aimed at disrupting a stronger foe.',
      goal_type: GOAL_TYPES.ATTACK,
      target_type: 'enemy',
      eligible_categories: ['Scout', 'Master Scout', 'Lancer', 'Man-at-Arms', 'Skirmisher', 'Ranger', 'Recruit', 'Soldier'],
      casualty_multiplier: 1.2,
      score_multiplier: 1.1,
      attack_bonus: 6,
      score_requirement: { method: 'behind', delta: 10 }
    },
    {
      key: 'overwhelming_assault',
      name: 'Overwhelming Assault',
      description: 'All-out frontal assault with maximum force deployment.',
      goal_type: GOAL_TYPES.ATTACK,
      target_type: 'enemy',
      eligible_categories: ['Pikeman', 'Greatsword Master', 'Knight', 'Heavy Cavalry', 'Royal Guard'],
      casualty_multiplier: 1.4,
      score_multiplier: 1.2,
      attack_bonus: 6,
      score_requirement: { method: 'ahead', delta: 8 }
    }
  ],
  defending: [
    {
      key: 'defensive_stance',
      name: 'Defensive Stance',
      description: 'Adopt a cautious posture to reduce losses and stabilize the line. Available to all units.',
      goal_type: GOAL_TYPES.DEFEND,
      target_type: 'self',
      eligible_categories: [],
      casualty_multiplier: 0.6,
      score_multiplier: 0.7,
      defense_bonus: 6
    },
    {
      key: 'hold_the_line',
      name: 'Hold the Line',
      description: 'Fortify your position to blunt enemy assaults.',
      goal_type: GOAL_TYPES.DEFEND,
      target_type: 'self',
      eligible_categories: ['Soldier', 'Spearman', 'Pikeman', 'Shield Guard', 'Greatsword Master', 'Royal Guard'],
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
      eligible_categories: ['Soldier', 'Spearman', 'Shield Guard', 'Pikeman', 'Knight'],
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
      eligible_categories: ['Longbowman', 'Crossbowman', 'Arbalest', 'Skirmisher', 'Ranger', 'Recruit', 'Soldier', 'Scout', 'Master Scout'],
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
      eligible_categories: ['Catapult Crew', 'Trebuchet Crew', 'Ballista Crew', 'Heavy Ballista', 'Bombard Crew', 'Grand Bombard', 'Siege Tower Operator'],
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
      eligible_categories: ['Shield Guard', 'Pikeman', 'Greatsword Master', 'Royal Guard'],
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
      eligible_categories: ['Scout', 'Master Scout', 'Lancer', 'Man-at-Arms', 'Skirmisher', 'Ranger', 'Mounted Archer', 'Horse Archer'],
      casualty_multiplier: 0.4,
      score_multiplier: 0.7,
      defense_bonus: 14
    }
  ],
  logistics: [
    {
      key: 'steady_supplies',
      name: 'Steady Supplies',
      description: 'Maintain consistent supply flow to keep your army effective. Available to all units.',
      goal_type: GOAL_TYPES.LOGISTICS,
      target_type: 'self',
      effect: 'increase_self',
      eligible_categories: [],
      score_multiplier: 1
    },
    {
      key: 'covert_funding',
      name: 'Covert Funding',
      description: 'Leverage hidden networks to bolster your battle score through clandestine support.',
      goal_type: GOAL_TYPES.LOGISTICS,
      target_type: 'self',
      effect: 'increase_self',
      eligible_categories: ['Spy', 'Master Spy', 'Assassin', 'Shadow Assassin'],
      score_multiplier: 1.3
    },
    {
      key: 'intercept_supply',
      name: 'Intercept Supply Lines',
      description: 'Disrupt enemy logistics to weaken their momentum.',
      goal_type: GOAL_TYPES.LOGISTICS,
      target_type: 'enemy',
      effect: 'decrease_target',
      eligible_categories: ['Scout', 'Master Scout', 'Lancer', 'Man-at-Arms', 'Spy', 'Master Spy', 'Skirmisher', 'Ranger'],
      score_multiplier: 1.1
    },
    {
      key: 'rally_troops',
      name: 'Rally Our Troops',
      description: 'Boost morale and coordination within your army.',
      goal_type: GOAL_TYPES.LOGISTICS,
      target_type: 'self',
      effect: 'increase_self',
      eligible_categories: ['Royal Guard', 'Knight', 'Soldier', 'Spearman', 'Shield Guard', 'Pikeman', 'Recruit'],
      score_multiplier: 0.9
    },
    {
      key: 'rapid_resupply',
      name: 'Rapid Resupply',
      description: 'Improve supply efficiency to bolster your battle score.',
      goal_type: GOAL_TYPES.LOGISTICS,
      target_type: 'self',
      effect: 'increase_self',
      eligible_categories: ['Scout', 'Master Scout', 'Lancer', 'Man-at-Arms', 'Spy', 'Master Spy'],
      score_multiplier: 1.2
    },
    {
      key: 'disrupt_comms',
      name: 'Disrupt Communications',
      description: 'Confuse enemy command and reduce their effectiveness.',
      goal_type: GOAL_TYPES.LOGISTICS,
      target_type: 'enemy',
      effect: 'decrease_target',
      eligible_categories: ['Spy', 'Master Spy', 'Scout', 'Master Scout'],
      score_multiplier: 1.3
    },
    {
      key: 'supply_cache',
      name: 'Establish Supply Cache',
      description: 'Create hidden supply stations across the battlefield for sustained operations.',
      goal_type: GOAL_TYPES.LOGISTICS,
      target_type: 'self',
      effect: 'increase_self',
      eligible_categories: ['Scout', 'Master Scout', 'Lancer', 'Man-at-Arms', 'Spy', 'Master Spy'],
      score_multiplier: 1.1
    },
    {
      key: 'field_medical',
      name: 'Deploy Field Medical',
      description: 'Set up medical stations to reduce casualty impact and sustain forces.',
      goal_type: GOAL_TYPES.LOGISTICS,
      target_type: 'self',
      effect: 'increase_self',
      eligible_categories: ['Knight', 'Royal Guard', 'Soldier', 'Shield Guard', 'Pikeman'],
      score_multiplier: 1
    }
  ],
  custom: [
    {
      key: 'skip_goal',
      name: 'Hold Position',
      description: 'No viable actions this round. The army holds position and waits.',
      goal_type: GOAL_TYPES.CUSTOM,
      target_type: 'self',
      eligible_categories: [],
      casualty_multiplier: 0,
      score_multiplier: 0
    }
  ],
  commander: [],
  unique: [
    {
      key: 'assassinate_commander',
      name: 'Assassinate Commander',
      description: 'Send elite assassins to eliminate the enemy commander. Success guarantees a kill on the target and halves the enemy\'s battle score, while your casualties scale with how successful the strike was.',
      goal_type: 'attack',
      target_type: 'enemy',
      effect: 'decrease_target_half_score',
      eligible_categories: ['Assassin', 'Shadow Assassin'],
      casualty_multiplier: 2,
      score_multiplier: 2.5,
      attack_bonus: 10,
      score_requirement: { method: 'ahead', delta: 10 }
    },
    {
      key: 'crusade_charge',
      name: 'Holy Crusade',
      description: 'A righteous charge by elite knights that hits hard while bolstering allied courage.',
      goal_type: GOAL_TYPES.ATTACK,
      target_type: 'enemy',
      eligible_categories: ['Knight'],
      casualty_multiplier: 1.8,
      score_multiplier: 2,
      attack_bonus: 12,
      score_requirement: { method: 'ahead', delta: 8 }
    },
    {
      key: 'scout_strike',
      name: 'Reconnaissance Strike',
      description: 'A precision strike guided by scouting that punishes exposed enemy weaknesses.',
      goal_type: GOAL_TYPES.ATTACK,
      target_type: 'enemy',
      eligible_categories: ['Scout', 'Master Scout'],
      casualty_multiplier: 1.6,
      score_multiplier: 1.8,
      attack_bonus: 14,
      score_requirement: { method: 'ahead', delta: 6 }
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
