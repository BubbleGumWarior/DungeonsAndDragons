export type BattleGoalType = 'attack' | 'defend' | 'logistics' | 'custom' | 'commander';
export type BattleGoalSection = 'attacking' | 'defending' | 'logistics' | 'custom' | 'commander';

export interface BattleGoalDefinition {
	key: string;
	name: string;
	description: string;
	goal_type: BattleGoalType;
	target_type: 'enemy' | 'self' | 'optional';
	effect?: 'decrease_target' | 'increase_self';
	eligible_categories?: string[];
}

export const BATTLE_GOALS: Record<BattleGoalSection, BattleGoalDefinition[]> = {
	attacking: [
		{
			key: 'cavalry_charge',
			name: 'Cavalry Charge',
			description: 'A devastating mounted charge aimed at breaking enemy lines.',
			goal_type: 'attack',
			target_type: 'enemy',
			eligible_categories: ['Knights', 'Shock Cavalry', 'Heavy Cavalry', 'Light Cavalry', 'Lancers', 'Mounted Archers']
		},
		{
			key: 'arrow_barrage',
			name: 'Arrow Barrage',
			description: 'Concentrated ranged volley to thin enemy ranks.',
			goal_type: 'attack',
			target_type: 'enemy',
			eligible_categories: ['Longbowmen', 'Crossbowmen', 'Skirmishers', 'Mounted Archers', 'Ballistae']
		},
		{
			key: 'spear_charge',
			name: 'Spear Charge',
			description: 'A disciplined spear thrust against a chosen enemy.',
			goal_type: 'attack',
			target_type: 'enemy',
			eligible_categories: ['Spear Wall', 'Pikemen', 'Heavy Infantry', 'Swordsmen']
		},
		{
			key: 'artillery_volley',
			name: 'Artillery Volley',
			description: 'Long-range siege fire directed at a target formation.',
			goal_type: 'attack',
			target_type: 'enemy',
			eligible_categories: ['Catapults', 'Trebuchets', 'Ballistae', 'Bombards']
		}
	],
	defending: [
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
			eligible_categories: ['Longbowmen', 'Crossbowmen', 'Skirmishers', 'Light Infantry', 'Scouts']
		},
		{
			key: 'fortify_position',
			name: 'Fortify Position',
			description: 'Dig in and create defensive works for siege units.',
			goal_type: 'defend',
			target_type: 'self',
			eligible_categories: ['Catapults', 'Trebuchets', 'Ballistae', 'Bombards', 'Siege Towers']
		}
	],
	logistics: [
		{
			key: 'intercept_supply',
			name: 'Intercept Supply Lines',
			description: 'Disrupt enemy logistics to weaken their momentum.',
			goal_type: 'logistics',
			target_type: 'enemy',
			effect: 'decrease_target',
			eligible_categories: ['Scouts', 'Light Cavalry', 'Spies', 'Skirmishers']
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
			eligible_categories: ['Spies', 'Scouts']
		}
	],
	custom: [],
	commander: []
};

export const flattenGoals = () => Object.values(BATTLE_GOALS).flat();

export const findGoalByKey = (goalKey: string) => flattenGoals().find(goal => goal.key === goalKey);

export const isGoalEligible = (goal: BattleGoalDefinition, category: string) => {
	if (!goal.eligible_categories || goal.eligible_categories.length === 0) return true;
	return goal.eligible_categories.includes(category);
};
