/**
 * UNIT_TEMPLATES — all 43 player-trainable unit progression templates (TypeScript version).
 * Mirrors backend/utils/unitTemplates.js exactly.
 */

export interface UnitStats {
  equipment: number;
  discipline: number;
  morale: number;
  command: number;
  logistics: number;
}

export interface BuildingRequirement {
  type: string;
  minLevel: number;
}

export interface UnitTemplate {
  tier: number;
  baseType: 'infantry' | 'archer' | 'cavalry' | 'guard' | 'artillery' | 'covert';
  icon: string;
  parents: string[];
  children: string[];
  buildingRequirements: BuildingRequirement[];
  baseDays: number;
  baseCost: { gold: number; food: number };
  stats: UnitStats;
}

export const UNIT_TEMPLATES: Record<string, UnitTemplate> = {
  // ─── Infantry (Barracks) ───────────────────────────────────────────────────
  'Recruit': {
    tier: 1, baseType: 'infantry', icon: '⚔️',
    parents: [], children: ['Soldier'],
    buildingRequirements: [{ type: 'barracks', minLevel: 1 }],
    baseDays: 3, baseCost: { gold: 5, food: 3 },
    stats: { equipment: 2, discipline: 3, morale: 3, command: 2, logistics: 3 },
  },
  'Soldier': {
    tier: 2, baseType: 'infantry', icon: '⚔️',
    parents: ['Recruit'], children: ['Spearman', 'Two-Handed Swordsman'],
    buildingRequirements: [{ type: 'barracks', minLevel: 2 }],
    baseDays: 6, baseCost: { gold: 10, food: 6 },
    stats: { equipment: 4, discipline: 5, morale: 5, command: 4, logistics: 4 },
  },
  'Spearman': {
    tier: 3, baseType: 'infantry', icon: '🗡️',
    parents: ['Soldier'], children: ['Pikeman'],
    buildingRequirements: [{ type: 'barracks', minLevel: 3 }],
    baseDays: 12, baseCost: { gold: 20, food: 12 },
    stats: { equipment: 6, discipline: 7, morale: 6, command: 5, logistics: 5 },
  },
  'Pikeman': {
    tier: 4, baseType: 'infantry', icon: '🔱',
    parents: ['Spearman'], children: [],
    buildingRequirements: [{ type: 'barracks', minLevel: 4 }],
    baseDays: 24, baseCost: { gold: 40, food: 24 },
    stats: { equipment: 7, discipline: 8, morale: 7, command: 6, logistics: 5 },
  },
  'Two-Handed Swordsman': {
    tier: 3, baseType: 'infantry', icon: '⚔️',
    parents: ['Soldier'], children: ['Greatsword Master'],
    buildingRequirements: [{ type: 'barracks', minLevel: 3 }, { type: 'armoury', minLevel: 1 }],
    baseDays: 12, baseCost: { gold: 22, food: 12 },
    stats: { equipment: 7, discipline: 6, morale: 7, command: 5, logistics: 4 },
  },
  'Greatsword Master': {
    tier: 4, baseType: 'infantry', icon: '⚔️',
    parents: ['Two-Handed Swordsman'], children: [],
    buildingRequirements: [{ type: 'barracks', minLevel: 4 }, { type: 'armoury', minLevel: 1 }],
    baseDays: 24, baseCost: { gold: 45, food: 24 },
    stats: { equipment: 9, discipline: 7, morale: 8, command: 6, logistics: 4 },
  },

  // ─── Archers (Barracks) ────────────────────────────────────────────────────
  'Skirmisher': {
    tier: 1, baseType: 'archer', icon: '🪃',
    parents: [], children: ['Ranger'],
    buildingRequirements: [{ type: 'barracks', minLevel: 1 }],
    baseDays: 5, baseCost: { gold: 8, food: 3 },
    stats: { equipment: 2, discipline: 2, morale: 3, command: 2, logistics: 4 },
  },
  'Ranger': {
    tier: 2, baseType: 'archer', icon: '🏹',
    parents: ['Skirmisher'], children: ['Archer', 'Crossbowman', 'Mounted Archer'],
    buildingRequirements: [{ type: 'barracks', minLevel: 2 }],
    baseDays: 10, baseCost: { gold: 16, food: 6 },
    stats: { equipment: 3, discipline: 4, morale: 4, command: 4, logistics: 5 },
  },
  'Archer': {
    tier: 3, baseType: 'archer', icon: '🏹',
    parents: ['Ranger'], children: ['Longbowman'],
    buildingRequirements: [{ type: 'barracks', minLevel: 3 }],
    baseDays: 20, baseCost: { gold: 32, food: 12 },
    stats: { equipment: 5, discipline: 6, morale: 6, command: 5, logistics: 6 },
  },
  'Longbowman': {
    tier: 4, baseType: 'archer', icon: '🏹',
    parents: ['Archer'], children: [],
    buildingRequirements: [{ type: 'barracks', minLevel: 4 }],
    baseDays: 40, baseCost: { gold: 64, food: 24 },
    stats: { equipment: 6, discipline: 7, morale: 8, command: 6, logistics: 7 },
  },
  'Crossbowman': {
    tier: 3, baseType: 'archer', icon: '🎯',
    parents: ['Ranger'], children: ['Arbalest'],
    buildingRequirements: [{ type: 'barracks', minLevel: 3 }, { type: 'workshop', minLevel: 1 }],
    baseDays: 20, baseCost: { gold: 32, food: 12 },
    stats: { equipment: 6, discipline: 6, morale: 5, command: 5, logistics: 6 },
  },
  'Arbalest': {
    tier: 4, baseType: 'archer', icon: '🎯',
    parents: ['Crossbowman'], children: [],
    buildingRequirements: [{ type: 'barracks', minLevel: 4 }, { type: 'workshop', minLevel: 1 }],
    baseDays: 40, baseCost: { gold: 64, food: 24 },
    stats: { equipment: 8, discipline: 7, morale: 6, command: 6, logistics: 7 },
  },
  'Mounted Archer': {
    tier: 3, baseType: 'archer', icon: '🏇',
    parents: ['Ranger', 'Man-at-Arms'], children: ['Horse Archer'],
    buildingRequirements: [{ type: 'barracks', minLevel: 2 }, { type: 'stable', minLevel: 2 }],
    baseDays: 20, baseCost: { gold: 40, food: 12 },
    stats: { equipment: 6, discipline: 5, morale: 6, command: 5, logistics: 7 },
  },
  'Horse Archer': {
    tier: 4, baseType: 'archer', icon: '🏇',
    parents: ['Mounted Archer'], children: [],
    buildingRequirements: [{ type: 'barracks', minLevel: 3 }, { type: 'stable', minLevel: 3 }],
    baseDays: 40, baseCost: { gold: 80, food: 24 },
    stats: { equipment: 7, discipline: 6, morale: 7, command: 6, logistics: 8 },
  },

  // ─── Cavalry (Stable) ──────────────────────────────────────────────────────
  'Squire': {
    tier: 1, baseType: 'cavalry', icon: '🐴',
    parents: [], children: ['Man-at-Arms'],
    buildingRequirements: [{ type: 'stable', minLevel: 1 }],
    baseDays: 7, baseCost: { gold: 15, food: 5 },
    stats: { equipment: 2, discipline: 2, morale: 3, command: 2, logistics: 3 },
  },
  'Man-at-Arms': {
    tier: 2, baseType: 'cavalry', icon: '🐴',
    parents: ['Squire'], children: ['Heavy Cavalry', 'Lancer', 'Mounted Archer'],
    buildingRequirements: [{ type: 'stable', minLevel: 2 }],
    baseDays: 14, baseCost: { gold: 30, food: 10 },
    stats: { equipment: 5, discipline: 4, morale: 4, command: 3, logistics: 4 },
  },
  'Heavy Cavalry': {
    tier: 3, baseType: 'cavalry', icon: '🛡️',
    parents: ['Man-at-Arms'], children: ['Knight'],
    buildingRequirements: [{ type: 'stable', minLevel: 3 }],
    baseDays: 28, baseCost: { gold: 60, food: 20 },
    stats: { equipment: 7, discipline: 6, morale: 6, command: 5, logistics: 5 },
  },
  'Knight': {
    tier: 4, baseType: 'cavalry', icon: '👑',
    parents: ['Heavy Cavalry'], children: [],
    buildingRequirements: [{ type: 'stable', minLevel: 4 }],
    baseDays: 56, baseCost: { gold: 120, food: 40 },
    stats: { equipment: 9, discipline: 7, morale: 7, command: 6, logistics: 5 },
  },
  'Lancer': {
    tier: 3, baseType: 'cavalry', icon: '🎪',
    parents: ['Man-at-Arms'], children: ['Royal Lancer'],
    buildingRequirements: [{ type: 'stable', minLevel: 3 }, { type: 'armoury', minLevel: 1 }],
    baseDays: 28, baseCost: { gold: 60, food: 20 },
    stats: { equipment: 7, discipline: 7, morale: 6, command: 5, logistics: 4 },
  },
  'Royal Lancer': {
    tier: 4, baseType: 'cavalry', icon: '🎪',
    parents: ['Lancer'], children: [],
    buildingRequirements: [{ type: 'stable', minLevel: 4 }, { type: 'armoury', minLevel: 1 }],
    baseDays: 56, baseCost: { gold: 120, food: 40 },
    stats: { equipment: 8, discipline: 8, morale: 7, command: 6, logistics: 4 },
  },

  // ─── Guards (Guard Post) ───────────────────────────────────────────────────
  'Watchman': {
    tier: 1, baseType: 'guard', icon: '🛡️',
    parents: [], children: ['Guard'],
    buildingRequirements: [{ type: 'guard_post', minLevel: 1 }],
    baseDays: 4, baseCost: { gold: 7, food: 3 },
    stats: { equipment: 2, discipline: 3, morale: 3, command: 2, logistics: 3 },
  },
  'Guard': {
    tier: 2, baseType: 'guard', icon: '🛡️',
    parents: ['Watchman'], children: ['Shield Guard', 'Axeman'],
    buildingRequirements: [{ type: 'guard_post', minLevel: 2 }],
    baseDays: 8, baseCost: { gold: 14, food: 6 },
    stats: { equipment: 4, discipline: 5, morale: 4, command: 3, logistics: 4 },
  },
  'Shield Guard': {
    tier: 3, baseType: 'guard', icon: '🛡️',
    parents: ['Guard'], children: ['Royal Guard'],
    buildingRequirements: [{ type: 'guard_post', minLevel: 3 }],
    baseDays: 16, baseCost: { gold: 28, food: 12 },
    stats: { equipment: 6, discipline: 7, morale: 7, command: 5, logistics: 5 },
  },
  'Royal Guard': {
    tier: 4, baseType: 'guard', icon: '👑',
    parents: ['Shield Guard'], children: [],
    buildingRequirements: [{ type: 'guard_post', minLevel: 4 }],
    baseDays: 32, baseCost: { gold: 56, food: 24 },
    stats: { equipment: 7, discipline: 8, morale: 9, command: 7, logistics: 6 },
  },
  'Axeman': {
    tier: 3, baseType: 'guard', icon: '🪓',
    parents: ['Guard'], children: ['Battle Axeman'],
    buildingRequirements: [{ type: 'guard_post', minLevel: 3 }, { type: 'blacksmith', minLevel: 1 }],
    baseDays: 16, baseCost: { gold: 28, food: 12 },
    stats: { equipment: 7, discipline: 6, morale: 7, command: 5, logistics: 4 },
  },
  'Battle Axeman': {
    tier: 4, baseType: 'guard', icon: '🪓',
    parents: ['Axeman'], children: [],
    buildingRequirements: [{ type: 'guard_post', minLevel: 4 }, { type: 'blacksmith', minLevel: 1 }],
    baseDays: 32, baseCost: { gold: 56, food: 24 },
    stats: { equipment: 9, discipline: 7, morale: 8, command: 6, logistics: 4 },
  },

  // ─── Artillery (Siege Workshop) ────────────────────────────────────────────
  'Siege Laborer': {
    tier: 1, baseType: 'artillery', icon: '🔨',
    parents: [], children: ['Siege Apprentice'],
    buildingRequirements: [{ type: 'siege_workshop', minLevel: 1 }],
    baseDays: 5, baseCost: { gold: 5, food: 2 },
    stats: { equipment: 2, discipline: 2, morale: 2, command: 2, logistics: 4 },
  },
  'Siege Apprentice': {
    tier: 2, baseType: 'artillery', icon: '⚙️',
    parents: ['Siege Laborer'], children: ['Ballista Crew', 'Catapult Crew', 'Bombard Crew'],
    buildingRequirements: [{ type: 'siege_workshop', minLevel: 2 }],
    baseDays: 10, baseCost: { gold: 10, food: 4 },
    stats: { equipment: 3, discipline: 3, morale: 3, command: 3, logistics: 5 },
  },
  'Ballista Crew': {
    tier: 3, baseType: 'artillery', icon: '🎯',
    parents: ['Siege Apprentice'], children: ['Heavy Ballista'],
    buildingRequirements: [{ type: 'siege_workshop', minLevel: 3 }],
    baseDays: 20, baseCost: { gold: 20, food: 8 },
    stats: { equipment: 5, discipline: 5, morale: 4, command: 4, logistics: 6 },
  },
  'Heavy Ballista': {
    tier: 4, baseType: 'artillery', icon: '🎯',
    parents: ['Ballista Crew'], children: [],
    buildingRequirements: [{ type: 'siege_workshop', minLevel: 4 }],
    baseDays: 40, baseCost: { gold: 40, food: 16 },
    stats: { equipment: 7, discipline: 6, morale: 5, command: 5, logistics: 7 },
  },
  'Catapult Crew': {
    tier: 3, baseType: 'artillery', icon: '💣',
    parents: ['Siege Apprentice'], children: ['Trebuchet Crew', 'Siege Tower Operator'],
    buildingRequirements: [{ type: 'siege_workshop', minLevel: 3 }],
    baseDays: 20, baseCost: { gold: 20, food: 8 },
    stats: { equipment: 5, discipline: 5, morale: 4, command: 5, logistics: 5 },
  },
  'Trebuchet Crew': {
    tier: 4, baseType: 'artillery', icon: '🏰',
    parents: ['Catapult Crew'], children: [],
    buildingRequirements: [{ type: 'siege_workshop', minLevel: 4 }],
    baseDays: 40, baseCost: { gold: 40, food: 16 },
    stats: { equipment: 7, discipline: 6, morale: 5, command: 6, logistics: 6 },
  },
  'Siege Tower Operator': {
    tier: 4, baseType: 'artillery', icon: '🗼',
    parents: ['Catapult Crew'], children: [],
    buildingRequirements: [{ type: 'siege_workshop', minLevel: 4 }],
    baseDays: 40, baseCost: { gold: 40, food: 16 },
    stats: { equipment: 6, discipline: 7, morale: 6, command: 6, logistics: 6 },
  },
  'Bombard Crew': {
    tier: 3, baseType: 'artillery', icon: '💥',
    parents: ['Siege Apprentice'], children: ['Grand Bombard'],
    buildingRequirements: [{ type: 'siege_workshop', minLevel: 3 }, { type: 'foundry', minLevel: 1 }],
    baseDays: 20, baseCost: { gold: 25, food: 8 },
    stats: { equipment: 6, discipline: 5, morale: 4, command: 5, logistics: 5 },
  },
  'Grand Bombard': {
    tier: 4, baseType: 'artillery', icon: '💥',
    parents: ['Bombard Crew'], children: [],
    buildingRequirements: [{ type: 'siege_workshop', minLevel: 4 }, { type: 'foundry', minLevel: 1 }],
    baseDays: 40, baseCost: { gold: 50, food: 16 },
    stats: { equipment: 8, discipline: 6, morale: 5, command: 6, logistics: 5 },
  },

  // ─── Covert (Thieves Guild) ────────────────────────────────────────────────
  'Street Informant': {
    tier: 1, baseType: 'covert', icon: '👁️',
    parents: [], children: ['Infiltrator'],
    buildingRequirements: [{ type: 'thieves_guild', minLevel: 1 }],
    baseDays: 6, baseCost: { gold: 10, food: 2 },
    stats: { equipment: 2, discipline: 2, morale: 3, command: 2, logistics: 4 },
  },
  'Infiltrator': {
    tier: 2, baseType: 'covert', icon: '🕵️',
    parents: ['Street Informant'], children: ['Scout', 'Spy', 'Assassin'],
    buildingRequirements: [{ type: 'thieves_guild', minLevel: 2 }],
    baseDays: 12, baseCost: { gold: 20, food: 4 },
    stats: { equipment: 3, discipline: 3, morale: 4, command: 4, logistics: 5 },
  },
  'Scout': {
    tier: 3, baseType: 'covert', icon: '👁️',
    parents: ['Infiltrator'], children: ['Master Scout'],
    buildingRequirements: [{ type: 'thieves_guild', minLevel: 3 }],
    baseDays: 24, baseCost: { gold: 40, food: 8 },
    stats: { equipment: 4, discipline: 5, morale: 5, command: 5, logistics: 8 },
  },
  'Master Scout': {
    tier: 4, baseType: 'covert', icon: '👁️',
    parents: ['Scout'], children: [],
    buildingRequirements: [{ type: 'thieves_guild', minLevel: 4 }],
    baseDays: 48, baseCost: { gold: 80, food: 16 },
    stats: { equipment: 5, discipline: 6, morale: 6, command: 6, logistics: 9 },
  },
  'Spy': {
    tier: 3, baseType: 'covert', icon: '🕵️',
    parents: ['Infiltrator'], children: ['Master Spy'],
    buildingRequirements: [{ type: 'thieves_guild', minLevel: 3 }],
    baseDays: 24, baseCost: { gold: 40, food: 8 },
    stats: { equipment: 3, discipline: 6, morale: 5, command: 7, logistics: 7 },
  },
  'Master Spy': {
    tier: 4, baseType: 'covert', icon: '🕵️',
    parents: ['Spy'], children: [],
    buildingRequirements: [{ type: 'thieves_guild', minLevel: 4 }],
    baseDays: 48, baseCost: { gold: 80, food: 16 },
    stats: { equipment: 4, discipline: 7, morale: 6, command: 8, logistics: 8 },
  },
  'Assassin': {
    tier: 3, baseType: 'covert', icon: '🗡️',
    parents: ['Infiltrator'], children: ['Shadow Assassin'],
    buildingRequirements: [{ type: 'thieves_guild', minLevel: 3 }, { type: 'shadow_order', minLevel: 1 }],
    baseDays: 24, baseCost: { gold: 50, food: 8 },
    stats: { equipment: 7, discipline: 7, morale: 6, command: 6, logistics: 6 },
  },
  'Shadow Assassin': {
    tier: 4, baseType: 'covert', icon: '🗡️',
    parents: ['Assassin'], children: [],
    buildingRequirements: [{ type: 'thieves_guild', minLevel: 4 }, { type: 'shadow_order', minLevel: 1 }],
    baseDays: 48, baseCost: { gold: 100, food: 16 },
    stats: { equipment: 8, discipline: 8, morale: 7, command: 7, logistics: 7 },
  },
};

/** Check whether a template is unlocked given a set of completed fief buildings. */
export function isTemplateUnlocked(
  templateName: string,
  completedBuildings: Array<{ building_type: string; level: number }>
): boolean {
  const template = UNIT_TEMPLATES[templateName];
  if (!template) return false;
  return template.buildingRequirements.every(req =>
    completedBuildings.some(b => b.building_type === req.type && b.level >= req.minLevel)
  );
}

/** Return all template names unlocked for a given set of completed buildings. */
export function getUnlockedTemplates(
  completedBuildings: Array<{ building_type: string; level: number }>
): string[] {
  return Object.keys(UNIT_TEMPLATES).filter(name => isTemplateUnlocked(name, completedBuildings));
}

/** All valid army category names (flat list). */
export const ALL_CATEGORY_NAMES: string[] = Object.keys(UNIT_TEMPLATES);

/** Army categories grouped by base type for UI display. */
export const ARMY_CATEGORY_GROUPS: Record<string, string[]> = {
  'Infantry':  ['Recruit', 'Soldier', 'Spearman', 'Pikeman', 'Two-Handed Swordsman', 'Greatsword Master'],
  'Archers':   ['Skirmisher', 'Ranger', 'Archer', 'Longbowman', 'Crossbowman', 'Arbalest', 'Mounted Archer', 'Horse Archer'],
  'Cavalry':   ['Squire', 'Man-at-Arms', 'Heavy Cavalry', 'Knight', 'Lancer', 'Royal Lancer'],
  'Guards':    ['Watchman', 'Guard', 'Shield Guard', 'Royal Guard', 'Axeman', 'Battle Axeman'],
  'Artillery': ['Siege Laborer', 'Siege Apprentice', 'Ballista Crew', 'Heavy Ballista', 'Catapult Crew', 'Trebuchet Crew', 'Siege Tower Operator', 'Bombard Crew', 'Grand Bombard'],
  'Covert':    ['Street Informant', 'Infiltrator', 'Scout', 'Master Scout', 'Spy', 'Master Spy', 'Assassin', 'Shadow Assassin'],
};
