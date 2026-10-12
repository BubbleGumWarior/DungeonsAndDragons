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
    },
    {
      key: 'arcane_blast',
      name: 'Arcane Blast',
      description: 'Hurl a bolt of raw arcane force at a target within reach.',
      goal_type: GOAL_TYPES.ATTACK,
      target_type: 'enemy',
      eligible_categories: ['Apprentice Mage', 'Battle Mage', 'Archmage', 'Necromancer', 'Pyromancer'],
      casualty_multiplier: 1.2,
      score_multiplier: 1.1,
      attack_bonus: 6
    },
    {
      key: 'chain_lightning',
      name: 'Chain Lightning',
      description: 'Lightning arcs through the enemy ranks, punishing a packed formation.',
      goal_type: GOAL_TYPES.ATTACK,
      target_type: 'enemy',
      eligible_categories: ['Battle Mage', 'Archmage', 'Necromancer', 'Pyromancer'],
      casualty_multiplier: 1.5,
      score_multiplier: 1.3,
      attack_bonus: 8
    },
    {
      key: 'dragon_sweep',
      name: 'Sweep Attack',
      description: 'A wing and tail sweep across the front rank that scatters the line.',
      goal_type: GOAL_TYPES.ATTACK,
      target_type: 'enemy',
      eligible_categories: ['Wyrmling', 'Drake', 'Elder Dragon'],
      casualty_multiplier: 1.4,
      score_multiplier: 1.2,
      attack_bonus: 7
    },
    {
      key: 'fire_breath',
      name: 'Fire Breath',
      description: 'A cone of dragonfire that scorches everything in front of the dragon.',
      goal_type: GOAL_TYPES.ATTACK,
      target_type: 'enemy',
      eligible_categories: ['Drake', 'Elder Dragon'],
      casualty_multiplier: 1.8,
      score_multiplier: 1.6,
      attack_bonus: 9,
      score_requirement: { method: 'ahead', delta: 4 }
    },
    {
      key: 'necrotic_blast',
      name: 'Necrotic Blast',
      description: 'Blast the enemy with deathly energy. Roughly four in ten of the dead rise again as skeletons of their own unit line under your command.',
      goal_type: GOAL_TYPES.ATTACK,
      target_type: 'enemy',
      eligible_categories: ['Necromancer'],
      casualty_multiplier: 1.3,
      score_multiplier: 1.2,
      attack_bonus: 6
    },
    {
      key: 'cataclysmic_fireball',
      name: 'Cataclysmic Fireball',
      description: 'Detonate a colossal fireball over the enemy host. Devastating, but the blast scorches your own ranks too.',
      goal_type: GOAL_TYPES.ATTACK,
      target_type: 'enemy',
      eligible_categories: ['Pyromancer'],
      casualty_multiplier: 3,
      score_multiplier: 2.6,
      attack_bonus: 14,
      guaranteed_casualty: 2
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
    },
    {
      key: 'arcane_ward',
      name: 'Arcane Ward',
      description: 'Weave a shimmering ward that absorbs the first blows of the enemy.',
      goal_type: GOAL_TYPES.DEFEND,
      target_type: 'self',
      eligible_categories: ['Apprentice Mage', 'Battle Mage', 'Archmage', 'Necromancer', 'Pyromancer'],
      casualty_multiplier: 0.65,
      score_multiplier: 0.75,
      defense_bonus: 6
    },
    {
      key: 'dragon_hide',
      name: 'Dragon Hide',
      description: 'Scaled hide turns aside blades and arrows while the dragon stands its ground.',
      goal_type: GOAL_TYPES.DEFEND,
      target_type: 'self',
      eligible_categories: ['Wyrmling', 'Drake', 'Elder Dragon'],
      casualty_multiplier: 0.6,
      score_multiplier: 0.7,
      defense_bonus: 7
    },
    {
      key: 'bone_ward',
      name: 'Bone Ward',
      description: 'A rattling wall of bone shields the army and soaks up the enemy blows.',
      goal_type: GOAL_TYPES.DEFEND,
      target_type: 'self',
      eligible_categories: ['Necromancer'],
      casualty_multiplier: 0.65,
      score_multiplier: 0.75,
      defense_bonus: 6
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
    },
    {
      key: 'steady_the_ranks',
      name: 'Steady the Ranks',
      description: 'Rest, rations and rousing words restore the army\'s nerve. Use it before a wavering army breaks and flees.',
      goal_type: GOAL_TYPES.LOGISTICS,
      target_type: 'self',
      effect: 'restore_morale',
      eligible_categories: [],
      score_multiplier: 0
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
  commander: [
    {
      key: 'duel_commander',
      name: 'Challenge the Commander to a Duel',
      description: 'Call out the enemy commander for single combat in front of both armies. The DM rules on who falls, who yields and how the watching armies take it.',
      goal_type: GOAL_TYPES.COMMANDER,
      target_type: 'enemy',
      manual: true, // no dice: the DM rules on the outcome
      eligible_categories: []
    },
    {
      key: 'bodyguard_charge',
      name: 'Bodyguard Charge',
      description: 'Lead your commander\'s bodyguards in a charge straight at the enemy commander and the guards around them. The DM rules on the clash.',
      goal_type: GOAL_TYPES.COMMANDER,
      target_type: 'enemy',
      manual: true, // no dice: the DM rules on the outcome
      eligible_categories: []
    },
    {
      key: 'pick_off_stragglers',
      name: 'Pick Off Stragglers',
      description: 'Hunt down scattered, wounded and lagging enemies at the edge of their formation. The DM decides how many fall and what it costs.',
      goal_type: GOAL_TYPES.COMMANDER,
      target_type: 'enemy',
      manual: true, // no dice: the DM rules on the outcome
      eligible_categories: []
    },
    {
      key: 'slay_dragon',
      name: 'Attack the Dragon',
      description: 'Bring the full weight of the army to bear on a dragon with ballistae, spears and fire. The DM rules how the beast and its attackers fare.',
      goal_type: GOAL_TYPES.COMMANDER,
      target_type: 'enemy',
      manual: true, // no dice: the DM rules on the outcome
      eligible_categories: [],
      target_base_types: ['dragon']
    }
  ],
  unique: [
    {
      key: 'vanish',
      name: 'Melt into the Shadows',
      description: 'Slip out of sight. On a success the army is hidden for the next round: the enemy cannot see it or target it, and it can use Shadow Strike. Failing leaves it exposed.',
      goal_type: GOAL_TYPES.CUSTOM,
      target_type: 'self',
      effect: 'stealth',
      eligible_categories: ['Street Informant', 'Infiltrator', 'Scout', 'Master Scout', 'Spy', 'Master Spy', 'Assassin', 'Shadow Assassin'],
      score_multiplier: 0
    },
    {
      key: 'stealth_strike',
      name: 'Shadow Strike',
      description: 'Strike from hiding with no warning and no defence. The deadliest goal in the game, and the higher the covert rank the worse it gets. Needs the army to be hidden first.',
      goal_type: GOAL_TYPES.ATTACK,
      target_type: 'enemy',
      requires_hidden: true,
      stealth: true,
      eligible_categories: ['Street Informant', 'Infiltrator', 'Scout', 'Master Scout', 'Spy', 'Master Spy', 'Assassin', 'Shadow Assassin'],
      casualty_multiplier: 6,
      score_multiplier: 3
    },
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
    },
    {
      key: 'meteor_swarm',
      name: 'Meteor Swarm',
      description: 'An archmage calls burning stones from the sky onto the enemy host.',
      goal_type: GOAL_TYPES.ATTACK,
      target_type: 'enemy',
      eligible_categories: ['Archmage'],
      casualty_multiplier: 2,
      score_multiplier: 2.2,
      attack_bonus: 12,
      score_requirement: { method: 'ahead', delta: 8 }
    },
    {
      key: 'dragonfire_inferno',
      name: 'Dragonfire Inferno',
      description: 'An elder dragon engulfs the field in a sustained firestorm.',
      goal_type: GOAL_TYPES.ATTACK,
      target_type: 'enemy',
      eligible_categories: ['Elder Dragon'],
      casualty_multiplier: 2.5,
      score_multiplier: 2.5,
      attack_bonus: 14,
      score_requirement: { method: 'ahead', delta: 8 }
    }
  ]
};

// Necromancers turn a share of the troops their attacks kill into skeletons of the same unit line
const RAISE_DEAD = { categories: ['Necromancer'], percent: 0.4 };

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
  RAISE_DEAD,
  findGoalByKey,
  isGoalEligible
};
