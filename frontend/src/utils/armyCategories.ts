import { ArmyStats } from '../types/campaignTypes';

// Army categories organized by type
export const ARMY_CATEGORIES = {
  'Elite': ['Royal Guard', 'Knights', 'Assassins'],
  'Infantry': ['Swordsmen', 'Shield Wall', 'Spear Wall', 'Pikemen', 'Heavy Infantry', 'Light Infantry'],
  'Archers': ['Longbowmen', 'Crossbowmen', 'Skirmishers', 'Mounted Archers'],
  'Cavalry': ['Shock Cavalry', 'Heavy Cavalry', 'Light Cavalry', 'Lancers'],
  'Artillery': ['Catapults', 'Trebuchets', 'Ballistae', 'Siege Towers', 'Bombards'],
  'Specialists': ['Scouts', 'Spies']
};

// Helper function to get army category icon
export const getArmyCategoryIcon = (category: string): string => {
  const iconMap: Record<string, string> = {
    // Elite
    'Royal Guard': '👑',
    'Assassins': '🗡️',
    // Infantry
    'Swordsmen': '⚔️',
    'Shield Wall': '🛡️',
    'Spear Wall': '🗡️',
    'Pikemen': '🔱',
    'Heavy Infantry': '⚒️',
    'Light Infantry': '🏃',
    // Archers
    'Longbowmen': '🏹',
    'Crossbowmen': '🎯',
    'Skirmishers': '🪃',
    'Mounted Archers': '🏇',
    // Cavalry
    'Shock Cavalry': '🐎',
    'Heavy Cavalry': '🛡️',
    'Light Cavalry': '🐴',
    'Lancers': '🎪',
    // Artillery
    'Catapults': '💣',
    'Trebuchets': '🏰',
    'Ballistae': '🎯',
    'Siege Towers': '🗼',
    'Bombards': '💥',
    // Specialists
    'Scouts': '👁️',
    'Spies': '🕵️'
  };
  return iconMap[category] || '⚔️';
};

// Stat presets for army categories (power scale: 1=weakest, 10=strongest)
export const getArmyCategoryPresets = (category: string): ArmyStats => {
  const presets: Record<string, ArmyStats> = {
    // Elite Units - Strongest (8-9)
    'Royal Guard': { equipment: 9, discipline: 9, morale: 9, command: 8, logistics: 7 },
    'Knights': { equipment: 9, discipline: 8, morale: 8, command: 7, logistics: 6 },
    'Assassins': { equipment: 8, discipline: 9, morale: 7, command: 6, logistics: 8 },
    
    // Heavy Infantry - Strong (6-7)
    'Swordsmen': { equipment: 6, discipline: 6, morale: 6, command: 5, logistics: 5 },
    'Shield Wall': { equipment: 7, discipline: 8, morale: 7, command: 6, logistics: 5 },
    'Spear Wall': { equipment: 6, discipline: 7, morale: 6, command: 5, logistics: 5 },
    'Pikemen': { equipment: 6, discipline: 7, morale: 6, command: 5, logistics: 5 },
    'Heavy Infantry': { equipment: 7, discipline: 7, morale: 7, command: 5, logistics: 5 },
    
    // Light Infantry - Average (4-5)
    'Light Infantry': { equipment: 4, discipline: 5, morale: 5, command: 4, logistics: 6 },
    
    // Archers - Medium (5-6)
    'Longbowmen': { equipment: 6, discipline: 6, morale: 5, command: 5, logistics: 5 },
    'Crossbowmen': { equipment: 6, discipline: 7, morale: 6, command: 5, logistics: 5 },
    'Skirmishers': { equipment: 4, discipline: 4, morale: 5, command: 4, logistics: 7 },
    'Mounted Archers': { equipment: 6, discipline: 6, morale: 6, command: 5, logistics: 6 },
    
    // Cavalry - Strong to Very Strong (6-8)
    'Shock Cavalry': { equipment: 8, discipline: 7, morale: 8, command: 6, logistics: 5 },
    'Heavy Cavalry': { equipment: 8, discipline: 7, morale: 7, command: 6, logistics: 5 },
    'Light Cavalry': { equipment: 5, discipline: 6, morale: 6, command: 5, logistics: 7 },
    'Lancers': { equipment: 7, discipline: 7, morale: 7, command: 6, logistics: 5 },
    
    // Artillery - Specialized (5-7)
    'Catapults': { equipment: 7, discipline: 5, morale: 5, command: 6, logistics: 4 },
    'Trebuchets': { equipment: 8, discipline: 6, morale: 5, command: 6, logistics: 4 },
    'Ballistae': { equipment: 7, discipline: 6, morale: 5, command: 6, logistics: 5 },
    'Siege Towers': { equipment: 6, discipline: 6, morale: 6, command: 5, logistics: 4 },
    'Bombards': { equipment: 8, discipline: 5, morale: 5, command: 6, logistics: 3 },
    
    // Specialists - Varied (4-7)
    'Scouts': { equipment: 4, discipline: 6, morale: 6, command: 5, logistics: 8 },
    'Spies': { equipment: 5, discipline: 7, morale: 6, command: 4, logistics: 7 }
  };
  
  return presets[category] || { equipment: 5, discipline: 5, morale: 5, command: 5, logistics: 5 };
};

// Get army movement speed based on category (in feet per round)
export const getArmyMovementSpeed = (category: string): number => {
  const speeds: Record<string, number> = {
    // Elite
    'Royal Guard': 60,
    'Knights': 150,
    'Assassins': 100,
    // Infantry
    'Swordsmen': 80,
    'Shield Wall': 60,
    'Spear Wall': 60,
    'Pikemen': 80,
    'Heavy Infantry': 60,
    'Light Infantry': 100,
    // Archers
    'Longbowmen': 60,
    'Crossbowmen': 60,
    'Skirmishers': 60,
    'Mounted Archers': 150,
    // Cavalry
    'Shock Cavalry': 180,
    'Heavy Cavalry': 120,
    'Light Cavalry': 180,
    'Lancers': 150,
    // Artillery
    'Catapults': 60,
    'Trebuchets': 50,
    'Ballistae': 60,
    'Siege Towers': 25,
    'Bombards': 50,
    // Specialists
    'Scouts': 200,
    'Spies': 100,
  };
  return speeds[category] ?? 100;
};
