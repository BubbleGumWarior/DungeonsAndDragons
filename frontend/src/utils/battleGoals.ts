export type BattleGoalType = 'attack' | 'defend' | 'logistics' | 'custom' | 'commander';
export type BattleGoalSection = 'attacking' | 'defending' | 'logistics' | 'custom' | 'commander' | 'unique';

export type ScoreRequirementType = 'ahead' | 'behind';

export interface ScoreRequirement {
	method: ScoreRequirementType;
	delta: number;
}

export interface BattleGoalDefinition {
	key: string;
	name: string;
	description: string;
	goal_type: BattleGoalType;
	target_type: 'enemy' | 'self' | 'optional';
	effect?: 'decrease_target' | 'increase_self' | 'decrease_target_half_score';
	eligible_categories?: string[];
	lock_reason?: string; // Reason why a unit can't use this goal
	score_requirement?: ScoreRequirement; // Score delta required vs target
	guaranteed_casualty?: number; // Guaranteed casualties from this goal (e.g., assassinate always costs 1)
}

export const BATTLE_GOALS: Record<BattleGoalSection, BattleGoalDefinition[]> = {
	attacking: [
		{
			key: 'basic_attack',
			name: 'Basic Attack',
			description: 'A straightforward frontal assault against the enemy. Available to all units.',
			goal_type: 'attack',
			target_type: 'enemy',
			eligible_categories: []
		},
		{
			key: 'cavalry_charge',
			name: 'Cavalry Charge',
			description: 'A devastating mounted charge aimed at breaking enemy lines.',
			goal_type: 'attack',
			target_type: 'enemy',
			eligible_categories: ['Knights', 'Shock Cavalry', 'Heavy Cavalry', 'Light Cavalry', 'Lancers', 'Mounted Archers'],
			lock_reason: 'Requires mounted units'
		},
		{
			key: 'arrow_barrage',
			name: 'Arrow Barrage',
			description: 'Concentrated ranged volley to thin enemy ranks.',
			goal_type: 'attack',
			target_type: 'enemy',
			eligible_categories: ['Longbowmen', 'Crossbowmen', 'Skirmishers', 'Mounted Archers', 'Ballistae'],
			lock_reason: 'Requires ranged units'
		},
		{
			key: 'spear_charge',
			name: 'Spear Charge',
			description: 'A disciplined spear thrust against a chosen enemy.',
			goal_type: 'attack',
			target_type: 'enemy',
			eligible_categories: ['Spear Wall', 'Pikemen', 'Heavy Infantry'],
			lock_reason: 'Requires heavy infantry'
		},
		{
			key: 'artillery_volley',
			name: 'Artillery Volley',
			description: 'Long-range siege fire directed at a target formation.',
			goal_type: 'attack',
			target_type: 'enemy',
			eligible_categories: ['Catapults', 'Trebuchets', 'Ballistae', 'Bombards'],
			lock_reason: 'Requires siege weapons'
		},
		{
			key: 'flanking_strike',
			name: 'Flanking Strike',
			description: 'Execute a coordinated attack on enemy flanks and weak points.',
			goal_type: 'attack',
			target_type: 'enemy',
			eligible_categories: ['Light Cavalry', 'Scouts', 'Light Infantry', 'Lancers'],
			lock_reason: 'Requires fast, mobile units',
			score_requirement: { method: 'ahead', delta: 6 }
		},
		{
			key: 'desperation_raid',
			name: 'Desperation Raid',
			description: 'A risky raid launched when you are outmatched, aimed at disrupting a stronger foe.',
			goal_type: 'attack',
			target_type: 'enemy',
			eligible_categories: ['Scouts', 'Light Cavalry', 'Skirmishers', 'Light Infantry'],
			lock_reason: 'Requires fast raiders',
			score_requirement: { method: 'behind', delta: 10 }
		},
		{
			key: 'overwhelming_assault',
			name: 'Overwhelming Assault',
			description: 'All-out frontal assault with maximum force deployment.',
			goal_type: 'attack',
			target_type: 'enemy',
			eligible_categories: ['Heavy Infantry', 'Knights', 'Shock Cavalry', 'Royal Guard'],
			score_requirement: { method: 'ahead', delta: 8 }
		}
	],
	defending: [
		{
			key: 'defensive_stance',
			name: 'Defensive Stance',
			description: 'Adopt a cautious posture to reduce losses and stabilize the line. Available to all units.',
			goal_type: 'defend',
			target_type: 'self',
			eligible_categories: []
		},
		{
			key: 'hold_the_line',
			name: 'Hold the Line',
			description: 'Fortify your position to blunt enemy assaults.',
			goal_type: 'defend',
			target_type: 'self',
			eligible_categories: ['Swordsmen', 'Shield Wall', 'Spear Wall', 'Pikemen', 'Heavy Infantry', 'Royal Guard']
		},
		{
			key: 'brace_for_impact',
			name: 'Brace for Impact',
			description: 'Prepare to absorb the next enemy strike.',
			goal_type: 'defend',
			target_type: 'self',
			eligible_categories: ['Swordsmen', 'Shield Wall', 'Heavy Infantry', 'Knights']
		},
		{
			key: 'take_cover',
			name: 'Take Cover',
			description: 'Find cover and minimize casualties from incoming attacks.',
			goal_type: 'defend',
			target_type: 'self',
			eligible_categories: ['Longbowmen', 'Crossbowmen', 'Skirmishers', 'Light Infantry', 'Scouts'],
			lock_reason: 'Better suited for light units and ranged troops'
		},
		{
			key: 'fortify_position',
			name: 'Fortify Position',
			description: 'Dig in and create defensive works for siege units.',
			goal_type: 'defend',
			target_type: 'self',
			eligible_categories: ['Catapults', 'Trebuchets', 'Ballistae', 'Bombards', 'Siege Towers'],
			lock_reason: 'Requires siege equipment'
		},
		{
			key: 'shield_wall',
			name: 'Shield Wall',
			description: 'Form an impenetrable wall of shields and armor, maximizing defense.',
			goal_type: 'defend',
			target_type: 'self',
			eligible_categories: ['Shield Wall', 'Heavy Infantry', 'Royal Guard', 'Pikemen'],
			lock_reason: 'Requires heavily armored melee units'
		},
		{
			key: 'guerrilla_tactics',
			name: 'Guerrilla Tactics',
			description: 'Use evasion and mobility to avoid and counter enemy attacks.',
			goal_type: 'defend',
			target_type: 'self',
			eligible_categories: ['Scouts', 'Light Cavalry', 'Skirmishers', 'Mounted Archers'],
			lock_reason: 'Requires fast, mobile units'
		}
	],
	logistics: [
		{
			key: 'steady_supplies',
			name: 'Steady Supplies',
			description: 'Maintain consistent supply flow to keep your army effective. Available to all units.',
			goal_type: 'logistics',
			target_type: 'self',
			effect: 'increase_self',
			eligible_categories: []
		},
		{
			key: 'covert_funding',
			name: 'Covert Funding',
			description: 'Leverage hidden networks to bolster your battle score through clandestine support.',
			goal_type: 'logistics',
			target_type: 'self',
			effect: 'increase_self',
			eligible_categories: ['Spies', 'Assassins'],
			lock_reason: 'Requires spies or assassins'
		},
		{
			key: 'intercept_supply',
			name: 'Intercept Supply Lines',
			description: 'Disrupt enemy logistics to weaken their momentum.',
			goal_type: 'logistics',
			target_type: 'enemy',
			effect: 'decrease_target',
			eligible_categories: ['Scouts', 'Light Cavalry', 'Spies', 'Skirmishers'],
			lock_reason: 'Requires scouts or spies'
		},
		{
			key: 'rally_troops',
			name: 'Rally Our Troops',
			description: 'Boost morale and coordination within your army.',
			goal_type: 'logistics',
			target_type: 'self',
			effect: 'increase_self',
			eligible_categories: ['Royal Guard', 'Knights', 'Swordsmen', 'Shield Wall', 'Heavy Infantry', 'Light Infantry']
		},
		{
			key: 'rapid_resupply',
			name: 'Rapid Resupply',
			description: 'Improve supply efficiency to bolster your battle score.',
			goal_type: 'logistics',
			target_type: 'self',
			effect: 'increase_self',
			eligible_categories: ['Scouts', 'Spies', 'Light Infantry', 'Light Cavalry']
		},
		{
			key: 'disrupt_comms',
			name: 'Disrupt Communications',
			description: 'Confuse enemy command and reduce their effectiveness.',
			goal_type: 'logistics',
			target_type: 'enemy',
			effect: 'decrease_target',
			eligible_categories: ['Spies', 'Scouts'],
			lock_reason: 'Requires intelligence specialists'
		},
		{
			key: 'supply_cache',
			name: 'Establish Supply Cache',
			description: 'Create hidden supply stations across the battlefield for sustained operations.',
			goal_type: 'logistics',
			target_type: 'self',
			effect: 'increase_self',
			eligible_categories: ['Scouts', 'Light Cavalry', 'Spies']
		},
		{
			key: 'field_medical',
			name: 'Deploy Field Medical',
			description: 'Set up medical stations to reduce casualty impact and sustain forces.',
			goal_type: 'logistics',
			target_type: 'self',
			effect: 'increase_self',
			eligible_categories: ['Knights', 'Royal Guard', 'Swordsmen', 'Heavy Infantry']
		}
	],
	custom: [
		{
			key: 'skip_goal',
			name: 'Hold Position',
			description: 'No viable actions this round. The army holds position and waits.',
			goal_type: 'custom',
			target_type: 'self',
			eligible_categories: []
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
			eligible_categories: ['Assassins'],
			effect: 'decrease_target_half_score',
			lock_reason: 'Requires Assassin units',
			score_requirement: { method: 'ahead', delta: 10 }
		},
		{
			key: 'crusade_charge',
			name: 'Holy Crusade',
			description: 'A righteous charge by elite knights that hits hard while bolstering allied courage.',
			goal_type: 'attack',
			target_type: 'enemy',
			eligible_categories: ['Knights'],
			lock_reason: 'Requires Knight units',
			score_requirement: { method: 'ahead', delta: 8 }
		},
		{
			key: 'scout_strike',
			name: 'Reconnaissance Strike',
			description: 'A precision strike guided by scouting that punishes exposed enemy weaknesses.',
			goal_type: 'attack',
			target_type: 'enemy',
			eligible_categories: ['Scouts'],
			lock_reason: 'Requires Scout units',
			score_requirement: { method: 'ahead', delta: 6 }
		}
	]
};

export const flattenGoals = () => Object.values(BATTLE_GOALS).flat();

export const findGoalByKey = (goalKey: string) => flattenGoals().find(goal => goal.key === goalKey);

export const isGoalEligible = (goal: BattleGoalDefinition, category: string) => {
	if (!goal.eligible_categories || goal.eligible_categories.length === 0) return true;
	return goal.eligible_categories.includes(category);
};
