import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCampaign } from '../contexts/CampaignContext';
import { characterAPI, inventoryAPI, monsterAPI, InventoryItem, Monster, armyAPI, battleAPI, Army, Battle, BattleParticipant, BattleGoal } from '../services/api';
import ConfirmationModal from './ConfirmationModal';
import FigureImage from '../assets/images/Board/Figure.png';
import WorldMapImage from '../assets/images/Campaign/WorldMap.jpg';
import BattleMapImage from '../assets/images/Campaign/BattleMap.jpg';
import io from 'socket.io-client';

// Battle Goals Data Structure
interface BattleGoalDefinition {
  name: string;
  category: 'Command' | 'Strategy' | 'Assault' | 'Combat' | 'Misc';
  requirement: string;
  required_army_category?: string[]; // Optional - specific army categories required to use this goal
  test_type: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA' | 'Attack' | 'Saving Throw' | 'Combat' | 'Numbers' | 'Equipment';
  army_stat?: 'numbers' | 'equipment' | 'discipline' | 'morale' | 'command' | 'logistics'; // Optional - some goals don't use army stats
  uses_character_stat?: boolean; // Whether this goal uses character ability modifier
  uses_army_stat?: boolean; // Whether this goal uses army stat modifier
  use_highest_modifier?: boolean; // If true, takes the highest of character stat OR army stat (for "or" tests)
  targets_enemy: boolean;
  reward: string;
  fail: string;
  description: string;
  requires_combat?: boolean; // New field for goals requiring actual combat
  min_round?: number; // Minimum round number this goal can be used (1-5)
  max_round?: number; // Maximum round number this goal can be used (1-5)
  only_when_losing?: boolean; // Can only be used when your team's score is not the highest
  is_defensive?: boolean; // Defensive goal - gets bonus if targeted, penalty if not targeted
  can_kill?: boolean; // Whether this goal can kill enemy troops
  defensive_kill_only?: boolean; // For defensive goals - can only kill if targeted by an attack
}

const BATTLE_GOALS: BattleGoalDefinition[] = [
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
const parseGoalModifier = (text: string): number => {
  if (text === 'No effect') return 0;
  
  // Find all number patterns in the text
  const matches = text.match(/([+-]\d+)/g);
  if (!matches || matches.length === 0) return 0;
  
  // For rewards, prioritize positive bonuses to your team or negative penalties to enemies
  // For failures, return the negative penalty
  const numbers = matches.map(m => parseInt(m));
  
  // If there's only one number, use it
  if (numbers.length === 1) return numbers[0];
  
  // If multiple numbers, use the one with the largest absolute value
  // This represents the primary effect of the goal
  return numbers.reduce((max, num) => 
    Math.abs(num) > Math.abs(max) ? num : max
  , numbers[0]);
};

// Helper function to get color based on modifier value
const getModifierColor = (modifier: number): string => {
  if (modifier >= 5) return '#10b981'; // Very strong green
  if (modifier >= 3) return '#22c55e'; // Strong green
  if (modifier >= 2) return '#4ade80'; // Green
  if (modifier >= 1) return '#86efac'; // Light green
  if (modifier === 0) return '#9ca3af'; // Gray for no effect
  if (modifier >= -1) return '#fca5a5'; // Light red
  if (modifier >= -2) return '#f87171'; // Red
  if (modifier >= -3) return '#ef4444'; // Strong red
  return '#dc2626'; // Very strong red
};

// Helper function to get army category icon
const getArmyCategoryIcon = (category: string): string => {
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

// Army categories organized by type
const ARMY_CATEGORIES = {
  'Elite': ['Royal Guard', 'Knights', 'Assassins'],
  'Infantry': ['Swordsmen', 'Shield Wall', 'Spear Wall', 'Pikemen', 'Heavy Infantry', 'Light Infantry'],
  'Archers': ['Longbowmen', 'Crossbowmen', 'Skirmishers', 'Mounted Archers'],
  'Cavalry': ['Shock Cavalry', 'Heavy Cavalry', 'Light Cavalry', 'Lancers'],
  'Artillery': ['Catapults', 'Trebuchets', 'Ballistae', 'Siege Towers', 'Bombards'],
  'Specialists': ['Scouts', 'Spies']
};

// Stat presets for army categories (power scale: 1=weakest, 10=strongest)
const getArmyCategoryPresets = (category: string): { equipment: number; discipline: number; morale: number; command: number; logistics: number } => {
  const presets: Record<string, { equipment: number; discipline: number; morale: number; command: number; logistics: number }> = {
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

// Get army movement speed based on category (in feet for battlefield display)
// Note: Battlefield distances are 10x combat (50ft on battlefield = 5ft in combat)
const getArmyMovementSpeed = (category: string): number => {
  // Artillery: 50ft per round
  const artilleryTypes = ['Catapults', 'Trebuchets', 'Ballistae', 'Siege Towers', 'Bombards'];
  if (artilleryTypes.includes(category)) return 50;
  
  // Cavalry: 300ft per round
  const cavalryTypes = ['Shock Cavalry', 'Heavy Cavalry', 'Light Cavalry', 'Lancers', 'Knights', 'Mounted Archers'];
  if (cavalryTypes.includes(category)) return 300;
  
  // Infantry and others: 100ft per round
  return 100;
};

const CampaignView: React.FC = () => {
  const { campaignName } = useParams<{ campaignName: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { 
    currentCampaign, 
    loadCampaign, 
    deleteCharacter,
    isLoading, 
    error, 
    clearError 
  } = useCampaign();

  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; characterId: number | null; characterName: string }>({
    isOpen: false,
    characterId: null,
    characterName: ''
  });

  // Character panel state
  const [selectedCharacter, setSelectedCharacter] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'board' | 'sheet' | 'inventory' | 'skills' | 'equip' | 'armies'>('board');
  const [mainView, setMainView] = useState<'character' | 'campaign'>('character');
  const [campaignTab, setCampaignTab] = useState<'map' | 'combat' | 'battlefield' | 'news' | 'journal' | 'encyclopedia'>('map');
  const [equipmentDetails, setEquipmentDetails] = useState<{ [characterId: number]: InventoryItem[] }>({});
  const [equippedItems, setEquippedItems] = useState<{ [characterId: number]: Record<string, InventoryItem | null> }>({});
  const [limbAC, setLimbAC] = useState<{ [characterId: number]: { head: number; chest: number; hands: number; main_hand: number; off_hand: number; feet: number } }>({});
  const [socket, setSocket] = useState<any>(null);
  const [draggedItem, setDraggedItem] = useState<{ item: InventoryItem; fromSlot?: string } | null>(null);
  const [showUnequipZone, setShowUnequipZone] = useState(false);
  const [inventoryFilter, setInventoryFilter] = useState<'all' | 'weapon' | 'armor' | 'tool'>('all');
  
  // Inventory management state (DM only)
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [allInventoryItems, setAllInventoryItems] = useState<InventoryItem[]>([]);
  const [addItemSearchTerm, setAddItemSearchTerm] = useState('');
  const [showCreateCustomModal, setShowCreateCustomModal] = useState(false);
  const [customItemData, setCustomItemData] = useState<Partial<InventoryItem>>({
    item_name: '',
    category: 'Weapon',
    subcategory: '',
    description: '',
    rarity: 'Common',
    properties: []
  });

  // Damage dice state (for weapons)
  const [damageCount, setDamageCount] = useState<number>(1);
  const [damageDie, setDamageDie] = useState<number>(8);

  // Toast notification state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Image cropping state
  const [showImageCropModal, setShowImageCropModal] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<{ file: File; url: string; characterId: number } | null>(null);
  const [imagePosition, setImagePosition] = useState({ x: 50, y: 50 }); // Percentage position
  const [imageScale, setImageScale] = useState(100); // Percentage scale

  // Character map positions state
  const [characterPositions, setCharacterPositions] = useState<Record<number, { x: number; y: number }>>({});
  const [battlePositions, setBattlePositions] = useState<Record<number, { x: number; y: number }>>({});
  const [remainingMovement, setRemainingMovement] = useState<Record<number, number>>({});
  const [remainingArmyMovement, setRemainingArmyMovement] = useState<Record<number, number>>({});
  const [draggedCharacter, setDraggedCharacter] = useState<number | null>(null);
  const [draggedArmyParticipant, setDraggedArmyParticipant] = useState<number | null>(null);
  const [dragStartPosition, setDragStartPosition] = useState<{ x: number; y: number } | null>(null);
  const [currentDragPosition, setCurrentDragPosition] = useState<{ x: number; y: number } | null>(null);

  // Combat state
  const [showAddToCombatModal, setShowAddToCombatModal] = useState(false);
  const [showResetCombatModal, setShowResetCombatModal] = useState(false);
  const [showCombatInviteModal, setShowCombatInviteModal] = useState(false);
  const [combatInvite, setCombatInvite] = useState<{ characterId: number; characterName: string } | null>(null);
  const [combatants, setCombatants] = useState<Array<{ 
    characterId: number; 
    playerId: number; 
    name: string; 
    initiative: number; 
    movement_speed: number;
    isMonster?: boolean;
    monsterId?: number;
    instanceNumber?: number;
  }>>([]);
  const [initiativeOrder, setInitiativeOrder] = useState<number[]>([]);
  const [currentTurnIndex, setCurrentTurnIndex] = useState<number>(-1);

  // Monster/Encyclopedia state
  const [monsters, setMonsters] = useState<any[]>([]);
  const [showAddMonsterModal, setShowAddMonsterModal] = useState(false);
  const [monsterFormData, setMonsterFormData] = useState<any>({
    name: '',
    description: '',
    limb_health: { head: 10, chest: 30, left_arm: 15, right_arm: 15, left_leg: 20, right_leg: 20 },
    limb_ac: { head: 10, chest: 12, left_arm: 10, right_arm: 10, left_leg: 10, right_leg: 10 }
  });
  const [monsterImageFile, setMonsterImageFile] = useState<File | null>(null);
  const [viewImageModal, setViewImageModal] = useState<{ imageUrl: string; name: string } | null>(null);

  // Army and Battlefield state
  const [armies, setArmies] = useState<Army[]>([]);
  const [activeBattle, setActiveBattle] = useState<Battle | null>(null);
  const [showAddArmyModal, setShowAddArmyModal] = useState(false);
  const [newArmyData, setNewArmyData] = useState<{
    name: string;
    category: string;
    total_troops: number;
    equipment: number;
    discipline: number;
    morale: number;
    command: number;
    logistics: number;
  }>({
    name: '',
    category: 'Swordsmen',
    total_troops: 100,
    equipment: 5,
    discipline: 5,
    morale: 5,
    command: 5,
    logistics: 5
  });
  const [newBattleData, setNewBattleData] = useState({
    name: '',
    terrain_description: '',
    total_rounds: 5
  });
  const [showAddParticipantModal, setShowAddParticipantModal] = useState(false);
  const [selectedGoalCategory, setSelectedGoalCategory] = useState<string>('Command');
  const [battleSummary, setBattleSummary] = useState<{
    battleName: string;
    results: any[];
    timestamp: string;
  } | null>(null);
  const [showBattleSetupModal, setShowBattleSetupModal] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<BattleGoalDefinition | null>(null);
  const [selectedTargetParticipant, setSelectedTargetParticipant] = useState<number | null>(null);
  const [selectedGoalExecutor, setSelectedGoalExecutor] = useState<number | null>(null);
  const [showGoalConfirmModal, setShowGoalConfirmModal] = useState(false);
  const [showArmySelectionModal, setShowArmySelectionModal] = useState(false);
  const [showInvitePlayersModal, setShowInvitePlayersModal] = useState(false);
  const [showBattleInvitationsModal, setShowBattleInvitationsModal] = useState(false);
  const [pendingInvitations, setPendingInvitations] = useState<any[]>([]);
  const [showBattlefieldGoals, setShowBattlefieldGoals] = useState(false);
  const [showBattlefieldParticipants, setShowBattlefieldParticipants] = useState(false);
  const [selectedPlayersToInvite, setSelectedPlayersToInvite] = useState<number[]>([]);
  const [selectedFactionForGoal, setSelectedFactionForGoal] = useState<string | null>(null);
  const [goalResolutionData, setGoalResolutionData] = useState<Record<number, {
    dc: number;
    success: boolean;
    scoreChange: number;
    casualties: number;
    targetId: number | null;
    targetScoreChange: number;
    targetCasualties: number;
    isCombatGoal: boolean;
  }>>({});
  const [inviteTeamName, setInviteTeamName] = useState<string>('');
  const [inviteTeamColor, setInviteTeamColor] = useState<string>('#3b82f6');
  const [newParticipantData, setNewParticipantData] = useState({
    type: 'player' as 'player' | 'dm',
    team: '',
    faction_color: '#ef4444',
    selectedPlayerArmies: [] as number[],
    tempArmyName: '',
    tempArmyCategory: 'Swordsmen' as string,
    tempArmyTroops: 100,
    tempArmyStats: {
      equipment: 5,
      discipline: 5,
      morale: 5,
      command: 5,
      logistics: 5
    }
  });

  // Helper functions for category-specific options
  const getSubcategoryOptions = (category: string) => {
    switch (category) {
      case 'Armor':
        return ['Light Armor', 'Medium Armor', 'Heavy Armor', 'Shield', 'Helmet', 'Boots'];
      case 'Weapon':
        return ['Simple Melee', 'Martial Melee', 'Simple Ranged', 'Martial Ranged'];
      case 'Tool':
        return ['Artisan\'s Tools', 'Gaming Set', 'Kit', 'Musical Instrument', 'Thieves\' Tools', 'Navigator\'s Tools', 'Herbalism Kit', 'Disguise Kit', 'Forgery Kit', 'Poisoner\'s Kit', 'Other Tools'];
      case 'General':
        return ['Adventuring Gear', 'Container', 'Food & Drink', 'Trade Goods'];
      case 'Magic Item':
        return ['Wondrous Item', 'Potion', 'Scroll', 'Ring', 'Rod', 'Staff', 'Wand'];
      case 'Consumable':
        return ['Potion', 'Food', 'Ammunition', 'Other'];
      default:
        return [];
    }
  };

  // Get available weapon/armor properties
  const getAvailableProperties = () => {
    return [
      'Versatile',
      'Finesse',
      'Light',
      'Heavy',
      'Two-Handed',
      'Thrown',
      'Reach',
      'Loading',
      'Ammunition',
      'Special',
      'Magical',
      'Cursed',
      'Silvered',
      'Adamantine'
    ];
  };

  const getDamageTypes = () => {
    return ['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'];
  };

  // Get dynamic icon for equipment slots
  const getSlotIcon = (slotId: string, equippedItem: any, defaultIcon: string) => {
    // For hand slots, show shield if shield is equipped, otherwise show swords
    if (slotId === 'main_hand' || slotId === 'off_hand') {
      if (equippedItem && equippedItem.subcategory && equippedItem.subcategory.toLowerCase().includes('shield')) {
        return '🛡️';
      }
      return '⚔️';
    }
    return defaultIcon;
  };

  // Initialize damage dice from existing damage_dice string
  useEffect(() => {
    if (customItemData.damage_dice) {
      const match = customItemData.damage_dice.match(/(\d+)d(\d+)/);
      if (match) {
        setDamageCount(parseInt(match[1]) || 1);
        setDamageDie(parseInt(match[2]) || 8);
      }
    }
  }, [customItemData.damage_dice]);
  
  // Backstory pagination state
  const [backstoryPage, setBackstoryPage] = useState(0);
  const [isKeyboardNavigating, setIsKeyboardNavigating] = useState(false);
  const [pageDirection, setPageDirection] = useState<'forward' | 'backward' | null>(null);

  // Function to split backstory into pages with intelligent paragraph boundary detection
  const paginateBackstory = useCallback((text: string, wordsPerPage: number = 500): string[] => {
    if (!text || text.trim().length === 0) return [];
    
    // Split by paragraphs (double newlines or single newlines)
    const paragraphs = text.split(/\n\s*\n|\n/).filter(p => p.trim().length > 0);
    const pages: string[] = [];
    let currentPage: string[] = [];
    let wordCount = 0;
    
    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i].trim();
      const paragraphWords = paragraph.split(/\s+/).length;
      
      // If this single paragraph is longer than the word limit, it gets its own page
      if (paragraphWords > wordsPerPage) {
        // Save current page if it has content
        if (currentPage.length > 0) {
          pages.push(currentPage.join('\n\n'));
          currentPage = [];
        }
        // Put the long paragraph on its own page
        pages.push(paragraph);
        wordCount = 0;
      }
      // If adding this paragraph would exceed the word limit
      else if (wordCount + paragraphWords > wordsPerPage && currentPage.length > 0) {
        // Save current page and start a new one
        pages.push(currentPage.join('\n\n'));
        currentPage = [paragraph];
        wordCount = paragraphWords;
      } else {
        // Add paragraph to current page
        currentPage.push(paragraph);
        wordCount += paragraphWords;
      }
    }
    
    // Add any remaining paragraphs as the final page
    if (currentPage.length > 0) {
      pages.push(currentPage.join('\n\n'));
    }
    
    return pages;
  }, []);

  useEffect(() => {
    if (campaignName) {
      loadCampaign(campaignName).catch(() => {
        // Error is handled by the context
      });
    }
  }, [campaignName, loadCampaign]);

  // Refresh campaign data when switching to map or battle tabs to ensure fresh positions
  useEffect(() => {
    if (campaignName && (campaignTab === 'map' || campaignTab === 'combat')) {
      loadCampaign(campaignName).catch(() => {
        // Error is handled by the context
      });
    }
  }, [campaignTab, campaignName, loadCampaign]);

  // Initialize character positions from campaign data
  useEffect(() => {
    if (currentCampaign) {
      const mapPositions: Record<number, { x: number; y: number }> = {};
      const battlePos: Record<number, { x: number; y: number }> = {};
      
      currentCampaign.characters.forEach(character => {
        mapPositions[character.id] = {
          x: character.map_position_x ?? 50,
          y: character.map_position_y ?? 50
        };
        battlePos[character.id] = {
          x: character.battle_position_x ?? 50,
          y: character.battle_position_y ?? 50
        };
      });
      
      setCharacterPositions(mapPositions);
      setBattlePositions(battlePos);
      
      // Only initialize movement if not already set by server sync
      // Server sync will override this via battleMovementSync event
      setRemainingMovement(prev => {
        // If we already have movement state (from server), keep it
        if (Object.keys(prev).length > 0) {
          return prev;
        }
        // Otherwise initialize with character movement speeds
        const movement: Record<number, number> = {};
        currentCampaign.characters.forEach(character => {
          movement[character.id] = character.movement_speed ?? 30;
        });
        return movement;
      });
    }
  }, [currentCampaign]);

  // Initialize army movement speeds when battle starts or participants change
  useEffect(() => {
    if (activeBattle && activeBattle.participants) {
      // Only initialize if we don't have movement data for this battle's participants
      const needsInit = activeBattle.participants.some(p => remainingArmyMovement[p.id] === undefined);
      if (needsInit) {
        const armyMovement: Record<number, number> = {};
        activeBattle.participants.forEach(participant => {
          const category = participant.temp_army_category || participant.army_category || 'Swordsmen';
          const speed = getArmyMovementSpeed(category);
          console.log(`Initializing movement for participant ${participant.id}: category="${category}", speed=${speed}ft`);
          armyMovement[participant.id] = speed;
        });
        setRemainingArmyMovement(prev => ({ ...prev, ...armyMovement }));
      }
    }
  }, [activeBattle?.id, activeBattle?.participants?.length]);

  // Auto-select character for players, first character for DMs
  useEffect(() => {
    if (currentCampaign) {
      if (user?.role === 'Player' && currentCampaign.userCharacter) {
        setSelectedCharacter(currentCampaign.userCharacter.id);
      } else if (user?.role === 'Dungeon Master' && currentCampaign.characters.length > 0) {
        setSelectedCharacter(currentCampaign.characters[0].id);
      }
    }
  }, [currentCampaign, user]);

  // Load monsters when campaign changes
  useEffect(() => {
    const loadMonsters = async () => {
      if (currentCampaign) {
        try {
          const fetchedMonsters = await monsterAPI.getCampaignMonsters(currentCampaign.campaign.id);
          setMonsters(fetchedMonsters);
        } catch (error) {
          console.error('Error loading monsters:', error);
        }
      }
    };
    loadMonsters();
  }, [currentCampaign]);

  // Load armies when selected character changes
  useEffect(() => {
    const loadArmies = async () => {
      if (selectedCharacter && currentCampaign) {
        const character = currentCampaign.characters.find(c => c.id === selectedCharacter);
        if (character) {
          try {
            const fetchedArmies = await armyAPI.getPlayerArmies(currentCampaign.campaign.id, character.player_id);
            setArmies(fetchedArmies);
          } catch (error) {
            console.error('Error loading armies:', error);
          }
        }
      }
    };
    loadArmies();
  }, [selectedCharacter, currentCampaign]);

  // Load active battle when switching to battlefield tab
  useEffect(() => {
    const loadActiveBattle = async () => {
      if (campaignTab === 'battlefield' && currentCampaign) {
        try {
          const battle = await battleAPI.getActiveBattle(currentCampaign.campaign.id);
          setActiveBattle(battle);
        } catch (error) {
          console.error('Error loading active battle:', error);
        }
      }
    };
    loadActiveBattle();
  }, [campaignTab, currentCampaign]);

  // Load pending battle invitations for player
  useEffect(() => {
    const loadInvitations = async () => {
      if (currentCampaign && selectedCharacter && user) {
        const character = currentCampaign.characters.find(c => c.id === selectedCharacter);
        if (character) {
          try {
            const invites = await battleAPI.getPlayerInvitations(character.player_id, currentCampaign.campaign.id);
            // Deduplicate: Keep only the latest invitation per battle_id
            const uniqueInvitations = invites.reduce((acc: any[], curr: any) => {
              const existingIndex = acc.findIndex(inv => inv.battle_id === curr.battle_id);
              if (existingIndex === -1) {
                acc.push(curr);
              } else {
                // Keep the one with the latest invited_at timestamp
                if (new Date(curr.invited_at) > new Date(acc[existingIndex].invited_at)) {
                  acc[existingIndex] = curr;
                }
              }
              return acc;
            }, []);
            setPendingInvitations(uniqueInvitations);
          } catch (error) {
            console.error('Error loading invitations:', error);
          }
        }
      }
    };
    loadInvitations();
  }, [currentCampaign, selectedCharacter, user]);

  // Reset backstory page when character changes
  useEffect(() => {
    setBackstoryPage(0);
    setPageDirection(null);
  }, [selectedCharacter]);

  // Battle Setup Handlers
  const handleCreateBattle = async () => {
    if (!newBattleData.name.trim() || !currentCampaign) return;

    try {
      const createdBattle = await battleAPI.createBattle({
        campaign_id: currentCampaign.campaign.id,
        battle_name: newBattleData.name,
        terrain_description: newBattleData.terrain_description,
        total_rounds: newBattleData.total_rounds
      });

      setActiveBattle(createdBattle);
      setShowBattleSetupModal(false);
      setNewBattleData({
        name: '',
        terrain_description: '',
        total_rounds: 5
      });
      setToastMessage(`Battle "${createdBattle.battle_name}" created!`);
      setTimeout(() => setToastMessage(null), 3000);
    } catch (error) {
      console.error('Error creating battle:', error);
      alert('Failed to create battle');
    }
  };



  // Helper function to calculate total character health from limbs
  const calculateCharacterHealth = (character: any) => {
    const baseHitPoints = character.hit_points;
    const conModifier = Math.floor((character.abilities.con - 10) / 2);
    const conBonus = Math.max(0, conModifier * 0.1);

    // Calculate limb health ratios (same as in character sheet)
    const limbHealthRatios = {
      head: Math.min(1.0, 0.25 + conBonus),
      torso: Math.min(2.0, 1.0 + conBonus),
      hand: Math.min(1.0, 0.15 + conBonus),  // Per hand
      leg: Math.min(1.0, 0.4 + conBonus)      // Per leg
    };

    const limbHealths = {
      head: Math.floor(baseHitPoints * limbHealthRatios.head),
      torso: Math.floor(baseHitPoints * limbHealthRatios.torso),
      leftHand: Math.floor(baseHitPoints * limbHealthRatios.hand),
      rightHand: Math.floor(baseHitPoints * limbHealthRatios.hand),
      leftLeg: Math.floor(baseHitPoints * limbHealthRatios.leg),
      rightLeg: Math.floor(baseHitPoints * limbHealthRatios.leg)
    };

    // Calculate total health: each limb counted separately
    const totalMaxHealth = limbHealths.head + limbHealths.torso + 
                          limbHealths.leftHand + limbHealths.rightHand + 
                          limbHealths.leftLeg + limbHealths.rightLeg;
    
    // TODO: When we add current health tracking, calculate current health for each limb separately
    // For now, assuming full health
    const currentHealth = totalMaxHealth;
    
    return {
      current: currentHealth,
      max: totalMaxHealth,
      percentage: (currentHealth / totalMaxHealth) * 100,
      isDead: currentHealth <= 0,
      limbs: limbHealths  // Return individual limb healths for future damage tracking
    };
  };

  // Helper function to determine if user can view all tabs for the selected character
  const canViewAllTabs = useCallback((characterId: number): boolean => {
    if (!user || !currentCampaign) return false;
    
    // Dungeon Master can see everything
    if (user.role === 'Dungeon Master') return true;
    
    // Players can only see full details of their own character
    return currentCampaign.userCharacter?.id === characterId;
  }, [user, currentCampaign]);

  // Reset to overview tab when viewing another player's character
  useEffect(() => {
    if (selectedCharacter && !canViewAllTabs(selectedCharacter)) {
      setActiveTab('board');
    }
  }, [selectedCharacter, canViewAllTabs]);

  // Keyboard navigation for backstory pages and character selection
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      // Only handle if we're not typing in an input field
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (currentCampaign) {
        // Character navigation with up/down arrows
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          const characters = currentCampaign.characters;
          if (characters.length > 1) {
            const currentIndex = characters.findIndex(c => c.id === selectedCharacter);
            if (currentIndex !== -1) {
              let newIndex;
              if (event.key === 'ArrowUp') {
                newIndex = currentIndex > 0 ? currentIndex - 1 : characters.length - 1; // Wrap to bottom
              } else {
                newIndex = currentIndex < characters.length - 1 ? currentIndex + 1 : 0; // Wrap to top
              }
              event.preventDefault();
              setSelectedCharacter(characters[newIndex].id);
              
              // Show keyboard navigation feedback
              setIsKeyboardNavigating(true);
              setTimeout(() => setIsKeyboardNavigating(false), 500);
            }
          }
        }

        // Backstory page navigation with left/right arrows
        if (selectedCharacter) {
          const character = currentCampaign.characters.find(c => c.id === selectedCharacter);
          if (character?.backstory && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
            const pages = paginateBackstory(character.backstory);
            
            if (event.key === 'ArrowLeft' && backstoryPage > 0) {
              event.preventDefault();
              setPageDirection('backward');
              setTimeout(() => {
                setBackstoryPage(backstoryPage - 1);
                setTimeout(() => setPageDirection(null), 600);
              }, 50);
            } else if (event.key === 'ArrowRight' && backstoryPage < pages.length - 1) {
              event.preventDefault();
              setPageDirection('forward');
              setTimeout(() => {
                setBackstoryPage(backstoryPage + 1);
                setTimeout(() => setPageDirection(null), 600);
              }, 50);
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [selectedCharacter, currentCampaign, backstoryPage, paginateBackstory]);

  const handleBackToDashboard = () => {
    navigate('/dashboard');
  };

  const confirmDeleteCharacter = async () => {
    if (deleteModal.characterId) {
      try {
        await deleteCharacter(deleteModal.characterId);
        setDeleteModal({ isOpen: false, characterId: null, characterName: '' });
        // Reload campaign to refresh the character list
        if (campaignName) {
          loadCampaign(campaignName);
        }
      } catch (error) {
        // Error is handled by the context
      }
    }
  };

  // Load all inventory items for DM add item modal
  const loadAllInventoryItems = useCallback(async () => {
    try {
      const items = await inventoryAPI.getAllItems();
      setAllInventoryItems(items);
    } catch (error) {
      console.error('Error loading inventory items:', error);
    }
  }, []);

  // Add item to character inventory (DM only)
  const handleAddItemToInventory = async (characterId: number, itemName: string) => {
    try {
      await characterAPI.addItemToInventory(characterId, itemName);
      // Refresh equipment details
      loadEquipmentDetails(characterId);
      setShowAddItemModal(false);
    } catch (error) {
      console.error('Error adding item to inventory:', error);
      alert('Failed to add item to inventory');
    }
  };

  // Remove item from character inventory (DM only)
  const handleRemoveItemFromInventory = async (characterId: number, itemName: string) => {
    try {
      await characterAPI.removeItemFromInventory(characterId, itemName);
      // Refresh equipment details and equipped items
      loadEquipmentDetails(characterId);
      loadEquippedItems(characterId);
    } catch (error) {
      console.error('Error removing item from inventory:', error);
      alert('Failed to remove item from inventory');
    }
  };

  // Create custom item and add to inventory (DM only)
  const handleCreateCustomItem = async (characterId: number) => {
    try {
      // Validate required fields
      if (!customItemData.item_name || !customItemData.description) {
        alert('Item name and description are required');
        return;
      }

      // Transform data to match backend expectations (camelCase)
      const backendData = {
        itemName: customItemData.item_name,
        category: customItemData.category,
        subcategory: customItemData.subcategory,
        description: customItemData.description,
        damage_dice: customItemData.damage_dice,
        damage_type: customItemData.damage_type,
        range_normal: customItemData.range_normal,
        range_long: customItemData.range_long,
        armor_class: customItemData.armor_class,
        weight: customItemData.weight,
        cost_cp: customItemData.cost_cp,
        strength_requirement: customItemData.strength_requirement,
        stealth_disadvantage: customItemData.stealth_disadvantage,
        properties: customItemData.properties,
        rarity: customItemData.rarity,
        attunement_required: customItemData.attunement_required
      };

      await characterAPI.createCustomItem(characterId, backendData);
      // Refresh equipment details
      loadEquipmentDetails(characterId);
      setShowCreateCustomModal(false);
      // Reset form
      setCustomItemData({
        item_name: '',
        category: 'Weapon',
        subcategory: '',
        description: '',
        rarity: 'Common',
        properties: []
      });
      // Reset damage dice state
      setDamageCount(1);
      setDamageDie(8);
    } catch (error) {
      console.error('Error creating custom item:', error);
      alert('Failed to create custom item');
    }
  };

  // Load equipment details for a character
  const loadEquipmentDetails = useCallback(async (characterId: number) => {
    if (equipmentDetails[characterId]) {
      return; // Already loaded
    }
    
    try {
      const details = await characterAPI.getEquipmentDetails(characterId);
      setEquipmentDetails(prev => ({
        ...prev,
        [characterId]: details.equipment
      }));
    } catch (error) {
      console.error('Error loading equipment details:', error);
    }
  }, [equipmentDetails]);

  // Load equipped items for a character
  const loadEquippedItems = useCallback(async (characterId: number) => {
    try {
      const equipped = await characterAPI.getEquippedItems(characterId);
      setEquippedItems(prev => ({
        ...prev,
        [characterId]: equipped.equipped_items
      }));
      
      // Store limb AC if available
      if (equipped.limb_ac) {
        setLimbAC(prev => ({
          ...prev,
          [characterId]: equipped.limb_ac!
        }));
      }
    } catch (error) {
      console.error('Error loading equipped items:', error);
    }
  }, []);

  // Helper function to refresh active battle (uses ref to avoid closure issues)
  const refreshActiveBattle = useCallback(async (battleId: number) => {
    try {
      const updatedBattle = await battleAPI.getBattle(battleId);
      // Don't set cancelled or completed battles as active
      if (updatedBattle.status === 'cancelled' || updatedBattle.status === 'completed') {
        setActiveBattle(null);
      } else {
        setActiveBattle(updatedBattle);
      }
    } catch (error) {
      console.error('Error refreshing battle:', error);
    }
  }, []);

  // Socket connection for real-time updates
  useEffect(() => {
    if (currentCampaign) {
      const socketUrl = process.env.NODE_ENV === 'production' 
        ? window.location.origin 
        : 'http://localhost:5000';
      const newSocket = io(socketUrl);
      
      // Register user ID for targeted notifications
      if (user) {
        newSocket.emit('registerUser', user.id);
      }
      
      // Join campaign room
      newSocket.emit('joinCampaign', currentCampaign.campaign.id);
      
      // Listen for equipment updates
      newSocket.on('equipmentChanged', (data: {
        characterId: number;
        action: 'equip' | 'unequip';
        slot: string;
        itemName: string;
        previousItem?: string;
        timestamp: string;
      }) => {
        // Refresh equipped items for the updated character
        loadEquippedItems(data.characterId);
        loadEquipmentDetails(data.characterId);
      });

      // Listen for inventory updates
      newSocket.on('inventoryChanged', (data: {
        characterId: number;
        action: 'add' | 'remove';
        itemName: string;
        unequippedFrom?: string;
        isCustom?: boolean;
        timestamp: string;
      }) => {
        // If an item was unequipped, refresh equipped items first
        if (data.unequippedFrom) {
          loadEquippedItems(data.characterId);
        }
        
        // Force clear the equipment details cache for the affected character to ensure fresh data
        setEquipmentDetails(prev => {
          const updated = { ...prev };
          delete updated[data.characterId];
          return updated;
        });
        
        // Refresh the campaign data to update character.equipment arrays
        if (campaignName) {
          loadCampaign(campaignName).then(() => {
            // After campaign data is refreshed, reload equipment details for the affected character
            loadEquipmentDetails(data.characterId);
            
            // Also refresh equipment details for the currently selected character if it's different
            // This ensures the UI updates properly when viewing a character whose inventory was modified
            if (selectedCharacter && selectedCharacter !== data.characterId) {
              // Clear cache for selected character too in case they have the same item
              setEquipmentDetails(prev => {
                const updated = { ...prev };
                delete updated[selectedCharacter];
                return updated;
              });
              loadEquipmentDetails(selectedCharacter);
            }
            
            // If we're currently viewing the affected character, also refresh equipped items
            // to ensure the equipment screen shows updated data
            if (selectedCharacter === data.characterId) {
              loadEquippedItems(data.characterId);
            }
          }).catch((error) => {
            console.error('Error reloading campaign after inventory change:', error);
            // Fallback: still try to load equipment details
            loadEquipmentDetails(data.characterId);
            if (selectedCharacter && selectedCharacter !== data.characterId) {
              // Clear cache for selected character too
              setEquipmentDetails(prev => {
                const updated = { ...prev };
                delete updated[selectedCharacter];
                return updated;
              });
              loadEquipmentDetails(selectedCharacter);
            }
          });
        } else {
          // If no campaign name, just refresh equipment details
          loadEquipmentDetails(data.characterId);
          if (selectedCharacter && selectedCharacter !== data.characterId) {
            // Clear cache for selected character too
            setEquipmentDetails(prev => {
              const updated = { ...prev };
              delete updated[selectedCharacter];
              return updated;
            });
            loadEquipmentDetails(selectedCharacter);
          }
        }
        
        // Show toast notification for inventory changes
        if (currentCampaign) {
          const character = currentCampaign.characters.find(c => c.id === data.characterId);
          const characterName = character ? character.name : `Character ${data.characterId}`;
          const action = data.action === 'add' ? 'added to' : 'removed from';
          const customText = data.isCustom ? ' (custom item)' : '';
          const unequipText = data.unequippedFrom ? ` and unequipped from ${data.unequippedFrom}` : '';
          
          setToastMessage(`${data.itemName}${customText} ${action} ${characterName}'s inventory${unequipText}`);
          setTimeout(() => setToastMessage(null), 4000);
        }
      });

      // Listen for character movement on world map
      newSocket.on('characterMoved', (data: {
        characterId: number;
        characterName: string;
        x: number;
        y: number;
        timestamp: string;
      }) => {
        console.log('📍 Received world map character movement:', data);
        // Update character position in state
        setCharacterPositions(prev => ({
          ...prev,
          [data.characterId]: { x: data.x, y: data.y }
        }));
      });

      // Listen for character movement on battle map
      newSocket.on('characterBattleMoved', (data: {
        characterId: number;
        characterName: string;
        x: number;
        y: number;
        remainingMovement: number;
        timestamp: string;
      }) => {
        // Update character battle position in state
        setBattlePositions(prev => ({
          ...prev,
          [data.characterId]: { x: data.x, y: data.y }
        }));
        // Update remaining movement
        setRemainingMovement(prev => ({
          ...prev,
          [data.characterId]: data.remainingMovement
        }));
      });

      // Listen for battle movement sync (server sends authoritative state on join)
      newSocket.on('battleMovementSync', (data: {
        movementState: Record<number, number>;
      }) => {
        setRemainingMovement(data.movementState);
      });

      // Listen for battlefield army/participant movement
      newSocket.on('battlefieldParticipantMoved', (data: {
        battleId: number;
        participantId: number;
        x: number;
        y: number;
        remainingMovement?: number;
        timestamp: string;
      }) => {
        console.log('📍 Received battlefield participant movement:', data);
        // Update the active battle state if it matches
        setActiveBattle(prev => {
          if (!prev || prev.id !== data.battleId || !prev.participants) return prev;
          return {
            ...prev,
            participants: prev.participants.map(p =>
              p.id === data.participantId
                ? { ...p, position_x: data.x, position_y: data.y }
                : p
            )
          };
        });
        
        // Update remaining movement if provided
        if (data.remainingMovement !== undefined) {
          setRemainingArmyMovement(prev => ({
            ...prev,
            [data.participantId]: data.remainingMovement!
          }));
        }
      });

      // Listen for battle combat sync (server sends combat state on join)
      newSocket.on('battleCombatSync', (data: {
        combatants: Array<{ 
          characterId: number; 
          playerId: number; 
          name: string; 
          initiative: number; 
          movement_speed: number;
          isMonster?: boolean;
          monsterId?: number;
          instanceNumber?: number;
        }>;
        initiativeOrder: number[];
        currentTurnIndex: number;
      }) => {
        setCombatants(data.combatants);
        setInitiativeOrder(data.initiativeOrder);
        setCurrentTurnIndex(data.currentTurnIndex);
      });

      // Listen for next turn event (DM resets all movement)
      newSocket.on('turnReset', (data: {
        resetMovement: Record<number, number>;
        timestamp: string;
      }) => {
        setRemainingMovement(data.resetMovement);
      });

      // Listen for combat invites (player receives)
      newSocket.on('combatInvite', (data: {
        campaignId: number;
        characterId: number;
        targetPlayerId: number;
        timestamp: string;
      }) => {
        // Check if this invite is for the current user
        if (user && data.targetPlayerId === user.id) {
          const character = currentCampaign.characters.find((c: any) => c.id === data.characterId);
          if (character) {
            setCombatInvite({ characterId: data.characterId, characterName: character.name });
            setShowCombatInviteModal(true);
          }
        }
      });

      // Listen for combatants updated (new combatant added or initiative changed)
      newSocket.on('combatantsUpdated', (data: {
        combatants: Array<{ 
          characterId: number; 
          playerId: number; 
          name: string; 
          initiative: number; 
          movement_speed: number;
          isMonster?: boolean;
          monsterId?: number;
          instanceNumber?: number;
        }>;
        initiativeOrder: number[];
        currentTurnIndex: number;
        timestamp: string;
      }) => {
        setCombatants(data.combatants);
        setInitiativeOrder(data.initiativeOrder);
        setCurrentTurnIndex(data.currentTurnIndex);
        // Reload campaign to get updated combat_active flags
        if (campaignName) {
          loadCampaign(campaignName);
        }
      });

      // Listen for turn advanced (initiative moves to next combatant)
      newSocket.on('turnAdvanced', (data: {
        currentCharacterId: number;
        initiativeOrder: number[];
        currentTurnIndex: number;
        resetMovementFor: number;
        movementSpeed: number;
        timestamp: string;
      }) => {
        setInitiativeOrder(data.initiativeOrder);
        setCurrentTurnIndex(data.currentTurnIndex);
        // Reset movement only for the current character (works for both characters and monsters)
        setRemainingMovement(prev => ({
          ...prev,
          [data.resetMovementFor]: data.movementSpeed
        }));
      });

      // Listen for combat reset (DM clears all combatants)
      newSocket.on('combatReset', (data: {
        timestamp: string;
      }) => {
        // Clear all combat state
        setCombatants([]);
        setInitiativeOrder([]);
        setCurrentTurnIndex(-1);
        // Reload campaign to get updated combat_active flags
        if (campaignName) {
          loadCampaign(campaignName);
        }
      });

      // Listen for army created
      newSocket.on('armyCreated', (data: { army: Army; timestamp: string }) => {
        // Reload armies if viewing the affected character
        if (selectedCharacter && currentCampaign) {
          const character = currentCampaign.characters.find(c => c.id === selectedCharacter);
          if (character && character.player_id === data.army.player_id) {
            armyAPI.getPlayerArmies(currentCampaign.campaign.id, character.player_id)
              .then(setArmies)
              .catch(console.error);
          }
        }
      });

      // Listen for army updated
      newSocket.on('armyUpdated', (data: { army: Army; timestamp: string }) => {
        setArmies(prev => prev.map(a => a.id === data.army.id ? { ...data.army, battle_history: a.battle_history } : a));
      });

      // Listen for army deleted
      newSocket.on('armyDeleted', (data: { armyId: number; timestamp: string }) => {
        setArmies(prev => prev.filter(a => a.id !== data.armyId));
      });

      // Listen for battle created
      newSocket.on('battleCreated', (data: { battle: Battle; timestamp: string }) => {
        if (campaignTab === 'battlefield') {
          setActiveBattle(data.battle);
        }
      });

      // Listen for battle status updated
      newSocket.on('battleStatusUpdated', (data: { battleId: number; status: string; timestamp: string }) => {
        if (data.status === 'cancelled') {
          setActiveBattle(null);
          setToastMessage('Battle was cancelled by the DM.');
          setTimeout(() => setToastMessage(null), 3000);
        } else {
          refreshActiveBattle(data.battleId);
        }
      });

      // Listen for battle participant added
      newSocket.on('battleParticipantAdded', (data: { battleId: number; participant: BattleParticipant; timestamp: string }) => {
        // Always refresh the battle to show new participant
        refreshActiveBattle(data.battleId);
      });

      // Listen for battle goal locked
      newSocket.on('battleGoalLocked', (data: { battleId: number; goal: BattleGoal; timestamp: string }) => {
        refreshActiveBattle(data.battleId);
      });

      // Listen for team goal completion
      newSocket.on('teamGoalSelected', (data: { battleId: number; teamName: string; timestamp: string }) => {
        console.log('Team goal selected:', data);
        refreshActiveBattle(data.battleId);
      });

      // Listen for battle goal rolled
      newSocket.on('battleGoalRolled', (data: { battleId: number; goalId: number; roll: number; timestamp: string }) => {
        // Refresh battle if we're viewing it
        if (activeBattle && activeBattle.id === data.battleId) {
          battleAPI.getBattle(data.battleId)
            .then(setActiveBattle)
            .catch(console.error);
        } else if (!activeBattle && currentCampaign) {
          // DM might not have activeBattle set, check if this is the campaign's active battle
          battleAPI.getActiveBattle(currentCampaign.campaign.id)
            .then(battle => {
              if (battle && battle.id === data.battleId) {
                setActiveBattle(battle);
              }
            })
            .catch(console.error);
        }
      });

      // Listen for battle goal resolved
      newSocket.on('battleGoalResolved', (data: { battleId: number; goalId: number; success: boolean; timestamp: string }) => {
        console.log('battleGoalResolved event received:', data);
        // Refresh battle data for everyone, not just if activeBattle matches
        battleAPI.getBattle(data.battleId)
          .then(battle => {
            console.log('Battle data refreshed after goal resolution:', battle);
            setActiveBattle(battle);
          })
          .catch(console.error);
      });

      // Listen for battle scores updated (real-time participant updates)
      newSocket.on('battleScoresUpdated', (data: { battleId: number; participants: any[]; timestamp: string }) => {
        console.log('battleScoresUpdated event received:', data);
        // Refresh full battle to get updated goals and participants
        battleAPI.getBattle(data.battleId)
          .then(battle => {
            console.log('Battle data refreshed after scores update:', battle);
            setActiveBattle(battle);
          })
          .catch(console.error);
      });

      // Listen for battle completed
      newSocket.on('battleCompleted', (data: { battleId: number; battleName: string; results: any; timestamp: string }) => {
        setTimeout(() => {
          setActiveBattle(null);
          setBattleSummary({
            battleName: data.battleName,
            results: data.results,
            timestamp: data.timestamp
          });
        }, 0);
      });

      // Listen for battle invitation sent
      newSocket.on('battleInvitationSent', (data: { battleId: number; invitations: any[]; timestamp: string }) => {
        if (currentCampaign && selectedCharacter) {
          const character = currentCampaign.characters.find(c => c.id === selectedCharacter);
          if (character) {
            battleAPI.getPlayerInvitations(character.player_id, currentCampaign.campaign.id)
              .then((invitations) => {
                // Deduplicate: Keep only the latest invitation per battle_id
                const uniqueInvitations = invitations.reduce((acc: any[], curr: any) => {
                  const existingIndex = acc.findIndex(inv => inv.battle_id === curr.battle_id);
                  if (existingIndex === -1) {
                    acc.push(curr);
                  } else {
                    // Keep the one with the latest invited_at timestamp
                    if (new Date(curr.invited_at) > new Date(acc[existingIndex].invited_at)) {
                      acc[existingIndex] = curr;
                    }
                  }
                  return acc;
                }, []);
                
                setPendingInvitations(uniqueInvitations);
                // Auto-open modal when new invitation is received
                if (uniqueInvitations.length > 0) {
                  setShowBattleInvitationsModal(true);
                }
              })
              .catch(console.error);
          }
        }
      });

      // Listen for invitation accepted
      newSocket.on('battleInvitationAccepted', (data: { battleId: number; playerId: number; timestamp: string }) => {
        // Refresh the battle to show new participants
        refreshActiveBattle(data.battleId);
        
        // Also reload armies list to update invitation status
        if (currentCampaign?.campaign.id && user?.id) {
          armyAPI.getPlayerArmies(currentCampaign.campaign.id, user.id)
            .then(setArmies)
            .catch(console.error);
        }
      });

      // Listen for invitation declined
      newSocket.on('battleInvitationDeclined', (data: { battleId: number; playerId: number; timestamp: string }) => {
      });
      
      // Listen for goal selected
      newSocket.on('battleGoalSelected', (data: { battleId: number; goal: any; timestamp: string }) => {
        refreshActiveBattle(data.battleId);
      });
      
      setSocket(newSocket);
      
      return () => {
        newSocket.emit('leaveCampaign', currentCampaign.campaign.id);
        newSocket.disconnect();
      };
    }
  }, [currentCampaign, loadEquippedItems, loadEquipmentDetails, campaignName, loadCampaign, selectedCharacter, user]);

  // Load equipped items when character changes
  useEffect(() => {
    if (selectedCharacter && currentCampaign) {
      loadEquippedItems(selectedCharacter);
      loadEquipmentDetails(selectedCharacter);
    }
  }, [selectedCharacter, currentCampaign, loadEquippedItems, loadEquipmentDetails]);

  const renderEquipTab = (character: any) => {
    // Define equipment slots with their names and types
    const equipmentSlots = [
      { id: 'head', name: 'Helmet/Hat', className: 'head', icon: '🛡️' },
      { id: 'chest', name: 'Armor/Clothing', className: 'chest', icon: '🛡️' },
      { id: 'main_hand', name: 'Main Hand', className: 'left-hand', icon: '⚔️' },
      { id: 'off_hand', name: 'Off Hand', className: 'right-hand', icon: '⚔️' },
      { id: 'feet', name: 'Left Boot', className: 'left-foot', icon: '🥾' },
      { id: 'feet_right', name: 'Right Boot', className: 'right-foot', icon: '🥾', syncWith: 'feet' }
    ];

    // Get equipped items for this character
    const characterEquippedItems = equippedItems[character.id] || {};

    // Handle equipment slot interactions
    const handleSlotClick = async (slotId: string) => {
      const equippedItem = characterEquippedItems[slotId];
      if (equippedItem) {
        // Unequip item
        try {
          await characterAPI.unequipItem(character.id, slotId);
          // Refresh equipped items and equipment list
          loadEquippedItems(character.id);
          loadEquipmentDetails(character.id);
          // Emit socket update
          if (socket) {
            socket.emit('equipmentUpdate', {
              campaignId: currentCampaign?.campaign.id,
              characterId: character.id,
              action: 'unequip',
              slot: slotId,
              itemName: equippedItem.item_name
            });
          }
        } catch (error) {
          console.error('Error unequipping item:', error);
        }
      }
    };

    const handleSlotDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      if (draggedItem) {
        e.currentTarget.classList.add('drag-over');
      }
    };

    const handleSlotDragLeave = (e: React.DragEvent) => {
      e.currentTarget.classList.remove('drag-over');
    };

    const handleSlotDrop = async (e: React.DragEvent, slotId: string) => {
      e.preventDefault();
      e.currentTarget.classList.remove('drag-over');
      
      if (!draggedItem) return;

      // Resolve synced slots (like feet_right -> feet)
      const targetSlot = equipmentSlots.find(slot => slot.id === slotId);
      const actualSlotId = targetSlot?.syncWith || slotId;

      // Check if item is being dragged from an equipped slot
      if (draggedItem.fromSlot) {
        // Moving from one slot to another - unequip first then equip
        try {
          await characterAPI.unequipItem(character.id, draggedItem.fromSlot);
          await characterAPI.equipItem(character.id, draggedItem.item.item_name, actualSlotId);
          loadEquippedItems(character.id);
          loadEquipmentDetails(character.id);
          if (socket) {
            socket.emit('equipmentUpdate', {
              campaignId: currentCampaign?.campaign.id,
              characterId: character.id,
              action: 'equip',
              slot: actualSlotId,
              itemName: draggedItem.item.item_name
            });
          }
        } catch (error) {
          console.error('Error moving equipped item:', error);
        }
      } else {
        // Equipping from inventory
        try {
          await characterAPI.equipItem(character.id, draggedItem.item.item_name, actualSlotId);
          loadEquippedItems(character.id);
          loadEquipmentDetails(character.id);
          if (socket) {
            socket.emit('equipmentUpdate', {
              campaignId: currentCampaign?.campaign.id,
              characterId: character.id,
              action: 'equip',
              slot: actualSlotId,
              itemName: draggedItem.item.item_name
            });
          }
        } catch (error) {
          console.error('Error equipping item:', error);
          alert('Cannot equip this item in this slot. Check item type compatibility.');
        }
      }
      
      setDraggedItem(null);
    };

    // Inventory drop zone handlers for unequipping items
    const handleInventoryDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      if (draggedItem?.fromSlot) {
        setShowUnequipZone(true);
      }
    };

    const handleInventoryDragLeave = (e: React.DragEvent) => {
      // Only hide if we're leaving the inventory area completely
      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
        setShowUnequipZone(false);
      }
    };

    const handleInventoryDrop = async (e: React.DragEvent) => {
      e.preventDefault();
      setShowUnequipZone(false);
      
      if (!draggedItem?.fromSlot) return; // Only allow dropping equipped items
      
      try {
        await characterAPI.unequipItem(character.id, draggedItem.fromSlot);
        loadEquippedItems(character.id);
        loadEquipmentDetails(character.id);
        if (socket) {
          socket.emit('equipmentUpdate', {
            campaignId: currentCampaign?.campaign.id,
            characterId: character.id,
            action: 'unequip',
            slot: draggedItem.fromSlot,
            itemName: draggedItem.item.item_name
          });
        }
      } catch (error) {
        console.error('Error unequipping item:', error);
      }
      
      setDraggedItem(null);
    };

    // Filter equipment based on current filter
    const getFilteredEquipment = () => {
      const allEquipment = equipmentDetails[character.id] || [];
      const characterEquippedItems = equippedItems[character.id] || {};
      
      // Get list of equipped item names to exclude from inventory display
      const equippedItemNames = Object.values(characterEquippedItems)
        .filter((item): item is InventoryItem => item !== null)
        .map(item => item.item_name);
      
      let filtered: InventoryItem[] = [];
      if (inventoryFilter === 'all') {
        filtered = allEquipment.filter(item => 
          ['Weapon', 'Armor', 'Tool'].includes(item.category)
        );
      } else if (inventoryFilter === 'weapon') {
        filtered = allEquipment.filter(item => item.category === 'Weapon');
      } else if (inventoryFilter === 'armor') {
        filtered = allEquipment.filter(item => item.category === 'Armor');
      } else if (inventoryFilter === 'tool') {
        filtered = allEquipment.filter(item => item.category === 'Tool');
      }
      
      // Filter out equipped items from display to avoid duplication
      return filtered.filter(item => !equippedItemNames.includes(item.item_name));
    };

    const filteredEquipment = getFilteredEquipment();

    return (
      <div>
        <div className="glass-panel">
          <h6>⚔️ Equipment</h6>
          <div style={{ 
            display: 'flex', 
            gap: '1.5rem', 
            alignItems: 'flex-start',
            minHeight: '600px' 
          }}>
            {/* Character Figure with Equipment Slots */}
            <div style={{ 
              flex: '0 0 70%',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center'
            }}>
              <div className="character-figure-container">
                <img 
                  src={FigureImage} 
                  alt="Character Figure" 
                  style={{ 
                    width: '100%', 
                    height: 'auto',
                    border: '2px solid rgba(212, 193, 156, 0.3)',
                    borderRadius: '0.5rem',
                    background: 'rgba(255, 255, 255, 0.05)',
                    display: 'block'
                  }} 
                />
                
                {/* Equipment Slot Overlays */}
                {equipmentSlots.map((slot) => {
                  // Handle synced slots (like feet)
                  const actualSlotId = slot.syncWith || slot.id;
                  const equippedItem = characterEquippedItems[actualSlotId];
                  const isOccupied = !!equippedItem;
                  
                  return (
                    <div
                      key={slot.id}
                      className={`equipment-slot ${slot.className} ${isOccupied ? 'occupied' : ''}`}
                      data-slot-id={actualSlotId}
                      data-slot-name={slot.name}
                      onClick={() => handleSlotClick(actualSlotId)}
                      onDragOver={handleSlotDragOver}
                      onDragLeave={handleSlotDragLeave}
                      onDrop={(e) => handleSlotDrop(e, actualSlotId)}
                      title={isOccupied ? equippedItem.item_name : `${slot.name} - Drag items here to equip`}
                      draggable={isOccupied}
                      onDragStart={isOccupied ? (e) => {
                        setDraggedItem({ item: equippedItem, fromSlot: actualSlotId });
                        setShowUnequipZone(true);
                        e.dataTransfer.setData('text/plain', equippedItem.item_name);
                      } : undefined}
                      onDragEnd={() => {
                        setShowUnequipZone(false);
                      }}
                    >
                      {isOccupied ? (
                        <div className="equipment-icon">
                          {getSlotIcon(actualSlotId, equippedItem, slot.icon)}
                        </div>
                      ) : null}
                      
                      {/* Tooltip for equipped item */}
                      {isOccupied && (
                        <div className="equipment-tooltip">
                          {equippedItem.item_name}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Equipment List */}
            <div style={{ 
              flex: '1',
              minWidth: 0 
            }}>
              <div style={{ marginBottom: '1rem' }}>
                <h6 style={{ marginBottom: '0.5rem', color: 'rgba(212, 193, 156, 0.9)' }}>Equippable Items</h6>
                
                {/* Filter Buttons */}
                <div className="inventory-filter">
                  {['all', 'weapon', 'armor', 'tool'].map(filter => (
                    <button
                      key={filter}
                      className={`filter-button ${inventoryFilter === filter ? 'active' : ''}`}
                      onClick={() => setInventoryFilter(filter as any)}
                    >
                      {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1) + 's'}
                    </button>
                  ))}
                </div>
              </div>
              
              {filteredEquipment && filteredEquipment.length > 0 ? (
                <div 
                  style={{ 
                    position: 'relative',
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '0.75rem',
                    maxHeight: '480px',
                    overflowY: 'auto',
                    paddingRight: '0.5rem',
                    paddingBottom: '1rem'
                  }}
                  onDragOver={handleInventoryDragOver}
                  onDragLeave={handleInventoryDragLeave}
                  onDrop={handleInventoryDrop}
                >
                  {/* Unequip drop zone overlay */}
                  {showUnequipZone && (
                    <div 
                      className="unequip-zone"
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(212, 193, 156, 0.2)',
                        border: '3px dashed var(--primary-gold)',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000,
                        pointerEvents: 'none'
                      }}
                    >
                      <div 
                        className="unequip-zone-text"
                        style={{
                          background: 'rgba(0, 0, 0, 0.8)',
                          color: 'var(--text-gold)',
                          padding: '1rem 2rem',
                          borderRadius: '8px',
                          fontSize: '1.2rem',
                          fontWeight: 'bold',
                          textAlign: 'center',
                          border: '1px solid var(--primary-gold)',
                          boxShadow: '0 0 20px rgba(212, 193, 156, 0.5)'
                        }}
                      >
                        🎒 Drop here to unequip
                      </div>
                    </div>
                  )}
                  {filteredEquipment.map((item: InventoryItem, index: number) => {
                    const isEquippable = ['Weapon', 'Armor', 'Tool'].includes(item.category);
                    
                    return (
                      <div 
                        key={index} 
                        className={`inventory-item ${isEquippable ? 'draggable' : 'non-equippable'}`}
                        style={{ 
                          padding: '0.75rem', 
                          background: 'rgba(255, 255, 255, 0.08)',
                          borderRadius: '0.5rem',
                          border: '1px solid rgba(212, 193, 156, 0.2)',
                          cursor: isEquippable ? 'grab' : 'default',
                          transition: 'all 0.2s ease'
                        }}
                        draggable={isEquippable}
                        onDragStart={isEquippable ? (e) => {
                          setDraggedItem({ item });
                          e.dataTransfer.setData('text/plain', item.item_name);
                          e.currentTarget.classList.add('dragging');
                        } : undefined}
                        onDragEnd={isEquippable ? (e) => {
                          e.currentTarget.classList.remove('dragging');
                          setDraggedItem(null);
                        } : undefined}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div className="text-gold" style={{ fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                              {item.item_name}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                              {item.category} {item.subcategory && `• ${item.subcategory}`}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                              {item.description}
                            </div>
                          </div>
                          
                          {/* Item Stats Summary */}
                          <div style={{ textAlign: 'right', minWidth: '80px' }}>
                            {item.damage_dice && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-gold)' }}>
                                {item.damage_dice}
                              </div>
                            )}
                            {item.armor_class && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-gold)' }}>
                                AC {item.armor_class}
                              </div>
                            )}
                            {item.weight && (
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                {item.weight} lb
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {!isEquippable && (
                          <div style={{ 
                            marginTop: '0.5rem', 
                            fontSize: '0.7rem', 
                            color: 'var(--text-muted)',
                            fontStyle: 'italic'
                          }}>
                            Cannot be equipped
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '200px',
                  border: '2px dashed rgba(212, 193, 156, 0.3)',
                  borderRadius: '0.5rem',
                  background: 'rgba(255, 255, 255, 0.02)',
                  transition: 'background 0.2s',
                  cursor: draggedItem?.fromSlot ? 'pointer' : 'default'
                }}
                onDragOver={handleInventoryDragOver}
                onDragLeave={handleInventoryDragLeave}
                onDrop={handleInventoryDrop}
              >
                  <p className="text-muted" style={{ fontSize: '0.9rem', textAlign: 'center' }}>
                    No equippable items available<br/>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {draggedItem?.fromSlot ? 'Drop here to unequip' : ''}
                    </span>
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Inventory tab - equipment and items with detailed information
  const renderInventoryTab = (character: any) => {
    const characterEquipmentDetails = equipmentDetails[character.id] || [];
    const hasDetailedData = characterEquipmentDetails.length > 0;

    return (
      <div>
        <div className="glass-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h6>🎒 Equipment & Inventory</h6>
            {user?.role === 'Dungeon Master' && (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => {
                    loadAllInventoryItems();
                    setAddItemSearchTerm('');
                    setShowAddItemModal(true);
                  }}
                  className="btn btn-secondary"
                  style={{
                    padding: '0.5rem 1rem',
                    fontSize: '0.8rem',
                    background: 'rgba(34, 197, 94, 0.2)',
                    border: '1px solid rgba(34, 197, 94, 0.4)',
                    color: '#4ade80'
                  }}
                >
                  + Add Item
                </button>
                <button
                  onClick={() => setShowCreateCustomModal(true)}
                  className="btn btn-secondary"
                  style={{
                    padding: '0.5rem 1rem',
                    fontSize: '0.8rem',
                    background: 'rgba(59, 130, 246, 0.2)',
                    border: '1px solid rgba(59, 130, 246, 0.4)',
                    color: '#60a5fa'
                  }}
                >
                  ✨ Create Custom
                </button>
              </div>
            )}
          </div>
          {character.equipment && character.equipment.length > 0 ? (
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(450px, 1fr))',
              gap: '1rem',
              maxHeight: '70vh',
              overflowY: 'auto',
              paddingRight: '0.5rem'
            }}>
              {character.equipment.map((itemName: string, index: number) => {
                // Find detailed information for this item
                const itemDetails = characterEquipmentDetails.find(detail => detail.item_name === itemName);
                
                return (
                  <div key={index} style={{ 
                    padding: '0.875rem', 
                    background: 'rgba(255, 255, 255, 0.08)',
                    borderRadius: '0.5rem',
                    border: '1px solid rgba(212, 193, 156, 0.3)',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.625rem'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
                    e.currentTarget.style.borderColor = 'rgba(212, 193, 156, 0.5)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                    e.currentTarget.style.borderColor = 'rgba(212, 193, 156, 0.3)';
                  }}
                  >
                    {/* Item Header */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {/* Top row: Title centered with badges on sides */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                        {/* Left spacer - matches right side width when badges exist */}
                        <div style={{ 
                          width: (itemDetails?.rarity && itemDetails.rarity !== 'Common') || user?.role === 'Dungeon Master' ? '80px' : '0',
                          flexShrink: 0
                        }} />
                        
                        {/* Center: Item title */}
                        <div style={{ flex: 1, textAlign: 'center' }}>
                          <div className="text-gold" style={{ fontWeight: 'bold', fontSize: '0.95rem', lineHeight: '1.3' }}>
                            {itemName}
                          </div>
                        </div>
                        
                        {/* Right: Badges */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0, width: '80px', justifyContent: 'flex-end' }}>
                          {itemDetails?.rarity && itemDetails.rarity !== 'Common' && (
                            <span style={{
                              fontSize: '0.65rem',
                              padding: '0.2rem 0.4rem',
                              borderRadius: '0.75rem',
                              background: itemDetails.rarity === 'Rare' ? 'rgba(59, 130, 246, 0.2)' : 
                                        itemDetails.rarity === 'Uncommon' ? 'rgba(34, 197, 94, 0.2)' : 
                                        'rgba(212, 193, 156, 0.2)',
                              color: itemDetails.rarity === 'Rare' ? '#60a5fa' : 
                                   itemDetails.rarity === 'Uncommon' ? '#4ade80' : 
                                   'var(--text-gold)',
                              border: '1px solid currentColor',
                              whiteSpace: 'nowrap',
                              lineHeight: '1'
                            }}>
                              {itemDetails.rarity}
                            </span>
                          )}
                          {user?.role === 'Dungeon Master' && (
                            <button
                              onClick={() => handleRemoveItemFromInventory(character.id, itemName)}
                              style={{
                                width: '20px',
                                height: '20px',
                                borderRadius: '50%',
                                border: '1px solid rgba(220, 53, 69, 0.4)',
                                background: 'rgba(220, 53, 69, 0.2)',
                                color: '#f5c6cb',
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.2s ease',
                                padding: 0,
                                lineHeight: '1'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(220, 53, 69, 0.4)';
                                e.currentTarget.style.borderColor = 'rgba(220, 53, 69, 0.6)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(220, 53, 69, 0.2)';
                                e.currentTarget.style.borderColor = 'rgba(220, 53, 69, 0.4)';
                              }}
                              title={`Remove ${itemName} from inventory`}
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </div>
                      
                      {/* Subtitle: Category */}
                      {itemDetails && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: '1.2', textAlign: 'center' }}>
                          {itemDetails.category} {itemDetails.subcategory && `• ${itemDetails.subcategory}`}
                        </div>
                      )}
                    </div>

                    {/* Item Description */}
                    {itemDetails?.description ? (
                      <div style={{ 
                        fontSize: '0.8rem', 
                        color: 'var(--text-secondary)', 
                        lineHeight: '1.4',
                        maxHeight: '3.6em',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical'
                      }}>
                        {itemDetails.description}
                      </div>
                    ) : (
                      <div style={{ 
                        fontSize: '0.75rem', 
                        color: 'var(--text-muted)', 
                        fontStyle: 'italic'
                      }}>
                        {hasDetailedData ? 'Item details not found' : 'Loading...'}
                      </div>
                    )}

                    {/* Item Stats - Compact Grid */}
                    {itemDetails && (
                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', 
                        gap: '0.5rem',
                        padding: '0.5rem',
                        background: 'rgba(255, 255, 255, 0.05)',
                        borderRadius: '0.375rem',
                        border: '1px solid rgba(212, 193, 156, 0.2)'
                      }}>
                        {itemDetails.damage_dice && (
                          <div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '0.125rem' }}>
                              Damage
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.2' }}>
                              {itemDetails.damage_dice}
                            </div>
                          </div>
                        )}
                        {itemDetails.armor_class && (
                          <div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '0.125rem' }}>
                              AC
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.2' }}>
                              {itemDetails.armor_class > 10 ? itemDetails.armor_class : `+${itemDetails.armor_class}`}
                            </div>
                          </div>
                        )}
                        {itemDetails.weight && (
                          <div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '0.125rem' }}>
                              Weight
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.2' }}>
                              {itemDetails.weight} lb
                            </div>
                          </div>
                        )}
                        {itemDetails.cost_cp && (
                          <div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '0.125rem' }}>
                              Value
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.2' }}>
                              {itemDetails.cost_cp >= 100 ? `${Math.floor(itemDetails.cost_cp / 100)} gp` : `${itemDetails.cost_cp} cp`}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Item Properties - Compact */}
                    {itemDetails?.properties && itemDetails.properties.length > 0 && (() => {
                      // Filter out Stealth Disadvantage from properties - it should only show as a warning
                      const filteredProps = itemDetails.properties.filter(prop => 
                        !prop.toLowerCase().includes('stealth disadvantage')
                      );
                      
                      if (filteredProps.length === 0) return null;
                      
                      return (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>
                            Properties:
                          </span>
                          {filteredProps.map((prop, propIndex) => (
                            <span key={propIndex} style={{
                              fontSize: '0.65rem',
                              padding: '0.2rem 0.4rem',
                              background: 'rgba(212, 193, 156, 0.2)',
                              color: 'var(--text-gold)',
                              borderRadius: '0.5rem',
                              border: '1px solid rgba(212, 193, 156, 0.3)',
                              lineHeight: '1'
                            }}>
                              {prop}
                            </span>
                          ))}
                        </div>
                      );
                    })()}

                    {/* Special Warnings - Compact */}
                    {(itemDetails?.stealth_disadvantage || 
                      itemDetails?.properties?.some(prop => prop.toLowerCase().includes('stealth'))) && (
                      <div style={{ 
                        padding: '0.375rem 0.5rem',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '0.375rem',
                        fontSize: '0.7rem',
                        color: '#fca5a5',
                        lineHeight: '1.3'
                      }}>
                        ⚠️ Stealth disadvantage
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '3rem',
              border: '2px dashed rgba(212, 193, 156, 0.3)',
              borderRadius: '1rem',
              background: 'rgba(255, 255, 255, 0.02)'
            }}>
              <div style={{ fontSize: '2rem', marginBottom: '1rem', opacity: 0.5 }}>🎒</div>
              <p className="text-muted" style={{ fontSize: '1rem', textAlign: 'center', margin: 0 }}>
                No equipment in inventory
              </p>
              <p className="text-muted" style={{ fontSize: '0.8rem', textAlign: 'center', marginTop: '0.5rem', margin: 0 }}>
                Equipment will appear here as it's added to the character
              </p>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="container fade-in">
        <div className="dashboard-container">
          <div className="app-header">
            <h1 className="app-title">Loading Campaign...</h1>
          </div>
          <div className="glass-panel info">
            <p className="text-center">Please wait while we load the campaign details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container fade-in">
        <div className="dashboard-container">
          <div className="app-header">
            <h1 className="app-title">Campaign Error</h1>
          </div>
          <div className="alert alert-error">
            <p>{error}</p>
            <div style={{ marginTop: '1rem' }}>
              <button onClick={clearError} className="btn btn-secondary" style={{ marginRight: '1rem' }}>
                Dismiss
              </button>
              <button 
                onClick={handleBackToDashboard} 
                className="btn btn-primary"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!currentCampaign) {
    return (
      <div className="container fade-in">
        <div className="dashboard-container">
          <div className="app-header">
            <h1 className="app-title">Campaign Not Found</h1>
          </div>
          <div className="glass-panel info">
            <p className="text-center">The requested campaign could not be found.</p>
            <div className="text-center" style={{ marginTop: '2rem' }}>
              <button 
                onClick={handleBackToDashboard} 
                className="btn btn-primary"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { campaign, characters } = currentCampaign;

  const selectedCharacterData = characters.find(c => c.id === selectedCharacter);

  return (
    <div className="container fade-in">
      <div className="dashboard-container">
        {/* Header */}
        <div className="app-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <div>
              <h1 className="app-title">{campaign.name}</h1>
              <p className="text-muted" style={{ margin: 0, fontSize: '1rem' }}>
                {campaign.description || 'No description available'}
              </p>
            </div>
            <button 
              onClick={handleBackToDashboard} 
              className="btn btn-secondary"
              style={{ 
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(212, 193, 156, 0.3)',
                color: 'var(--text-secondary)'
              }}
            >
              ← Back to Dashboard
            </button>
          </div>
        </div>

        {/* Main View Switcher */}
        <div className="glass-panel" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <button
              onClick={() => setMainView('campaign')}
              style={{
                padding: '0.625rem 1.5rem',
                background: mainView === 'campaign' 
                  ? 'linear-gradient(135deg, rgba(212, 193, 156, 0.3) 0%, rgba(212, 193, 156, 0.2) 100%)' 
                  : 'rgba(255, 255, 255, 0.05)',
                border: mainView === 'campaign' 
                  ? '2px solid var(--primary-gold)' 
                  : '1px solid rgba(212, 193, 156, 0.2)',
                borderRadius: '0.75rem',
                color: mainView === 'campaign' ? 'var(--text-gold)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: 'bold',
                transition: 'all 0.3s ease',
                boxShadow: mainView === 'campaign' 
                  ? '0 4px 12px rgba(212, 193, 156, 0.2)' 
                  : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
              onMouseEnter={(e) => {
                if (mainView !== 'campaign') {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.borderColor = 'rgba(212, 193, 156, 0.4)';
                }
              }}
              onMouseLeave={(e) => {
                if (mainView !== 'campaign') {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                  e.currentTarget.style.borderColor = 'rgba(212, 193, 156, 0.2)';
                }
              }}
            >
              <span style={{ fontSize: '1.1rem' }}>🗺️</span>
              Campaign View
            </button>
            <button
              onClick={() => setMainView('character')}
              style={{
                padding: '0.625rem 1.5rem',
                background: mainView === 'character' 
                  ? 'linear-gradient(135deg, rgba(212, 193, 156, 0.3) 0%, rgba(212, 193, 156, 0.2) 100%)' 
                  : 'rgba(255, 255, 255, 0.05)',
                border: mainView === 'character' 
                  ? '2px solid var(--primary-gold)' 
                  : '1px solid rgba(212, 193, 156, 0.2)',
                borderRadius: '0.75rem',
                color: mainView === 'character' ? 'var(--text-gold)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: 'bold',
                transition: 'all 0.3s ease',
                boxShadow: mainView === 'character' 
                  ? '0 4px 12px rgba(212, 193, 156, 0.2)' 
                  : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
              onMouseEnter={(e) => {
                if (mainView !== 'character') {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.borderColor = 'rgba(212, 193, 156, 0.4)';
                }
              }}
              onMouseLeave={(e) => {
                if (mainView !== 'character') {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                  e.currentTarget.style.borderColor = 'rgba(212, 193, 156, 0.2)';
                }
              }}
            >
              <span style={{ fontSize: '1.1rem' }}>👤</span>
              Character View
            </button>
          </div>
        </div>

        {/* Main Content Area with Character List */}
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
          {/* Character List - Always Visible */}
          <div style={{ flex: '0 0 280px' }}>
            <div className="glass-panel" style={{ position: 'sticky', top: '1rem' }}>
              <div style={{ marginBottom: '1rem' }}>
                <h6 style={{ margin: 0, marginBottom: '0.5rem' }}>👥 Characters ({characters.length})</h6>
                {characters.length > 1 && (
                  <div style={{ 
                    fontSize: '0.65rem', 
                    color: 'var(--text-muted)', 
                    fontStyle: 'italic'
                  }}>
                    Use ↑ ↓ arrow keys to navigate
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '70vh', overflowY: 'auto', paddingRight: '0.25rem' }}>
                {characters.map((character) => (
                  <button
                    key={character.id}
                    onClick={() => {
                      setSelectedCharacter(character.id);
                      if (mainView !== 'character') {
                        setMainView('character');
                      }
                    }}
                    style={{
                      padding: '0.75rem',
                      background: selectedCharacter === character.id 
                        ? 'rgba(212, 193, 156, 0.2)' 
                        : 'rgba(255, 255, 255, 0.08)',
                      border: selectedCharacter === character.id 
                        ? '2px solid var(--primary-gold)' 
                        : '1px solid rgba(212, 193, 156, 0.2)',
                      borderRadius: '0.5rem',
                      cursor: 'pointer',
                      transition: 'all var(--transition-normal)',
                      boxShadow: selectedCharacter === character.id && isKeyboardNavigating
                        ? '0 0 20px rgba(212, 193, 156, 0.6)'
                        : selectedCharacter === character.id
                        ? '0 0 10px rgba(212, 193, 156, 0.3)'
                        : 'none',
                      textAlign: 'left',
                      width: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.25rem'
                    }}
                    onMouseEnter={(e) => {
                      if (selectedCharacter !== character.id) {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
                        e.currentTarget.style.borderColor = 'rgba(212, 193, 156, 0.4)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedCharacter !== character.id) {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                        e.currentTarget.style.borderColor = 'rgba(212, 193, 156, 0.2)';
                      }
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div className="text-gold" style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>
                        {character.name}
                      </div>
                      {characters.length > 1 && selectedCharacter === character.id && (
                        <div style={{ 
                          fontSize: '0.65rem', 
                          color: 'var(--text-muted)',
                          backgroundColor: 'rgba(212, 193, 156, 0.1)',
                          padding: '0.2rem 0.4rem',
                          borderRadius: '10px',
                          border: '1px solid rgba(212, 193, 156, 0.2)'
                        }}>
                          {characters.findIndex(c => c.id === character.id) + 1}/{characters.length}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Lvl {character.level} {character.race} {character.class}
                    </div>
                    
                    {/* Health Bar and Status */}
                    {(() => {
                      const health = calculateCharacterHealth(character);
                      const healthColor = health.isDead 
                        ? '#dc3545' 
                        : health.percentage > 50 
                        ? '#28a745' 
                        : health.percentage > 25 
                        ? '#ffc107' 
                        : '#dc3545';
                      
                      return (
                        <div style={{ marginTop: '0.5rem' }}>
                          {/* Health Bar */}
                          <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.5rem',
                            marginBottom: '0.25rem'
                          }}>
                            {/* Status Icon */}
                            <div style={{ 
                              fontSize: '1rem',
                              filter: health.isDead ? 'none' : 'drop-shadow(0 0 4px rgba(40, 167, 69, 0.6))'
                            }} title={health.isDead ? 'Dead' : 'Alive'}>
                              {health.isDead ? '💀' : '❤️'}
                            </div>
                            
                            {/* Health Bar Background */}
                            <div style={{
                              flex: 1,
                              height: '12px',
                              background: 'rgba(0, 0, 0, 0.4)',
                              borderRadius: '6px',
                              overflow: 'hidden',
                              border: '1px solid rgba(212, 193, 156, 0.3)',
                              position: 'relative'
                            }}>
                              {/* Health Bar Fill */}
                              <div style={{
                                width: `${health.percentage}%`,
                                height: '100%',
                                background: `linear-gradient(90deg, ${healthColor} 0%, ${healthColor}dd 100%)`,
                                transition: 'width 0.3s ease',
                                boxShadow: `0 0 8px ${healthColor}88`
                              }} />
                              
                              {/* Health Text Overlay */}
                              <div style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.65rem',
                                fontWeight: 'bold',
                                color: '#fff',
                                textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)',
                                pointerEvents: 'none'
                              }}>
                                {health.current}/{health.max}
                              </div>
                            </div>
                          </div>
                          
                          {/* Health Percentage */}
                          <div style={{
                            fontSize: '0.65rem',
                            color: healthColor,
                            textAlign: 'right',
                            fontWeight: 'bold'
                          }}>
                            {health.percentage.toFixed(0)}% HP
                          </div>
                        </div>
                      );
                    })()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div style={{ flex: '1', minWidth: 0 }}>

            {/* Campaign Content */}
            {mainView === 'campaign' && (
              <div>
            {/* Global Quick Actions for DM */}

            {/* Campaign Tab Navigation */}
            <div className="glass-panel" style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                {(['map', 'combat', 'battlefield', 'news', 'journal', 'encyclopedia'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setCampaignTab(tab)}
                    style={{
                      padding: '0.625rem 1.25rem',
                      background: campaignTab === tab 
                        ? 'rgba(212, 193, 156, 0.3)' 
                        : 'rgba(255, 255, 255, 0.1)',
                      border: campaignTab === tab 
                        ? '2px solid var(--primary-gold)' 
                        : '1px solid rgba(212, 193, 156, 0.2)',
                      borderRadius: '1.5rem',
                      color: campaignTab === tab ? 'var(--text-gold)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      fontWeight: 'bold',
                      transition: 'all var(--transition-normal)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}
                    onMouseEnter={(e) => {
                      if (campaignTab !== tab) {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                        e.currentTarget.style.borderColor = 'rgba(212, 193, 156, 0.4)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (campaignTab !== tab) {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                        e.currentTarget.style.borderColor = 'rgba(212, 193, 156, 0.2)';
                      }
                    }}
                  >
                    {tab === 'map' ? '🗺️ Campaign Map' : 
                     tab === 'combat' ? '⚔️ Combat Area' :
                     tab === 'battlefield' ? '🏰 Battlefield' :
                     tab === 'encyclopedia' ? '📚 Encyclopedia' :
                     tab === 'news' ? '📰 Campaign News' : 
                     '📖 Campaign Journal'}
                  </button>
                ))}
              </div>
            </div>

            {/* Campaign Tab Content */}
            {campaignTab === 'map' && (
              <div className="glass-panel">
                <h5 style={{ color: 'var(--text-gold)', marginBottom: '1.5rem' }}>🗺️ Campaign Map</h5>
                <div style={{
                  position: 'relative',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  borderRadius: '0.75rem',
                  overflow: 'hidden',
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '2px solid rgba(212, 193, 156, 0.3)'
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggedCharacter !== null) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = ((e.clientX - rect.left) / rect.width) * 100;
                    const y = ((e.clientY - rect.top) / rect.height) * 100;
                    
                    // Update position in state immediately
                    setCharacterPositions(prev => ({
                      ...prev,
                      [draggedCharacter]: { x, y }
                    }));
                    
                    // Emit to other users via Socket.IO immediately
                    if (socket && currentCampaign) {
                      const character = currentCampaign.characters.find(c => c.id === draggedCharacter);
                      const moveData = {
                        campaignId: currentCampaign.campaign.id,
                        characterId: draggedCharacter,
                        characterName: character?.name || '',
                        x,
                        y
                      };
                      socket.emit('characterMove', moveData);
                    }
                    
                    // Update position in backend (async, doesn't block UI)
                    characterAPI.updateMapPosition(draggedCharacter, x, y).catch(error => {
                      console.error('Error updating character position:', error);
                    });
                    
                    setDraggedCharacter(null);
                  }
                }}
                >
                  <img 
                    src={WorldMapImage} 
                    alt="Campaign World Map" 
                    style={{ 
                      width: '100%', 
                      height: 'auto',
                      display: 'block'
                    }} 
                  />
                  
                  {/* Character Icons */}
                  {currentCampaign && currentCampaign.characters.map(character => {
                    const position = characterPositions[character.id] || { x: 50, y: 50 };
                    const canMove = user?.role === 'Dungeon Master' || character.player_id === user?.id;
                    
                    return (
                      <div
                        key={character.id}
                        draggable={canMove}
                        onDragStart={() => {
                          if (canMove) {
                            setDraggedCharacter(character.id);
                          }
                        }}
                        onDragEnd={() => setDraggedCharacter(null)}
                        style={{
                          position: 'absolute',
                          left: `${position.x}%`,
                          top: `${position.y}%`,
                          transform: 'translate(-50%, -50%)',
                          cursor: canMove ? 'grab' : 'default',
                          transition: draggedCharacter === character.id ? 'none' : 'all 0.3s ease',
                          zIndex: draggedCharacter === character.id ? 1000 : 10
                        }}
                        title={character.name}
                      >
                        {character.image_url ? (
                          <div style={{
                            width: '50px',
                            height: '50px',
                            borderRadius: '50%',
                            border: '3px solid var(--primary-gold)',
                            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
                            overflow: 'hidden',
                            background: 'rgba(0, 0, 0, 0.3)'
                          }}>
                            <img 
                              src={process.env.NODE_ENV === 'production' ? character.image_url : `http://localhost:5000${character.image_url}`}
                              alt={character.name}
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                pointerEvents: 'none'
                              }}
                            />
                          </div>
                        ) : (
                          <div style={{
                            width: '50px',
                            height: '50px',
                            borderRadius: '50%',
                            border: '3px solid var(--primary-gold)',
                            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
                            background: 'linear-gradient(135deg, rgba(212, 193, 156, 0.3) 0%, rgba(212, 193, 156, 0.2) 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.5rem',
                            fontWeight: 'bold',
                            color: 'var(--text-gold)'
                          }}>
                            {character.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div style={{
                          position: 'absolute',
                          bottom: '-20px',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          whiteSpace: 'nowrap',
                          background: 'rgba(0, 0, 0, 0.8)',
                          color: 'var(--text-gold)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '0.7rem',
                          border: '1px solid rgba(212, 193, 156, 0.3)',
                          pointerEvents: 'none'
                        }}>
                          {character.name}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {campaignTab === 'combat' && (
              <div className="glass-panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h5 style={{ color: 'var(--text-gold)', margin: 0 }}>⚔️ Combat Area</h5>
                  {user?.role === 'Dungeon Master' && (
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <button
                        onClick={() => setShowAddToCombatModal(true)}
                        style={{
                          padding: '0.5rem 1rem',
                          background: 'linear-gradient(135deg, #61c961, #5ab85a)',
                          border: '2px solid #4a4',
                          borderRadius: '0.5rem',
                          color: '#000',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          fontSize: '0.9rem'
                        }}
                      >
                        ➕ Add to Combat
                      </button>
                      {combatants.length > 0 && (
                        <>
                          <button
                            onClick={() => {
                              if (socket && currentCampaign) {
                                // Use the new initiative system
                                socket.emit('nextTurn', {
                                  campaignId: currentCampaign.campaign.id
                                });
                              }
                            }}
                            style={{
                              padding: '0.5rem 1rem',
                              background: currentTurnIndex === -1 
                                ? 'linear-gradient(135deg, #61c961, #5ab85a)'
                                : 'linear-gradient(135deg, #c9a961, #b8935a)',
                              border: currentTurnIndex === -1
                                ? '2px solid #4a4'
                                : '2px solid var(--text-gold)',
                              borderRadius: '0.5rem',
                              color: '#000',
                              fontWeight: 'bold',
                              cursor: 'pointer',
                              fontSize: '0.9rem'
                            }}
                          >
                            {currentTurnIndex === -1 ? '⚔️ Start Combat' : '🔄 Next Turn'}
                          </button>
                          <button
                            onClick={() => setShowResetCombatModal(true)}
                            style={{
                              padding: '0.5rem 1rem',
                              background: 'linear-gradient(135deg, #d9534f, #c9302c)',
                              border: '2px solid #a94442',
                              borderRadius: '0.5rem',
                              color: '#fff',
                              fontWeight: 'bold',
                              cursor: 'pointer',
                              fontSize: '0.9rem'
                            }}
                          >
                            🔄 Reset Combat
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Initiative Order Display */}
                {combatants.length > 0 && (
                  <div style={{
                    marginBottom: '1.5rem',
                    padding: '1rem',
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '2px solid rgba(212, 193, 156, 0.3)',
                    borderRadius: '0.75rem'
                  }}>
                    <h6 style={{ color: 'var(--text-gold)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span>🎲</span>
                      <span>Initiative Order</span>
                      {currentTurnIndex >= 0 && initiativeOrder.length > 0 ? (
                        <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: '#999' }}>
                          Turn {currentTurnIndex + 1} of {initiativeOrder.length}
                        </span>
                      ) : (
                        <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: '#f4a261' }}>
                          ⏸️ Waiting to start
                        </span>
                      )}
                    </h6>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {/* Sort combatants by initiative order for display */}
                      {initiativeOrder.map((combatantId, orderIndex) => {
                        const combatant = combatants.find(c => c.characterId === combatantId);
                        if (!combatant) return null;
                        
                        const isCurrentTurn = currentTurnIndex >= 0 && currentTurnIndex === orderIndex;
                        return (
                          <div
                            key={combatant.characterId}
                            style={{
                              padding: '0.75rem',
                              background: isCurrentTurn 
                                ? 'linear-gradient(135deg, rgba(97, 201, 97, 0.2), rgba(90, 184, 90, 0.2))'
                                : 'rgba(212, 193, 156, 0.05)',
                              border: isCurrentTurn 
                                ? '2px solid #4a4'
                                : '1px solid rgba(212, 193, 156, 0.2)',
                              borderRadius: '0.5rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '1rem',
                              transition: 'all 0.3s ease'
                            }}
                          >
                            <div style={{
                              minWidth: '2rem',
                              height: '2rem',
                              borderRadius: '50%',
                              background: isCurrentTurn 
                                ? 'linear-gradient(135deg, #61c961, #5ab85a)'
                                : 'rgba(212, 193, 156, 0.2)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: isCurrentTurn ? '#000' : 'var(--text-gold)',
                              fontWeight: 'bold',
                              fontSize: '1rem'
                            }}>
                              {combatant.initiative}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{
                                color: isCurrentTurn ? '#4a4' : 'var(--text-gold)',
                                fontWeight: isCurrentTurn ? 'bold' : 'normal',
                                fontSize: isCurrentTurn ? '1.05rem' : '0.95rem'
                              }}>
                                {combatant.name}
                                {isCurrentTurn && <span style={{ marginLeft: '0.5rem' }}>← Current Turn</span>}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.25rem' }}>
                                Movement: {(remainingMovement[combatant.characterId] ?? combatant.movement_speed).toFixed(2)}/{combatant.movement_speed} ft
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div style={{
                  position: 'relative',
                  width: '100%',
                  minHeight: '600px',
                  border: '2px solid rgba(212, 193, 156, 0.3)',
                  borderRadius: '0.75rem',
                  overflow: 'hidden',
                  background: 'rgba(0, 0, 0, 0.3)'
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  // Update current drag position for visual feedback
                  if (draggedCharacter !== null && dragStartPosition) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = ((e.clientX - rect.left) / rect.width) * 100;
                    const y = ((e.clientY - rect.top) / rect.height) * 100;
                    setCurrentDragPosition({ x, y });
                    // console.log('📍 Drag position:', x.toFixed(1), y.toFixed(1)); // Uncomment for debugging
                  }
                }}
                onDragLeave={(e) => {
                  // Only clear if we're leaving the container, not just moving between children
                  if (e.currentTarget === e.target) {
                    setCurrentDragPosition(null);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggedCharacter !== null && dragStartPosition) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = ((e.clientX - rect.left) / rect.width) * 100;
                    const y = ((e.clientY - rect.top) / rect.height) * 100;
                    
                    // Calculate distance moved in percentage points
                    const deltaX = x - dragStartPosition.x;
                    const deltaY = y - dragStartPosition.y;
                    const distancePercent = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
                    
                    // Convert percentage distance to feet (assuming battle map is 100ft x 100ft)
                    // 1% of map = 1 foot of movement
                    const distanceFeet = distancePercent;
                    
                    const character = currentCampaign?.characters.find(c => c.id === draggedCharacter);
                    const currentRemaining = remainingMovement[draggedCharacter] ?? (character?.movement_speed ?? 30);
                    
                    // DM can move characters beyond their movement limit
                    const isDM = user?.role === 'Dungeon Master';
                    
                    // Check if character has enough movement (only enforce for non-DMs)
                    if (!isDM && distanceFeet > currentRemaining) {
                      // Clear drag state without moving
                      setDraggedCharacter(null);
                      setDragStartPosition(null);
                      setCurrentDragPosition(null);
                      return;
                    }
                    
                    // Update position in state immediately
                    setBattlePositions(prev => ({
                      ...prev,
                      [draggedCharacter]: { x, y }
                    }));
                    
                    // Decrease remaining movement (can go negative if DM overrides)
                    // Don't consume movement if combat hasn't started yet (waiting phase)
                    const newRemaining = currentTurnIndex === -1 ? currentRemaining : currentRemaining - distanceFeet;
                    setRemainingMovement(prev => ({
                      ...prev,
                      [draggedCharacter]: newRemaining
                    }));
                    
                    // Emit to other users via Socket.IO immediately
                    if (socket && currentCampaign) {
                      const moveData = {
                        campaignId: currentCampaign.campaign.id,
                        characterId: draggedCharacter,
                        characterName: character?.name || '',
                        x,
                        y,
                        remainingMovement: newRemaining
                      };
                      socket.emit('characterBattleMove', moveData);
                    }
                    
                    // Update position in backend (async, doesn't block UI)
                    characterAPI.updateBattlePosition(draggedCharacter, x, y).catch(error => {
                      console.error('Error updating character battle position:', error);
                    });
                    
                    setDraggedCharacter(null);
                    setDragStartPosition(null);
                    setCurrentDragPosition(null);
                  }
                }}
                >
                  <img 
                    src={BattleMapImage} 
                    alt="Battle Map" 
                    style={{ 
                      width: '100%', 
                      height: 'auto',
                      display: 'block',
                      userSelect: 'none',
                      pointerEvents: 'none'
                    }} 
                  />
                  
                  {/* Visual movement line while dragging */}
                  {draggedCharacter !== null && dragStartPosition && currentDragPosition && (
                    <>
                      {/* Distance line */}
                      <svg
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          pointerEvents: 'none',
                          zIndex: 999
                        }}
                      >
                        <line
                          x1={`${dragStartPosition.x}%`}
                          y1={`${dragStartPosition.y}%`}
                          x2={`${currentDragPosition.x}%`}
                          y2={`${currentDragPosition.y}%`}
                          stroke={(() => {
                            const character = currentCampaign?.characters.find(c => c.id === draggedCharacter);
                            const currentRemaining = remainingMovement[draggedCharacter] ?? (character?.movement_speed ?? 30);
                            const deltaX = currentDragPosition.x - dragStartPosition.x;
                            const deltaY = currentDragPosition.y - dragStartPosition.y;
                            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
                            return distance <= currentRemaining ? '#4CAF50' : '#f44336';
                          })()}
                          strokeWidth="3"
                          strokeDasharray="5,5"
                          markerEnd="url(#arrowhead)"
                        />
                        <defs>
                          <marker
                            id="arrowhead"
                            markerWidth="10"
                            markerHeight="10"
                            refX="9"
                            refY="3"
                            orient="auto"
                          >
                            <polygon
                              points="0 0, 10 3, 0 6"
                              fill={(() => {
                                const character = currentCampaign?.characters.find(c => c.id === draggedCharacter);
                                const currentRemaining = remainingMovement[draggedCharacter] ?? (character?.movement_speed ?? 30);
                                const deltaX = currentDragPosition.x - dragStartPosition.x;
                                const deltaY = currentDragPosition.y - dragStartPosition.y;
                                const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
                                return distance <= currentRemaining ? '#4CAF50' : '#f44336';
                              })()}
                            />
                          </marker>
                        </defs>
                      </svg>
                      
                      {/* Distance label */}
                      <div
                        style={{
                          position: 'absolute',
                          left: `${(dragStartPosition.x + currentDragPosition.x) / 2}%`,
                          top: `${(dragStartPosition.y + currentDragPosition.y) / 2}%`,
                          transform: 'translate(-50%, -150%)',
                          background: (() => {
                            const character = currentCampaign?.characters.find(c => c.id === draggedCharacter);
                            const currentRemaining = remainingMovement[draggedCharacter] ?? (character?.movement_speed ?? 30);
                            const deltaX = currentDragPosition.x - dragStartPosition.x;
                            const deltaY = currentDragPosition.y - dragStartPosition.y;
                            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
                            return distance <= currentRemaining ? 'rgba(76, 175, 80, 0.9)' : 'rgba(244, 67, 54, 0.9)';
                          })(),
                          color: 'white',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          fontSize: '0.9rem',
                          fontWeight: 'bold',
                          whiteSpace: 'nowrap',
                          pointerEvents: 'none',
                          zIndex: 1000,
                          boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                          border: '2px solid rgba(255,255,255,0.3)'
                        }}
                      >
                        {(() => {
                          const character = currentCampaign?.characters.find(c => c.id === draggedCharacter);
                          const currentRemaining = remainingMovement[draggedCharacter] ?? (character?.movement_speed ?? 30);
                          const deltaX = currentDragPosition.x - dragStartPosition.x;
                          const deltaY = currentDragPosition.y - dragStartPosition.y;
                          const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
                          const afterMove = currentRemaining - distance;
                          return `${distance.toFixed(1)}ft (${afterMove.toFixed(1)}ft remaining)`;
                        })()}
                      </div>
                    </>
                  )}
                  
                  {/* Combat tokens on battle map (Characters and Monsters) */}
                  {combatants.map(combatant => {
                    const position = battlePositions[combatant.characterId];
                    if (!position) {
                      // Set initial random position for new combatants
                      const randomX = 20 + Math.random() * 60;
                      const randomY = 20 + Math.random() * 60;
                      setBattlePositions(prev => ({ ...prev, [combatant.characterId]: { x: randomX, y: randomY } }));
                      return null;
                    }
                    
                    const isDM = user?.role === 'Dungeon Master';
                    const remaining = remainingMovement[combatant.characterId] ?? combatant.movement_speed ?? 30;
                    
                    // Check if it's this token's turn (in combat)
                    const isTheirTurn = currentTurnIndex >= 0 && initiativeOrder.length > 0
                      ? initiativeOrder[currentTurnIndex] === combatant.characterId
                      : false; // Changed from true - no one's turn if combat hasn't started
                    
                    // Find if this is a character or monster instance
                    const character = currentCampaign?.characters.find((c: any) => c.id === combatant.characterId);
                    
                    // For monsters, characterId is actually the instance ID
                    // We need to find the monster template using the monsterId field
                    let monsterTemplate = null;
                    let isMonster = false;
                    if (!character && combatant.monsterId) {
                      monsterTemplate = monsters.find((m: any) => m.id === combatant.monsterId);
                      isMonster = true;
                    }
                    
                    // Can move if: (DM always can) OR (combat started AND is owner AND it's their turn)
                    const isOwner = character ? character.player_id === user?.id : false;
                    const combatStarted = currentTurnIndex >= 0;
                    const canMove = isDM || (combatStarted && isOwner && isTheirTurn);
                    
                    const imageUrl = (character?.image_url || monsterTemplate?.image_url)
                      ? (process.env.NODE_ENV === 'production' ? (character?.image_url || monsterTemplate?.image_url) : `http://localhost:5000${character?.image_url || monsterTemplate?.image_url}`)
                      : null;
                    
                    const name = combatant.name;
                    const displayName = character ? `${name} (${character.player_name})` : name;
                    
                    return (
                      <div
                        key={`battle-${combatant.characterId}`}
                        style={{
                          position: 'absolute',
                          left: `${position.x}%`,
                          top: `${position.y}%`,
                          transform: 'translate(-50%, -50%)',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          zIndex: draggedCharacter === combatant.characterId ? 1000 : 1
                        }}
                      >
                        <div
                          draggable={canMove && (isDM || remaining > 0)}
                          onDragStart={() => {
                            if (canMove && (isDM || remaining > 0)) {
                              setDraggedCharacter(combatant.characterId);
                              setDragStartPosition({ x: position.x, y: position.y });
                              setCurrentDragPosition(null);
                            }
                          }}
                          onDragEnd={() => {
                            setDraggedCharacter(null);
                            setDragStartPosition(null);
                            setCurrentDragPosition(null);
                          }}
                          style={{
                            width: '50px',
                            height: '50px',
                            borderRadius: '50%',
                            border: isTheirTurn 
                              ? `3px solid ${remaining > 0 ? '#4a4' : remaining === 0 ? '#888' : '#f44336'}`
                              : `3px solid ${isMonster ? '#d9534f' : remaining > 0 ? 'var(--text-gold)' : remaining === 0 ? '#888' : '#f44336'}`,
                            backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                            backgroundColor: !imageUrl 
                              ? (isMonster ? 'linear-gradient(135deg, rgba(217, 83, 79, 0.8), rgba(200, 60, 60, 0.8))' : 'linear-gradient(135deg, rgba(139, 69, 19, 0.8), rgba(101, 67, 33, 0.8))')
                              : undefined,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            fontWeight: 'bold',
                            fontSize: '1.2rem',
                            cursor: canMove && (isDM || remaining > 0) ? 'move' : 'not-allowed',
                            userSelect: 'none',
                            boxShadow: isTheirTurn ? '0 0 12px rgba(74, 164, 74, 0.6)' : '0 4px 8px rgba(0, 0, 0, 0.3)',
                            transition: 'all 0.3s ease',
                            opacity: isDM ? 1 : (canMove && remaining > 0 ? 1 : 0.5)
                          }}
                          title={`${displayName} - ${remaining.toFixed(2)}ft remaining${!combatStarted ? ' (Combat not started - DM only)' : !isTheirTurn && !isDM ? ' (Not your turn)' : ''}${isDM && remaining <= 0 ? ' (DM Override)' : ''}${isMonster ? ' (Monster)' : ''}`}
                        >
                          {!imageUrl && name.charAt(0).toUpperCase()}
                        </div>
                        <div style={{
                          marginTop: '4px',
                          padding: '2px 6px',
                          background: isTheirTurn
                            ? (remaining > 0 ? 'rgba(74, 164, 74, 0.9)' : remaining === 0 ? 'rgba(136, 136, 136, 0.9)' : 'rgba(244, 67, 54, 0.9)')
                            : (remaining > 0 ? (isMonster ? 'rgba(217, 83, 79, 0.9)' : 'rgba(212, 193, 156, 0.9)') : remaining === 0 ? 'rgba(136, 136, 136, 0.9)' : 'rgba(244, 67, 54, 0.9)'),
                          borderRadius: '4px',
                          fontSize: '0.7rem',
                          fontWeight: 'bold',
                          color: remaining < 0 ? '#fff' : '#000',
                          whiteSpace: 'nowrap'
                        }}>
                          {remaining < 0 ? `${remaining.toFixed(2)}ft` : `${remaining.toFixed(2)}ft`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* BATTLEFIELD TAB - Mass Combat System */}
            {campaignTab === 'battlefield' && (
              <div className="glass-panel" style={{ position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h5 style={{ color: 'var(--text-gold)', margin: 0 }}>🏰 Battlefield - Mass Combat</h5>
                  {user?.role === 'Dungeon Master' && !activeBattle && (
                    <button
                      onClick={() => setShowBattleSetupModal(true)}
                      className="btn btn-primary"
                      style={{
                        padding: '0.625rem 1.25rem',
                        background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.3), rgba(220, 38, 38, 0.3))',
                        border: '2px solid rgba(239, 68, 68, 0.5)',
                        color: '#f87171',
                        fontWeight: 'bold'
                      }}
                    >
                      ⚔️ Start New Battle
                    </button>
                  )}
                </div>

                {!activeBattle ? (
                  <div style={{
                    minHeight: '400px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '2px dashed rgba(212, 193, 156, 0.3)',
                    borderRadius: '0.75rem',
                    background: 'rgba(255, 255, 255, 0.02)',
                    padding: '3rem'
                  }}>
                    <div style={{ fontSize: '4rem', marginBottom: '1rem', opacity: 0.5 }}>⚔️</div>
                    <h4 style={{ color: 'var(--text-gold)', marginBottom: '0.5rem' }}>No Active Battle</h4>
                    <p style={{ color: 'var(--text-muted)', textAlign: 'center', maxWidth: '600px' }}>
                      {user?.role === 'Dungeon Master' 
                        ? 'Click "Start New Battle" to initiate a mass combat encounter. You can invite players\' armies and add temporary enemy forces.'
                        : 'The Dungeon Master hasn\'t started a battle yet. Once a battle begins, you\'ll be able to join with your armies and choose battle goals.'}
                    </p>
                  </div>
                ) : (
                  <div>
                    {/* Battle Info Header */}
                    <div style={{
                      background: 'linear-gradient(135deg, rgba(212, 193, 156, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)',
                      border: '2px solid rgba(212, 193, 156, 0.3)',
                      borderRadius: '0.75rem',
                      padding: '1.5rem',
                      marginBottom: '1.5rem'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                        <div>
                          <h4 style={{ color: 'var(--text-gold)', margin: 0, marginBottom: '0.5rem' }}>
                            {activeBattle.battle_name}
                          </h4>
                          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>
                            {activeBattle.terrain_description || 'No terrain description'}
                          </p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{
                            padding: '0.5rem 1rem',
                            background: activeBattle.status === 'planning' ? 'rgba(59, 130, 246, 0.2)' :
                                       activeBattle.status === 'goal_selection' ? 'rgba(245, 158, 11, 0.2)' :
                                       activeBattle.status === 'resolution' ? 'rgba(239, 68, 68, 0.2)' :
                                       'rgba(34, 197, 94, 0.2)',
                            border: `1px solid ${
                              activeBattle.status === 'planning' ? 'rgba(59, 130, 246, 0.5)' :
                              activeBattle.status === 'goal_selection' ? 'rgba(245, 158, 11, 0.5)' :
                              activeBattle.status === 'resolution' ? 'rgba(239, 68, 68, 0.5)' :
                              'rgba(34, 197, 94, 0.5)'}`,
                            borderRadius: '0.5rem',
                            color: activeBattle.status === 'planning' ? '#60a5fa' :
                                   activeBattle.status === 'goal_selection' ? '#fbbf24' :
                                   activeBattle.status === 'resolution' ? '#f87171' :
                                   '#4ade80',
                            fontSize: '0.85rem',
                            fontWeight: 'bold',
                            textTransform: 'uppercase',
                            marginBottom: '0.5rem'
                          }}>
                            {activeBattle.status.replace('_', ' ')}
                          </div>
                          <div style={{ color: 'var(--text-gold)', fontSize: '0.9rem', fontWeight: 'bold' }}>
                            Round {activeBattle.current_round} / {activeBattle.total_rounds || 5}
                          </div>
                        </div>
                      </div>

                      {user?.role === 'Dungeon Master' && (
                        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                          {/* End Battle Button - Always available for DM */}
                          <button
                            onClick={() => {
                              if (window.confirm('⚠️ Are you sure you want to cancel this battle? All progress will be lost and participants will be removed.')) {
                                battleAPI.updateStatus(activeBattle.id, 'cancelled')
                                  .then(() => {
                                    setActiveBattle(null);
                                    setToastMessage('Battle cancelled successfully.');
                                    setTimeout(() => setToastMessage(null), 3000);
                                  })
                                  .catch(error => {
                                    console.error('Error cancelling battle:', error);
                                    alert('Failed to cancel battle');
                                  });
                              }
                            }}
                            style={{
                              padding: '0.5rem 1rem',
                              background: 'rgba(100, 100, 120, 0.2)',
                              border: '1px solid rgba(150, 150, 170, 0.4)',
                              borderRadius: '0.5rem',
                              color: '#94a3b8',
                              cursor: 'pointer',
                              fontSize: '0.85rem',
                              marginLeft: 'auto'
                            }}
                          >
                            🚫 End Battle
                          </button>
                          
                          {activeBattle.status === 'planning' && (
                            <>
                              <button
                                onClick={() => setShowInvitePlayersModal(true)}
                                style={{
                                  padding: '0.5rem 1rem',
                                  background: 'rgba(34, 197, 94, 0.2)',
                                  border: '1px solid rgba(34, 197, 94, 0.4)',
                                  borderRadius: '0.5rem',
                                  color: '#4ade80',
                                  cursor: 'pointer',
                                  fontSize: '0.85rem'
                                }}
                              >
                                📨 Invite Players
                              </button>
                              <button
                                onClick={() => setShowAddParticipantModal(true)}
                                style={{
                                  padding: '0.5rem 1rem',
                                  background: 'rgba(168, 85, 247, 0.2)',
                                  border: '1px solid rgba(168, 85, 247, 0.4)',
                                  borderRadius: '0.5rem',
                                  color: '#a78bfa',
                                  cursor: 'pointer',
                                  fontSize: '0.85rem'
                                }}
                              >
                                🎭 Add AI Army
                              </button>
                              <button
                                onClick={async () => {
                                  try {
                                    await battleAPI.calculateBaseScores(activeBattle.id);
                                    await battleAPI.updateStatus(activeBattle.id, 'goal_selection');
                                    const updated = await battleAPI.getBattle(activeBattle.id);
                                    setActiveBattle(updated);
                                  } catch (error) {
                                    console.error('Error starting battle:', error);
                                  }
                                }}
                                style={{
                                  padding: '0.5rem 1rem',
                                  background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.3), rgba(217, 119, 6, 0.3))',
                                  border: '2px solid rgba(245, 158, 11, 0.5)',
                                  borderRadius: '0.5rem',
                                  color: '#fbbf24',
                                  cursor: 'pointer',
                                  fontSize: '0.85rem',
                                  fontWeight: 'bold'
                                }}
                              >
                                🎯 Start Battle (Calculate Scores)
                              </button>
                            </>
                          )}
                          {activeBattle.status === 'goal_selection' && (
                            <button
                              onClick={async () => {
                                try {
                                  await battleAPI.updateStatus(activeBattle.id, 'resolution');
                                  const updated = await battleAPI.getBattle(activeBattle.id);
                                  setActiveBattle(updated);
                                } catch (error) {
                                  console.error('Error moving to resolution:', error);
                                }
                              }}
                              style={{
                                padding: '0.5rem 1rem',
                                background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.3), rgba(220, 38, 38, 0.3))',
                                border: '2px solid rgba(239, 68, 68, 0.5)',
                                borderRadius: '0.5rem',
                                color: '#f87171',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                fontWeight: 'bold'
                              }}
                            >
                              ⏭️ Move to Resolution Phase
                            </button>
                          )}
                          {activeBattle.status === 'resolution' && activeBattle.current_round < (activeBattle.total_rounds || 5) && (
                            <button
                              onClick={async () => {
                                try {
                                  await battleAPI.advanceRound(activeBattle.id);
                                  await battleAPI.updateStatus(activeBattle.id, 'goal_selection');
                                  const updated = await battleAPI.getBattle(activeBattle.id);
                                  setActiveBattle(updated);
                                  
                                  // Reset all army movement for the new round
                                  const armyMovement: Record<number, number> = {};
                                  updated.participants?.forEach(participant => {
                                    const category = participant.temp_army_category || participant.army_category || 'Swordsmen';
                                    const speed = getArmyMovementSpeed(category);
                                    console.log(`Round ${updated.current_round} - Resetting movement for participant ${participant.id}: category="${category}", speed=${speed}ft`);
                                    armyMovement[participant.id] = speed;
                                  });
                                  setRemainingArmyMovement(armyMovement);
                                } catch (error) {
                                  console.error('Error advancing round:', error);
                                }
                              }}
                              style={{
                                padding: '0.5rem 1rem',
                                background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.3), rgba(22, 163, 74, 0.3))',
                                border: '2px solid rgba(34, 197, 94, 0.5)',
                                borderRadius: '0.5rem',
                                color: '#4ade80',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                fontWeight: 'bold'
                              }}
                            >
                              ▶️ Next Round
                            </button>
                          )}
                          {activeBattle.status === 'resolution' && activeBattle.current_round >= (activeBattle.total_rounds || 5) && (
                            <button
                              onClick={async () => {
                                try {
                                  await battleAPI.completeBattle(activeBattle.id);
                                  setActiveBattle(null);
                                  setToastMessage('Battle completed! Results saved to army histories.');
                                  setTimeout(() => setToastMessage(null), 4000);
                                } catch (error) {
                                  console.error('Error completing battle:', error);
                                }
                              }}
                              style={{
                                padding: '0.5rem 1rem',
                                background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.3), rgba(147, 51, 234, 0.3))',
                                border: '2px solid rgba(168, 85, 247, 0.5)',
                                borderRadius: '0.5rem',
                                color: '#c084fc',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                fontWeight: 'bold'
                              }}
                            >
                              🏁 Complete Battle
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Simultaneous Team Selection Status */}
                    {activeBattle.status === 'goal_selection' && (() => {
                      // Group participants by team
                      const teams = activeBattle.participants?.reduce((acc, p) => {
                        if (!acc[p.team_name]) {
                          acc[p.team_name] = {
                            name: p.team_name,
                            color: p.faction_color || '#808080',
                            has_selected: p.has_selected_goal || false,
                            participants: []
                          };
                        }
                        acc[p.team_name].participants.push(p);
                        return acc;
                      }, {} as Record<string, {name: string; color: string; has_selected: boolean; participants: any[]}>);

                      const teamsList = teams ? Object.values(teams) : [];
                      const allSelected = teamsList.every(t => t.has_selected);
                      const selectedCount = teamsList.filter(t => t.has_selected).length;
                      
                      return (
                        <div style={{
                          padding: '1.5rem',
                          marginBottom: '1.5rem',
                          background: allSelected 
                            ? 'rgba(34, 197, 94, 0.2)'
                            : 'linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(217, 119, 6, 0.2))',
                          border: allSelected
                            ? '2px solid rgba(34, 197, 94, 0.5)'
                            : '2px solid rgba(245, 158, 11, 0.4)',
                          borderRadius: '0.75rem'
                        }}>
                          <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: allSelected ? '#4ade80' : '#fbbf24', marginBottom: '1rem', textAlign: 'center' }}>
                            {allSelected ? '✓ All Teams Ready!' : '⏳ Teams Selecting Goals'}
                          </div>
                          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                            {teamsList.map(team => (
                              <div key={team.name} style={{
                                padding: '0.75rem 1.25rem',
                                background: team.has_selected 
                                  ? `linear-gradient(135deg, ${team.color}40, ${team.color}60)`
                                  : 'rgba(100, 100, 120, 0.2)',
                                border: `2px solid ${team.color}`,
                                borderRadius: '0.5rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                              }}>
                                <span style={{ fontSize: '1.2rem' }}>
                                  {team.has_selected ? '✓' : '⏱️'}
                                </span>
                                <div>
                                  <div style={{ fontWeight: 'bold', color: team.color }}>
                                    Team {team.name}
                                  </div>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                    {team.has_selected ? 'Ready' : 'Selecting...'}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                          {allSelected && (
                            <div style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.9rem', color: '#4ade80' }}>
                              DM can move to Resolution Phase
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Battle Map with Overlay Controls */}
                    <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
                      {/* Map Container */}
                      <div style={{
                        position: 'relative',
                        width: '100%',
                        minHeight: '600px',
                        border: '3px solid var(--border-gold)',
                        borderRadius: '0.75rem',
                        overflow: 'hidden',
                        background: 'rgba(0, 0, 0, 0.3)'
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        // Update current drag position for line drawing
                        if (draggedArmyParticipant !== null) {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const x = ((e.clientX - rect.left) / rect.width) * 100;
                          const y = ((e.clientY - rect.top) / rect.height) * 100;
                          setCurrentDragPosition({ x, y });
                        }
                      }}
                      onDrop={async (e) => {
                        e.preventDefault();
                        const participantId = parseInt(e.dataTransfer.getData('participantId'));
                        const startX = parseFloat(e.dataTransfer.getData('startX'));
                        const startY = parseFloat(e.dataTransfer.getData('startY'));
                        
                        if (!participantId || isNaN(startX) || isNaN(startY)) return;
                        
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = ((e.clientX - rect.left) / rect.width) * 100;
                        const y = ((e.clientY - rect.top) / rect.height) * 100;

                        // Calculate distance moved in percentage points
                        const deltaX = x - startX;
                        const deltaY = y - startY;
                        const distancePercent = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
                        
                        // Convert percentage distance to feet
                        // Battlefield map is 1000ft x 1000ft, so 1% = 10ft
                        const distanceFeet = distancePercent * 10;
                        
                        const participant = activeBattle.participants?.find(p => p.id === participantId);
                        if (!participant) return;
                        
                        const currentRemaining = remainingArmyMovement[participantId] ?? 0;
                        const isDM = user?.role === 'Dungeon Master';
                        
                        // Check if army has enough movement (only enforce for non-DMs)
                        // Just prevent the move without alert - visual feedback shows red indicator
                        if (!isDM && distanceFeet > currentRemaining) {
                          return;
                        }

                        // Update local state immediately for smooth UX
                        setActiveBattle(prev => {
                          if (!prev || !prev.participants) return prev;
                          return {
                            ...prev,
                            participants: prev.participants.map(p =>
                              p.id === participantId
                                ? { ...p, position_x: x, position_y: y }
                                : p
                            )
                          };
                        });

                        // Decrease remaining movement (can go negative if DM overrides)
                        const newRemaining = currentRemaining - distanceFeet;
                        setRemainingArmyMovement(prev => ({
                          ...prev,
                          [participantId]: isDM ? currentRemaining : Math.max(0, newRemaining)
                        }));

                        // Emit to other users via Socket.IO
                        if (socket && currentCampaign) {
                          socket.emit('battlefieldParticipantMove', {
                            campaignId: currentCampaign.campaign.id,
                            battleId: activeBattle.id,
                            participantId,
                            x,
                            y,
                            remainingMovement: isDM ? currentRemaining : Math.max(0, newRemaining)
                          });
                        }

                        // Update position in backend (async)
                        try {
                          await battleAPI.updateParticipantPosition(participantId, x, y);
                        } catch (error) {
                          console.error('Error updating position:', error);
                          // Refresh from server on error
                          const updated = await battleAPI.getBattle(activeBattle.id);
                          setActiveBattle(updated);
                        }
                      }}
                      >
                          <img 
                            src={BattleMapImage} 
                            alt="Battlefield Map" 
                            style={{ 
                              width: '100%', 
                              height: 'auto',
                              display: 'block',
                              userSelect: 'none',
                              pointerEvents: 'none'
                            }} 
                          />
                          
                          {/* Grid overlay */}
                          <div style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundImage: 'linear-gradient(rgba(212, 193, 156, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(212, 193, 156, 0.1) 1px, transparent 1px)',
                            backgroundSize: '50px 50px',
                            pointerEvents: 'none'
                          }} />

                          {/* Drag distance line */}
                          {draggedArmyParticipant !== null && dragStartPosition && currentDragPosition && 
                           !isNaN(dragStartPosition.x) && !isNaN(dragStartPosition.y) && 
                           !isNaN(currentDragPosition.x) && !isNaN(currentDragPosition.y) && (() => {
                            const deltaX = currentDragPosition.x - dragStartPosition.x;
                            const deltaY = currentDragPosition.y - dragStartPosition.y;
                            const distancePercent = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
                            const distanceFeet = Math.round(distancePercent * 10);
                            
                            const participant = activeBattle.participants?.find(p => p.id === draggedArmyParticipant);
                            const currentRemaining = remainingArmyMovement[draggedArmyParticipant] ?? 0;
                            const isDM = user?.role === 'Dungeon Master';
                            const hasEnoughMovement = isDM || distanceFeet <= currentRemaining;
                            
                            const midX = (dragStartPosition.x + currentDragPosition.x) / 2;
                            const midY = (dragStartPosition.y + currentDragPosition.y) / 2;
                            
                            // Extra safety check
                            if (isNaN(midX) || isNaN(midY)) return null;
                            
                            return (
                              <svg style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: '100%',
                                pointerEvents: 'none',
                                zIndex: 1000
                              }}>
                                <line
                                  x1={`${dragStartPosition.x}%`}
                                  y1={`${dragStartPosition.y}%`}
                                  x2={`${currentDragPosition.x}%`}
                                  y2={`${currentDragPosition.y}%`}
                                  stroke={hasEnoughMovement ? '#4ade80' : '#ef4444'}
                                  strokeWidth="3"
                                  strokeDasharray="5,5"
                                />
                                <text
                                  x={`${midX}%`}
                                  y={`${midY}%`}
                                  fill={hasEnoughMovement ? '#4ade80' : '#ef4444'}
                                  fontSize="16"
                                  fontWeight="bold"
                                  textAnchor="middle"
                                  style={{
                                    textShadow: '0 0 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.9)'
                                  }}
                                >
                                  {distanceFeet}ft
                                </text>
                              </svg>
                            );
                          })()}

                          {/* Army positions */}
                          {activeBattle.participants && activeBattle.participants.map((participant) => {
                            const canDrag = user?.role === 'Dungeon Master' || (participant.user_id === user?.id && !participant.is_temporary);
                            const factionColor = participant.faction_color || (participant.team_name === 'A' ? '#3b82f6' : '#ef4444');
                            const hasMovement = (remainingArmyMovement[participant.id] ?? 0) > 0;
                            const isDM = user?.role === 'Dungeon Master';
                            
                            // Get the army category and icon
                            let armyCategory = 'Swordsmen';
                            let categoryIcon = '⚔️';
                            
                            if (participant.is_temporary) {
                              // For temporary armies, use temp_army_category
                              armyCategory = (participant as any).temp_army_category || 'Swordsmen';
                              categoryIcon = getArmyCategoryIcon(armyCategory);
                            } else if ((participant as any).army_category) {
                              // For regular armies, use army_category from participant data
                              armyCategory = (participant as any).army_category;
                              categoryIcon = getArmyCategoryIcon(armyCategory);
                            }
                            
                            return (
                            <div
                              key={participant.id}
                              draggable={canDrag}
                              onDragStart={(e) => {
                                if (!canDrag) {
                                  e.preventDefault();
                                  return;
                                }
                                e.dataTransfer.effectAllowed = 'move';
                                e.dataTransfer.setData('participantId', participant.id.toString());
                                // Store starting position for distance calculation
                                e.dataTransfer.setData('startX', (participant.position_x || 50).toString());
                                e.dataTransfer.setData('startY', (participant.position_y || 50).toString());
                                
                                // Set drag state for line drawing
                                setDraggedArmyParticipant(participant.id);
                                setDragStartPosition({ x: participant.position_x || 50, y: participant.position_y || 50 });
                                setCurrentDragPosition({ x: participant.position_x || 50, y: participant.position_y || 50 });
                              }}
                              onDragEnd={() => {
                                // Clear drag state
                                setDraggedArmyParticipant(null);
                                setDragStartPosition(null);
                                setCurrentDragPosition(null);
                              }}
                              style={{
                                position: 'absolute',
                                left: `${participant.position_x || 50}%`,
                                top: `${participant.position_y || 50}%`,
                                transform: 'translate(-50%, -50%)',
                                width: '90px',
                                height: '90px',
                                background: `linear-gradient(135deg, ${factionColor}ee, ${factionColor}cc)`,
                                border: (!isDM && !hasMovement) ? '4px solid #ef4444' : `4px solid ${factionColor}`,
                                borderRadius: '50%',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: canDrag ? 'move' : 'default',
                                boxShadow: (!isDM && !hasMovement) 
                                  ? '0 4px 12px rgba(239, 68, 68, 0.8), 0 0 20px rgba(239, 68, 68, 0.6)'
                                  : `0 4px 12px ${factionColor}80, 0 0 20px ${factionColor}40`,
                                transition: 'transform 0.2s',
                                opacity: canDrag ? 1 : 0.7
                              }}
                              onMouseEnter={(e) => canDrag && (e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1.15)')}
                              onMouseLeave={(e) => canDrag && (e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1)')}
                            >
                              {/* Team badge */}
                              <div style={{
                                position: 'absolute',
                                top: '-8px',
                                background: factionColor,
                                padding: '2px 8px',
                                borderRadius: '10px',
                                fontSize: '0.7rem',
                                fontWeight: 'bold',
                                color: 'white',
                                textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                                border: '2px solid white',
                                whiteSpace: 'nowrap'
                              }}>
                                {participant.team_name}
                              </div>
                              
                              <div style={{ fontSize: '1.8rem', marginBottom: '0.2rem' }}>
                                {categoryIcon}
                              </div>
                              <div style={{
                                fontSize: '0.7rem',
                                fontWeight: 'bold',
                                color: 'white',
                                textAlign: 'center',
                                textShadow: '0 1px 3px rgba(0,0,0,0.9)',
                                lineHeight: 1.2,
                                maxWidth: '80px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}>
                                {participant.temp_army_name || participant.army_name}
                              </div>
                              {participant.current_troops !== undefined && (
                                <div style={{
                                  fontSize: '0.65rem',
                                  color: participant.current_troops < (participant.army_total_troops || 0) * 0.5 ? '#ef4444' : '#4ade80',
                                  textShadow: '0 1px 3px rgba(0,0,0,0.9)',
                                  fontWeight: 'bold',
                                  marginTop: '0.1rem'
                                }}>
                                  👥 {participant.current_troops.toLocaleString()}
                                </div>
                              )}
                              
                              {/* Movement indicator */}
                              <div style={{
                                position: 'absolute',
                                bottom: '-8px',
                                background: remainingArmyMovement[participant.id] > 0 ? '#4ade80' : '#888',
                                padding: '2px 8px',
                                borderRadius: '10px',
                                fontSize: '0.65rem',
                                fontWeight: 'bold',
                                color: 'white',
                                textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                                border: '2px solid white',
                                whiteSpace: 'nowrap'
                              }}
                              title={`Movement: ${(remainingArmyMovement[participant.id] || 0).toFixed(0)}ft remaining`}
                              >
                                🏃 {(remainingArmyMovement[participant.id] || 0).toFixed(0)}ft
                              </div>
                            </div>
                          );})}

                        {/* Overlay Control Buttons */}
                        <div style={{
                          position: 'absolute',
                          top: '1rem',
                          right: '1rem',
                          display: 'flex',
                          gap: '0.5rem',
                          zIndex: 10
                        }}>
                          {activeBattle.participants && activeBattle.participants.length > 0 && (
                            <button
                              onClick={() => setShowBattlefieldParticipants(!showBattlefieldParticipants)}
                              style={{
                                padding: '0.75rem 1rem',
                                background: showBattlefieldParticipants 
                                  ? 'rgba(212, 193, 156, 0.9)' 
                                  : 'rgba(0, 0, 0, 0.8)',
                                border: '2px solid var(--border-gold)',
                                borderRadius: '0.5rem',
                                color: showBattlefieldParticipants ? '#000' : 'var(--text-gold)',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                fontSize: '0.9rem',
                                backdropFilter: 'blur(10px)',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
                              }}
                            >
                              ⚔️ Participants
                            </button>
                          )}
                          {activeBattle.status !== 'planning' && (
                            <button
                              onClick={() => setShowBattlefieldGoals(!showBattlefieldGoals)}
                              style={{
                                padding: '0.75rem 1rem',
                                background: showBattlefieldGoals 
                                  ? 'rgba(212, 193, 156, 0.9)' 
                                  : 'rgba(0, 0, 0, 0.8)',
                                border: '2px solid var(--border-gold)',
                                borderRadius: '0.5rem',
                                color: showBattlefieldGoals ? '#000' : 'var(--text-gold)',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                fontSize: '0.9rem',
                                backdropFilter: 'blur(10px)',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
                              }}
                            >
                              🎯 Goals {activeBattle.current_goals && activeBattle.current_goals.length > 0 ? `(${activeBattle.current_goals.length})` : ''}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Participants Overlay Panel */}
                    {showBattlefieldParticipants && activeBattle.participants && activeBattle.participants.length > 0 && (
                      <div style={{
                        position: 'fixed',
                        top: '50%',
                        left: showBattlefieldGoals ? '5%' : '50%',
                        transform: showBattlefieldGoals ? 'translate(0, -50%)' : 'translate(-50%, -50%)',
                        maxWidth: '90vw',
                        maxHeight: '80vh',
                        overflowY: 'auto',
                        background: 'linear-gradient(135deg, rgba(20, 20, 30, 0.98), rgba(30, 30, 40, 0.98))',
                        border: '3px solid var(--border-gold)',
                        borderRadius: '1rem',
                        padding: '2rem',
                        zIndex: 1000,
                        backdropFilter: 'blur(20px)',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
                        transition: 'left 0.4s ease-in-out, transform 0.4s ease-in-out'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                          <h5 style={{ color: 'var(--text-gold)', margin: 0 }}>⚔️ Battle Participants</h5>
                          <button
                            onClick={() => setShowBattlefieldParticipants(false)}
                            style={{
                              padding: '0.5rem 1rem',
                              background: 'rgba(239, 68, 68, 0.2)',
                              border: '2px solid rgba(239, 68, 68, 0.5)',
                              borderRadius: '0.5rem',
                              color: '#f87171',
                              fontWeight: 'bold',
                              cursor: 'pointer',
                              fontSize: '0.9rem'
                            }}
                          >
                            ✕ Close
                          </button>
                        </div>
                        {(() => {
                          // Group participants by team
                          const teamGroups = (activeBattle.participants || []).reduce((acc, p) => {
                            if (!acc[p.team_name]) acc[p.team_name] = [];
                            acc[p.team_name].push(p);
                            return acc;
                          }, {} as Record<string, BattleParticipant[]>);

                          return Object.entries(teamGroups).map(([teamName, participants]) => (
                            <div key={teamName} style={{
                              marginBottom: '1.5rem',
                              padding: '1rem',
                              background: 'rgba(0, 0, 0, 0.2)',
                              border: `2px solid ${participants[0].faction_color || '#808080'}`,
                              borderRadius: '0.75rem'
                            }}>
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                marginBottom: '1rem',
                                paddingBottom: '0.5rem',
                                borderBottom: `2px solid ${participants[0].faction_color || '#808080'}`
                              }}>
                                <div style={{
                                  width: '1rem',
                                  height: '1rem',
                                  background: participants[0].faction_color || '#808080',
                                  borderRadius: '50%',
                                  boxShadow: `0 0 10px ${participants[0].faction_color || '#808080'}`
                                }} />
                                <h6 style={{ color: participants[0].faction_color || '#808080', margin: 0, fontSize: '1.1rem', fontWeight: 'bold' }}>
                                  {teamName}
                                </h6>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                  ({participants.length} {participants.length === 1 ? 'army' : 'armies'})
                                </span>
                                {activeBattle.status !== 'planning' && (
                                  <div style={{
                                    marginLeft: 'auto',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    padding: '0.5rem 1rem',
                                    background: 'rgba(0, 0, 0, 0.4)',
                                    borderRadius: '0.5rem',
                                    border: `2px solid ${participants[0].faction_color || '#808080'}`
                                  }}>
                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Total Score:</span>
                                    <span style={{
                                      fontSize: '1.3rem',
                                      fontWeight: 'bold',
                                      color: participants[0].faction_color || '#808080',
                                      textShadow: `0 0 10px ${participants[0].faction_color || '#808080'}`
                                    }}>
                                      {participants.reduce((sum, p) => sum + ((p.current_troops || 0) > 0 ? (p.current_score || 0) : 0), 0)}
                                    </span>
                                  </div>
                                )}
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                                {participants.map((participant) => (
                            <div
                              key={participant.id}
                              style={{
                                padding: '1rem',
                                background: 'rgba(0, 0, 0, 0.3)',
                                border: '2px solid rgba(212, 193, 156, 0.3)',
                                borderRadius: '0.5rem'
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.75rem' }}>
                                <div>
                                  <div style={{ fontWeight: 'bold', color: 'var(--text-gold)', fontSize: '1rem' }}>
                                    {participant.temp_army_name || participant.army_name}
                                  </div>
                                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                                    Team: {participant.team_name}
                                    {participant.player_name && ` (${participant.player_name})`}
                                  </div>
                                  {participant.current_troops !== undefined && (
                                    <div style={{ 
                                      fontSize: '0.8rem', 
                                      color: participant.current_troops < (participant.army_total_troops || 0) * 0.5 ? '#ef4444' : '#4ade80',
                                      marginTop: '0.25rem',
                                      fontWeight: 'bold'
                                    }}>
                                      👥 Troops: {participant.current_troops.toLocaleString()} / {participant.army_total_troops?.toLocaleString() || 'N/A'}
                                    </div>
                                  )}
                                </div>
                                {participant.is_temporary && (
                                  <span style={{
                                    fontSize: '0.75rem',
                                    padding: '0.25rem 0.5rem',
                                    background: 'rgba(239, 68, 68, 0.2)',
                                    border: '1px solid rgba(239, 68, 68, 0.4)',
                                    borderRadius: '0.25rem',
                                    color: '#f87171'
                                  }}>
                                    Temporary
                                  </span>
                                )}
                              </div>
                              
                              {activeBattle.status !== 'planning' && (
                                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '0.5rem' }}>
                                  <div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Base Score</div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#60a5fa' }}>
                                      {participant.base_score || 0}
                                    </div>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Current Score</div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#4ade80' }}>
                                      {participant.current_score || 0}
                                    </div>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Modifier</div>
                                    <div style={{ 
                                      fontSize: '1.1rem', 
                                      fontWeight: 'bold', 
                                      color: (participant.current_score - participant.base_score) >= 0 ? '#4ade80' : '#f87171'
                                    }}>
                                      {(participant.current_score - participant.base_score) >= 0 ? '+' : ''}
                                      {participant.current_score - participant.base_score}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                                ))}
                              </div>
                            </div>
                          ));
                        })()}
                      </div>
                    )}

                    {/* Goals Overlay Panel */}
                    {showBattlefieldGoals && (activeBattle.status === 'goal_selection' || activeBattle.status === 'resolution') && (
                      <div style={{
                        position: 'fixed',
                        top: '50%',
                        right: showBattlefieldParticipants ? '5%' : 'auto',
                        left: showBattlefieldParticipants ? 'auto' : '50%',
                        transform: showBattlefieldParticipants ? 'translate(0, -50%)' : 'translate(-50%, -50%)',
                        width: showBattlefieldParticipants ? '48%' : 'auto',
                        maxWidth: showBattlefieldParticipants ? '48vw' : '90vw',
                        maxHeight: '85vh',
                        overflowY: 'auto',
                        background: 'linear-gradient(135deg, rgba(20, 20, 30, 0.98), rgba(30, 30, 40, 0.98))',
                        border: '3px solid var(--border-gold)',
                        borderRadius: '1rem',
                        padding: '2rem',
                        zIndex: 1000,
                        backdropFilter: 'blur(20px)',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
                        transition: 'left 0.4s ease-in-out, right 0.4s ease-in-out, transform 0.4s ease-in-out, width 0.4s ease-in-out, max-width 0.4s ease-in-out'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                          <h5 style={{ color: 'var(--text-gold)', margin: 0 }}>
                            {activeBattle.status === 'goal_selection' ? '🎯 Goal Selection' : '📊 Goal Resolution'}
                          </h5>
                          <button
                            onClick={() => setShowBattlefieldGoals(false)}
                            style={{
                              padding: '0.5rem 1rem',
                              background: 'rgba(239, 68, 68, 0.2)',
                              border: '2px solid rgba(239, 68, 68, 0.5)',
                              borderRadius: '0.5rem',
                              color: '#f87171',
                              fontWeight: 'bold',
                              cursor: 'pointer',
                              fontSize: '0.9rem'
                            }}
                          >
                            ✕ Close
                          </button>
                        </div>
                      <div>
                    {/* Goal Selection Phase */}
                    {activeBattle.status === 'goal_selection' && (() => {
                      // Group participants by team
                      const teams = activeBattle.participants?.reduce((acc, p) => {
                        if (!acc[p.team_name]) {
                          acc[p.team_name] = {
                            name: p.team_name,
                            color: p.faction_color || '#808080',
                            has_selected: p.has_selected_goal || false,
                            participants: []
                          };
                        }
                        acc[p.team_name].participants.push(p);
                        return acc;
                      }, {} as Record<string, {name: string; color: string; has_selected: boolean; participants: any[]}>);

                      // Find teams the current user can control
                      const userTeams = teams ? Object.values(teams).filter(t => {
                        if (user?.role === 'Dungeon Master') {
                          // DM can control any team that doesn't belong to players
                          return t.participants.every(p => !p.user_id || p.is_temporary);
                        } else {
                          // Players can control their own teams
                          return t.participants.some(p => p.user_id === user?.id);
                        }
                      }) : [];

                      const unselectedUserTeams = userTeams.filter(t => !t.has_selected);
                      const isDM = user?.role === 'Dungeon Master';

                      // Check if user has already selected for all their teams
                      const allUserTeamsSelected = unselectedUserTeams.length === 0;

                      // If user has selected all their teams, show waiting screen
                      if (allUserTeamsSelected) {
                        return (
                          <div>
                            <div style={{
                              padding: '2rem',
                              textAlign: 'center',
                              background: 'rgba(34, 197, 94, 0.1)',
                              border: '2px solid rgba(34, 197, 94, 0.4)',
                              borderRadius: '0.75rem'
                            }}>
                              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✓</div>
                              <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#4ade80', marginBottom: '0.5rem' }}>
                                Goals Selected!
                              </div>
                              <div style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
                                {isDM 
                                  ? 'You have selected goals for all your factions. Waiting for other teams...'
                                  : 'Your team has selected its goal. Waiting for other teams...'}
                              </div>
                            </div>

                            {/* Show other teams' status */}
                            <div style={{ marginTop: '1.5rem' }}>
                              <h6 style={{ color: 'var(--text-gold)', marginBottom: '1rem' }}>Team Status:</h6>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {teams && Object.values(teams).map(team => (
                                  <div key={team.name} style={{
                                    padding: '0.75rem 1rem',
                                    background: team.has_selected 
                                      ? `linear-gradient(135deg, ${team.color}30, ${team.color}20)`
                                      : 'rgba(100, 100, 120, 0.15)',
                                    border: `2px solid ${team.color}`,
                                    borderRadius: '0.5rem',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                  }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                      <span style={{ fontSize: '1.3rem' }}>
                                        {team.has_selected ? '✓' : '⏱️'}
                                      </span>
                                      <div>
                                        <div style={{ fontWeight: 'bold', color: team.color }}>
                                          Team {team.name}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                          {team.participants.map(p => p.temp_army_name || p.army_name).join(', ')}
                                        </div>
                                      </div>
                                    </div>
                                    <div style={{ 
                                      fontSize: '0.85rem', 
                                      fontWeight: 'bold',
                                      color: team.has_selected ? '#4ade80' : '#fbbf24'
                                    }}>
                                      {team.has_selected ? 'Ready' : 'Selecting...'}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      }

                      // Show goal selection UI
                      return (
                        <div>
                          <div style={{
                            padding: '1rem',
                            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(217, 119, 6, 0.2))',
                            border: '2px solid rgba(245, 158, 11, 0.4)',
                            borderRadius: '0.75rem',
                            marginBottom: '1.5rem'
                          }}>
                            <div style={{ fontSize: '1.2rem', color: '#fbbf24', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                              🎯 Goal Selection - Round {activeBattle.current_round} of {activeBattle.total_rounds || 5}
                            </div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                              {isDM 
                                ? 'Select goals for your factions. All teams choose simultaneously.'
                                : 'Select a goal for your team. All teams choose at the same time.'}
                            </div>
                          </div>

                          {/* DM Faction Selector */}
                          {isDM && unselectedUserTeams.length > 1 && (
                            <div style={{ marginBottom: '1.5rem' }}>
                              <h6 style={{ color: 'var(--text-gold)', marginBottom: '0.75rem' }}>
                                Select Faction to Choose Goal:
                              </h6>
                              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                {unselectedUserTeams.map(team => (
                                  <button
                                    key={team.name}
                                    onClick={() => {
                                      setSelectedFactionForGoal(team.name);
                                      setSelectedGoalExecutor(null);
                                    }}
                                    style={{
                                      padding: '1rem 1.5rem',
                                      background: selectedFactionForGoal === team.name
                                        ? `linear-gradient(135deg, ${team.color}50, ${team.color}70)`
                                        : `linear-gradient(135deg, ${team.color}20, ${team.color}30)`,
                                      border: selectedFactionForGoal === team.name
                                        ? `3px solid ${team.color}`
                                        : `2px solid ${team.color}80`,
                                      borderRadius: '0.75rem',
                                      color: 'white',
                                      cursor: 'pointer',
                                      fontWeight: 'bold',
                                      transition: 'all 0.2s',
                                      boxShadow: selectedFactionForGoal === team.name 
                                        ? `0 4px 12px ${team.color}60`
                                        : 'none'
                                    }}
                                  >
                                    <div style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>
                                      Team {team.name}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', opacity: 0.9 }}>
                                      {team.participants.length} {team.participants.length === 1 ? 'army' : 'armies'}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Select Army Button - First Step */}
                          {!selectedGoalExecutor && (!isDM || unselectedUserTeams.length === 1 || selectedFactionForGoal) && (
                            <div style={{
                              display: 'flex',
                              justifyContent: 'center',
                              marginBottom: '1.5rem'
                            }}>
                              <button
                                onClick={() => setShowArmySelectionModal(true)}
                                style={{
                                  padding: '1rem 2rem',
                                  background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.3), rgba(124, 58, 237, 0.3))',
                                  border: '3px solid rgba(168, 85, 247, 0.6)',
                                  borderRadius: '0.75rem',
                                  color: '#a78bfa',
                                  fontWeight: 'bold',
                                  cursor: 'pointer',
                                  fontSize: '1.1rem',
                                  boxShadow: '0 4px 12px rgba(168, 85, 247, 0.3)',
                                  transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.transform = 'scale(1.05)';
                                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(168, 85, 247, 0.5)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.transform = 'scale(1)';
                                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(168, 85, 247, 0.3)';
                                }}
                              >
                                🎯 Select Army & Choose Goal
                              </button>
                            </div>
                          )}

                        {showBattlefieldGoals && selectedGoalExecutor && (
                          <div style={{
                            background: 'rgba(0, 0, 0, 0.3)',
                            border: '1px solid rgba(212, 193, 156, 0.2)',
                            borderRadius: '0.75rem',
                            padding: '1.5rem',
                            marginBottom: '1.5rem'
                          }}>
                            {/* Change Army Button */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                              <button
                                onClick={() => {
                                  setSelectedGoalExecutor(null);
                                }}
                                style={{
                                  padding: '0.5rem 1rem',
                                  background: 'rgba(59, 130, 246, 0.2)',
                                  border: '1px solid rgba(59, 130, 246, 0.4)',
                                  borderRadius: '0.5rem',
                                  color: '#60a5fa',
                                  cursor: 'pointer',
                                  fontSize: '0.85rem',
                                  fontWeight: 'bold'
                                }}
                              >
                                ← Change Army
                              </button>
                            </div>
                            {/* Category Tabs */}
                            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                              {['Command', 'Strategy', 'Assault', 'Combat', 'Misc'].map((category) => (
                                <button
                                  key={category}
                                  onClick={() => setSelectedGoalCategory(category)}
                                  style={{
                                    padding: '0.75rem 1.5rem',
                                    background: selectedGoalCategory === category
                                      ? 'linear-gradient(135deg, rgba(212, 193, 156, 0.3), rgba(212, 193, 156, 0.2))'
                                      : 'rgba(212, 193, 156, 0.1)',
                                    border: selectedGoalCategory === category
                                      ? '2px solid rgba(212, 193, 156, 0.6)'
                                      : '1px solid rgba(212, 193, 156, 0.3)',
                                    borderRadius: '0.5rem',
                                    color: selectedGoalCategory === category ? '#fbbf24' : 'var(--text-gold)',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem',
                                    fontWeight: selectedGoalCategory === category ? 'bold' : 'normal',
                                    transition: 'all 0.2s'
                                  }}
                                >
                                  {category === 'Command' && '👑 '}
                                  {category === 'Strategy' && '🧠 '}
                                  {category === 'Assault' && '⚔️ '}
                                  {category === 'Combat' && '🎮 '}
                                  {category === 'Misc' && '🎲 '}
                                  {category}
                                </button>
                              ))}
                            </div>

                            {/* Goals by Category */}
                            <div style={{
                              background: 'rgba(0, 0, 0, 0.2)',
                              padding: '1rem',
                              borderRadius: '0.5rem',
                              border: '1px solid rgba(212, 193, 156, 0.2)'
                            }}>
                              <h4 style={{
                                color: selectedGoalCategory === 'Command' ? '#a78bfa' :
                                       selectedGoalCategory === 'Strategy' ? '#60a5fa' :
                                       selectedGoalCategory === 'Assault' ? '#f87171' :
                                       selectedGoalCategory === 'Combat' ? '#a855f7' : '#4ade80',
                                marginTop: 0,
                                marginBottom: '1rem',
                                fontSize: '1.1rem'
                              }}>
                                {selectedGoalCategory === 'Command' && '👑 Command Goals'}
                                {selectedGoalCategory === 'Strategy' && '🧠 Strategy Goals'}
                                {selectedGoalCategory === 'Assault' && '⚔️ Assault Goals'}
                                {selectedGoalCategory === 'Combat' && '🎮 Combat Goals (Player Fights)'}
                                {selectedGoalCategory === 'Misc' && '🎲 Miscellaneous Goals'}
                              </h4>
                              <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                                gap: '1rem'
                              }}>
                              {BATTLE_GOALS.filter(g => g.category === selectedGoalCategory).map((goal, index) => {
                                // Find executor participant and their team
                                const executorParticipant = activeBattle?.participants?.find(p => p.id === selectedGoalExecutor);
                                
                                // User can always select goals (no restrictions based on turn order)
                                const canSelect = true;
                                
                                // Calculate the modifier for this goal based on SELECTED executor army's stats
                                let calculatedModifier = 0;
                                
                                // Check if goal is locked based on army category requirement
                                let isLocked = false;
                                let lockReason = '';
                                
                                // Check army category requirement
                                if (goal.required_army_category && executorParticipant) {
                                  // Get the army category for the selected executor
                                  let armyCategory: string | undefined;
                                  if (executorParticipant.is_temporary) {
                                    armyCategory = executorParticipant.temp_army_category;
                                  } else {
                                    const participantArmy = armies.find(a => a.id === executorParticipant.army_id);
                                    armyCategory = participantArmy?.category;
                                  }
                                  
                                  // Check if army category matches requirement
                                  if (!armyCategory || !goal.required_army_category.includes(armyCategory)) {
                                    isLocked = true;
                                    lockReason = `Requires ${goal.required_army_category.join(' or ')} army`;
                                  }
                                }
                                
                                // Check round restrictions
                                if (!isLocked && activeBattle?.current_round) {
                                  if (goal.min_round && activeBattle.current_round < goal.min_round) {
                                    isLocked = true;
                                    lockReason = `Only available from round ${goal.min_round} onwards`;
                                  } else if (goal.max_round && activeBattle.current_round > goal.max_round) {
                                    isLocked = true;
                                    lockReason = `Only available in round ${goal.max_round}`;
                                  }
                                }
                                
                                // Check if losing requirement (only when your team's score is not the highest)
                                if (!isLocked && goal.only_when_losing && executorParticipant && activeBattle?.participants) {
                                  // Calculate team scores
                                  const teamScores: Record<string, number> = {};
                                  activeBattle.participants.forEach(p => {
                                    if (!teamScores[p.team_name]) {
                                      teamScores[p.team_name] = 0;
                                    }
                                    teamScores[p.team_name] += p.current_score || 0;
                                  });
                                  
                                  const executorTeamScore = teamScores[executorParticipant.team_name] || 0;
                                  const highestScore = Math.max(...Object.values(teamScores));
                                  
                                  if (executorTeamScore >= highestScore) {
                                    isLocked = true;
                                    lockReason = 'Only available when your team is losing';
                                  }
                                }
                                
                                if (executorParticipant) {
                                  let characterModifier = 0;
                                  let armyModifier = 0;
                                  
                                  // Get character stats if this goal uses character stats
                                  if (goal.uses_character_stat) {
                                    // Find the character associated with this user in the campaign
                                    const character = characters.find(c => c.player_id === user?.id);
                                    if (character && character.abilities) {
                                      // Get the ability modifier based on test_type
                                      let abilityScore = 10; // Default
                                      switch(goal.test_type) {
                                        case 'STR': abilityScore = character.abilities.str || 10; break;
                                        case 'DEX': abilityScore = character.abilities.dex || 10; break;
                                        case 'CON': abilityScore = character.abilities.con || 10; break;
                                        case 'INT': abilityScore = character.abilities.int || 10; break;
                                        case 'WIS': abilityScore = character.abilities.wis || 10; break;
                                        case 'CHA': abilityScore = character.abilities.cha || 10; break;
                                        case 'Attack': abilityScore = character.abilities.str || 10; break; // Use STR for attacks
                                        case 'Saving Throw': abilityScore = character.abilities.wis || 10; break; // Use WIS for saves
                                      }
                                      // D&D modifier calculation: (ability - 10) / 2, rounded down
                                      characterModifier = Math.floor((abilityScore - 10) / 2);
                                    }
                                  }
                                  
                                  // Get army stats if this goal uses army stats
                                  if (goal.uses_army_stat && goal.army_stat) {
                                    let armyStats;
                                    if (executorParticipant.is_temporary && executorParticipant.temp_army_stats) {
                                      armyStats = executorParticipant.temp_army_stats;
                                      // Calculate numbers stat from troop count for temporary armies
                                      if (goal.army_stat === 'numbers' && executorParticipant.current_troops !== undefined) {
                                        const troopCount = executorParticipant.current_troops;
                                        let numbersStat = 1;
                                        if (troopCount <= 20) numbersStat = 1;
                                        else if (troopCount <= 50) numbersStat = 2;
                                        else if (troopCount <= 100) numbersStat = 3;
                                        else if (troopCount <= 200) numbersStat = 4;
                                        else if (troopCount <= 400) numbersStat = 5;
                                        else if (troopCount <= 800) numbersStat = 6;
                                        else if (troopCount <= 1600) numbersStat = 7;
                                        else if (troopCount <= 3200) numbersStat = 8;
                                        else if (troopCount <= 6400) numbersStat = 9;
                                        else numbersStat = 10;
                                        armyStats = { ...armyStats, numbers: numbersStat };
                                      }
                                    } else {
                                      const participantArmy = armies.find(a => a.id === executorParticipant.army_id);
                                      if (participantArmy) {
                                        armyStats = {
                                          numbers: participantArmy.numbers,
                                          equipment: participantArmy.equipment,
                                          discipline: participantArmy.discipline,
                                          morale: participantArmy.morale,
                                          command: participantArmy.command,
                                          logistics: participantArmy.logistics
                                        };
                                      }
                                    }
                                    
                                    if (armyStats) {
                                      const armyStatValue = armyStats[goal.army_stat as keyof typeof armyStats] || 1;
                                      // Modifier is (stat - 5) since 5 is average/neutral
                                      // Stat 1 = -4, Stat 5 = 0, Stat 10 = +5
                                      armyModifier = armyStatValue - 5;
                                    }
                                  }
                                  
                                  // Combine modifiers
                                  // If use_highest_modifier is true, take the highest of character or army modifier
                                  // Otherwise, add them together
                                  if (goal.use_highest_modifier) {
                                    calculatedModifier = Math.max(characterModifier, armyModifier);
                                  } else {
                                    calculatedModifier = characterModifier + armyModifier;
                                  }
                                }

                                return (
                                  <div
                                    key={index}
                                    onClick={() => {
                                      if (canSelect && !isLocked) {
                                        setSelectedGoal(goal);
                                        setShowGoalConfirmModal(true);
                                      }
                                    }}
                                    style={{
                                      padding: '1.25rem',
                                      background: (canSelect && !isLocked)
                                        ? 'linear-gradient(135deg, rgba(212, 193, 156, 0.12), rgba(255, 255, 255, 0.06))'
                                        : 'rgba(100, 100, 120, 0.1)',
                                      border: `2px solid ${(canSelect && !isLocked) ? 'rgba(212, 193, 156, 0.4)' : 'rgba(100, 100, 120, 0.2)'}`,
                                      borderRadius: '0.75rem',
                                      cursor: (canSelect && !isLocked) ? 'pointer' : 'not-allowed',
                                      opacity: (canSelect && !isLocked) ? 1 : 0.5,
                                      transition: 'all 0.2s',
                                      position: 'relative'
                                    }}
                                    onMouseEnter={(e) => {
                                      if (canSelect && !isLocked) {
                                        e.currentTarget.style.transform = 'translateY(-2px)';
                                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(212, 193, 156, 0.3)';
                                      }
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.transform = 'translateY(0)';
                                      e.currentTarget.style.boxShadow = 'none';
                                    }}
                                  >
                                    {/* Lock Icon */}
                                    {isLocked && (
                                      <div style={{
                                        position: 'absolute',
                                        top: '0.75rem',
                                        right: '0.75rem',
                                        fontSize: '1.5rem',
                                        opacity: 0.6
                                      }}>
                                        🔒
                                      </div>
                                    )}

                                    {/* Goal Name */}
                                    <div style={{
                                      fontWeight: 'bold',
                                      color: (canSelect && !isLocked) ? 'var(--text-gold)' : 'var(--text-muted)',
                                      fontSize: '1.1rem',
                                      marginBottom: '0.75rem',
                                      paddingRight: isLocked ? '2rem' : '0'
                                    }}>
                                      {goal.name}
                                    </div>

                                    {/* Goal Description */}
                                    <div style={{
                                      fontSize: '0.85rem',
                                      color: 'var(--text-secondary)',
                                      marginBottom: '1rem',
                                      fontStyle: 'italic',
                                      lineHeight: '1.4'
                                    }}>
                                      {goal.description}
                                    </div>

                                    {goal.requires_combat && (
                                      <div style={{
                                        fontSize: '0.75rem',
                                        padding: '0.5rem 0.75rem',
                                        background: 'rgba(168, 85, 247, 0.2)',
                                        border: '1px solid rgba(168, 85, 247, 0.5)',
                                        borderRadius: '0.5rem',
                                        color: '#c4b5fd',
                                        marginBottom: '1rem',
                                        fontWeight: 'bold',
                                        display: 'inline-block'
                                      }}>
                                        🎮 Requires Player Combat
                                      </div>
                                    )}

                                    {/* Defensive Goal Badge */}
                                    {goal.is_defensive && (
                                      <div style={{
                                        fontSize: '0.75rem',
                                        padding: '0.5rem 0.75rem',
                                        background: 'rgba(59, 130, 246, 0.2)',
                                        border: '1px solid rgba(59, 130, 246, 0.5)',
                                        borderRadius: '0.5rem',
                                        color: '#60a5fa',
                                        marginBottom: '1rem',
                                        fontWeight: 'bold',
                                        display: 'inline-block',
                                        marginLeft: goal.requires_combat ? '0.5rem' : '0'
                                      }}>
                                        🛡️ Defensive Goal
                                      </div>
                                    )}

                                    {/* Army Category Requirement */}
                                    {goal.required_army_category && (
                                      <div style={{
                                        fontSize: '0.75rem',
                                        padding: '0.5rem 0.75rem',
                                        background: isLocked ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                                        border: `1px solid ${isLocked ? 'rgba(239, 68, 68, 0.4)' : 'rgba(34, 197, 94, 0.4)'}`,
                                        borderRadius: '0.5rem',
                                        color: isLocked ? '#fca5a5' : '#4ade80',
                                        marginBottom: '1rem',
                                        fontWeight: 'bold',
                                        display: 'inline-block'
                                      }}>
                                        {isLocked ? '🔒' : '✓'} Requires: {goal.required_army_category.join(', ')}
                                      </div>
                                    )}

                                    {/* Divider */}
                                    <div style={{
                                      borderTop: '1px solid rgba(212, 193, 156, 0.3)',
                                      marginBottom: '0.75rem'
                                    }} />

                                    {/* Test Information */}
                                    <div style={{ marginBottom: '0.75rem' }}>
                                      <div style={{
                                        fontSize: '0.75rem',
                                        color: 'var(--text-muted)',
                                        marginBottom: '0.25rem',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px',
                                        fontWeight: 'bold'
                                      }}>
                                        Test
                                      </div>
                                      <div style={{
                                        fontSize: '0.9rem',
                                        color: '#60a5fa',
                                        fontWeight: 'bold'
                                      }}>
                                        {goal.test_type}
                                        {goal.uses_character_stat && goal.uses_army_stat && goal.army_stat && !goal.use_highest_modifier && 
                                          ` + ${goal.army_stat.charAt(0).toUpperCase() + goal.army_stat.slice(1)}`}
                                        {goal.uses_character_stat && goal.uses_army_stat && goal.army_stat && goal.use_highest_modifier && 
                                          ` or ${goal.army_stat.charAt(0).toUpperCase() + goal.army_stat.slice(1)}`}
                                        {!goal.uses_character_stat && goal.uses_army_stat && goal.army_stat && 
                                          ` (${goal.army_stat.charAt(0).toUpperCase() + goal.army_stat.slice(1)})`}
                                      </div>
                                    </div>

                                    {/* Modifier */}
                                    <div style={{ marginBottom: '0.75rem' }}>
                                      <div style={{
                                        fontSize: '0.75rem',
                                        color: 'var(--text-muted)',
                                        marginBottom: '0.25rem',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px',
                                        fontWeight: 'bold'
                                      }}>
                                        Your Modifier
                                      </div>
                                      <div style={{
                                        display: 'inline-block',
                                        padding: '0.35rem 0.75rem',
                                        background: `${getModifierColor(calculatedModifier)}20`,
                                        borderRadius: '0.5rem',
                                        border: `2px solid ${getModifierColor(calculatedModifier)}60`
                                      }}>
                                        <span style={{
                                          fontSize: '1.2rem',
                                          fontWeight: 'bold',
                                          color: getModifierColor(calculatedModifier)
                                        }}>
                                          {calculatedModifier >= 0 ? '+' : ''}{calculatedModifier}
                                        </span>
                                        {goal.uses_character_stat && goal.uses_army_stat && (() => {
                                          // Calculate individual modifiers to show breakdown
                                          let charMod = 0;
                                          let armyMod = 0;
                                          
                                          if (executorParticipant) {
                                            // Get character modifier
                                            const character = characters.find(c => c.player_id === executorParticipant.user_id);
                                            if (character && character.abilities) {
                                              let abilityScore = 10;
                                              switch(goal.test_type) {
                                                case 'STR': abilityScore = character.abilities.str || 10; break;
                                                case 'DEX': abilityScore = character.abilities.dex || 10; break;
                                                case 'CON': abilityScore = character.abilities.con || 10; break;
                                                case 'INT': abilityScore = character.abilities.int || 10; break;
                                                case 'WIS': abilityScore = character.abilities.wis || 10; break;
                                                case 'CHA': abilityScore = character.abilities.cha || 10; break;
                                                case 'Attack': abilityScore = character.abilities.str || 10; break;
                                                case 'Saving Throw': abilityScore = character.abilities.wis || 10; break;
                                              }
                                              charMod = Math.floor((abilityScore - 10) / 2);
                                            }
                                            
                                            // Get army modifier
                                            if (goal.army_stat) {
                                              let armyStats;
                                              if (executorParticipant.is_temporary && executorParticipant.temp_army_stats) {
                                                armyStats = executorParticipant.temp_army_stats;
                                                // Calculate numbers stat from troop count for temporary armies
                                                if (goal.army_stat === 'numbers' && executorParticipant.current_troops !== undefined) {
                                                  const troopCount = executorParticipant.current_troops;
                                                  let numbersStat = 1;
                                                  if (troopCount <= 20) numbersStat = 1;
                                                  else if (troopCount <= 50) numbersStat = 2;
                                                  else if (troopCount <= 100) numbersStat = 3;
                                                  else if (troopCount <= 200) numbersStat = 4;
                                                  else if (troopCount <= 400) numbersStat = 5;
                                                  else if (troopCount <= 800) numbersStat = 6;
                                                  else if (troopCount <= 1600) numbersStat = 7;
                                                  else if (troopCount <= 3200) numbersStat = 8;
                                                  else if (troopCount <= 6400) numbersStat = 9;
                                                  else numbersStat = 10;
                                                  armyStats = { ...armyStats, numbers: numbersStat };
                                                }
                                              } else {
                                                const participantArmy = armies.find(a => a.id === executorParticipant.army_id);
                                                if (participantArmy) {
                                                  armyStats = {
                                                    numbers: participantArmy.numbers,
                                                    equipment: participantArmy.equipment,
                                                    discipline: participantArmy.discipline,
                                                    morale: participantArmy.morale,
                                                    command: participantArmy.command,
                                                    logistics: participantArmy.logistics
                                                  };
                                                }
                                              }
                                              if (armyStats) {
                                                const armyStatValue = armyStats[goal.army_stat as keyof typeof armyStats] || 1;
                                                armyMod = armyStatValue - 5;
                                              }
                                            }
                                          }
                                          
                                          return (
                                            <span style={{ fontSize: '0.75rem', marginLeft: '0.5rem', color: 'var(--text-muted)' }}>
                                              ({charMod >= 0 ? '+' : ''}{charMod} {armyMod >= 0 ? '+' : ''}{armyMod})
                                            </span>
                                          );
                                        })()}
                                        {goal.uses_character_stat && !goal.uses_army_stat && (
                                          <span style={{ fontSize: '0.75rem', marginLeft: '0.5rem', color: 'var(--text-muted)' }}>
                                            (Character)
                                          </span>
                                        )}
                                        {!goal.uses_character_stat && goal.uses_army_stat && (
                                          <span style={{ fontSize: '0.75rem', marginLeft: '0.5rem', color: 'var(--text-muted)' }}>
                                            (Army)
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    {/* Target */}
                                    <div style={{ marginBottom: '0.75rem' }}>
                                      <div style={{
                                        fontSize: '0.75rem',
                                        color: 'var(--text-muted)',
                                        marginBottom: '0.25rem',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px',
                                        fontWeight: 'bold'
                                      }}>
                                        Target
                                      </div>
                                      <div style={{
                                        display: 'inline-block',
                                        padding: '0.35rem 0.75rem',
                                        background: goal.targets_enemy ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                                        borderRadius: '0.5rem',
                                        border: `2px solid ${goal.targets_enemy ? 'rgba(239, 68, 68, 0.5)' : 'rgba(34, 197, 94, 0.5)'}`,
                                        color: goal.targets_enemy ? '#f87171' : '#4ade80',
                                        fontSize: '0.85rem',
                                        fontWeight: 'bold'
                                      }}>
                                        {goal.targets_enemy ? '🎯 Enemy' : '🛡️ Ally'}
                                      </div>
                                    </div>

                                    {/* Success Effect */}
                                    <div style={{ marginBottom: '0.5rem' }}>
                                      <div style={{
                                        fontSize: '0.75rem',
                                        color: 'var(--text-muted)',
                                        marginBottom: '0.25rem',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px',
                                        fontWeight: 'bold'
                                      }}>
                                        Success
                                      </div>
                                      <div style={{
                                        padding: '0.5rem 0.75rem',
                                        background: 'rgba(34, 197, 94, 0.15)',
                                        border: '1px solid rgba(34, 197, 94, 0.3)',
                                        borderRadius: '0.5rem',
                                        fontSize: '0.85rem',
                                        color: '#4ade80'
                                      }}>
                                        ✓ {goal.reward}
                                      </div>
                                    </div>

                                    {/* Failure Effect */}
                                    <div style={{ marginBottom: goal.is_defensive ? '0.75rem' : '0' }}>
                                      <div style={{
                                        fontSize: '0.75rem',
                                        color: 'var(--text-muted)',
                                        marginBottom: '0.25rem',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px',
                                        fontWeight: 'bold'
                                      }}>
                                        Failure
                                      </div>
                                      <div style={{
                                        padding: '0.5rem 0.75rem',
                                        background: 'rgba(239, 68, 68, 0.15)',
                                        border: '1px solid rgba(239, 68, 68, 0.3)',
                                        borderRadius: '0.5rem',
                                        fontSize: '0.85rem',
                                        color: '#f87171'
                                      }}>
                                        ✗ {goal.fail}
                                      </div>
                                    </div>

                                    {/* Defensive Mechanic Explanation */}
                                    {goal.is_defensive && (
                                      <div style={{
                                        padding: '0.75rem',
                                        background: 'rgba(59, 130, 246, 0.1)',
                                        border: '1px solid rgba(59, 130, 246, 0.3)',
                                        borderRadius: '0.5rem',
                                        fontSize: '0.75rem',
                                        color: '#93c5fd',
                                        lineHeight: '1.5'
                                      }}>
                                        <div style={{ fontWeight: 'bold', marginBottom: '0.25rem', color: '#60a5fa' }}>
                                          🛡️ Defensive Goal Mechanic:
                                        </div>
                                        <div>• If an enemy targets you with an aggressive goal: <span style={{ color: '#4ade80', fontWeight: 'bold' }}>+3 bonus</span> to your roll</div>
                                        <div>• If no enemy targets you: <span style={{ color: '#fca5a5', fontWeight: 'bold' }}>-2 penalty</span> to your roll</div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Current Round Goals */}
                        {activeBattle.current_goals && activeBattle.current_goals.length > 0 && (
                          <div style={{
                            background: 'rgba(0, 0, 0, 0.4)',
                            border: '2px solid rgba(212, 193, 156, 0.3)',
                            borderRadius: '0.75rem',
                            padding: '1.5rem',
                            marginBottom: '1.5rem'
                          }}>
                            <h6 style={{ color: 'var(--text-gold)', marginTop: 0, marginBottom: '1rem' }}>
                              📜 Goals Selected This Round
                            </h6>
                            <div style={{ display: 'grid', gap: '0.75rem' }}>
                              {activeBattle.current_goals.map((goal) => (
                                <div
                                  key={goal.id}
                                  style={{
                                    padding: '0.75rem',
                                    background: 'rgba(212, 193, 156, 0.05)',
                                    border: '1px solid rgba(212, 193, 156, 0.2)',
                                    borderRadius: '0.5rem',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                  }}
                                >
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 'bold', color: 'var(--text-gold)', fontSize: '0.9rem' }}>
                                      {goal.goal_name}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                                      Team {goal.team_name} | Test: {goal.test_type}
                                      {goal.target_participant_id && ` | Target: ${goal.target_team_name}`}
                                    </div>
                                  </div>
                                  {goal.locked_in && (
                                    <div style={{
                                      padding: '0.25rem 0.75rem',
                                      background: 'rgba(34, 197, 94, 0.2)',
                                      border: '1px solid rgba(34, 197, 94, 0.4)',
                                      borderRadius: '0.25rem',
                                      color: '#4ade80',
                                      fontSize: '0.75rem',
                                      fontWeight: 'bold'
                                    }}>
                                      🔒 Locked
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        </div>
                      );
                    })()}

                    {/* Resolution Phase */}
                    {activeBattle.status === 'resolution' && (
                      <div>
                        <div style={{
                          padding: '1.5rem',
                          background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(220, 38, 38, 0.2))',
                          border: '2px solid rgba(239, 68, 68, 0.4)',
                          borderRadius: '0.75rem',
                          marginBottom: '1.5rem'
                        }}>
                          <div style={{ fontSize: '1.2rem', color: '#f87171', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                            ⚖️ Resolution Phase - Round {activeBattle.current_round}
                          </div>
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            Roll dice for each goal and apply modifiers. The DM sets the DC and determines success or failure.
                          </div>
                        </div>

                        {/* Goals to Resolve */}
                        {activeBattle.current_goals && activeBattle.current_goals.map((goal) => (
                          <div
                            key={goal.id}
                            style={{
                              padding: '1.5rem',
                              background: 'rgba(0, 0, 0, 0.4)',
                              border: '2px solid rgba(212, 193, 156, 0.3)',
                              borderRadius: '0.75rem',
                              marginBottom: '1rem'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                              <div>
                                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-gold)', marginBottom: '0.5rem' }}>
                                  {goal.goal_name}
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                  Team {goal.team_name} | Test: {goal.test_type}
                                  {goal.target_participant_id && ` | Target: ${goal.target_team_name}`}
                                </div>
                              </div>
                            </div>

                            <div style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                              gap: '1rem',
                              marginBottom: '1rem'
                            }}>
                              <div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                  Character Modifier
                                </div>
                                <div style={{
                                  fontSize: '1.5rem',
                                  fontWeight: 'bold',
                                  color: goal.character_modifier >= 0 ? '#4ade80' : '#f87171'
                                }}>
                                  {goal.character_modifier >= 0 ? '+' : ''}{goal.character_modifier}
                                </div>
                              </div>

                              <div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                  Army Stat Modifier
                                </div>
                                <div style={{
                                  fontSize: '1.5rem',
                                  fontWeight: 'bold',
                                  color: goal.army_stat_modifier >= 0 ? '#4ade80' : '#f87171'
                                }}>
                                  {goal.army_stat_modifier >= 0 ? '+' : ''}{goal.army_stat_modifier}
                                </div>
                              </div>

                              <div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                  Dice Roll (d20)
                                </div>
                                {goal.dice_roll !== null ? (
                                  <div style={{
                                    fontSize: '1.5rem',
                                    fontWeight: 'bold',
                                    color: 'var(--text-gold)'
                                  }}>
                                    {goal.dice_roll}
                                  </div>
                                ) : (() => {
                                  // Check if current user can roll for this goal
                                  const userOwnsTeamMember = activeBattle.participants?.some(
                                    p => p.team_name === goal.team_name && p.user_id === user?.id
                                  );
                                  
                                  // Check if this is an AI-controlled team (all participants have no user_id)
                                  const teamParticipants = activeBattle.participants?.filter(
                                    p => p.team_name === goal.team_name
                                  ) || [];
                                  const isAITeam = teamParticipants.length > 0 && teamParticipants.every(p => p.user_id === null);
                                  
                                  // DM can roll for AI teams, players can roll for their own teams
                                  const isDM = user?.role === 'Dungeon Master';
                                  const canRoll = userOwnsTeamMember || (isDM && isAITeam);

                                  if (!canRoll) {
                                    return (
                                      <div style={{
                                        fontSize: '0.85rem',
                                        color: 'var(--text-muted)',
                                        fontStyle: 'italic'
                                      }}>
                                        Waiting for roll...
                                      </div>
                                    );
                                  }

                                  if (isDM && isAITeam) {
                                    // DM can manually input roll or auto-roll for AI teams only
                                    return (
                                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                        <input
                                          type="number"
                                          min="1"
                                          max="20"
                                          placeholder="1-20"
                                          id={`manual-roll-${goal.id}`}
                                          style={{
                                            width: '60px',
                                            padding: '0.5rem',
                                            background: 'rgba(0, 0, 0, 0.4)',
                                            border: '1px solid rgba(212, 193, 156, 0.3)',
                                            borderRadius: '0.25rem',
                                            color: 'white',
                                            fontSize: '0.85rem'
                                          }}
                                        />
                                        <button
                                          onClick={async () => {
                                            const input = document.getElementById(`manual-roll-${goal.id}`) as HTMLInputElement;
                                            const manualRoll = input?.value ? parseInt(input.value) : null;
                                            
                                            if (manualRoll && (manualRoll < 1 || manualRoll > 20)) {
                                              alert('Roll must be between 1 and 20');
                                              return;
                                            }

                                            const roll = manualRoll || (Math.floor(Math.random() * 20) + 1);
                                            try {
                                              await battleAPI.updateGoalRoll(goal.id, roll);
                                              const updated = await battleAPI.getBattle(activeBattle.id);
                                              setActiveBattle(updated);
                                            } catch (error) {
                                              console.error('Error rolling dice:', error);
                                            }
                                          }}
                                          style={{
                                            padding: '0.5rem 1rem',
                                            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.3), rgba(37, 99, 235, 0.3))',
                                            border: '2px solid rgba(59, 130, 246, 0.5)',
                                            borderRadius: '0.5rem',
                                            color: '#60a5fa',
                                            fontWeight: 'bold',
                                            cursor: 'pointer',
                                            fontSize: '0.85rem',
                                            whiteSpace: 'nowrap'
                                          }}
                                        >
                                          🎲 Set/Roll
                                        </button>
                                      </div>
                                    );
                                  }

                                  // Player can only auto-roll
                                  return (
                                    <button
                                      onClick={async () => {
                                        const roll = Math.floor(Math.random() * 20) + 1;
                                        try {
                                          await battleAPI.updateGoalRoll(goal.id, roll);
                                          const updated = await battleAPI.getBattle(activeBattle.id);
                                          setActiveBattle(updated);
                                        } catch (error) {
                                          console.error('Error rolling dice:', error);
                                        }
                                      }}
                                      style={{
                                        padding: '0.5rem 1rem',
                                        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.3), rgba(37, 99, 235, 0.3))',
                                        border: '2px solid rgba(59, 130, 246, 0.5)',
                                        borderRadius: '0.5rem',
                                        color: '#60a5fa',
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        fontSize: '0.85rem'
                                      }}
                                    >
                                      🎲 Roll
                                    </button>
                                  );
                                })()}
                              </div>

                              <div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                  Total
                                </div>
                                <div style={{
                                  fontSize: '1.5rem',
                                  fontWeight: 'bold',
                                  color: '#fbbf24'
                                }}>
                                  {goal.dice_roll !== null 
                                    ? goal.dice_roll + goal.character_modifier + goal.army_stat_modifier
                                    : '—'}
                                </div>
                              </div>
                            </div>

                            {/* DM Controls */}
                            {user?.role === 'Dungeon Master' && goal.dice_roll !== null && (() => {
                              const resolutionData = goalResolutionData[goal.id];
                              const total = (goal.dice_roll || 0) + goal.character_modifier + goal.army_stat_modifier;
                              
                              return (
                                <div style={{
                                  padding: '1rem',
                                  background: 'rgba(168, 85, 247, 0.1)',
                                  border: '1px solid rgba(168, 85, 247, 0.3)',
                                  borderRadius: '0.5rem',
                                  marginTop: '1rem'
                                }}>
                                  <div style={{ color: '#a78bfa', fontWeight: 'bold', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                                    🎭 DM Resolution
                                  </div>
                                  
                                  {!resolutionData ? (
                                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'end' }}>
                                      <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                                          DC Required
                                        </label>
                                        <input
                                          type="number"
                                          min="1"
                                          max="30"
                                          defaultValue={goal.dc_required || 15}
                                          id={`dc-input-${goal.id}`}
                                          style={{
                                            width: '100%',
                                            padding: '0.5rem',
                                            background: 'rgba(0, 0, 0, 0.4)',
                                            border: '1px solid rgba(212, 193, 156, 0.3)',
                                            borderRadius: '0.25rem',
                                            color: 'white'
                                          }}
                                        />
                                      </div>
                                      <button
                                        onClick={() => {
                                          const dcInput = document.getElementById(`dc-input-${goal.id}`) as HTMLInputElement;
                                          const dc = parseInt(dcInput?.value || '15');
                                          const success = total >= dc;
                                          
                                          // Find the goal definition
                                          const goalDef = BATTLE_GOALS.find(g => g.name === goal.goal_name);
                                          
                                          // Calculate score change and casualties based on success margin
                                          let scoreChange = 0;
                                          let casualties = 0;
                                          let targetScoreChange = 0;
                                          let targetCasualties = 0;
                                          const margin = total - dc;
                                          
                                          const isCombatGoal = goalDef?.can_kill || false;
                                          const executorParticipant = activeBattle.participants?.find(p => p.id === goal.participant_id);
                                          const targetParticipant = goal.target_participant_id ? activeBattle.participants?.find(p => p.id === goal.target_participant_id) : null;
                                          
                                          if (success) {
                                            // Success - parse executor and target scores separately
                                            if (goalDef?.reward) {
                                              // Look for "to your team" or "to your" for executor score
                                              const executorMatch = goalDef.reward.match(/([+-]\d+)\s+to\s+your(?:\s+team)?/i);
                                              if (executorMatch) {
                                                scoreChange = parseInt(executorMatch[1]);
                                              } else {
                                                // If no "to your team", use parseGoalModifier as fallback
                                                // But only if there's no "to target" (which is for the enemy)
                                                if (!goalDef.reward.includes('to target')) {
                                                  scoreChange = parseGoalModifier(goalDef.reward);
                                                } else {
                                                  // Has target modifier but no explicit executor modifier
                                                  scoreChange = 0;
                                                }
                                              }
                                            } else {
                                              scoreChange = 2; // Default
                                            }
                                            
                                            // Add bonus for critical success (10+ over DC)
                                            if (margin >= 10) scoreChange += 1;
                                            
                                            // Parse target score from reward text (e.g., "-6 to target enemy")
                                            if (goalDef?.reward && goalDef.targets_enemy) {
                                              const targetMatch = goalDef.reward.match(/([+-]\d+)\s+to\s+target/i);
                                              if (targetMatch) targetScoreChange = parseInt(targetMatch[1]);
                                            }
                                            
                                            if (isCombatGoal) {
                                              // Combat goals: minimal casualties on success
                                              if (executorParticipant?.current_troops) {
                                                casualties = Math.floor(executorParticipant.current_troops * (0.01 + Math.random() * 0.04)); // 1-5%
                                              }
                                              // Target takes more casualties
                                              if (targetParticipant?.current_troops) {
                                                targetCasualties = Math.floor(targetParticipant.current_troops * (0.10 + Math.random() * 0.10)); // 10-20%
                                              }
                                            }
                                          } else {
                                            // Failure - parse executor score (usually negative)
                                            if (goalDef?.fail) {
                                              // Look for "to your team" or "to your" for executor score
                                              const executorMatch = goalDef.fail.match(/([+-]\d+)\s+to\s+your(?:\s+team)?(?:'s\s+total\s+score)?/i);
                                              if (executorMatch) {
                                                scoreChange = parseInt(executorMatch[1]);
                                              } else {
                                                // If no "to your team", use parseGoalModifier
                                                scoreChange = parseGoalModifier(goalDef.fail);
                                              }
                                            } else {
                                              scoreChange = -1; // Default
                                            }
                                            
                                            // Add penalty for critical failure (10+ under DC)
                                            if (margin <= -10) scoreChange -= 1;
                                            
                                            // Parse target score from fail text
                                            if (goalDef?.fail && goalDef.targets_enemy) {
                                              const targetMatch = goalDef.fail.match(/([+-]\d+)\s+to\s+target/i);
                                              if (targetMatch) targetScoreChange = parseInt(targetMatch[1]);
                                            }
                                            
                                            if (isCombatGoal) {
                                              // Combat goals: higher casualties on failure
                                              if (executorParticipant?.current_troops) {
                                                casualties = Math.floor(executorParticipant.current_troops * (0.08 + Math.random() * 0.12)); // 8-20%
                                              }
                                              // Target takes minimal casualties
                                              if (targetParticipant?.current_troops) {
                                                targetCasualties = Math.floor(targetParticipant.current_troops * (0.02 + Math.random() * 0.03)); // 2-5%
                                              }
                                            }
                                          }
                                          
                                          setGoalResolutionData({
                                            ...goalResolutionData,
                                            [goal.id]: {
                                              dc,
                                              success,
                                              scoreChange,
                                              casualties,
                                              targetId: goal.target_participant_id,
                                              targetScoreChange,
                                              targetCasualties,
                                              isCombatGoal
                                            }
                                          });
                                        }}
                                        style={{
                                          padding: '0.5rem 1.5rem',
                                          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.3), rgba(37, 99, 235, 0.3))',
                                          border: '2px solid rgba(59, 130, 246, 0.5)',
                                          borderRadius: '0.5rem',
                                          color: '#60a5fa',
                                          fontWeight: 'bold',
                                          cursor: 'pointer',
                                          fontSize: '0.85rem'
                                        }}
                                      >
                                        📊 Calculate Effects
                                      </button>
                                    </div>
                                  ) : (
                                    <div>
                                      {/* Show calculated effects with edit capability */}
                                      <div style={{
                                        padding: '1rem',
                                        background: resolutionData.success ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                        border: `2px solid ${resolutionData.success ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                                        borderRadius: '0.5rem',
                                        marginBottom: '1rem'
                                      }}>
                                        <div style={{ fontSize: '1rem', fontWeight: 'bold', color: resolutionData.success ? '#4ade80' : '#f87171', marginBottom: '0.75rem' }}>
                                          {resolutionData.success ? '✓ SUCCESS' : '✗ FAILURE'} (DC {resolutionData.dc})
                                        </div>
                                        
                                        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                                          <div>
                                            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                                              Score Change (Executor)
                                            </label>
                                            <input
                                              type="number"
                                              value={resolutionData.scoreChange}
                                              onChange={(e) => {
                                                setGoalResolutionData({
                                                  ...goalResolutionData,
                                                  [goal.id]: {
                                                    ...resolutionData,
                                                    scoreChange: parseInt(e.target.value) || 0
                                                  }
                                                });
                                              }}
                                              style={{
                                                width: '100%',
                                                padding: '0.5rem',
                                                background: 'rgba(0, 0, 0, 0.4)',
                                                border: '1px solid rgba(212, 193, 156, 0.3)',
                                                borderRadius: '0.25rem',
                                                color: 'white',
                                                fontSize: '1.1rem',
                                                fontWeight: 'bold'
                                              }}
                                            />
                                          </div>
                                          
                                          {resolutionData.isCombatGoal && (
                                            <div>
                                              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                                                Casualties (Executor)
                                              </label>
                                              <input
                                                type="number"
                                                min="0"
                                                value={resolutionData.casualties}
                                                onChange={(e) => {
                                                  setGoalResolutionData({
                                                    ...goalResolutionData,
                                                    [goal.id]: {
                                                      ...resolutionData,
                                                      casualties: parseInt(e.target.value) || 0
                                                    }
                                                  });
                                                }}
                                                style={{
                                                  width: '100%',
                                                  padding: '0.5rem',
                                                  background: 'rgba(0, 0, 0, 0.4)',
                                                  border: '1px solid rgba(212, 193, 156, 0.3)',
                                                  borderRadius: '0.25rem',
                                                  color: 'white',
                                                  fontSize: '1.1rem',
                                                  fontWeight: 'bold'
                                                }}
                                              />
                                            </div>
                                          )}
                                          
                                          {resolutionData.targetId && resolutionData.targetId !== goal.participant_id && (() => {
                                            const targetParticipant = activeBattle.participants?.find(p => p.id === resolutionData.targetId);
                                            if (!targetParticipant) return null;
                                            
                                            return (
                                              <>
                                                <div>
                                                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                                                    Target Score Change ({targetParticipant.temp_army_name || targetParticipant.army_name})
                                                  </label>
                                                  <input
                                                    type="number"
                                                    value={resolutionData.targetScoreChange}
                                                    onChange={(e) => {
                                                      setGoalResolutionData({
                                                        ...goalResolutionData,
                                                        [goal.id]: {
                                                          ...resolutionData,
                                                          targetScoreChange: parseInt(e.target.value) || 0
                                                        }
                                                      });
                                                    }}
                                                    style={{
                                                      width: '100%',
                                                      padding: '0.5rem',
                                                      background: 'rgba(0, 0, 0, 0.4)',
                                                      border: '1px solid rgba(212, 193, 156, 0.3)',
                                                      borderRadius: '0.25rem',
                                                      color: 'white',
                                                      fontSize: '1.1rem',
                                                      fontWeight: 'bold'
                                                    }}
                                                  />
                                                </div>
                                                
                                                {resolutionData.isCombatGoal && (
                                                  <div>
                                                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                                                      Target Casualties ({targetParticipant.temp_army_name || targetParticipant.army_name})
                                                    </label>
                                                    <input
                                                      type="number"
                                                      min="0"
                                                      value={resolutionData.targetCasualties}
                                                      onChange={(e) => {
                                                        setGoalResolutionData({
                                                          ...goalResolutionData,
                                                          [goal.id]: {
                                                            ...resolutionData,
                                                            targetCasualties: parseInt(e.target.value) || 0
                                                          }
                                                        });
                                                      }}
                                                      style={{
                                                        width: '100%',
                                                        padding: '0.5rem',
                                                        background: 'rgba(0, 0, 0, 0.4)',
                                                        border: '1px solid rgba(212, 193, 156, 0.3)',
                                                        borderRadius: '0.25rem',
                                                        color: 'white',
                                                        fontSize: '1.1rem',
                                                        fontWeight: 'bold'
                                                      }}
                                                    />
                                                  </div>
                                                )}
                                              </>
                                            );
                                          })()}
                                        </div>
                                      </div>
                                      
                                      <div style={{ display: 'flex', gap: '1rem' }}>
                                        <button
                                          onClick={() => {
                                            setGoalResolutionData({
                                              ...goalResolutionData,
                                              [goal.id]: undefined as any
                                            });
                                          }}
                                          style={{
                                            flex: 1,
                                            padding: '0.5rem 1rem',
                                            background: 'rgba(100, 100, 120, 0.3)',
                                            border: '1px solid rgba(150, 150, 170, 0.5)',
                                            borderRadius: '0.5rem',
                                            color: 'var(--text-secondary)',
                                            cursor: 'pointer',
                                            fontSize: '0.85rem'
                                          }}
                                        >
                                          ← Back
                                        </button>
                                        <button
                                          onClick={async () => {
                                            try {
                                              console.log('=== Apply Resolution Clicked ===');
                                              console.log('Resolution Data:', resolutionData);
                                              console.log('Is Combat Goal:', resolutionData.isCombatGoal);
                                              console.log('Casualties:', resolutionData.casualties);
                                              console.log('Target Casualties:', resolutionData.targetCasualties);
                                              
                                              // Resolve goal with executor score change
                                              await battleAPI.resolveGoal(
                                                goal.id,
                                                resolutionData.dc,
                                                resolutionData.success,
                                                resolutionData.scoreChange,
                                                total
                                              );
                                              console.log('✓ Goal resolved');
                                              
                                              // Apply target score change if applicable
                                              if (resolutionData.targetId && resolutionData.targetId !== goal.participant_id && resolutionData.targetScoreChange !== 0) {
                                                const targetParticipant = activeBattle.participants?.find(p => p.id === resolutionData.targetId);
                                                if (targetParticipant) {
                                                  console.log(`Applying target score change: ${resolutionData.targetScoreChange} to participant ${resolutionData.targetId}`);
                                                  await battleAPI.updateParticipantScore(
                                                    resolutionData.targetId,
                                                    resolutionData.targetScoreChange
                                                  );
                                                  console.log('✓ Target score updated');
                                                }
                                              }
                                              
                                              // Apply casualties to executor (combat goals only)
                                              if (resolutionData.isCombatGoal) {
                                                console.log('Applying casualties - is combat goal');
                                                const executorParticipant = activeBattle.participants?.find(p => p.id === goal.participant_id);
                                                if (executorParticipant && resolutionData.casualties > 0) {
                                                  console.log(`Applying ${resolutionData.casualties} casualties to executor ${executorParticipant.id}`);
                                                  await battleAPI.updateParticipantTroops(
                                                    executorParticipant.id,
                                                    -resolutionData.casualties
                                                  );
                                                  console.log('✓ Executor casualties applied');
                                                } else {
                                                  console.log('Skipping executor casualties:', { hasParticipant: !!executorParticipant, casualties: resolutionData.casualties });
                                                }
                                                
                                                // Apply casualties to target (combat goals only)
                                                if (resolutionData.targetId && resolutionData.targetId !== goal.participant_id && resolutionData.targetCasualties > 0) {
                                                  console.log(`Applying ${resolutionData.targetCasualties} casualties to target ${resolutionData.targetId}`);
                                                  await battleAPI.updateParticipantTroops(
                                                    resolutionData.targetId,
                                                    -resolutionData.targetCasualties
                                                  );
                                                  console.log('✓ Target casualties applied');
                                                } else {
                                                  console.log('Skipping target casualties:', { targetId: resolutionData.targetId, participantId: goal.participant_id, casualties: resolutionData.targetCasualties });
                                                }
                                              } else {
                                                console.log('Not a combat goal, skipping casualties');
                                              }
                                              
                                              const updated = await battleAPI.getBattle(activeBattle.id);
                                              setActiveBattle(updated);
                                              console.log('✓ Battle data refreshed');
                                              
                                              // Clear resolution data for this goal
                                              setGoalResolutionData({
                                                ...goalResolutionData,
                                                [goal.id]: undefined as any
                                              });
                                            } catch (error: any) {
                                              console.error('❌ Error resolving goal:', error);
                                              console.error('Error details:', error.response?.data || error.message);
                                              alert(`Failed to apply resolution: ${error.response?.data?.error || error.message}`);
                                            }
                                          }}
                                          style={{
                                            flex: 2,
                                            padding: '0.5rem 1.5rem',
                                            background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.3), rgba(22, 163, 74, 0.3))',
                                            border: '2px solid rgba(34, 197, 94, 0.5)',
                                            borderRadius: '0.5rem',
                                            color: '#4ade80',
                                            fontWeight: 'bold',
                                            cursor: 'pointer',
                                            fontSize: '0.85rem'
                                          }}
                                        >
                                          ✓ Apply Resolution
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}

                            {/* Result Display */}
                            {goal.success !== null && (
                              <div style={{
                                marginTop: '1rem',
                                padding: '1rem',
                                background: goal.success ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                border: `2px solid ${goal.success ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                                borderRadius: '0.5rem'
                              }}>
                                <div style={{
                                  fontSize: '1.1rem',
                                  fontWeight: 'bold',
                                  color: goal.success ? '#4ade80' : '#f87171',
                                  marginBottom: '0.5rem'
                                }}>
                                  {goal.success ? '✓ SUCCESS' : '✗ FAILURE'}
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                  Modifier Applied: {goal.modifier_applied >= 0 ? '+' : ''}{goal.modifier_applied}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                      </div>
                    </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {campaignTab === 'news' && (
              <div className="glass-panel">
                <h5 style={{ color: 'var(--text-gold)', marginBottom: '1.5rem' }}>📰 Campaign News & Updates</h5>
                <div style={{
                  minHeight: '400px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '2px dashed rgba(212, 193, 156, 0.3)',
                  borderRadius: '0.75rem',
                  background: 'rgba(255, 255, 255, 0.02)',
                  padding: '3rem'
                }}>
                  <div style={{ fontSize: '4rem', marginBottom: '1rem', opacity: 0.5 }}>📰</div>
                  <h4 style={{ color: 'var(--text-gold)', marginBottom: '0.5rem' }}>Campaign News Coming Soon</h4>
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center', maxWidth: '500px' }}>
                    This section will display campaign updates, quest announcements, world events, and important news.
                    The DM can post updates to keep all players informed of the evolving story.
                  </p>
                </div>
              </div>
            )}

            {campaignTab === 'encyclopedia' && (
              <div className="glass-panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h5 style={{ color: 'var(--text-gold)', margin: 0 }}>📚 Monster Encyclopedia</h5>
                  {user?.role === 'Dungeon Master' && (
                    <button
                      onClick={() => setShowAddMonsterModal(true)}
                      style={{
                        padding: '0.5rem 1rem',
                        background: 'linear-gradient(135deg, #61c961, #5ab85a)',
                        border: '2px solid #4a4',
                        borderRadius: '0.5rem',
                        color: '#000',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        fontSize: '0.9rem'
                      }}
                    >
                      ➕ Add Monster
                    </button>
                  )}
                </div>

                {/* Monster Grid */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                  gap: '1.5rem',
                  marginTop: '1.5rem'
                }}>
                  {monsters.length === 0 ? (
                    <div style={{
                      gridColumn: '1 / -1',
                      minHeight: '300px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '2px dashed rgba(212, 193, 156, 0.3)',
                      borderRadius: '0.75rem',
                      background: 'rgba(255, 255, 255, 0.02)',
                      padding: '3rem'
                    }}>
                      <div style={{ fontSize: '4rem', marginBottom: '1rem', opacity: 0.5 }}>📚</div>
                      <h4 style={{ color: 'var(--text-gold)', marginBottom: '0.5rem' }}>No Monsters Yet</h4>
                      <p style={{ color: 'var(--text-muted)', textAlign: 'center', maxWidth: '500px' }}>
                        {user?.role === 'Dungeon Master' 
                          ? 'Click "Add Monster" to add creatures to your encyclopedia.'
                          : 'The DM hasn\'t added any monsters to the encyclopedia yet.'}
                      </p>
                    </div>
                  ) : (
                    monsters.map((monster: Monster) => {
                      const isDM = user?.role === 'Dungeon Master';
                      const showDetails = isDM || monster.visible_to_players;
                      const imageUrl = monster.image_url 
                        ? (process.env.NODE_ENV === 'production' ? monster.image_url : `http://localhost:5000${monster.image_url}`)
                        : null;

                      return (
                        <div
                          key={monster.id}
                          style={{
                            background: 'rgba(0, 0, 0, 0.3)',
                            border: '2px solid rgba(212, 193, 156, 0.3)',
                            borderRadius: '0.75rem',
                            padding: '1rem',
                            transition: 'all 0.3s ease'
                          }}
                        >
                          {/* Monster Image */}
                          {imageUrl && (
                            <div 
                              onClick={() => setViewImageModal({ imageUrl, name: monster.name })}
                              style={{
                                width: '100%',
                                height: '200px',
                                borderRadius: '0.5rem',
                                backgroundImage: `url(${imageUrl})`,
                                backgroundSize: 'cover',
                                backgroundPosition: 'center',
                                marginBottom: '1rem',
                                border: '1px solid rgba(212, 193, 156, 0.2)',
                                cursor: 'pointer',
                                transition: 'transform 0.2s ease, box-shadow 0.2s ease'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'scale(1.02)';
                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(212, 193, 156, 0.3)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'scale(1)';
                                e.currentTarget.style.boxShadow = 'none';
                              }}
                            />
                          )}

                          {/* Monster Name */}
                          <h6 style={{ color: 'var(--text-gold)', marginBottom: '0.5rem', fontSize: '1.1rem' }}>
                            {monster.name}
                          </h6>

                          {/* Show Details if visible or is DM */}
                          {showDetails ? (
                            <>
                              {/* Description */}
                              {monster.description && (
                                <p style={{ color: '#ccc', fontSize: '0.85rem', marginBottom: '1rem', lineHeight: '1.4' }}>
                                  {monster.description}
                                </p>
                              )}

                              {/* Limb Health */}
                              <div style={{ marginBottom: '1rem' }}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-gold)', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                                  Health
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem', fontSize: '0.75rem' }}>
                                  <div style={{ color: '#999' }}>Head: <span style={{ color: '#fff' }}>{monster.limb_health?.head}</span></div>
                                  <div style={{ color: '#999' }}>Chest: <span style={{ color: '#fff' }}>{monster.limb_health?.chest}</span></div>
                                  <div style={{ color: '#999' }}>L.Arm: <span style={{ color: '#fff' }}>{monster.limb_health?.left_arm}</span></div>
                                  <div style={{ color: '#999' }}>R.Arm: <span style={{ color: '#fff' }}>{monster.limb_health?.right_arm}</span></div>
                                  <div style={{ color: '#999' }}>L.Leg: <span style={{ color: '#fff' }}>{monster.limb_health?.left_leg}</span></div>
                                  <div style={{ color: '#999' }}>R.Leg: <span style={{ color: '#fff' }}>{monster.limb_health?.right_leg}</span></div>
                                </div>
                              </div>

                              {/* Limb AC */}
                              <div style={{ marginBottom: '1rem' }}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-gold)', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                                  Armor Class
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem', fontSize: '0.75rem' }}>
                                  <div style={{ color: '#999' }}>Head: <span style={{ color: '#fff' }}>{monster.limb_ac?.head}</span></div>
                                  <div style={{ color: '#999' }}>Chest: <span style={{ color: '#fff' }}>{monster.limb_ac?.chest}</span></div>
                                  <div style={{ color: '#999' }}>L.Arm: <span style={{ color: '#fff' }}>{monster.limb_ac?.left_arm}</span></div>
                                  <div style={{ color: '#999' }}>R.Arm: <span style={{ color: '#fff' }}>{monster.limb_ac?.right_arm}</span></div>
                                  <div style={{ color: '#999' }}>L.Leg: <span style={{ color: '#fff' }}>{monster.limb_ac?.left_leg}</span></div>
                                  <div style={{ color: '#999' }}>R.Leg: <span style={{ color: '#fff' }}>{monster.limb_ac?.right_leg}</span></div>
                                </div>
                              </div>
                            </>
                          ) : (
                            <p style={{ color: '#999', fontSize: '0.85rem', fontStyle: 'italic' }}>
                              Details hidden by DM
                            </p>
                          )}

                          {/* DM Controls */}
                          {isDM && (
                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(212, 193, 156, 0.2)' }}>
                              <button
                                onClick={async () => {
                                  try {
                                    const updated = await monsterAPI.toggleVisibility(monster.id);
                                    setMonsters(prev => prev.map(m => m.id === monster.id ? updated : m));
                                  } catch (error) {
                                    console.error('Error toggling visibility:', error);
                                  }
                                }}
                                style={{
                                  flex: 1,
                                  padding: '0.4rem',
                                  background: monster.visible_to_players 
                                    ? 'linear-gradient(135deg, #61c961, #5ab85a)'
                                    : 'linear-gradient(135deg, #c9a961, #b8935a)',
                                  border: 'none',
                                  borderRadius: '0.25rem',
                                  color: '#000',
                                  fontWeight: 'bold',
                                  cursor: 'pointer',
                                  fontSize: '0.75rem'
                                }}
                              >
                                {monster.visible_to_players ? '👁️ Visible' : '🔒 Hidden'}
                              </button>
                              <button
                                onClick={async () => {
                                  if (window.confirm(`Delete ${monster.name}?`)) {
                                    try {
                                      await monsterAPI.deleteMonster(monster.id);
                                      setMonsters(prev => prev.filter(m => m.id !== monster.id));
                                    } catch (error) {
                                      console.error('Error deleting monster:', error);
                                    }
                                  }
                                }}
                                style={{
                                  padding: '0.4rem 0.75rem',
                                  background: 'linear-gradient(135deg, #d9534f, #c9302c)',
                                  border: 'none',
                                  borderRadius: '0.25rem',
                                  color: '#fff',
                                  fontWeight: 'bold',
                                  cursor: 'pointer',
                                  fontSize: '0.75rem'
                                }}
                              >
                                🗑️
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {campaignTab === 'journal' && (
              <div className="glass-panel">
                <h5 style={{ color: 'var(--text-gold)', marginBottom: '1.5rem' }}>📖 Campaign Journal</h5>
                <div style={{
                  minHeight: '400px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '2px dashed rgba(212, 193, 156, 0.3)',
                  borderRadius: '0.75rem',
                  background: 'rgba(255, 255, 255, 0.02)',
                  padding: '3rem'
                }}>
                  <div style={{ fontSize: '4rem', marginBottom: '1rem', opacity: 0.5 }}>📖</div>
                  <h4 style={{ color: 'var(--text-gold)', marginBottom: '0.5rem' }}>Campaign Journal Coming Soon</h4>
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center', maxWidth: '500px' }}>
                    This area will contain the campaign's shared journal with session recaps, important discoveries,
                    NPC notes, and a timeline of major events. Both players and DM can contribute entries.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Character Content (existing) */}
        {mainView === 'character' && (
          <div>
          {/* Character Details Panel */}
          {selectedCharacterData ? (
              <div>
                {/* Character Tab Navigation */}
                <div className="glass-panel" style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                    {/* Show only overview tab for other players' characters, all tabs for own character or if DM */}
                    {(canViewAllTabs(selectedCharacterData.id) 
                      ? (['board', 'sheet', 'inventory', 'equip', 'armies'] as const)
                      : (['board'] as const)
                    ).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`tab-button ${activeTab === tab ? 'active' : ''}`}
                        style={{
                          padding: '0.625rem 1.25rem',
                          background: activeTab === tab 
                            ? 'rgba(212, 193, 156, 0.3)' 
                            : 'rgba(255, 255, 255, 0.1)',
                          border: activeTab === tab 
                            ? '2px solid var(--primary-gold)' 
                            : '1px solid rgba(212, 193, 156, 0.2)',
                          borderRadius: '1.5rem',
                          color: activeTab === tab ? 'var(--text-gold)' : 'var(--text-secondary)',
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                          fontWeight: 'bold',
                          transition: 'all var(--transition-normal)',
                          textTransform: 'capitalize'
                        }}
                      >
                        {tab === 'board' ? '📋 Overview' : 
                         tab === 'sheet' ? '📊 Character Sheet' :
                         tab === 'inventory' ? '🎒 Inventory' :
                         tab === 'armies' ? '⚔️ Armies' :
                         '🛡️ Equipment'}
                      </button>
                    ))}
                    
                    {/* Show a lock icon and message for restricted characters */}
                    {!canViewAllTabs(selectedCharacterData.id) && (
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.5rem',
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)',
                        fontStyle: 'italic',
                        padding: '0.625rem 1rem'
                      }}>
                        🔒 Limited view - overview only
                      </div>
                    )}
                  </div>
                </div>

                {/* Tab Content */}
                {activeTab === 'board' && (
                  <div className="glass-panel">
                    <h6>📋 Character Overview</h6>
                    
                    {/* Character Name Header */}
                    <div style={{
                      textAlign: 'center',
                      marginBottom: '2rem',
                      padding: '1.5rem',
                      background: 'linear-gradient(135deg, rgba(212, 193, 156, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)',
                      borderRadius: '12px',
                      border: '2px solid rgba(212, 193, 156, 0.3)',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                    }}>
                      <div style={{
                        fontSize: '2rem',
                        fontWeight: 'bold',
                        color: 'var(--primary-gold)',
                        textShadow: '0 2px 4px rgba(0, 0, 0, 0.5), 0 0 20px rgba(212, 193, 156, 0.3)',
                        letterSpacing: '2px',
                        marginBottom: '0.5rem'
                      }}>
                        {selectedCharacterData.name}
                      </div>
                      <div style={{
                        fontSize: '0.9rem',
                        color: 'var(--text-muted)',
                        fontStyle: 'italic'
                      }}>
                      </div>
                    </div>
                    
                    {/* Character Image */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'center',
                      marginBottom: '2rem'
                    }}>
                      {selectedCharacterData.image_url ? (
                        <img 
                          src={process.env.NODE_ENV === 'production' ? selectedCharacterData.image_url : `http://localhost:5000${selectedCharacterData.image_url}`}
                          alt={selectedCharacterData.name}
                          style={{
                            width: '250px',
                            height: '250px',
                            objectFit: 'cover',
                            borderRadius: '12px',
                            border: '3px solid rgba(212, 193, 156, 0.4)',
                            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
                            backgroundColor: 'rgba(0, 0, 0, 0.3)'
                          }}
                          onError={(e) => {
                            console.error('Failed to load image:', selectedCharacterData.image_url);
                            // Hide image on error
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        (user?.role === 'Dungeon Master' || selectedCharacterData.player_id === user?.id) && (
                          <button
                            onClick={() => {
                              const input = document.createElement('input');
                              input.type = 'file';
                              input.accept = 'image/jpeg,image/jpg,image/png,image/gif,image/webp';
                              input.onchange = async (e) => {
                                const file = (e.target as HTMLInputElement).files?.[0];
                                if (file) {
                                  // Create URL for preview
                                  const url = URL.createObjectURL(file);
                                  setImageToCrop({ file, url, characterId: selectedCharacterData.id });
                                  setShowImageCropModal(true);
                                  setImagePosition({ x: 50, y: 50 });
                                  setImageScale(100);
                                }
                              };
                              input.click();
                            }}
                            style={{
                              width: '250px',
                              height: '250px',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '1rem',
                              background: 'rgba(255, 255, 255, 0.05)',
                              border: '3px dashed rgba(212, 193, 156, 0.3)',
                              borderRadius: '12px',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                              color: 'var(--text-muted)'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                              e.currentTarget.style.borderColor = 'rgba(212, 193, 156, 0.5)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                              e.currentTarget.style.borderColor = 'rgba(212, 193, 156, 0.3)';
                            }}
                          >
                            <div style={{ fontSize: '3rem', opacity: 0.5 }}>📷</div>
                            <div style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Upload Character Image</div>
                            <div style={{ fontSize: '0.7rem' }}>Click to select an image</div>
                          </button>
                        )
                      )}
                    </div>
                    
                    {/* Basic Info Section - Styled Cards */}
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
                      gap: '1rem',
                      marginBottom: '2rem'
                    }}>
                      <div style={{
                        padding: '1rem',
                        backgroundColor: 'rgba(255, 255, 255, 0.03)',
                        borderRadius: '8px',
                        border: '1px solid rgba(212, 193, 156, 0.2)',
                        textAlign: 'center',
                        transition: 'all 0.3s ease',
                        cursor: 'default'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                        e.currentTarget.style.borderColor = 'rgba(212, 193, 156, 0.4)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
                        e.currentTarget.style.borderColor = 'rgba(212, 193, 156, 0.2)';
                      }}>
                        <div style={{ 
                          fontSize: '0.75rem', 
                          color: 'var(--text-muted)', 
                          marginBottom: '0.5rem',
                          textTransform: 'uppercase',
                          letterSpacing: '1px'
                        }}>Race</div>
                        <div style={{ 
                          fontSize: '1.1rem', 
                          color: 'var(--text-gold)', 
                          fontWeight: 'bold'
                        }}>{selectedCharacterData.race}</div>
                      </div>

                      <div style={{
                        padding: '1rem',
                        backgroundColor: 'rgba(255, 255, 255, 0.03)',
                        borderRadius: '8px',
                        border: '1px solid rgba(212, 193, 156, 0.2)',
                        textAlign: 'center',
                        transition: 'all 0.3s ease',
                        cursor: 'default'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                        e.currentTarget.style.borderColor = 'rgba(212, 193, 156, 0.4)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
                        e.currentTarget.style.borderColor = 'rgba(212, 193, 156, 0.2)';
                      }}>
                        <div style={{ 
                          fontSize: '0.75rem', 
                          color: 'var(--text-muted)', 
                          marginBottom: '0.5rem',
                          textTransform: 'uppercase',
                          letterSpacing: '1px'
                        }}>Class</div>
                        <div style={{ 
                          fontSize: '1.1rem', 
                          color: 'var(--text-gold)', 
                          fontWeight: 'bold'
                        }}>{selectedCharacterData.class}</div>
                      </div>

                      <div style={{
                        padding: '1rem',
                        backgroundColor: 'rgba(255, 255, 255, 0.03)',
                        borderRadius: '8px',
                        border: '1px solid rgba(212, 193, 156, 0.2)',
                        textAlign: 'center',
                        transition: 'all 0.3s ease',
                        cursor: 'default'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                        e.currentTarget.style.borderColor = 'rgba(212, 193, 156, 0.4)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
                        e.currentTarget.style.borderColor = 'rgba(212, 193, 156, 0.2)';
                      }}>
                        <div style={{ 
                          fontSize: '0.75rem', 
                          color: 'var(--text-muted)', 
                          marginBottom: '0.5rem',
                          textTransform: 'uppercase',
                          letterSpacing: '1px'
                        }}>Level</div>
                        <div style={{ 
                          fontSize: '1.1rem', 
                          color: 'var(--text-gold)', 
                          fontWeight: 'bold'
                        }}>{selectedCharacterData.level}</div>
                      </div>

                      <div style={{
                        padding: '1rem',
                        backgroundColor: 'rgba(255, 255, 255, 0.03)',
                        borderRadius: '8px',
                        border: '1px solid rgba(212, 193, 156, 0.2)',
                        textAlign: 'center',
                        transition: 'all 0.3s ease',
                        cursor: 'default'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                        e.currentTarget.style.borderColor = 'rgba(212, 193, 156, 0.4)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
                        e.currentTarget.style.borderColor = 'rgba(212, 193, 156, 0.2)';
                      }}>
                        <div style={{ 
                          fontSize: '0.75rem', 
                          color: 'var(--text-muted)', 
                          marginBottom: '0.5rem',
                          textTransform: 'uppercase',
                          letterSpacing: '1px'
                        }}>Background</div>
                        <div style={{ 
                          fontSize: '1.1rem', 
                          color: 'var(--text-gold)', 
                          fontWeight: 'bold'
                        }}>{selectedCharacterData.background || 'None'}</div>
                      </div>
                    </div>
                    
                    {selectedCharacterData.backstory && (
                      <div style={{ marginTop: '2rem' }}>
                        <h6 className="text-gold">Backstory</h6>
                        {(() => {
                          const pages = paginateBackstory(selectedCharacterData.backstory);
                          const currentPage = Math.min(backstoryPage, pages.length - 1);
                          
                          // Calculate max height - account for line breaks AND text wrapping
                          const calculatePageHeight = (text: string) => {
                            const explicitLines = text.split('\n').length;
                            // Average ~120 chars per line before wrapping at justify (more generous)
                            const charsPerLine = 120;
                            const wrappedLines = Math.ceil(text.length / charsPerLine);
                            const totalLines = Math.max(explicitLines, wrappedLines);
                            // 27 pixels per line (1.8 line height * 15px font)
                            return totalLines * 27 + 50;
                          };
                          
                          const heights = pages.map(page => calculatePageHeight(page));
                          const maxHeight = Math.max(...heights, 300);
                          
                          return (
                            <div style={{ 
                              padding: '1.5rem',
                              backgroundColor: 'rgba(255, 255, 255, 0.05)',
                              borderRadius: '12px',
                              border: '2px solid rgba(212, 193, 156, 0.2)',
                              position: 'relative',
                              minHeight: '200px',
                              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                              perspective: '2000px',
                              perspectiveOrigin: 'center center'
                            }}>
                              {/* Book-style header */}
                              <div style={{ 
                                display: 'flex', 
                                justifyContent: 'space-between', 
                                alignItems: 'center', 
                                marginBottom: '1rem',
                                paddingBottom: '0.5rem',
                                borderBottom: '1px solid rgba(212, 193, 156, 0.2)'
                              }}>
                                <div style={{ 
                                  fontSize: '0.85rem', 
                                  color: 'var(--text-gold)', 
                                  fontWeight: 'bold',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.5rem'
                                }}>
                                  📖 {selectedCharacterData.name}'s Chronicle
                                </div>
                                <div style={{ 
                                  fontSize: '0.8rem', 
                                  color: 'var(--text-muted)',
                                  fontStyle: 'italic'
                                }}>
                                  Page {currentPage + 1} of {pages.length}
                                </div>
                              </div>

                              {/* Page content */}
                              <div style={{
                                height: `${maxHeight}px`,
                                position: 'relative',
                                overflow: 'visible'
                              }}>
                                {pageDirection ? (
                                  <div 
                                    key={`page-${currentPage}-${pageDirection}-${Date.now()}`}
                                    className={pageDirection === 'forward' ? 'page-flip-forward' : 'page-flip-backward'}
                                    style={{ 
                                      lineHeight: '1.8', 
                                      whiteSpace: 'pre-wrap',
                                      fontSize: '0.95rem',
                                      color: 'var(--text-primary)',
                                      textAlign: 'justify',
                                      paddingBottom: '1rem',
                                      wordWrap: 'break-word',
                                      overflowWrap: 'break-word'
                                    }}>
                                    {pages[currentPage] || 'No content available.'}
                                  </div>
                                ) : (
                                  <div 
                                    style={{ 
                                      lineHeight: '1.8', 
                                      whiteSpace: 'pre-wrap',
                                      fontSize: '0.95rem',
                                      color: 'var(--text-primary)',
                                      textAlign: 'justify',
                                      paddingBottom: '1rem',
                                      wordWrap: 'break-word',
                                      overflowWrap: 'break-word'
                                    }}>
                                    {pages[currentPage] || 'No content available.'}
                                  </div>
                                )}
                              </div>

                              {/* Navigation controls */}
                              {pages.length > 1 && (
                                <div style={{ 
                                  display: 'flex', 
                                  justifyContent: 'space-between', 
                                  alignItems: 'center',
                                  marginTop: '1rem',
                                  paddingTop: '1rem',
                                  borderTop: '1px solid rgba(212, 193, 156, 0.2)'
                                }}>
                                  <button
                                    onClick={() => {
                                      if (backstoryPage > 0) {
                                        setPageDirection('backward');
                                        setTimeout(() => {
                                          setBackstoryPage(backstoryPage - 1);
                                          setTimeout(() => setPageDirection(null), 600);
                                        }, 50);
                                      }
                                    }}
                                    disabled={backstoryPage === 0}
                                    className="btn btn-secondary"
                                    style={{ 
                                      padding: '0.5rem 1rem',
                                      fontSize: '0.85rem',
                                      minHeight: 'auto',
                                      opacity: backstoryPage === 0 ? 0.3 : 1,
                                      cursor: backstoryPage === 0 ? 'not-allowed' : 'pointer'
                                    }}
                                  >
                                    ← Previous
                                  </button>

                                  {/* Page dots indicator */}
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                      {pages.map((_, index) => (
                                        <button
                                          key={index}
                                          onClick={() => {
                                            if (index !== currentPage) {
                                              const direction = index > currentPage ? 'forward' : 'backward';
                                              setPageDirection(direction);
                                              setTimeout(() => {
                                                setBackstoryPage(index);
                                                setTimeout(() => setPageDirection(null), 600);
                                              }, 50);
                                            }
                                          }}
                                          style={{
                                            width: '8px',
                                            height: '8px',
                                            borderRadius: '50%',
                                            border: 'none',
                                            backgroundColor: index === currentPage 
                                              ? 'var(--primary-gold)' 
                                              : 'rgba(212, 193, 156, 0.3)',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease',
                                            padding: 0
                                          }}
                                          onMouseEnter={(e) => {
                                            if (index !== currentPage) {
                                              e.currentTarget.style.backgroundColor = 'rgba(212, 193, 156, 0.6)';
                                            }
                                          }}
                                          onMouseLeave={(e) => {
                                            if (index !== currentPage) {
                                              e.currentTarget.style.backgroundColor = 'rgba(212, 193, 156, 0.3)';
                                            }
                                          }}
                                        />
                                      ))}
                                    </div>
                                    <div style={{ 
                                      fontSize: '0.65rem', 
                                      color: 'var(--text-muted)', 
                                      fontStyle: 'italic',
                                      textAlign: 'center'
                                    }}>
                                      ← → pages • ↑ ↓ characters
                                    </div>
                                  </div>

                                  <button
                                    onClick={() => {
                                      if (backstoryPage < pages.length - 1) {
                                        setPageDirection('forward');
                                        setTimeout(() => {
                                          setBackstoryPage(backstoryPage + 1);
                                          setTimeout(() => setPageDirection(null), 600);
                                        }, 50);
                                      }
                                    }}
                                    disabled={backstoryPage === pages.length - 1}
                                    className="btn btn-secondary"
                                    style={{ 
                                      padding: '0.5rem 1rem',
                                      fontSize: '0.85rem',
                                      minHeight: 'auto',
                                      opacity: backstoryPage === pages.length - 1 ? 0.3 : 1,
                                      cursor: backstoryPage === pages.length - 1 ? 'not-allowed' : 'pointer'
                                    }}
                                  >
                                    Next →
                                  </button>
                                </div>
                              )}

                              {/* Word count info */}
                              <div style={{ 
                                position: 'absolute',
                                bottom: '0.5rem',
                                right: '1rem',
                                fontSize: '0.7rem',
                                color: 'var(--text-muted)',
                                fontStyle: 'italic'
                              }}>
                                ~{selectedCharacterData.backstory.split(/\s+/).length} words total • Pages split by paragraphs
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* Personality Traits, Ideals, Bonds, and Flaws */}
                    {(selectedCharacterData.personality_traits || selectedCharacterData.ideals || selectedCharacterData.bonds || selectedCharacterData.flaws) && (
                      <div style={{ marginTop: '2rem' }}>
                        <h6 className="text-gold">Personality</h6>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
                          {selectedCharacterData.personality_traits && (
                            <div>
                              <strong style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-gold)' }}>Personality Traits</strong>
                              <div style={{ 
                                padding: '0.75rem', 
                                backgroundColor: 'rgba(212, 193, 156, 0.1)', 
                                borderRadius: '6px', 
                                border: '1px solid rgba(212, 193, 156, 0.2)',
                                fontSize: '0.9rem',
                                whiteSpace: 'pre-wrap',
                                lineHeight: '1.5'
                              }}>
                                {selectedCharacterData.personality_traits}
                              </div>
                            </div>
                          )}
                          {selectedCharacterData.ideals && (
                            <div>
                              <strong style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-gold)' }}>Ideals</strong>
                              <div style={{ 
                                padding: '0.75rem', 
                                backgroundColor: 'rgba(212, 193, 156, 0.1)', 
                                borderRadius: '6px', 
                                border: '1px solid rgba(212, 193, 156, 0.2)',
                                fontSize: '0.9rem',
                                whiteSpace: 'pre-wrap',
                                lineHeight: '1.5'
                              }}>
                                {selectedCharacterData.ideals}
                              </div>
                            </div>
                          )}
                          {selectedCharacterData.bonds && (
                            <div>
                              <strong style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-gold)' }}>Bonds</strong>
                              <div style={{ 
                                padding: '0.75rem', 
                                backgroundColor: 'rgba(212, 193, 156, 0.1)', 
                                borderRadius: '6px', 
                                border: '1px solid rgba(212, 193, 156, 0.2)',
                                fontSize: '0.9rem',
                                whiteSpace: 'pre-wrap',
                                lineHeight: '1.5'
                              }}>
                                {selectedCharacterData.bonds}
                              </div>
                            </div>
                          )}
                          {selectedCharacterData.flaws && (
                            <div>
                              <strong style={{ display: 'block', marginBottom: '0.5rem', color: '#ff6b6b' }}>Flaws</strong>
                              <div style={{ 
                                padding: '0.75rem', 
                                backgroundColor: 'rgba(220, 53, 69, 0.1)', 
                                borderRadius: '6px', 
                                border: '1px solid rgba(220, 53, 69, 0.2)',
                                fontSize: '0.9rem',
                                whiteSpace: 'pre-wrap',
                                lineHeight: '1.5'
                              }}>
                                {selectedCharacterData.flaws}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'sheet' && canViewAllTabs(selectedCharacterData.id) && (
                  <div className="glass-panel">
                    <h6>📊 Character Sheet</h6>
                    
                    {/* Character Figure with Ability Scores and Limb Health */}
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: '1fr 300px 1fr',
                      gap: '1.5rem',
                      alignItems: 'start',
                      marginBottom: '2rem'
                    }}>
                      {/* Left Column - Three Abilities (Smaller) */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {['str', 'dex', 'con'].map((ability) => {
                          const score = selectedCharacterData.abilities[ability as keyof typeof selectedCharacterData.abilities] as number;
                          const modifier = Math.floor((score - 10) / 2);
                          return (
                            <div key={ability} style={{
                              background: 'rgba(212, 193, 156, 0.1)',
                              border: '2px solid rgba(212, 193, 156, 0.3)',
                              borderRadius: '8px',
                              padding: '0.75rem',
                              textAlign: 'center'
                            }}>
                              <div style={{ 
                                fontSize: '0.75rem', 
                                fontWeight: 'bold', 
                                color: 'var(--text-gold)',
                                marginBottom: '0.25rem'
                              }}>
                                {ability.toUpperCase()}
                              </div>
                              <div style={{ 
                                fontSize: '1.25rem', 
                                fontWeight: 'bold', 
                                color: 'white',
                                marginBottom: '0.125rem'
                              }}>
                                {score}
                              </div>
                              <div style={{ 
                                fontSize: '0.85rem', 
                                color: 'var(--text-secondary)',
                                fontWeight: 'bold'
                              }}>
                                {modifier >= 0 ? '+' : ''}{modifier}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Center - Character Figure with Limb Health */}
                      <div style={{ position: 'relative', width: '300px' }}>
                        <img 
                          src={FigureImage} 
                          alt="Character Figure" 
                          style={{ 
                            width: '100%', 
                            height: 'auto',
                            border: '2px solid rgba(212, 193, 156, 0.3)',
                            borderRadius: '0.5rem',
                            background: 'rgba(255, 255, 255, 0.05)',
                            display: 'block'
                          }} 
                        />
                        
                        {/* Limb Health Overlays */}
                        {(() => {
                          const baseHitPoints = selectedCharacterData.hit_points;
                          const conModifier = Math.floor((selectedCharacterData.abilities.con - 10) / 2);
                          const conBonus = Math.max(0, conModifier * 0.1); // 10% bonus per positive CON modifier
                          
                          // Calculate limb health ratios
                          const limbHealthRatios = {
                            head: Math.min(1.0, 0.25 + conBonus), // 25% base, up to 100% with high CON
                            torso: Math.min(2.0, 1.0 + conBonus), // 100% base, up to 200% with high CON
                            hands: Math.min(1.0, 0.15 + conBonus), // 15% base, up to 100% with high CON
                            legs: Math.min(1.0, 0.4 + conBonus) // 40% base, up to 100% with high CON
                          };
                          
                          const limbHealths = {
                            head: Math.floor(baseHitPoints * limbHealthRatios.head),
                            torso: Math.floor(baseHitPoints * limbHealthRatios.torso),
                            hands: Math.floor(baseHitPoints * limbHealthRatios.hands),
                            legs: Math.floor(baseHitPoints * limbHealthRatios.legs)
                          };
                          
                          // Get limb AC from equipped items
                          const characterLimbAC = limbAC[selectedCharacterData.id] || {
                            head: 12,  // Head has base AC of 12
                            chest: selectedCharacterData.armor_class || 10,
                            hands: 0,
                            main_hand: 0,
                            off_hand: 0,
                            feet: 0
                          };
                          
                          // Helper function to get health color based on percentage
                          const getHealthColor = (current: number, max: number) => {
                            const percentage = (current / max) * 100;
                            if (percentage > 66) return '#4ade80'; // Green
                            if (percentage > 33) return '#fbbf24'; // Yellow
                            return '#ef4444'; // Red
                          };

                          return (
                            <>
                              {/* Head Health & AC */}
                              <div style={{
                                position: 'absolute',
                                top: '8%',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                background: 'rgba(0, 0, 0, 0.8)',
                                color: 'var(--text-gold)',
                                padding: '0.25rem 0.5rem',
                                borderRadius: '4px',
                                fontSize: '0.7rem',
                                fontWeight: 'bold',
                                border: '1px solid var(--primary-gold)',
                                minWidth: '60px',
                                textAlign: 'center'
                              }}>
                                <div style={{ fontSize: '0.75rem', color: getHealthColor(limbHealths.head, limbHealths.head) }}>{limbHealths.head}/{limbHealths.head}</div>
                                <div style={{ fontSize: '0.65rem', color: '#60a5fa', marginTop: '2px' }}>AC {characterLimbAC.head}</div>
                              </div>

                              {/* Torso Health & AC */}
                              <div style={{
                                position: 'absolute',
                                top: '35%',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                background: 'rgba(0, 0, 0, 0.8)',
                                color: 'var(--text-gold)',
                                padding: '0.25rem 0.5rem',
                                borderRadius: '4px',
                                fontSize: '0.7rem',
                                fontWeight: 'bold',
                                border: '1px solid var(--primary-gold)',
                                minWidth: '60px',
                                textAlign: 'center'
                              }}>
                                <div style={{ fontSize: '0.75rem', color: getHealthColor(limbHealths.torso, limbHealths.torso) }}>{limbHealths.torso}/{limbHealths.torso}</div>
                                <div style={{ fontSize: '0.65rem', color: '#60a5fa', marginTop: '2px' }}>AC {characterLimbAC.chest}</div>
                              </div>

                              {/* Left Hand Health & AC (Main Hand) */}
                              <div style={{
                                position: 'absolute',
                                top: '32%',
                                left: '8%',
                                background: 'rgba(0, 0, 0, 0.8)',
                                color: 'var(--text-gold)',
                                padding: '0.25rem 0.5rem',
                                borderRadius: '4px',
                                fontSize: '0.7rem',
                                fontWeight: 'bold',
                                border: '1px solid var(--primary-gold)',
                                minWidth: '60px',
                                textAlign: 'center'
                              }}>
                                <div style={{ fontSize: '0.75rem', color: getHealthColor(limbHealths.hands, limbHealths.hands) }}>{limbHealths.hands}/{limbHealths.hands}</div>
                                <div style={{ fontSize: '0.65rem', color: '#60a5fa', marginTop: '2px' }}>AC {characterLimbAC.main_hand}</div>
                              </div>

                              {/* Right Hand Health & AC (Off Hand) */}
                              <div style={{
                                position: 'absolute',
                                top: '32%',
                                right: '8%',
                                background: 'rgba(0, 0, 0, 0.8)',
                                color: 'var(--text-gold)',
                                padding: '0.25rem 0.5rem',
                                borderRadius: '4px',
                                fontSize: '0.7rem',
                                fontWeight: 'bold',
                                border: '1px solid var(--primary-gold)',
                                minWidth: '60px',
                                textAlign: 'center'
                              }}>
                                <div style={{ fontSize: '0.75rem', color: getHealthColor(limbHealths.hands, limbHealths.hands) }}>{limbHealths.hands}/{limbHealths.hands}</div>
                                <div style={{ fontSize: '0.65rem', color: '#60a5fa', marginTop: '2px' }}>AC {characterLimbAC.off_hand}</div>
                              </div>

                              {/* Left Leg Health & AC */}
                              <div style={{
                                position: 'absolute',
                                bottom: '15%',
                                left: '25%',
                                background: 'rgba(0, 0, 0, 0.8)',
                                color: 'var(--text-gold)',
                                padding: '0.25rem 0.5rem',
                                borderRadius: '4px',
                                fontSize: '0.7rem',
                                fontWeight: 'bold',
                                border: '1px solid var(--primary-gold)',
                                minWidth: '60px',
                                textAlign: 'center'
                              }}>
                                <div style={{ fontSize: '0.75rem', color: getHealthColor(limbHealths.legs, limbHealths.legs) }}>{limbHealths.legs}/{limbHealths.legs}</div>
                                <div style={{ fontSize: '0.65rem', color: '#60a5fa', marginTop: '2px' }}>AC {characterLimbAC.feet}</div>
                              </div>

                              {/* Right Leg Health & AC */}
                              <div style={{
                                position: 'absolute',
                                bottom: '15%',
                                right: '25%',
                                background: 'rgba(0, 0, 0, 0.8)',
                                color: 'var(--text-gold)',
                                padding: '0.25rem 0.5rem',
                                borderRadius: '4px',
                                fontSize: '0.7rem',
                                fontWeight: 'bold',
                                border: '1px solid var(--primary-gold)',
                                minWidth: '60px',
                                textAlign: 'center'
                              }}>
                                <div style={{ fontSize: '0.75rem', color: getHealthColor(limbHealths.legs, limbHealths.legs) }}>{limbHealths.legs}/{limbHealths.legs}</div>
                                <div style={{ fontSize: '0.65rem', color: '#60a5fa', marginTop: '2px' }}>AC {characterLimbAC.feet}</div>
                              </div>
                              
                              {/* Character Name Below Figure */}
                              <div style={{
                                position: 'absolute',
                                bottom: '-15px',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                background: 'rgba(0, 0, 0, 0.9)',
                                color: 'var(--text-gold)',
                                padding: '0.25rem 0.75rem',
                                borderRadius: '12px',
                                fontSize: '0.75rem',
                                fontWeight: 'bold',
                                border: '1px solid var(--primary-gold)',
                                whiteSpace: 'nowrap'
                              }}>
                                {selectedCharacterData.name}
                              </div>
                            </>
                          );
                        })()}
                      </div>

                      {/* Right Column - Three Abilities (Smaller) */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {['int', 'wis', 'cha'].map((ability) => {
                          const score = selectedCharacterData.abilities[ability as keyof typeof selectedCharacterData.abilities] as number;
                          const modifier = Math.floor((score - 10) / 2);
                          return (
                            <div key={ability} style={{
                              background: 'rgba(212, 193, 156, 0.1)',
                              border: '2px solid rgba(212, 193, 156, 0.3)',
                              borderRadius: '8px',
                              padding: '0.75rem',
                              textAlign: 'center'
                            }}>
                              <div style={{ 
                                fontSize: '0.75rem', 
                                fontWeight: 'bold', 
                                color: 'var(--text-gold)',
                                marginBottom: '0.25rem'
                              }}>
                                {ability.toUpperCase()}
                              </div>
                              <div style={{ 
                                fontSize: '1.25rem', 
                                fontWeight: 'bold', 
                                color: 'white',
                                marginBottom: '0.125rem'
                              }}>
                                {score}
                              </div>
                              <div style={{ 
                                fontSize: '0.85rem', 
                                color: 'var(--text-secondary)',
                                fontWeight: 'bold'
                              }}>
                                {modifier >= 0 ? '+' : ''}{modifier}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Combat Stats */}
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                      gap: '1rem',
                      marginBottom: '2rem'
                    }}>
                      <div style={{
                        background: 'rgba(220, 53, 69, 0.1)',
                        border: '2px solid rgba(220, 53, 69, 0.3)',
                        borderRadius: '12px',
                        padding: '1rem',
                        textAlign: 'center',
                        position: 'relative',
                        cursor: 'help'
                      }}
                      title={`Limb Health System:\n\n• Head: ${Math.floor(selectedCharacterData.hit_points * Math.min(1.0, 0.25 + Math.max(0, Math.floor((selectedCharacterData.abilities.con - 10) / 2) * 0.1)))} HP (25% base + CON bonus, max 100%)\n• Torso: ${Math.floor(selectedCharacterData.hit_points * Math.min(2.0, 1.0 + Math.max(0, Math.floor((selectedCharacterData.abilities.con - 10) / 2) * 0.1)))} HP (100% base + CON bonus, max 200%)\n• Hands: ${Math.floor(selectedCharacterData.hit_points * Math.min(1.0, 0.15 + Math.max(0, Math.floor((selectedCharacterData.abilities.con - 10) / 2) * 0.1)))} HP (15% base + CON bonus, max 100%)\n• Legs: ${Math.floor(selectedCharacterData.hit_points * Math.min(1.0, 0.4 + Math.max(0, Math.floor((selectedCharacterData.abilities.con - 10) / 2) * 0.1)))} HP (40% base + CON bonus, max 100%)\n\nCON Modifier: ${Math.floor((selectedCharacterData.abilities.con - 10) / 2) >= 0 ? '+' : ''}${Math.floor((selectedCharacterData.abilities.con - 10) / 2)}\nEach +1 CON adds 10% more HP to all limbs\nTorso can reach up to 200% of base HP!`}
                      >
                        <div style={{ color: 'var(--text-gold)', fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                          Hit Points
                        </div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'white' }}>
                          {selectedCharacterData.hit_points}
                        </div>
                        <div style={{ color: 'var(--text-gold)', fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                          Chest will always be 100% hit points value, the rest is a value of Hit Points that scales with CON value.
                        </div>
                      </div>
                      
                      <div style={{
                        background: 'rgba(13, 110, 253, 0.1)',
                        border: '2px solid rgba(13, 110, 253, 0.3)',
                        borderRadius: '12px',
                        padding: '1rem',
                        textAlign: 'center',
                        position: 'relative',
                        cursor: 'help'
                      }}
                      title={`Limb-Specific Armor Class:\n\n• Head: Base AC 12 + Helmet AC\n  Current: ${(limbAC[selectedCharacterData.id]?.head || 12)} (${(limbAC[selectedCharacterData.id]?.head || 12) > 12 ? `12 base + ${(limbAC[selectedCharacterData.id]?.head || 12) - 12} helmet` : '12 base, no helmet'})\n\n• Torso: Character Base AC or Chest Armor AC\n  Current: ${(limbAC[selectedCharacterData.id]?.chest || selectedCharacterData.armor_class || 10)}\n\n• Main Hand: Shield/Gauntlet AC only\n  Current: ${(limbAC[selectedCharacterData.id]?.main_hand || 0)} (${(limbAC[selectedCharacterData.id]?.main_hand || 0) === 0 ? 'Unprotected' : 'Protected'})\n\n• Off Hand: Shield/Gauntlet AC only\n  Current: ${(limbAC[selectedCharacterData.id]?.off_hand || 0)} (${(limbAC[selectedCharacterData.id]?.off_hand || 0) === 0 ? 'Unprotected' : 'Protected'})\n\n• Feet: Boot AC only\n  Current: ${(limbAC[selectedCharacterData.id]?.feet || 0)} (${(limbAC[selectedCharacterData.id]?.feet || 0) === 0 ? 'Unprotected' : 'Protected'})\n\nNote: Only the torso has base AC. All other limbs start at 0 (or 12 for head) and only gain AC from equipped armor.`}
                      >
                        <div style={{ color: 'var(--text-gold)', fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                          Armor Class
                        </div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'white' }}>
                          {selectedCharacterData.armor_class}
                        </div>
                        <div style={{ color: 'var(--text-gold)', fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                          AC for limbs are dependent on what item is equipped in that slot.
                        </div>
                      </div>

                      <div style={{
                        background: 'rgba(25, 135, 84, 0.1)',
                        border: '2px solid rgba(25, 135, 84, 0.3)',
                        borderRadius: '12px',
                        padding: '1rem',
                        textAlign: 'center'
                      }}>
                        <div style={{ color: 'var(--text-gold)', fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                          Proficiency Bonus
                        </div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'white' }}>
                          +{Math.ceil(selectedCharacterData.level / 4) + 1}
                        </div>
                      </div>
                    </div>

                    {/* Skills - Organized by Ability Score */}
                    <div>
                      <h6 className="text-gold">🎯 Skills by Ability Score</h6>
                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
                        gap: '1.5rem' 
                      }}>
                        {(() => {
                          const skillsByAbility = {
                            'str': { name: 'Strength', skills: ['Athletics'] },
                            'dex': { name: 'Dexterity', skills: ['Acrobatics', 'Sleight of Hand', 'Stealth'] },
                            'int': { name: 'Intelligence', skills: ['Arcana', 'History', 'Investigation', 'Nature', 'Religion'] },
                            'wis': { name: 'Wisdom', skills: ['Animal Handling', 'Insight', 'Medicine', 'Perception', 'Survival'] },
                            'cha': { name: 'Charisma', skills: ['Deception', 'Intimidation', 'Performance', 'Persuasion'] }
                          };

                          return Object.entries(skillsByAbility).map(([abilityKey, { name, skills }]) => {
                            const abilityScore = selectedCharacterData.abilities[abilityKey as keyof typeof selectedCharacterData.abilities] as number;
                            const baseModifier = Math.floor((abilityScore - 10) / 2);
                            const proficiencyBonus = Math.max(2, Math.ceil(selectedCharacterData.level / 4) + 1);

                            return (
                              <div key={abilityKey} style={{
                                background: 'rgba(0, 0, 0, 0.3)',
                                border: '1px solid rgba(212, 193, 156, 0.4)',
                                borderRadius: '8px',
                                padding: '1rem',
                                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
                              }}>
                                {/* Ability Header */}
                                <div style={{
                                  background: 'var(--primary-gold)',
                                  color: 'var(--background-dark)',
                                  padding: '0.5rem',
                                  borderRadius: '6px',
                                  marginBottom: '0.75rem',
                                  textAlign: 'center',
                                  fontWeight: 'bold',
                                  fontSize: '0.9rem'
                                }}>
                                  {name} ({abilityKey.toUpperCase()}) {baseModifier >= 0 ? '+' : ''}{baseModifier}
                                </div>

                                {/* Skills for this ability */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                  {skills.map(skill => {
                                    const isProficient = selectedCharacterData.skills?.includes(skill.toLowerCase().replace(/\s+/g, '_')) || false;
                                    const totalModifier = baseModifier + (isProficient ? proficiencyBonus : 0);

                                    return (
                                      <div key={skill} style={{
                                        background: isProficient ? 'rgba(212, 193, 156, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                                        border: isProficient ? '1px solid rgba(212, 193, 156, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
                                        borderRadius: '4px',
                                        padding: '0.6rem 0.75rem',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        transition: 'all 0.2s ease'
                                      }}>
                                        <span style={{ 
                                          color: isProficient ? 'var(--text-gold)' : 'white',
                                          fontSize: '0.85rem',
                                          fontWeight: isProficient ? 'bold' : 'normal',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '0.5rem'
                                        }}>
                                          {isProficient && <span style={{ color: 'var(--primary-gold)' }}>⭐</span>}
                                          {skill}
                                        </span>
                                        <div style={{
                                          background: isProficient ? 'var(--primary-gold)' : 'rgba(255, 255, 255, 0.1)',
                                          color: isProficient ? 'var(--background-dark)' : 'var(--text-gold)',
                                          padding: '0.2rem 0.5rem',
                                          borderRadius: '12px',
                                          fontWeight: 'bold',
                                          fontSize: '0.8rem',
                                          minWidth: '35px',
                                          textAlign: 'center'
                                        }}>
                                          {totalModifier >= 0 ? '+' : ''}{totalModifier}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'inventory' && canViewAllTabs(selectedCharacterData.id) && renderInventoryTab(selectedCharacterData)}
                {activeTab === 'equip' && canViewAllTabs(selectedCharacterData.id) && renderEquipTab(selectedCharacterData)}
                
                {/* Armies Tab */}
                {activeTab === 'armies' && canViewAllTabs(selectedCharacterData.id) && (
                  <div className="glass-panel">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                      <h5 style={{ color: 'var(--text-gold)', margin: 0 }}>⚔️ Armies</h5>
                      {user?.role === 'Dungeon Master' && (
                        <button
                          onClick={() => setShowAddArmyModal(true)}
                          className="btn btn-primary"
                          style={{
                            padding: '0.5rem 1rem',
                            fontSize: '0.9rem',
                            background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.3), rgba(22, 163, 74, 0.3))',
                            border: '2px solid rgba(34, 197, 94, 0.5)',
                            color: '#4ade80'
                          }}
                        >
                          ➕ Add New Army
                        </button>
                      )}
                    </div>

                    {armies.length > 0 ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '1.5rem' }}>
                        {armies.map((army) => (
                          <div
                            key={army.id}
                            className="glass-panel"
                            style={{
                              background: 'linear-gradient(135deg, rgba(212, 193, 156, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)',
                              border: '2px solid rgba(212, 193, 156, 0.3)',
                              padding: '1.5rem',
                              transition: 'all 0.3s ease'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = 'rgba(212, 193, 156, 0.5)';
                              e.currentTarget.style.boxShadow = '0 8px 24px rgba(212, 193, 156, 0.2)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = 'rgba(212, 193, 156, 0.3)';
                              e.currentTarget.style.boxShadow = 'none';
                            }}
                          >
                            {/* Army Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                              <div>
                                <h6 style={{ color: 'var(--text-gold)', margin: 0, fontSize: '1.2rem' }}>
                                  {getArmyCategoryIcon(army.category)} {army.name}
                                </h6>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem', fontStyle: 'italic' }}>
                                  {army.category}
                                </div>
                              </div>
                              {user?.role === 'Dungeon Master' && (
                                <button
                                  onClick={async () => {
                                    if (window.confirm(`Are you sure you want to delete the army "${army.name}"? This will also delete all battle history.`)) {
                                      try {
                                        await armyAPI.deleteArmy(army.id);
                                        setArmies(armies.filter(a => a.id !== army.id));
                                        setToastMessage(`Army "${army.name}" deleted`);
                                        setTimeout(() => setToastMessage(null), 3000);
                                      } catch (error) {
                                        console.error('Error deleting army:', error);
                                      }
                                    }
                                  }}
                                  style={{
                                    padding: '0.25rem 0.5rem',
                                    background: 'rgba(239, 68, 68, 0.2)',
                                    border: '1px solid rgba(239, 68, 68, 0.4)',
                                    borderRadius: '0.25rem',
                                    color: '#ef4444',
                                    cursor: 'pointer',
                                    fontSize: '0.8rem'
                                  }}
                                >
                                  🗑️ Delete
                                </button>
                              )}
                            </div>

                            {/* Army Stats */}
                            <div style={{ display: 'grid', gap: '1rem', marginBottom: '1.5rem' }}>
                              {/* Troop Count Display */}
                              <div style={{ 
                                padding: '1rem', 
                                background: 'rgba(212, 193, 156, 0.1)', 
                                borderRadius: '0.5rem',
                                border: '2px solid rgba(212, 193, 156, 0.3)'
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                                  <span style={{ fontSize: '1.5rem' }}>👥</span>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Troop Count</div>
                                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--text-gold)' }}>
                                      {army.total_troops?.toLocaleString() || 'N/A'}
                                    </div>
                                  </div>
                                  {user?.role === 'Dungeon Master' && army.total_troops && (
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                      <button
                                        onClick={async () => {
                                          const change = -Math.min(10, army.total_troops || 0);
                                          if (army.total_troops && army.total_troops > 1) {
                                            try {
                                              const updated = await armyAPI.updateTroops(army.id, change);
                                              setArmies(armies.map(a => a.id === army.id ? updated : a));
                                            } catch (error) {
                                              console.error('Error updating troops:', error);
                                            }
                                          }
                                        }}
                                        disabled={!army.total_troops || army.total_troops <= 1}
                                        style={{
                                          padding: '0.5rem 0.75rem',
                                          background: (!army.total_troops || army.total_troops <= 1) ? 'rgba(255, 255, 255, 0.05)' : 'rgba(239, 68, 68, 0.2)',
                                          border: '1px solid rgba(239, 68, 68, 0.4)',
                                          borderRadius: '0.25rem',
                                          color: (!army.total_troops || army.total_troops <= 1) ? '#666' : '#ef4444',
                                          cursor: (!army.total_troops || army.total_troops <= 1) ? 'not-allowed' : 'pointer',
                                          fontSize: '0.9rem'
                                        }}
                                      >
                                        -10
                                      </button>
                                      <button
                                        onClick={async () => {
                                          try {
                                            const updated = await armyAPI.updateTroops(army.id, 10);
                                            setArmies(armies.map(a => a.id === army.id ? updated : a));
                                          } catch (error) {
                                            console.error('Error updating troops:', error);
                                          }
                                        }}
                                        style={{
                                          padding: '0.5rem 0.75rem',
                                          background: 'rgba(34, 197, 94, 0.2)',
                                          border: '1px solid rgba(34, 197, 94, 0.4)',
                                          borderRadius: '0.25rem',
                                          color: '#4ade80',
                                          cursor: 'pointer',
                                          fontSize: '0.9rem'
                                        }}
                                      >
                                        +10
                                      </button>
                                      <button
                                        onClick={() => {
                                          const newValue = prompt(`Enter new troop count for ${army.name}:`, army.total_troops?.toString() || '100');
                                          if (newValue !== null) {
                                            const parsed = parseInt(newValue);
                                            if (!isNaN(parsed) && parsed >= 1) {
                                              const change = parsed - (army.total_troops || 0);
                                              armyAPI.updateTroops(army.id, change)
                                                .then(updated => {
                                                  setArmies(armies.map(a => a.id === army.id ? updated : a));
                                                })
                                                .catch(error => {
                                                  console.error('Error updating troops:', error);
                                                  alert('Failed to update troop count');
                                                });
                                            } else {
                                              alert('Please enter a valid number (minimum 1)');
                                            }
                                          }
                                        }}
                                        style={{
                                          padding: '0.5rem 0.75rem',
                                          background: 'rgba(168, 85, 247, 0.2)',
                                          border: '1px solid rgba(168, 85, 247, 0.4)',
                                          borderRadius: '0.25rem',
                                          color: '#a78bfa',
                                          cursor: 'pointer',
                                          fontSize: '0.9rem'
                                        }}
                                        title="Set exact troop count"
                                      >
                                        ✏️
                                      </button>
                                    </div>
                                  )}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                  Numbers stat: {army.numbers}/10 (auto-calculated from troops)
                                </div>
                              </div>

                              {/* Other Stats */}
                              {[
                                { key: 'equipment', label: 'Equipment', icon: '⚔️', color: '#ef4444' },
                                { key: 'discipline', label: 'Discipline', icon: '🛡️', color: '#3b82f6' },
                                { key: 'morale', label: 'Morale', icon: '💪', color: '#10b981' },
                                { key: 'command', label: 'Command', icon: '👑', color: '#f59e0b' },
                                { key: 'logistics', label: 'Logistics', icon: '📦', color: '#06b6d4' }
                              ].map((stat) => {
                                const value = army[stat.key as keyof Army] as number;
                                return (
                                  <div key={stat.key} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <span style={{ fontSize: '1.2rem' }}>{stat.icon}</span>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{stat.label}</span>
                                        <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: stat.color }}>{value}/10</span>
                                      </div>
                                      <div style={{
                                        height: '8px',
                                        background: 'rgba(255, 255, 255, 0.1)',
                                        borderRadius: '4px',
                                        overflow: 'hidden',
                                        position: 'relative'
                                      }}>
                                        <div style={{
                                          width: `${(value / 10) * 100}%`,
                                          height: '100%',
                                          background: `linear-gradient(90deg, ${stat.color}dd, ${stat.color})`,
                                          transition: 'width 0.3s ease',
                                          boxShadow: `0 0 8px ${stat.color}88`
                                        }} />
                                      </div>
                                    </div>
                                    {user?.role === 'Dungeon Master' && (
                                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                                        <button
                                          onClick={async () => {
                                            if (value > 1) {
                                              try {
                                                const updated = await armyAPI.updateArmy(army.id, { [stat.key]: value - 1 });
                                                setArmies(armies.map(a => a.id === army.id ? updated : a));
                                              } catch (error) {
                                                console.error('Error updating army:', error);
                                              }
                                            }
                                          }}
                                          disabled={value <= 1}
                                          style={{
                                            width: '24px',
                                            height: '24px',
                                            padding: 0,
                                            background: value <= 1 ? 'rgba(255, 255, 255, 0.05)' : 'rgba(239, 68, 68, 0.2)',
                                            border: '1px solid rgba(239, 68, 68, 0.4)',
                                            borderRadius: '4px',
                                            color: value <= 1 ? '#666' : '#ef4444',
                                            cursor: value <= 1 ? 'not-allowed' : 'pointer',
                                            fontSize: '0.9rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                          }}
                                        >
                                          −
                                        </button>
                                        <button
                                          onClick={async () => {
                                            if (value < 10) {
                                              try {
                                                const updated = await armyAPI.updateArmy(army.id, { [stat.key]: value + 1 });
                                                setArmies(armies.map(a => a.id === army.id ? updated : a));
                                              } catch (error) {
                                                console.error('Error updating army:', error);
                                              }
                                            }
                                          }}
                                          disabled={value >= 10}
                                          style={{
                                            width: '24px',
                                            height: '24px',
                                            padding: 0,
                                            background: value >= 10 ? 'rgba(255, 255, 255, 0.05)' : 'rgba(34, 197, 94, 0.2)',
                                            border: '1px solid rgba(34, 197, 94, 0.4)',
                                            borderRadius: '4px',
                                            color: value >= 10 ? '#666' : '#4ade80',
                                            cursor: value >= 10 ? 'not-allowed' : 'pointer',
                                            fontSize: '0.9rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                          }}
                                        >
                                          +
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            {/* Battle History */}
                            {army.battle_history && army.battle_history.length > 0 && (
                              <div style={{ borderTop: '1px solid rgba(212, 193, 156, 0.2)', paddingTop: '1rem' }}>
                                <h6 style={{ color: 'var(--text-gold)', fontSize: '0.95rem', marginBottom: '0.75rem' }}>
                                  📜 Battle History ({army.battle_history.length})
                                </h6>
                                <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'grid', gap: '0.5rem' }}>
                                  {army.battle_history.map((history) => {
                                    const resultColor = 
                                      history.result === 'victory' ? '#4ade80' :
                                      history.result === 'defeat' ? '#ef4444' :
                                      '#94a3b8';
                                    const resultIcon = 
                                      history.result === 'victory' ? '🏆' :
                                      history.result === 'defeat' ? '💀' :
                                      '🤝';
                                    
                                    return (
                                      <div
                                        key={history.id}
                                        style={{
                                          padding: '0.75rem',
                                          background: 'rgba(0, 0, 0, 0.2)',
                                          borderRadius: '0.5rem',
                                          border: `1px solid ${resultColor}44`,
                                          fontSize: '0.85rem'
                                        }}
                                      >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                          <span style={{ fontWeight: 'bold', color: 'var(--text-gold)' }}>
                                            {resultIcon} {history.battle_name}
                                          </span>
                                          <span style={{ color: resultColor, textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                            {history.result}
                                          </span>
                                        </div>
                                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                                          <div>vs {history.enemy_name}</div>
                                          <div style={{ marginTop: '0.25rem' }}>
                                            <span style={{ color: '#4ade80' }}>Your Score:</span> {history.start_score} → {history.end_score} 
                                            <span style={{ marginLeft: '0.5rem', color: '#ef4444' }}>Enemy:</span> {history.enemy_start_score} → {history.enemy_end_score}
                                          </div>
                                          {history.troops_lost !== undefined && history.troops_lost > 0 && (
                                            <div style={{ marginTop: '0.25rem', color: '#ef4444', fontWeight: 'bold' }}>
                                              💀 Casualties: {history.troops_lost.toLocaleString()} troops lost
                                            </div>
                                          )}
                                          <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', opacity: 0.7 }}>
                                            {new Date(history.battle_date).toLocaleDateString()}
                                          </div>
                                          {history.goals_chosen && history.goals_chosen.length > 0 && (
                                            <details style={{ marginTop: '0.5rem' }}>
                                              <summary style={{ cursor: 'pointer', color: 'var(--text-gold)' }}>
                                                Goals Used ({history.goals_chosen.length})
                                              </summary>
                                              <div style={{ marginTop: '0.5rem', paddingLeft: '1rem' }}>
                                                {history.goals_chosen.map((goal: any, idx: number) => (
                                                  <div key={idx} style={{ marginBottom: '0.25rem' }}>
                                                    • {goal.goal_name} {goal.success ? '✅' : '❌'}
                                                  </div>
                                                ))}
                                              </div>
                                            </details>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {(!army.battle_history || army.battle_history.length === 0) && (
                              <div style={{ 
                                borderTop: '1px solid rgba(212, 193, 156, 0.2)', 
                                paddingTop: '1rem',
                                textAlign: 'center',
                                color: 'var(--text-muted)',
                                fontSize: '0.85rem',
                                fontStyle: 'italic'
                              }}>
                                No battles fought yet
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.5 }}>⚔️</div>
                        <h6>No Armies Yet</h6>
                        <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
                          {user?.role === 'Dungeon Master' 
                            ? 'Click "Add New Army" to create an army for this character.'
                            : 'The Dungeon Master hasn\'t assigned any armies to this character yet.'}
                        </p>
                      </div>
                    )}
                  </div>
                )}
                
                {/* Show access denied message for restricted tabs */}
                {(activeTab === 'inventory' || activeTab === 'equip' || activeTab === 'armies') && !canViewAllTabs(selectedCharacterData.id) && (
                  <div className="glass-panel">
                    <div style={{ textAlign: 'center', padding: '2rem' }}>
                      <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🔒</div>
                      <h5 style={{ color: 'var(--text-gold)', marginBottom: '1rem' }}>Access Restricted</h5>
                      <p style={{ color: 'var(--text-secondary)' }}>
                        You can only view the overview of other players' characters.
                        {user?.role === 'Player' && (
                          <span>
                            <br />To view detailed information, select your own character.
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="glass-panel">
                <div style={{ textAlign: 'center', padding: '3rem' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.5 }}>👤</div>
                  <h5 className="text-muted">Select a Character</h5>
                  <p className="text-muted">Choose a character from the list to view their details.</p>
                </div>
              </div>
            )}
          </div>
        )}

        </div>
      </div>

      {/* Toast Notification */}
        {toastMessage && (
          <div style={{
            position: 'fixed',
            top: '2rem',
            right: '2rem',
            background: 'rgba(34, 197, 94, 0.9)',
            color: 'white',
            padding: '1rem 1.5rem',
            borderRadius: '0.5rem',
            border: '1px solid rgba(34, 197, 94, 0.5)',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
            zIndex: 2000,
            maxWidth: '400px',
            fontSize: '0.9rem',
            fontWeight: 'bold',
            animation: 'slideInRight 0.3s ease-out'
          }}>
            🎒 {toastMessage}
          </div>
        )}

        {/* Add Item Modal */}
        {showAddItemModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}>
            <div style={{
              background: 'var(--background-dark)',
              borderRadius: '1rem',
              padding: '2rem',
              width: '90%',
              maxWidth: '600px',
              maxHeight: '80vh',
              overflow: 'auto',
              border: '1px solid rgba(212, 193, 156, 0.3)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h4 style={{ color: 'var(--text-gold)', margin: 0 }}>Add Item to Inventory</h4>
                <button
                  onClick={() => setShowAddItemModal(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    fontSize: '1.5rem',
                    cursor: 'pointer'
                  }}
                >
                  ×
                </button>
              </div>
              
              <div style={{ marginBottom: '1rem' }}>
                <input
                  type="text"
                  placeholder="Search items..."
                  value={addItemSearchTerm}
                  onChange={(e) => setAddItemSearchTerm(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(212, 193, 156, 0.3)',
                    borderRadius: '0.5rem',
                    color: 'white',
                    fontSize: '0.9rem'
                  }}
                />
              </div>

              <div style={{ 
                display: 'grid', 
                gap: '0.5rem',
                maxHeight: '400px',
                overflow: 'auto'
              }}>
                {allInventoryItems
                  .filter(item => 
                    addItemSearchTerm === '' || 
                    item.item_name.toLowerCase().includes(addItemSearchTerm.toLowerCase()) ||
                    item.category.toLowerCase().includes(addItemSearchTerm.toLowerCase()) ||
                    (item.subcategory && item.subcategory.toLowerCase().includes(addItemSearchTerm.toLowerCase()))
                  )
                  .map((item, index) => (
                  <div
                    key={index}
                    style={{
                      padding: '1rem',
                      background: 'rgba(255, 255, 255, 0.1)',
                      borderRadius: '0.5rem',
                      border: '1px solid rgba(212, 193, 156, 0.2)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                      e.currentTarget.style.borderColor = 'rgba(212, 193, 156, 0.4)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                      e.currentTarget.style.borderColor = 'rgba(212, 193, 156, 0.2)';
                    }}
                    onClick={() => selectedCharacterData && handleAddItemToInventory(selectedCharacterData.id, item.item_name)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ color: 'var(--text-gold)', fontWeight: 'bold', fontSize: '0.9rem' }}>
                          {item.item_name}
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                          {item.category} {item.subcategory && `• ${item.subcategory}`}
                        </div>
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                        Click to add
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Create Custom Item Modal */}
        {showCreateCustomModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(4px)'
          }}>
            <div style={{
              background: 'linear-gradient(135deg, rgba(20, 20, 30, 0.98) 0%, rgba(30, 30, 40, 0.98) 100%)',
              borderRadius: '1rem',
              padding: '2rem',
              width: '90%',
              maxWidth: '900px',
              maxHeight: '85vh',
              overflow: 'auto',
              border: '2px solid rgba(212, 193, 156, 0.4)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 60px rgba(212, 193, 156, 0.1)'
            }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', paddingBottom: '1rem', borderBottom: '2px solid rgba(212, 193, 156, 0.3)' }}>
                <h4 style={{ color: 'var(--text-gold)', margin: 0, fontSize: '1.5rem', textShadow: '0 2px 4px rgba(0, 0, 0, 0.5)' }}>✨ Create Custom Item</h4>
                <button
                  onClick={() => {
                    setShowCreateCustomModal(false);
                    // Reset form
                    setCustomItemData({
                      item_name: '',
                      category: 'Weapon',
                      subcategory: '',
                      description: '',
                      rarity: 'Common',
                      properties: []
                    });
                  }}
                  style={{
                    background: 'rgba(220, 53, 69, 0.2)',
                    border: '1px solid rgba(220, 53, 69, 0.4)',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                    color: '#f5c6cb',
                    fontSize: '1.5rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(220, 53, 69, 0.4)';
                    e.currentTarget.style.borderColor = 'rgba(220, 53, 69, 0.6)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(220, 53, 69, 0.2)';
                    e.currentTarget.style.borderColor = 'rgba(220, 53, 69, 0.4)';
                  }}
                >
                  ×
                </button>
              </div>
              
              {/* Basic Info */}
              <div style={{ marginBottom: '1.5rem' }}>
                <h5 style={{ color: 'var(--text-gold)', marginBottom: '1rem', fontSize: '1.1rem' }}>Basic Information</h5>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                  {/* Item Name */}
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-gold)', fontSize: '0.85rem', fontWeight: 'bold' }}>
                      Item Name <span style={{ color: '#ff6b6b' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={customItemData.item_name || ''}
                      onChange={(e) => setCustomItemData({ ...customItemData, item_name: e.target.value })}
                      placeholder="Enter item name..."
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(212, 193, 156, 0.3)',
                        borderRadius: '0.5rem',
                        color: 'white',
                        fontSize: '0.9rem',
                        transition: 'all 0.2s ease'
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(212, 193, 156, 0.6)';
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(212, 193, 156, 0.3)';
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                      }}
                    />
                  </div>

                  {/* Category */}
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-gold)', fontSize: '0.85rem', fontWeight: 'bold' }}>
                      Category <span style={{ color: '#ff6b6b' }}>*</span>
                    </label>
                    <select
                      value={customItemData.category || 'Weapon'}
                      onChange={(e) => {
                        const newCategory = e.target.value as any;
                        setCustomItemData({ 
                          ...customItemData, 
                          category: newCategory,
                          subcategory: '',
                          damage_dice: newCategory === 'Weapon' ? customItemData.damage_dice : undefined,
                          damage_type: newCategory === 'Weapon' ? customItemData.damage_type : undefined,
                          armor_class: newCategory === 'Armor' ? customItemData.armor_class : undefined,
                          stealth_disadvantage: newCategory === 'Armor' ? customItemData.stealth_disadvantage : undefined
                        });
                      }}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        background: 'rgba(0, 0, 0, 0.5)',
                        border: '1px solid rgba(212, 193, 156, 0.3)',
                        borderRadius: '0.5rem',
                        color: 'white',
                        fontSize: '0.9rem',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="Weapon">Weapon</option>
                      <option value="Armor">Armor</option>
                      <option value="Tool">Tool</option>
                      <option value="General">General</option>
                      <option value="Magic Item">Magic Item</option>
                      <option value="Consumable">Consumable</option>
                    </select>
                  </div>

                  {/* Subcategory */}
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-gold)', fontSize: '0.85rem', fontWeight: 'bold' }}>
                      Subcategory
                    </label>
                    <select
                      value={customItemData.subcategory || ''}
                      onChange={(e) => setCustomItemData({ ...customItemData, subcategory: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        background: 'rgba(0, 0, 0, 0.5)',
                        border: '1px solid rgba(212, 193, 156, 0.3)',
                        borderRadius: '0.5rem',
                        color: 'white',
                        fontSize: '0.9rem',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="">Select subcategory...</option>
                      {getSubcategoryOptions(customItemData.category || 'Weapon').map(option => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>

                  {/* Rarity */}
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-gold)', fontSize: '0.85rem', fontWeight: 'bold' }}>
                      Rarity
                    </label>
                    <select
                      value={customItemData.rarity || 'Common'}
                      onChange={(e) => setCustomItemData({ ...customItemData, rarity: e.target.value as any })}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        background: 'rgba(0, 0, 0, 0.5)',
                        border: '1px solid rgba(212, 193, 156, 0.3)',
                        borderRadius: '0.5rem',
                        color: 'white',
                        fontSize: '0.9rem',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="Common">Common</option>
                      <option value="Uncommon">Uncommon</option>
                      <option value="Rare">Rare</option>
                      <option value="Very Rare">Very Rare</option>
                      <option value="Legendary">Legendary</option>
                      <option value="Artifact">Artifact</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-gold)', fontSize: '0.85rem', fontWeight: 'bold' }}>
                  Description <span style={{ color: '#ff6b6b' }}>*</span>
                </label>
                <textarea
                  value={customItemData.description || ''}
                  onChange={(e) => setCustomItemData({ ...customItemData, description: e.target.value })}
                  placeholder="Describe the item's appearance, history, or special features..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(212, 193, 156, 0.3)',
                    borderRadius: '0.5rem',
                    color: 'white',
                    fontSize: '0.9rem',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                    transition: 'all 0.2s ease'
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(212, 193, 156, 0.6)';
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(212, 193, 156, 0.3)';
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                  }}
                />
              </div>

              {/* Properties Section */}
              <div style={{ marginBottom: '1.5rem' }}>
                <h5 style={{ color: 'var(--text-gold)', marginBottom: '1rem', fontSize: '1.1rem' }}>Properties</h5>
                
                {/* Property Selector */}
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    Add Property
                  </label>
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value && !customItemData.properties?.includes(e.target.value)) {
                        setCustomItemData({
                          ...customItemData,
                          properties: [...(customItemData.properties || []), e.target.value]
                        });
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      background: 'rgba(0, 0, 0, 0.5)',
                      border: '1px solid rgba(212, 193, 156, 0.3)',
                      borderRadius: '0.5rem',
                      color: 'white',
                      fontSize: '0.9rem',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="">Select a property to add...</option>
                    {getAvailableProperties()
                      .filter(prop => !customItemData.properties?.includes(prop))
                      .map(prop => (
                        <option key={prop} value={prop}>{prop}</option>
                      ))}
                  </select>
                </div>

                {/* Selected Properties List */}
                {customItemData.properties && customItemData.properties.length > 0 && (
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      Selected Properties
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', padding: '0.75rem', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '0.5rem', border: '1px solid rgba(212, 193, 156, 0.2)' }}>
                      {customItemData.properties.map((prop, index) => (
                        <span key={index} style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.375rem',
                          fontSize: '0.8rem',
                          padding: '0.375rem 0.625rem',
                          background: 'rgba(212, 193, 156, 0.2)',
                          color: 'var(--text-gold)',
                          borderRadius: '1rem',
                          border: '1px solid rgba(212, 193, 156, 0.3)'
                        }}>
                          {prop}
                          <button
                            onClick={() => {
                              setCustomItemData({
                                ...customItemData,
                                properties: customItemData.properties?.filter((_, i) => i !== index)
                              });
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#ff6b6b',
                              fontSize: '1rem',
                              cursor: 'pointer',
                              padding: 0,
                              lineHeight: '1',
                              width: '16px',
                              height: '16px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: '50%',
                              transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'rgba(220, 53, 69, 0.2)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'none';
                            }}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Category-Specific Stats */}
              {customItemData.category === 'Weapon' && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <h5 style={{ color: 'var(--text-gold)', marginBottom: '1rem', fontSize: '1.1rem' }}>Weapon Stats</h5>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                    {/* Damage Dice */}
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        Damage Dice
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={damageCount}
                          onChange={(e) => {
                            const count = parseInt(e.target.value) || 1;
                            setDamageCount(count);
                            setCustomItemData({ ...customItemData, damage_dice: `${count}d${damageDie}` });
                          }}
                          style={{
                            width: '60px',
                            padding: '0.75rem',
                            background: 'rgba(255, 255, 255, 0.08)',
                            border: '1px solid rgba(212, 193, 156, 0.3)',
                            borderRadius: '0.5rem',
                            color: 'white',
                            fontSize: '0.9rem',
                            textAlign: 'center'
                          }}
                        />
                        <span style={{ color: 'var(--text-gold)', fontSize: '1.2rem', fontWeight: 'bold' }}>d</span>
                        <input
                          type="number"
                          value={damageDie}
                          onChange={(e) => {
                            const die = parseInt(e.target.value) || 4;
                            setDamageDie(die);
                            setCustomItemData({ ...customItemData, damage_dice: `${damageCount}d${die}` });
                          }}
                          style={{
                            width: '60px',
                            padding: '0.75rem',
                            background: 'rgba(255, 255, 255, 0.08)',
                            border: '1px solid rgba(212, 193, 156, 0.3)',
                            borderRadius: '0.5rem',
                            color: 'white',
                            fontSize: '0.9rem',
                            textAlign: 'center'
                          }}
                        />
                      </div>
                    </div>

                    {/* Damage Type */}
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        Damage Type
                      </label>
                      <select
                        value={customItemData.damage_type || ''}
                        onChange={(e) => setCustomItemData({ ...customItemData, damage_type: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          background: 'rgba(0, 0, 0, 0.5)',
                          border: '1px solid rgba(212, 193, 156, 0.3)',
                          borderRadius: '0.5rem',
                          color: 'white',
                          fontSize: '0.9rem',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="">Select damage type...</option>
                        {getDamageTypes().map(type => (
                          <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {customItemData.category === 'Armor' && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <h5 style={{ color: 'var(--text-gold)', marginBottom: '1rem', fontSize: '1.1rem' }}>Armor Stats</h5>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                    {/* Armor Class */}
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        Armor Class
                      </label>
                      <input
                        type="number"
                        min="10"
                        max="20"
                        value={customItemData.armor_class || ''}
                        onChange={(e) => setCustomItemData({ ...customItemData, armor_class: parseInt(e.target.value) || undefined })}
                        placeholder="Enter AC value..."
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          background: 'rgba(255, 255, 255, 0.08)',
                          border: '1px solid rgba(212, 193, 156, 0.3)',
                          borderRadius: '0.5rem',
                          color: 'white',
                          fontSize: '0.9rem'
                        }}
                      />
                    </div>

                    {/* Stealth Disadvantage Toggle */}
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        Stealth Penalty
                      </label>
                      <button
                        onClick={() => setCustomItemData({ 
                          ...customItemData, 
                          stealth_disadvantage: !customItemData.stealth_disadvantage 
                        })}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          background: customItemData.stealth_disadvantage 
                            ? 'rgba(239, 68, 68, 0.2)' 
                            : 'rgba(255, 255, 255, 0.08)',
                          border: customItemData.stealth_disadvantage 
                            ? '2px solid rgba(239, 68, 68, 0.5)' 
                            : '1px solid rgba(212, 193, 156, 0.3)',
                          borderRadius: '0.5rem',
                          color: customItemData.stealth_disadvantage ? '#fca5a5' : 'var(--text-secondary)',
                          fontSize: '0.9rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.5rem',
                          transition: 'all 0.2s ease',
                          fontWeight: customItemData.stealth_disadvantage ? 'bold' : 'normal'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = customItemData.stealth_disadvantage 
                            ? 'rgba(239, 68, 68, 0.3)' 
                            : 'rgba(255, 255, 255, 0.12)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = customItemData.stealth_disadvantage 
                            ? 'rgba(239, 68, 68, 0.2)' 
                            : 'rgba(255, 255, 255, 0.08)';
                        }}
                      >
                        {customItemData.stealth_disadvantage ? '⚠️ Stealth Disadvantage' : '✓ No Stealth Penalty'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* General Stats */}
              <div style={{ marginBottom: '1.5rem' }}>
                <h5 style={{ color: 'var(--text-gold)', marginBottom: '1rem', fontSize: '1.1rem' }}>General Stats</h5>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      Weight (lbs)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={customItemData.weight || ''}
                      onChange={(e) => setCustomItemData({ ...customItemData, weight: parseFloat(e.target.value) || undefined })}
                      placeholder="0.0"
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(212, 193, 156, 0.3)',
                        borderRadius: '0.5rem',
                        color: 'white',
                        fontSize: '0.9rem'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      Cost (copper pieces)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={customItemData.cost_cp || ''}
                      onChange={(e) => setCustomItemData({ ...customItemData, cost_cp: parseInt(e.target.value) || undefined })}
                      placeholder="0"
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(212, 193, 156, 0.3)',
                        borderRadius: '0.5rem',
                        color: 'white',
                        fontSize: '0.9rem'
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '2px solid rgba(212, 193, 156, 0.2)' }}>
                <button
                  onClick={() => {
                    setShowCreateCustomModal(false);
                    setCustomItemData({
                      item_name: '',
                      category: 'Weapon',
                      subcategory: '',
                      description: '',
                      rarity: 'Common',
                      properties: []
                    });
                  }}
                  className="btn btn-secondary"
                  style={{
                    padding: '0.875rem 1.75rem',
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(212, 193, 156, 0.3)',
                    color: 'var(--text-secondary)',
                    borderRadius: '0.5rem',
                    fontSize: '0.95rem',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                    e.currentTarget.style.borderColor = 'rgba(212, 193, 156, 0.5)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                    e.currentTarget.style.borderColor = 'rgba(212, 193, 156, 0.3)';
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => selectedCharacterData && handleCreateCustomItem(selectedCharacterData.id)}
                  className="btn btn-primary"
                  style={{
                    padding: '0.875rem 1.75rem',
                    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.3) 0%, rgba(37, 99, 235, 0.3) 100%)',
                    border: '2px solid rgba(59, 130, 246, 0.5)',
                    color: '#60a5fa',
                    borderRadius: '0.5rem',
                    fontSize: '0.95rem',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 4px 12px rgba(59, 130, 246, 0.2)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(59, 130, 246, 0.4) 0%, rgba(37, 99, 235, 0.4) 100%)';
                    e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.7)';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(59, 130, 246, 0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(59, 130, 246, 0.3) 0%, rgba(37, 99, 235, 0.3) 100%)';
                    e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.5)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.2)';
                  }}
                >
                  ✨ Create & Add to Inventory
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Image Crop/Position Modal */}
        {showImageCropModal && imageToCrop && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000
          }}>
            <div style={{
              background: 'linear-gradient(135deg, rgba(26, 26, 26, 0.98) 0%, rgba(17, 17, 17, 0.98) 100%)',
              borderRadius: '16px',
              padding: '2rem',
              maxWidth: '600px',
              width: '90%',
              border: '2px solid rgba(212, 193, 156, 0.3)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)'
            }}>
              <h3 style={{ 
                color: 'var(--text-gold)', 
                marginBottom: '1.5rem',
                textAlign: 'center',
                fontSize: '1.5rem'
              }}>
                📷 Position Your Character Image
              </h3>

              {/* Preview Container */}
              <div style={{
                position: 'relative',
                width: '400px',
                height: '400px',
                margin: '0 auto 1.5rem',
                border: '3px solid rgba(212, 193, 156, 0.4)',
                borderRadius: '12px',
                overflow: 'hidden',
                backgroundColor: 'rgba(0, 0, 0, 0.3)'
              }}>
                <img 
                  src={imageToCrop.url}
                  alt="Preview"
                  style={{
                    position: 'absolute',
                    width: `${imageScale}%`,
                    height: 'auto',
                    left: `${imagePosition.x}%`,
                    top: `${imagePosition.y}%`,
                    transform: 'translate(-50%, -50%)',
                    pointerEvents: 'none'
                  }}
                />
              </div>

              {/* Controls */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ 
                  display: 'block', 
                  color: 'var(--text-gold)', 
                  marginBottom: '0.5rem',
                  fontSize: '0.9rem'
                }}>
                  Horizontal Position
                </label>
                <input 
                  type="range"
                  min="0"
                  max="100"
                  value={imagePosition.x}
                  onChange={(e) => setImagePosition({ ...imagePosition, x: parseInt(e.target.value) })}
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ 
                  display: 'block', 
                  color: 'var(--text-gold)', 
                  marginBottom: '0.5rem',
                  fontSize: '0.9rem'
                }}>
                  Vertical Position
                </label>
                <input 
                  type="range"
                  min="0"
                  max="100"
                  value={imagePosition.y}
                  onChange={(e) => setImagePosition({ ...imagePosition, y: parseInt(e.target.value) })}
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ 
                  display: 'block', 
                  color: 'var(--text-gold)', 
                  marginBottom: '0.5rem',
                  fontSize: '0.9rem'
                }}>
                  Zoom ({imageScale}%)
                </label>
                <input 
                  type="range"
                  min="50"
                  max="200"
                  value={imageScale}
                  onChange={(e) => setImageScale(parseInt(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                <button
                  onClick={() => {
                    setShowImageCropModal(false);
                    URL.revokeObjectURL(imageToCrop.url);
                    setImageToCrop(null);
                  }}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(212, 193, 156, 0.3)',
                    borderRadius: '8px',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                    e.currentTarget.style.borderColor = 'rgba(212, 193, 156, 0.5)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                    e.currentTarget.style.borderColor = 'rgba(212, 193, 156, 0.3)';
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    try {
                      // Create a canvas to crop the image
                      const canvas = document.createElement('canvas');
                      const ctx = canvas.getContext('2d');
                      canvas.width = 400;
                      canvas.height = 400;

                      const img = new Image();
                      img.src = imageToCrop.url;
                      
                      await new Promise((resolve) => {
                        img.onload = resolve;
                      });

                      if (ctx) {
                        // Clear canvas with black background
                        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                        
                        // Calculate dimensions based on scale
                        // We need to maintain aspect ratio and scale properly
                        const scale = imageScale / 100;
                        
                        // Calculate what the image width would be to fill the container at this scale
                        const containerWidth = 400;
                        const scaledWidth = containerWidth * (scale);
                        const scaledHeight = (img.height / img.width) * scaledWidth;
                        
                        // Calculate position in pixels (center point)
                        const centerX = (imagePosition.x / 100) * canvas.width;
                        const centerY = (imagePosition.y / 100) * canvas.height;
                        
                        // Calculate top-left corner from center point
                        const x = centerX - scaledWidth / 2;
                        const y = centerY - scaledHeight / 2;
                        
                        // Draw the image
                        ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
                        
                        // Convert canvas to blob
                        canvas.toBlob(async (blob) => {
                          if (blob) {
                            // Create a new file from the blob
                            const croppedFile = new File([blob], imageToCrop.file.name, { type: 'image/jpeg' });
                            
                            // Upload the cropped image
                            await characterAPI.uploadCharacterImage(imageToCrop.characterId, croppedFile);
                            
                            // Reload campaign to refresh character data
                            if (campaignName) {
                              await loadCampaign(campaignName);
                            }
                            
                            // Close modal and cleanup
                            setShowImageCropModal(false);
                            URL.revokeObjectURL(imageToCrop.url);
                            setImageToCrop(null);
                          }
                        }, 'image/jpeg', 0.9);
                      }
                    } catch (error) {
                      console.error('Error uploading image:', error);
                      alert('Failed to upload image. Please try again.');
                    }
                  }}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: 'linear-gradient(135deg, rgba(212, 193, 156, 0.3) 0%, rgba(212, 193, 156, 0.2) 100%)',
                    border: '2px solid var(--primary-gold)',
                    borderRadius: '8px',
                    color: 'var(--text-gold)',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: 'bold',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(212, 193, 156, 0.4) 0%, rgba(212, 193, 156, 0.3) 100%)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(212, 193, 156, 0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(212, 193, 156, 0.3) 0%, rgba(212, 193, 156, 0.2) 100%)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  Upload Image
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Character Confirmation Modal */}
        <ConfirmationModal
          isOpen={deleteModal.isOpen}
          title="Delete Character"
          message={`Are you sure you want to delete "${deleteModal.characterName}"? This action cannot be undone.`}
          confirmText="Delete"
          cancelText="Cancel"
          onConfirm={confirmDeleteCharacter}
          onClose={() => setDeleteModal({ isOpen: false, characterId: null, characterName: '' })}
          isDangerous={true}
        />

        {/* Reset Combat Confirmation Modal */}
        <ConfirmationModal
          isOpen={showResetCombatModal}
          title="Reset Combat"
          message="Are you sure you want to reset combat? This will clear all combatants and initiative order."
          confirmText="Reset Combat"
          cancelText="Cancel"
          onConfirm={() => {
            if (socket && currentCampaign) {
              socket.emit('resetCombat', {
                campaignId: currentCampaign.campaign.id
              });
            }
            setShowResetCombatModal(false);
          }}
          onClose={() => setShowResetCombatModal(false)}
          isDangerous={true}
        />

        {/* Add to Combat Modal (DM) */}
        {showAddToCombatModal && currentCampaign && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}>
            <div style={{
              background: 'linear-gradient(135deg, rgba(20, 20, 20, 0.95) 0%, rgba(30, 30, 30, 0.95) 100%)',
              border: '2px solid var(--text-gold)',
              borderRadius: '1rem',
              padding: '2rem',
              maxWidth: '900px',
              width: '90%',
              maxHeight: '80vh',
              overflow: 'auto'
            }}>
              <h3 style={{ color: 'var(--text-gold)', marginBottom: '1.5rem' }}>⚔️ Add to Combat</h3>
              
              {/* Two-column layout */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                {/* Left Column - Player Characters */}
                <div>
                  <h4 style={{ color: 'var(--text-gold)', marginBottom: '1rem', fontSize: '1.1rem' }}>
                    👥 Player Characters
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {currentCampaign.characters.map((character: any) => (
                      <button
                        key={character.id}
                        onClick={() => {
                          if (socket && currentCampaign) {
                            socket.emit('inviteToCombat', {
                              campaignId: currentCampaign.campaign.id,
                              characterId: character.id,
                              targetPlayerId: character.player_id
                            });
                            setShowAddToCombatModal(false);
                          }
                        }}
                        style={{
                          padding: '1rem',
                          background: 'rgba(97, 201, 97, 0.1)',
                          border: '1px solid rgba(97, 201, 97, 0.3)',
                          borderRadius: '0.5rem',
                          color: '#4a4',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(97, 201, 97, 0.2)';
                          e.currentTarget.style.borderColor = '#4a4';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(97, 201, 97, 0.1)';
                          e.currentTarget.style.borderColor = 'rgba(97, 201, 97, 0.3)';
                        }}
                      >
                        <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>{character.name}</div>
                        <div style={{ fontSize: '0.85rem', color: '#999' }}>
                          Level {character.level} {character.race} {character.class}
                        </div>
                      </button>
                    ))}
                    {currentCampaign.characters.length === 0 && (
                      <div style={{ 
                        padding: '2rem', 
                        textAlign: 'center', 
                        color: '#999',
                        border: '1px dashed rgba(97, 201, 97, 0.3)',
                        borderRadius: '0.5rem'
                      }}>
                        No player characters
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column - Monsters */}
                <div>
                  <h4 style={{ color: 'var(--text-gold)', marginBottom: '1rem', fontSize: '1.1rem' }}>
                    🐉 Monsters
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {monsters.map((monster: Monster) => {
                      const imageUrl = monster.image_url 
                        ? (process.env.NODE_ENV === 'production' ? monster.image_url : `http://localhost:5000${monster.image_url}`)
                        : null;
                      
                      return (
                        <button
                          key={monster.id}
                          onClick={() => {
                            if (socket && currentCampaign) {
                              // For monsters, we don't have a player_id, so we'll use the DM's ID
                              socket.emit('inviteToCombat', {
                                campaignId: currentCampaign.campaign.id,
                                characterId: monster.id,
                                targetPlayerId: user?.id, // DM controls monsters
                                isMonster: true
                              });
                              setShowAddToCombatModal(false);
                            }
                          }}
                          style={{
                            padding: '1rem',
                            background: 'rgba(217, 83, 79, 0.1)',
                            border: '1px solid rgba(217, 83, 79, 0.3)',
                            borderRadius: '0.5rem',
                            color: '#d9534f',
                            cursor: 'pointer',
                            textAlign: 'left',
                            transition: 'all 0.2s ease',
                            display: 'flex',
                            gap: '1rem',
                            alignItems: 'center'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(217, 83, 79, 0.2)';
                            e.currentTarget.style.borderColor = '#d9534f';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(217, 83, 79, 0.1)';
                            e.currentTarget.style.borderColor = 'rgba(217, 83, 79, 0.3)';
                          }}
                        >
                          {imageUrl && (
                            <div style={{
                              width: '50px',
                              height: '50px',
                              borderRadius: '0.25rem',
                              backgroundImage: `url(${imageUrl})`,
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                              border: '1px solid rgba(217, 83, 79, 0.3)',
                              flexShrink: 0
                            }} />
                          )}
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>{monster.name}</div>
                            {monster.limb_health && (
                              <div style={{ fontSize: '0.85rem', color: '#999' }}>
                                HP: {monster.limb_health.chest} | AC: {monster.limb_ac?.chest || 10}
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                    {monsters.length === 0 && (
                      <div style={{ 
                        padding: '2rem', 
                        textAlign: 'center', 
                        color: '#999',
                        border: '1px dashed rgba(217, 83, 79, 0.3)',
                        borderRadius: '0.5rem'
                      }}>
                        No monsters in encyclopedia
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Cancel Button */}
              <button
                onClick={() => setShowAddToCombatModal(false)}
                style={{
                  marginTop: '1.5rem',
                  padding: '0.75rem 1.5rem',
                  background: 'rgba(100, 100, 100, 0.3)',
                  border: '1px solid #666',
                  borderRadius: '0.5rem',
                  color: '#ccc',
                  cursor: 'pointer',
                  width: '100%'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Combat Invite Modal (Player) */}
        {showCombatInviteModal && combatInvite && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}>
            <div style={{
              background: 'linear-gradient(135deg, rgba(20, 20, 20, 0.95) 0%, rgba(30, 30, 30, 0.95) 100%)',
              border: '2px solid var(--text-gold)',
              borderRadius: '1rem',
              padding: '2rem',
              maxWidth: '500px',
              width: '90%'
            }}>
              <h3 style={{ color: 'var(--text-gold)', marginBottom: '1.5rem' }}>⚔️ Combat Invitation</h3>
              <p style={{ color: '#ccc', marginBottom: '1.5rem', fontSize: '1.1rem' }}>
                You've been invited to join combat with <strong style={{ color: 'var(--text-gold)' }}>{combatInvite.characterName}</strong>!
              </p>
              <p style={{ color: '#999', marginBottom: '2rem', fontSize: '0.9rem' }}>
                Accepting will roll your initiative and add you to the battle.
              </p>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button
                  onClick={() => {
                    if (socket && currentCampaign && user) {
                      socket.emit('acceptCombatInvite', {
                        campaignId: currentCampaign.campaign.id,
                        characterId: combatInvite.characterId,
                        playerId: user.id
                      });
                      setShowCombatInviteModal(false);
                      setCombatInvite(null);
                      // Navigate to campaign view and combat tab
                      setMainView('campaign');
                      setCampaignTab('combat');
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '0.75rem 1.5rem',
                    background: 'linear-gradient(135deg, #61c961, #5ab85a)',
                    border: '2px solid #4a4',
                    borderRadius: '0.5rem',
                    color: '#000',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    fontSize: '1rem'
                  }}
                >
                  ✓ Accept
                </button>
                <button
                  onClick={() => {
                    setShowCombatInviteModal(false);
                    setCombatInvite(null);
                  }}
                  style={{
                    flex: 1,
                    padding: '0.75rem 1.5rem',
                    background: 'rgba(100, 100, 100, 0.3)',
                    border: '1px solid #666',
                    borderRadius: '0.5rem',
                    color: '#ccc',
                    cursor: 'pointer',
                    fontSize: '1rem'
                  }}
                >
                  ✗ Decline
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Monster Modal (DM) */}
        {showAddMonsterModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            overflow: 'auto'
          }}>
            <div style={{
              background: 'linear-gradient(135deg, rgba(20, 20, 20, 0.95) 0%, rgba(30, 30, 30, 0.95) 100%)',
              border: '2px solid var(--text-gold)',
              borderRadius: '1rem',
              padding: '2rem',
              maxWidth: '600px',
              width: '90%',
              maxHeight: '90vh',
              overflow: 'auto'
            }}>
              <h3 style={{ color: 'var(--text-gold)', marginBottom: '1.5rem' }}>📚 Add Monster</h3>
              
              {/* Name */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ color: '#ccc', fontSize: '0.9rem', marginBottom: '0.5rem', display: 'block' }}>
                  Name *
                </label>
                <input
                  type="text"
                  value={monsterFormData.name}
                  onChange={(e) => setMonsterFormData({ ...monsterFormData, name: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(212, 193, 156, 0.3)',
                    borderRadius: '0.5rem',
                    color: '#fff',
                    fontSize: '1rem'
                  }}
                  placeholder="Enter monster name"
                />
              </div>

              {/* Description */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ color: '#ccc', fontSize: '0.9rem', marginBottom: '0.5rem', display: 'block' }}>
                  Description
                </label>
                <textarea
                  value={monsterFormData.description}
                  onChange={(e) => setMonsterFormData({ ...monsterFormData, description: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(212, 193, 156, 0.3)',
                    borderRadius: '0.5rem',
                    color: '#fff',
                    fontSize: '0.9rem',
                    minHeight: '80px',
                    resize: 'vertical'
                  }}
                  placeholder="Enter monster description"
                />
              </div>

              {/* Limb Health */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ color: 'var(--text-gold)', fontSize: '0.9rem', marginBottom: '0.5rem', display: 'block', fontWeight: 'bold' }}>
                  Limb Health
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  {Object.entries(monsterFormData.limb_health).map(([limb, value]) => (
                    <div key={limb}>
                      <label style={{ color: '#999', fontSize: '0.8rem', marginBottom: '0.25rem', display: 'block', textTransform: 'capitalize' }}>
                        {limb.replace('_', ' ')}
                      </label>
                      <input
                        type="number"
                        value={value as number}
                        onChange={(e) => setMonsterFormData({
                          ...monsterFormData,
                          limb_health: { ...monsterFormData.limb_health, [limb]: parseInt(e.target.value) || 0 }
                        })}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          background: 'rgba(0, 0, 0, 0.3)',
                          border: '1px solid rgba(212, 193, 156, 0.3)',
                          borderRadius: '0.25rem',
                          color: '#fff',
                          fontSize: '0.9rem'
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Limb AC */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ color: 'var(--text-gold)', fontSize: '0.9rem', marginBottom: '0.5rem', display: 'block', fontWeight: 'bold' }}>
                  Limb Armor Class
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  {Object.entries(monsterFormData.limb_ac).map(([limb, value]) => (
                    <div key={limb}>
                      <label style={{ color: '#999', fontSize: '0.8rem', marginBottom: '0.25rem', display: 'block', textTransform: 'capitalize' }}>
                        {limb.replace('_', ' ')}
                      </label>
                      <input
                        type="number"
                        value={value as number}
                        onChange={(e) => setMonsterFormData({
                          ...monsterFormData,
                          limb_ac: { ...monsterFormData.limb_ac, [limb]: parseInt(e.target.value) || 0 }
                        })}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          background: 'rgba(0, 0, 0, 0.3)',
                          border: '1px solid rgba(212, 193, 156, 0.3)',
                          borderRadius: '0.25rem',
                          color: '#fff',
                          fontSize: '0.9rem'
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Image Upload */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ color: '#ccc', fontSize: '0.9rem', marginBottom: '0.5rem', display: 'block' }}>
                  Monster Image
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setMonsterImageFile(e.target.files[0]);
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(212, 193, 156, 0.3)',
                    borderRadius: '0.5rem',
                    color: '#ccc',
                    fontSize: '0.9rem'
                  }}
                />
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button
                  onClick={async () => {
                    if (!monsterFormData.name.trim()) {
                      alert('Please enter a monster name');
                      return;
                    }
                    try {
                      // Create the monster
                      const newMonster = await monsterAPI.createMonster({
                        campaign_id: currentCampaign?.campaign.id,
                        ...monsterFormData
                      });

                      // Upload image if provided
                      if (monsterImageFile) {
                        await monsterAPI.uploadMonsterImage(newMonster.id, monsterImageFile);
                      }

                      // Reload monsters
                      const updated = await monsterAPI.getCampaignMonsters(currentCampaign!.campaign.id);
                      setMonsters(updated);

                      // Reset form and close
                      setMonsterFormData({
                        name: '',
                        description: '',
                        limb_health: { head: 10, chest: 30, left_arm: 15, right_arm: 15, left_leg: 20, right_leg: 20 },
                        limb_ac: { head: 10, chest: 12, left_arm: 10, right_arm: 10, left_leg: 10, right_leg: 10 }
                      });
                      setMonsterImageFile(null);
                      setShowAddMonsterModal(false);
                    } catch (error) {
                      console.error('Error creating monster:', error);
                      alert('Failed to create monster');
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '0.75rem 1.5rem',
                    background: 'linear-gradient(135deg, #61c961, #5ab85a)',
                    border: '2px solid #4a4',
                    borderRadius: '0.5rem',
                    color: '#000',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    fontSize: '1rem'
                  }}
                >
                  ✓ Create Monster
                </button>
                <button
                  onClick={() => {
                    setMonsterFormData({
                      name: '',
                      description: '',
                      limb_health: { head: 10, chest: 30, left_arm: 15, right_arm: 15, left_leg: 20, right_leg: 20 },
                      limb_ac: { head: 10, chest: 12, left_arm: 10, right_arm: 10, left_leg: 10, right_leg: 10 }
                    });
                    setMonsterImageFile(null);
                    setShowAddMonsterModal(false);
                  }}
                  style={{
                    flex: 1,
                    padding: '0.75rem 1.5rem',
                    background: 'rgba(100, 100, 100, 0.3)',
                    border: '1px solid #666',
                    borderRadius: '0.5rem',
                    color: '#ccc',
                    cursor: 'pointer',
                    fontSize: '1rem'
                  }}
                >
                  ✗ Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Image Viewer Modal */}
        {viewImageModal && (
          <div 
            onClick={() => setViewImageModal(null)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.9)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2000,
              padding: '2rem',
              cursor: 'pointer'
            }}
          >
            <div 
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'relative',
                maxWidth: '90vw',
                maxHeight: '90vh',
                cursor: 'default'
              }}
            >
              {/* Close button */}
              <button
                onClick={() => setViewImageModal(null)}
                style={{
                  position: 'absolute',
                  top: '-3rem',
                  right: 0,
                  padding: '0.75rem 1.5rem',
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  borderRadius: '0.5rem',
                  color: '#fff',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                  e.currentTarget.style.borderColor = '#fff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                }}
              >
                ✕ Close
              </button>

              {/* Monster name */}
              <div style={{
                position: 'absolute',
                top: '-3rem',
                left: 0,
                color: 'var(--text-gold)',
                fontSize: '1.5rem',
                fontWeight: 'bold',
                textShadow: '0 2px 4px rgba(0, 0, 0, 0.8)'
              }}>
                {viewImageModal.name}
              </div>

              {/* Image */}
              <img
                src={viewImageModal.imageUrl}
                alt={viewImageModal.name}
                style={{
                  maxWidth: '100%',
                  maxHeight: '90vh',
                  borderRadius: '0.75rem',
                  border: '3px solid var(--text-gold)',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8)'
                }}
              />
            </div>
          </div>
        )}

        {/* Add Army Modal */}
        {showAddArmyModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000
          }}>
            <div style={{
              background: 'linear-gradient(135deg, rgba(26, 26, 26, 0.98) 0%, rgba(17, 17, 17, 0.98) 100%)',
              borderRadius: '16px',
              padding: '2rem',
              maxWidth: '500px',
              width: '90%',
              border: '2px solid rgba(212, 193, 156, 0.3)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)'
            }}>
              <h3 style={{ color: 'var(--text-gold)', marginBottom: '1.5rem', textAlign: 'center' }}>
                ⚔️ Create New Army
              </h3>

              {/* Army Name */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Army Name *
                </label>
                <input
                  type="text"
                  value={newArmyData.name || ''}
                  onChange={(e) => setNewArmyData({ ...newArmyData, name: e.target.value })}
                  placeholder="e.g., King's Elite Guard, Red Banner Legion"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(212, 193, 156, 0.3)',
                    borderRadius: '0.5rem',
                    color: 'white',
                    fontSize: '1rem'
                  }}
                />
              </div>

              {/* Army Category */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-gold)', fontSize: '0.95rem' }}>
                  Army Type *
                </label>
                <select
                  value={newArmyData.category || 'Swordsmen'}
                  onChange={(e) => {
                    const presets = getArmyCategoryPresets(e.target.value);
                    setNewArmyData({ ...newArmyData, category: e.target.value, ...presets });
                  }}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'rgba(0, 0, 0, 0.6)',
                    border: '1px solid rgba(212, 193, 156, 0.3)',
                    borderRadius: '0.5rem',
                    color: 'white',
                    fontSize: '1rem',
                    cursor: 'pointer'
                  }}
                  className="army-category-select"
                >
                  {Object.entries(ARMY_CATEGORIES).map(([groupName, categories]) => (
                    <optgroup key={groupName} label={groupName} style={{ background: '#1a1a1a', color: 'var(--text-gold)' }}>
                      {categories.map((category) => (
                        <option key={category} value={category} style={{ background: '#1a1a1a', color: 'white', padding: '0.5rem' }}>
                          {getArmyCategoryIcon(category)} {category}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem', fontStyle: 'italic' }}>
                  Stats are prefilled based on army type, but you can customize them below
                </div>
              </div>

              {/* Army Stats (all default to 5) */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.75rem', color: 'var(--text-gold)', fontSize: '0.95rem' }}>
                  Troop Count
                </label>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', fontStyle: 'italic' }}>
                  Numbers stat will be auto-calculated: 1-20=1, 21-50=2, 51-100=3, 101-200=4, 201-400=5, 401-800=6, 801-1600=7, 1601-3200=8, 3201-6400=9, 6400+=10
                </div>
                <input
                  type="number"
                  min="1"
                  max="100000"
                  value={newArmyData.total_troops || 100}
                  onChange={(e) => setNewArmyData({ ...newArmyData, total_troops: parseInt(e.target.value) || 100 })}
                  placeholder="Number of troops"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(212, 193, 156, 0.3)',
                    borderRadius: '0.5rem',
                    color: 'white',
                    fontSize: '1rem',
                    marginBottom: '1.5rem'
                  }}
                />
                
                <label style={{ display: 'block', marginBottom: '0.75rem', color: 'var(--text-gold)', fontSize: '0.95rem' }}>
                  Initial Stats (1-10, default: 5)
                </label>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem', fontStyle: 'italic' }}>
                  You can adjust these stats after creation using the +/- buttons
                </div>
                {[
                  { key: 'equipment', label: 'Equipment', icon: '⚔️' },
                  { key: 'discipline', label: 'Discipline', icon: '🛡️' },
                  { key: 'morale', label: 'Morale', icon: '💪' },
                  { key: 'command', label: 'Command', icon: '👑' },
                  { key: 'logistics', label: 'Logistics', icon: '📦' }
                ].map((stat) => (
                  <div key={stat.key} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '1.1rem', width: '24px' }}>{stat.icon}</span>
                    <span style={{ flex: 1, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{stat.label}</span>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      value={newArmyData[stat.key as keyof typeof newArmyData] as number || 5}
                      onChange={(e) => setNewArmyData({ ...newArmyData, [stat.key]: parseInt(e.target.value) })}
                      style={{ flex: 2 }}
                    />
                    <span style={{ 
                      width: '32px', 
                      textAlign: 'center', 
                      fontWeight: 'bold', 
                      color: 'var(--text-gold)' 
                    }}>
                      {newArmyData[stat.key as keyof typeof newArmyData] || 5}
                    </span>
                  </div>
                ))}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    setShowAddArmyModal(false);
                    setNewArmyData({
                      name: '',
                      category: 'Swordsmen',
                      total_troops: 100,
                      equipment: 5,
                      discipline: 5,
                      morale: 5,
                      command: 5,
                      logistics: 5
                    });
                  }}
                  className="btn btn-secondary"
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(212, 193, 156, 0.3)',
                    borderRadius: '0.5rem',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!newArmyData.name || !selectedCharacter || !currentCampaign) {
                      alert('Please enter an army name');
                      return;
                    }

                    const character = currentCampaign.characters.find(c => c.id === selectedCharacter);
                    if (!character) return;

                    try {
                      const createdArmy = await armyAPI.createArmy({
                        ...newArmyData,
                        player_id: character.player_id,
                        campaign_id: currentCampaign.campaign.id
                      });
                      
                      setArmies([...armies, { ...createdArmy, battle_history: [] }]);
                      setShowAddArmyModal(false);
                      setNewArmyData({
                        name: '',
                        category: 'Swordsmen',
                        total_troops: 100,
                        equipment: 5,
                        discipline: 5,
                        morale: 5,
                        command: 5,
                        logistics: 5
                      });
                      setToastMessage(`Army "${createdArmy.name}" created!`);
                      setTimeout(() => setToastMessage(null), 3000);
                    } catch (error) {
                      console.error('Error creating army:', error);
                      alert('Failed to create army');
                    }
                  }}
                  className="btn btn-primary"
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.3), rgba(22, 163, 74, 0.3))',
                    border: '2px solid rgba(34, 197, 94, 0.5)',
                    borderRadius: '0.5rem',
                    color: '#4ade80',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  ✓ Create Army
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Battle Setup Modal */}
        {showBattleSetupModal && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.85)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}
            onClick={() => setShowBattleSetupModal(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: 'linear-gradient(135deg, rgba(26, 26, 46, 0.98), rgba(35, 35, 60, 0.98))',
                border: '2px solid var(--border-gold)',
                borderRadius: '1rem',
                padding: '2rem',
                width: '90%',
                maxWidth: '600px',
                maxHeight: '80vh',
                overflowY: 'auto',
                boxShadow: '0 8px 32px rgba(212, 193, 156, 0.3)'
              }}
            >
              <h2 style={{ 
                marginTop: 0, 
                marginBottom: '1.5rem', 
                color: 'var(--text-gold)',
                fontSize: '1.75rem',
                textAlign: 'center',
                borderBottom: '2px solid var(--border-gold)',
                paddingBottom: '0.75rem'
              }}>
                ⚔️ Create New Battle
              </h2>

              {/* Battle Name */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-gold)', fontSize: '0.95rem' }}>
                  Battle Name *
                </label>
                <input
                  type="text"
                  value={newBattleData.name}
                  onChange={(e) => setNewBattleData({ ...newBattleData, name: e.target.value })}
                  placeholder="e.g., Siege of Ironhold, Battle of the Blood Plains"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid rgba(212, 193, 156, 0.3)',
                    borderRadius: '0.5rem',
                    color: 'white',
                    fontSize: '1rem'
                  }}
                />
              </div>

              {/* Terrain Description */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-gold)', fontSize: '0.95rem' }}>
                  Terrain Description
                </label>
                <textarea
                  value={newBattleData.terrain_description}
                  onChange={(e) => setNewBattleData({ ...newBattleData, terrain_description: e.target.value })}
                  placeholder="Describe the battlefield: fortifications, weather, obstacles, tactical advantages..."
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid rgba(212, 193, 156, 0.3)',
                    borderRadius: '0.5rem',
                    color: 'white',
                    fontSize: '0.95rem',
                    resize: 'vertical',
                    fontFamily: 'inherit'
                  }}
                />
              </div>

              {/* Total Rounds */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-gold)', fontSize: '0.95rem' }}>
                  Number of Rounds *
                </label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={newBattleData.total_rounds}
                  onChange={(e) => setNewBattleData({ ...newBattleData, total_rounds: parseInt(e.target.value) || 5 })}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid rgba(212, 193, 156, 0.3)',
                    borderRadius: '0.5rem',
                    color: 'white',
                    fontSize: '1rem'
                  }}
                />
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem', fontStyle: 'italic' }}>
                  Each round, teams select goals and engage in combat. Default is 5 rounds.
                </div>
              </div>

              {/* Info Box */}
              <div style={{ 
                background: 'rgba(59, 130, 246, 0.1)', 
                border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: '0.5rem',
                padding: '1rem',
                marginBottom: '1.5rem',
                fontSize: '0.85rem',
                color: 'var(--text-secondary)'
              }}>
                <div style={{ color: '#60a5fa', fontWeight: 'bold', marginBottom: '0.5rem' }}>ℹ️ Battle Flow</div>
                <div>1. <strong>Planning Phase:</strong> Add participants and set up teams</div>
                <div>2. <strong>Goal Selection:</strong> Each team picks 1 goal per round</div>
                <div>3. <strong>Resolution:</strong> Roll dice, apply modifiers, DM judges outcomes</div>
                <div>4. <strong>Completion:</strong> Final scores determine winner, history saved</div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    setShowBattleSetupModal(false);
                    setNewBattleData({
                      name: '',
                      terrain_description: '',
                      total_rounds: 5
                    });
                  }}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: 'rgba(100, 100, 120, 0.3)',
                    border: '1px solid rgba(150, 150, 170, 0.5)',
                    borderRadius: '0.5rem',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateBattle}
                  disabled={!newBattleData.name.trim()}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: newBattleData.name.trim() 
                      ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.3), rgba(22, 163, 74, 0.3))'
                      : 'rgba(100, 100, 120, 0.2)',
                    border: newBattleData.name.trim()
                      ? '2px solid rgba(34, 197, 94, 0.5)'
                      : '1px solid rgba(100, 100, 120, 0.3)',
                    borderRadius: '0.5rem',
                    color: newBattleData.name.trim() ? '#4ade80' : 'rgba(255, 255, 255, 0.3)',
                    fontWeight: 'bold',
                    cursor: newBattleData.name.trim() ? 'pointer' : 'not-allowed'
                  }}
                >
                  ⚔️ Create Battle
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Army Selection Modal - Step 1: Choose which army will perform the goal */}
        {showArmySelectionModal && activeBattle && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.85)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}
            onClick={() => {
              setShowArmySelectionModal(false);
              setSelectedGoalExecutor(null);
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: 'linear-gradient(135deg, rgba(26, 26, 46, 0.98), rgba(35, 35, 60, 0.98))',
                border: '2px solid var(--border-gold)',
                borderRadius: '1rem',
                padding: '2rem',
                width: '90%',
                maxWidth: '600px',
                maxHeight: '90vh',
                overflowY: 'auto',
                boxShadow: '0 8px 32px rgba(212, 193, 156, 0.3)'
              }}
            >
              <h2 style={{
                marginTop: 0,
                marginBottom: '1.5rem',
                color: 'var(--text-gold)',
                fontSize: '1.5rem',
                textAlign: 'center',
                borderBottom: '2px solid var(--border-gold)',
                paddingBottom: '0.75rem'
              }}>
                ⚔️ Select Army to Execute Goal
              </h2>

              <div style={{
                padding: '1rem',
                background: 'rgba(168, 85, 247, 0.1)',
                border: '1px solid rgba(168, 85, 247, 0.3)',
                borderRadius: '0.5rem',
                marginBottom: '1.5rem',
                fontSize: '0.85rem',
                color: 'var(--text-secondary)'
              }}>
                <strong style={{ color: '#a78bfa' }}>Step 1 of 2:</strong> Choose which army from your team will perform the goal. Goal modifiers will be calculated using this army's stats and its commander's abilities.
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.75rem', color: 'var(--text-gold)', fontSize: '0.95rem' }}>
                  Select Your Army *
                </label>
                <div style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(212, 193, 156, 0.3)',
                  borderRadius: '0.5rem',
                  padding: '0.75rem',
                  maxHeight: '400px',
                  overflowY: 'auto'
                }}>
                  {(() => {
                    const teams = activeBattle.participants?.reduce((acc, p) => {
                      if (!acc[p.team_name]) {
                        acc[p.team_name] = {
                          name: p.team_name,
                          color: p.faction_color || '#808080',
                          has_selected: p.has_selected_goal || false,
                          participants: []
                        };
                      }
                      acc[p.team_name].participants.push(p);
                      return acc;
                    }, {} as Record<string, {name: string; color: string; has_selected: boolean; participants: any[]}>);

                    // Get teams the user can control
                    let availableTeam: any = null;
                    const isDM = user?.role === 'Dungeon Master';
                    
                    if (isDM && selectedFactionForGoal) {
                      // DM has selected a specific faction
                      availableTeam = teams ? teams[selectedFactionForGoal] : null;
                    } else if (isDM) {
                      // DM hasn't selected yet, get first unselected NPC team
                      const unselectedTeams = teams ? Object.values(teams).filter(t => 
                        !t.has_selected && t.participants.every(p => !p.user_id || p.is_temporary)
                      ) : [];
                      availableTeam = unselectedTeams.length > 0 ? unselectedTeams[0] : null;
                      if (availableTeam) {
                        setSelectedFactionForGoal(availableTeam.name);
                      }
                    } else {
                      // Player - find their unselected team
                      const userTeams = teams ? Object.values(teams).filter(t => 
                        !t.has_selected && t.participants.some(p => p.user_id === user?.id)
                      ) : [];
                      availableTeam = userTeams.length > 0 ? userTeams[0] : null;
                    }

                    if (!availableTeam) return <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>No team available</div>;

                    const teamArmies = availableTeam.participants;

                    return teamArmies.map((participant: any) => {
                      // Get army category for icon
                      let armyCategory = 'Swordsmen';
                      if (participant.is_temporary && participant.temp_army_category) {
                        armyCategory = participant.temp_army_category;
                      } else if (participant.army_id) {
                        const army = armies.find(a => a.id === participant.army_id);
                        if (army) armyCategory = army.category;
                      }

                      return (
                        <label
                          key={participant.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            padding: '1rem',
                            background: selectedGoalExecutor === participant.id
                              ? 'rgba(168, 85, 247, 0.2)'
                              : 'transparent',
                            border: selectedGoalExecutor === participant.id
                              ? '2px solid rgba(168, 85, 247, 0.4)'
                              : '1px solid rgba(212, 193, 156, 0.2)',
                            borderRadius: '0.5rem',
                            marginBottom: '0.75rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            if (selectedGoalExecutor !== participant.id) {
                              e.currentTarget.style.background = 'rgba(212, 193, 156, 0.1)';
                              e.currentTarget.style.borderColor = 'rgba(212, 193, 156, 0.4)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (selectedGoalExecutor !== participant.id) {
                              e.currentTarget.style.background = 'transparent';
                              e.currentTarget.style.borderColor = 'rgba(212, 193, 156, 0.2)';
                            }
                          }}
                        >
                          <input
                            type="radio"
                            name="executor"
                            checked={selectedGoalExecutor === participant.id}
                            onChange={() => setSelectedGoalExecutor(participant.id)}
                            style={{ cursor: 'pointer' }}
                          />
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                              <span style={{ fontSize: '1.2rem' }}>{getArmyCategoryIcon(armyCategory)}</span>
                              <div style={{ color: 'white', fontWeight: 'bold', fontSize: '1rem' }}>
                                {participant.temp_army_name || participant.army_name || 'Unknown Army'}
                              </div>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              Category: {armyCategory}
                              {participant.current_troops !== undefined && (
                                <span style={{ marginLeft: '0.5rem', color: '#4ade80' }}>
                                  | 👥 {participant.current_troops.toLocaleString()} troops
                                </span>
                              )}
                              <span style={{ marginLeft: '0.5rem', color: '#60a5fa' }}>
                                | Score: {participant.current_score}
                              </span>
                            </div>
                          </div>
                        </label>
                      );
                    });
                  })()}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    setShowArmySelectionModal(false);
                    setSelectedGoalExecutor(null);
                  }}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: 'rgba(100, 100, 120, 0.3)',
                    border: '1px solid rgba(150, 150, 170, 0.5)',
                    borderRadius: '0.5rem',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (!selectedGoalExecutor) {
                      alert('Please select an army');
                      return;
                    }
                    setShowArmySelectionModal(false);
                    // Goals will now be shown with this army's modifiers
                  }}
                  disabled={!selectedGoalExecutor}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: selectedGoalExecutor
                      ? 'linear-gradient(135deg, rgba(168, 85, 247, 0.3), rgba(124, 58, 237, 0.3))'
                      : 'rgba(100, 100, 120, 0.2)',
                    border: selectedGoalExecutor
                      ? '2px solid rgba(168, 85, 247, 0.5)'
                      : '1px solid rgba(100, 100, 120, 0.3)',
                    borderRadius: '0.5rem',
                    color: selectedGoalExecutor ? '#a78bfa' : 'rgba(255, 255, 255, 0.3)',
                    fontWeight: 'bold',
                    cursor: selectedGoalExecutor ? 'pointer' : 'not-allowed'
                  }}
                >
                  ✓ Continue to Goal Selection
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Goal Confirmation Modal */}
        {showGoalConfirmModal && selectedGoal && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.85)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}
            onClick={() => {
              // Don't close modal on background click - user needs to select target
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: 'linear-gradient(135deg, rgba(26, 26, 46, 0.98), rgba(35, 35, 60, 0.98))',
                border: '2px solid var(--border-gold)',
                borderRadius: '1rem',
                padding: '2rem',
                width: '90%',
                maxWidth: '600px',
                maxHeight: '90vh',
                overflowY: 'auto',
                boxShadow: '0 8px 32px rgba(212, 193, 156, 0.3)'
              }}
            >
              <h2 style={{
                marginTop: 0,
                marginBottom: '1.5rem',
                color: 'var(--text-gold)',
                fontSize: '1.5rem',
                textAlign: 'center',
                borderBottom: '2px solid var(--border-gold)',
                paddingBottom: '0.75rem'
              }}>
                🎯 Confirm Goal Selection
              </h2>

              <div style={{
                padding: '1.5rem',
                background: 'rgba(212, 193, 156, 0.1)',
                border: '2px solid rgba(212, 193, 156, 0.3)',
                borderRadius: '0.75rem',
                marginBottom: '1.5rem'
              }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--text-gold)', marginBottom: '0.75rem' }}>
                  {selectedGoal.name}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem', fontStyle: 'italic' }}>
                  {selectedGoal.description}
                </div>

                {selectedGoal.requires_combat && (
                  <div style={{
                    padding: '0.75rem',
                    background: 'rgba(168, 85, 247, 0.2)',
                    border: '2px solid rgba(168, 85, 247, 0.5)',
                    borderRadius: '0.5rem',
                    marginBottom: '1rem'
                  }}>
                    <div style={{ fontSize: '0.85rem', color: '#a855f7', fontWeight: 'bold' }}>
                      🎮 <strong>REQUIRES PLAYER COMBAT!</strong>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#c4b5fd', marginTop: '0.5rem' }}>
                      Players must fight in the Combat Area. DM will mark victory or defeat after combat concludes.
                    </div>
                  </div>
                )}

                <div style={{ fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                  <strong style={{ color: 'var(--text-gold)' }}>Test:</strong>{' '}
                  <span style={{ color: 'white' }}>
                    {selectedGoal.test_type}
                    {selectedGoal.army_stat && ` + ${selectedGoal.army_stat.charAt(0).toUpperCase() + selectedGoal.army_stat.slice(1)}`}
                  </span>
                </div>

                <div style={{
                  padding: '0.75rem',
                  background: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  borderRadius: '0.5rem',
                  marginBottom: '0.5rem'
                }}>
                  <div style={{ fontSize: '0.75rem', color: '#4ade80' }}>
                    ✓ <strong>Success:</strong> {selectedGoal.reward}
                  </div>
                </div>

                <div style={{
                  padding: '0.75rem',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '0.5rem'
                }}>
                  <div style={{ fontSize: '0.75rem', color: '#f87171' }}>
                    ✗ <strong>Failure:</strong> {selectedGoal.fail}
                  </div>
                </div>
              </div>

              {/* Target Selection - Show for both enemy and ally targets */}
              {activeBattle && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.75rem', color: 'var(--text-gold)', fontSize: '0.95rem' }}>
                    Select Target Army {selectedGoal.targets_enemy && '*'}
                  </label>
                  <div style={{
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(212, 193, 156, 0.3)',
                    borderRadius: '0.5rem',
                    padding: '0.75rem',
                    maxHeight: '200px',
                    overflowY: 'auto'
                  }}>
                    {(() => {
                      // Find the executor's team (the participant who is selecting this goal)
                      const executorParticipant = activeBattle.participants?.find(p => p.id === selectedGoalExecutor);
                      const executorTeam = executorParticipant?.team_name;
                      
                      // For enemy-targeting goals, show only enemies. For ally goals, show all participants
                      const targetParticipants = selectedGoal.targets_enemy
                        ? activeBattle.participants?.filter(p => executorTeam && p.team_name !== executorTeam) || []
                        : activeBattle.participants || [];
                      
                      return targetParticipants.map(participant => {
                        const isAlly = executorTeam && participant.team_name === executorTeam;
                        const isSelf = participant.id === selectedGoalExecutor;
                        
                        return (
                          <label
                            key={participant.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.75rem',
                              padding: '0.75rem',
                              background: selectedTargetParticipant === participant.id
                                ? (selectedGoal.targets_enemy ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)')
                                : 'transparent',
                              border: selectedTargetParticipant === participant.id
                                ? (selectedGoal.targets_enemy ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(34, 197, 94, 0.4)')
                                : '1px solid transparent',
                              borderRadius: '0.5rem',
                              marginBottom: '0.5rem',
                              cursor: 'pointer'
                            }}
                          >
                            <input
                              type="radio"
                              name="target"
                              checked={selectedTargetParticipant === participant.id}
                              onChange={() => setSelectedTargetParticipant(participant.id)}
                              style={{ cursor: 'pointer' }}
                            />
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div style={{ color: 'white', fontWeight: 'bold' }}>
                                  {participant.temp_army_name || participant.army_name || 'Unknown Army'}
                                </div>
                                {isSelf && (
                                  <span style={{
                                    fontSize: '0.7rem',
                                    padding: '0.15rem 0.4rem',
                                    background: 'rgba(96, 165, 250, 0.3)',
                                    border: '1px solid rgba(96, 165, 250, 0.5)',
                                    borderRadius: '0.25rem',
                                    color: '#60a5fa'
                                  }}>
                                    YOU
                                  </span>
                                )}
                                {!isSelf && isAlly && (
                                  <span style={{
                                    fontSize: '0.7rem',
                                    padding: '0.15rem 0.4rem',
                                    background: 'rgba(34, 197, 94, 0.3)',
                                    border: '1px solid rgba(34, 197, 94, 0.5)',
                                    borderRadius: '0.25rem',
                                    color: '#4ade80'
                                  }}>
                                    ALLY
                                  </span>
                                )}
                                {!isAlly && (
                                  <span style={{
                                    fontSize: '0.7rem',
                                    padding: '0.15rem 0.4rem',
                                    background: 'rgba(239, 68, 68, 0.3)',
                                    border: '1px solid rgba(239, 68, 68, 0.5)',
                                    borderRadius: '0.25rem',
                                    color: '#f87171'
                                  }}>
                                    ENEMY
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                Team {participant.team_name} | Score: {participant.current_score}
                                {participant.current_troops !== undefined && (
                                  <span style={{ marginLeft: '0.5rem', color: participant.current_troops < (participant.army_total_troops || 0) * 0.5 ? '#ef4444' : '#4ade80', fontWeight: 'bold' }}>
                                    | 👥 {participant.current_troops.toLocaleString()}
                                  </span>
                                )}
                              </div>
                            </div>
                          </label>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    setShowGoalConfirmModal(false);
                    setSelectedGoal(null);
                    setSelectedTargetParticipant(null);
                  }}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: 'rgba(100, 100, 120, 0.3)',
                    border: '1px solid rgba(150, 150, 170, 0.5)',
                    borderRadius: '0.5rem',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!activeBattle || !currentCampaign) return;
                    if (!selectedGoalExecutor) {
                      alert('No army selected. Please go back and select an army.');
                      return;
                    }
                    if (selectedGoal.targets_enemy && !selectedTargetParticipant) {
                      alert('Please select a target army');
                      return;
                    }

                    try {
                      // Find the executor participant
                      const executorParticipant = activeBattle.participants?.find(p => p.id === selectedGoalExecutor);
                      
                      if (!executorParticipant) {
                        alert('Selected executor not found');
                        return;
                      }

                      // Get army stats - either from temp_army_stats (custom army) or from armies array (regular army)
                      let armyStats;
                      if (executorParticipant.is_temporary && executorParticipant.temp_army_stats) {
                        // Custom/temporary army - use temp_army_stats
                        armyStats = executorParticipant.temp_army_stats;
                        // Calculate numbers stat from troop count for temporary armies
                        if (selectedGoal.army_stat === 'numbers' && executorParticipant.current_troops !== undefined) {
                          const troopCount = executorParticipant.current_troops;
                          let numbersStat = 1;
                          if (troopCount <= 20) numbersStat = 1;
                          else if (troopCount <= 50) numbersStat = 2;
                          else if (troopCount <= 100) numbersStat = 3;
                          else if (troopCount <= 200) numbersStat = 4;
                          else if (troopCount <= 400) numbersStat = 5;
                          else if (troopCount <= 800) numbersStat = 6;
                          else if (troopCount <= 1600) numbersStat = 7;
                          else if (troopCount <= 3200) numbersStat = 8;
                          else if (troopCount <= 6400) numbersStat = 9;
                          else numbersStat = 10;
                          armyStats = { ...armyStats, numbers: numbersStat };
                        }
                      } else {
                        // Regular army - find in armies array
                        const participantArmy = armies.find(a => a.id === executorParticipant.army_id);
                        if (!participantArmy) {
                          alert('Army data not found. Please contact the Dungeon Master.');
                          return;
                        }
                        armyStats = {
                          numbers: participantArmy.numbers,
                          equipment: participantArmy.equipment,
                          discipline: participantArmy.discipline,
                          morale: participantArmy.morale,
                          command: participantArmy.command,
                          logistics: participantArmy.logistics
                        };
                      }

                      // Calculate modifiers
                      let characterModifier = 0;
                      
                      // If goal uses character stat, get it from character abilities
                      if (selectedGoal.uses_character_stat) {
                        if (executorParticipant.character_abilities) {
                          // Parse if it's a string
                          const abilities = typeof executorParticipant.character_abilities === 'string' 
                            ? JSON.parse(executorParticipant.character_abilities)
                            : executorParticipant.character_abilities;
                          
                          const testType = selectedGoal.test_type.toLowerCase(); // 'CHA', 'STR', etc.
                          
                          // Map test type to ability score
                          const abilityScore = abilities[testType] || 10; // Default to 10 if not found
                          
                          // Calculate D&D 5e ability modifier: (score - 10) / 2, rounded down
                          characterModifier = Math.floor((abilityScore - 10) / 2);
                        } else {
                          // No character linked (AI army or temp army), use neutral modifier
                          characterModifier = 0;
                        }
                      }
                      
                      const armyStatValue = selectedGoal.army_stat ? (armyStats[selectedGoal.army_stat as keyof typeof armyStats] || 5) : 5; // Default to 5 if stat not found
                      const armyStatModifier = selectedGoal.uses_army_stat ? (armyStatValue - 5) : 0; // Only apply if goal uses army stat

                      await battleAPI.setGoal(activeBattle.id, {
                        round_number: activeBattle.current_round,
                        participant_id: executorParticipant.id,
                        goal_name: selectedGoal.name,
                        target_participant_id: selectedTargetParticipant,
                        test_type: selectedGoal.test_type,
                        character_modifier: characterModifier,
                        army_stat_modifier: armyStatModifier
                      });

                      // Emit socket event that this team has selected
                      if (socket) {
                        socket.emit('teamGoalSelected', {
                          campaignId: currentCampaign.campaign.id,
                          battleId: activeBattle.id,
                          teamName: executorParticipant.team_name
                        });
                      }

                      const updated = await battleAPI.getBattle(activeBattle.id);
                      setActiveBattle(updated);

                      setShowGoalConfirmModal(false);
                      setSelectedGoal(null);
                      setSelectedTargetParticipant(null);
                      setSelectedGoalExecutor(null);
                      setSelectedFactionForGoal(null);

                      setToastMessage(`Goal "${selectedGoal.name}" selected!`);
                      setTimeout(() => setToastMessage(null), 3000);
                    } catch (error) {
                      console.error('Error selecting goal:', error);
                      alert('Failed to select goal');
                    }
                  }}
                  disabled={selectedGoal.targets_enemy && !selectedTargetParticipant}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: (!selectedGoal.targets_enemy || selectedTargetParticipant)
                      ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.3), rgba(22, 163, 74, 0.3))'
                      : 'rgba(100, 100, 120, 0.2)',
                    border: (!selectedGoal.targets_enemy || selectedTargetParticipant)
                      ? '2px solid rgba(34, 197, 94, 0.5)'
                      : '1px solid rgba(100, 100, 120, 0.3)',
                    borderRadius: '0.5rem',
                    color: (!selectedGoal.targets_enemy || selectedTargetParticipant) ? '#4ade80' : 'rgba(255, 255, 255, 0.3)',
                    fontWeight: 'bold',
                    cursor: (!selectedGoal.targets_enemy || selectedTargetParticipant) ? 'pointer' : 'not-allowed'
                  }}
                >
                  ✓ Confirm Goal
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add AI Army Modal (DM only) */}
        {showAddParticipantModal && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.85)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}
            onClick={() => setShowAddParticipantModal(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: 'linear-gradient(135deg, rgba(26, 26, 46, 0.98), rgba(35, 35, 60, 0.98))',
                border: '2px solid var(--border-gold)',
                borderRadius: '1rem',
                padding: '2rem',
                width: '90%',
                maxWidth: '600px',
                maxHeight: '80vh',
                overflowY: 'auto',
                boxShadow: '0 8px 32px rgba(212, 193, 156, 0.3)'
              }}
            >
              <h2 style={{ 
                marginTop: 0, 
                marginBottom: '1.5rem', 
                color: 'var(--text-gold)',
                fontSize: '1.75rem',
                textAlign: 'center',
                borderBottom: '2px solid var(--border-gold)',
                paddingBottom: '0.75rem'
              }}>
                🎭 Add AI/Temporary Army
              </h2>

              <div style={{
                padding: '1rem',
                background: 'rgba(168, 85, 247, 0.1)',
                border: '1px solid rgba(168, 85, 247, 0.3)',
                borderRadius: '0.5rem',
                marginBottom: '1.5rem',
                fontSize: '0.85rem',
                color: 'var(--text-secondary)'
              }}>
                <strong style={{ color: '#a78bfa' }}>Note:</strong> This creates a temporary enemy army controlled by the DM. It will not be saved after the battle ends.
              </div>

              {/* Team/Faction Configuration */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.75rem', color: 'var(--text-gold)', fontSize: '0.95rem' }}>
                  Team/Faction Name *
                </label>
                <input
                  type="text"
                  value={newParticipantData.team}
                  onChange={(e) => setNewParticipantData({ ...newParticipantData, team: e.target.value })}
                  placeholder="e.g., Enemies, Monsters, Team Red..."
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid rgba(212, 193, 156, 0.3)',
                    borderRadius: '0.5rem',
                    color: 'white',
                    fontSize: '1rem',
                    marginBottom: '0.75rem'
                  }}
                />
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-gold)', fontSize: '0.95rem' }}>
                  Faction Color *
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                  {['#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b', '#059669'].map(color => (
                    <button
                      key={color}
                      onClick={() => setNewParticipantData({ ...newParticipantData, faction_color: color })}
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '0.5rem',
                        background: color,
                        border: newParticipantData.faction_color === color ? '3px solid white' : '1px solid rgba(255,255,255,0.3)',
                        cursor: 'pointer',
                        boxShadow: newParticipantData.faction_color === color ? '0 0 10px rgba(255,255,255,0.5)' : 'none'
                      }}
                    />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <label style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Custom:</label>
                  <input
                    type="color"
                    value={newParticipantData.faction_color}
                    onChange={(e) => setNewParticipantData({ ...newParticipantData, faction_color: e.target.value })}
                    style={{
                      width: '60px',
                      height: '35px',
                      border: '1px solid rgba(212, 193, 156, 0.3)',
                      borderRadius: '0.5rem',
                      cursor: 'pointer',
                      background: 'transparent'
                    }}
                  />
                </div>
              </div>

              {/* Temporary DM Army Creation */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-gold)', fontSize: '0.95rem' }}>
                  Army Name *
                </label>
                    <input
                      type="text"
                      value={newParticipantData.tempArmyName}
                      onChange={(e) => setNewParticipantData({ ...newParticipantData, tempArmyName: e.target.value })}
                      placeholder="e.g., Goblin Horde, Royal Guard"
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        background: 'rgba(0, 0, 0, 0.4)',
                        border: '1px solid rgba(212, 193, 156, 0.3)',
                        borderRadius: '0.5rem',
                        color: 'white',
                        fontSize: '1rem'
                      }}
                    />
                  </div>

              {/* Army Category */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-gold)', fontSize: '0.95rem' }}>
                  Army Type *
                </label>
                <select
                  value={newParticipantData.tempArmyCategory || 'Swordsmen'}
                  onChange={(e) => {
                    const presets = getArmyCategoryPresets(e.target.value);
                    setNewParticipantData({ 
                      ...newParticipantData, 
                      tempArmyCategory: e.target.value,
                      tempArmyStats: presets
                    });
                  }}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'rgba(0, 0, 0, 0.6)',
                    border: '1px solid rgba(212, 193, 156, 0.3)',
                    borderRadius: '0.5rem',
                    color: 'white',
                    fontSize: '1rem',
                    cursor: 'pointer'
                  }}
                  className="army-category-select"
                >
                  {Object.entries(ARMY_CATEGORIES).map(([groupName, categories]) => (
                    <optgroup key={groupName} label={groupName} style={{ background: '#1a1a1a', color: 'var(--text-gold)' }}>
                      {categories.map((category) => (
                        <option key={category} value={category} style={{ background: '#1a1a1a', color: 'white', padding: '0.5rem' }}>
                          {getArmyCategoryIcon(category)} {category}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem', fontStyle: 'italic' }}>
                  Stats are prefilled based on army type, but you can customize them below
                </div>
              </div>

                  <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.75rem', color: 'var(--text-gold)', fontSize: '0.95rem' }}>
                      Troop Count
                    </label>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', fontStyle: 'italic' }}>
                      Numbers stat will be auto-calculated from troop count
                    </div>
                    <input
                      type="number"
                      min="1"
                      max="100000"
                      value={newParticipantData.tempArmyTroops || 100}
                      onChange={(e) => setNewParticipantData({ ...newParticipantData, tempArmyTroops: parseInt(e.target.value) || 100 })}
                      placeholder="Number of troops"
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        background: 'rgba(0, 0, 0, 0.4)',
                        border: '1px solid rgba(212, 193, 156, 0.3)',
                        borderRadius: '0.5rem',
                        color: 'white',
                        fontSize: '1rem',
                        marginBottom: '1.5rem'
                      }}
                    />
                    
                    <label style={{ display: 'block', marginBottom: '0.75rem', color: 'var(--text-gold)', fontSize: '0.95rem' }}>
                      Temporary Army Stats (1-10, default: 5)
                    </label>
                    {[
                      { key: 'equipment', label: 'Equipment', icon: '⚔️' },
                      { key: 'discipline', label: 'Discipline', icon: '🛡️' },
                      { key: 'morale', label: 'Morale', icon: '💪' },
                      { key: 'command', label: 'Command', icon: '👑' },
                      { key: 'logistics', label: 'Logistics', icon: '📦' }
                    ].map((stat) => (
                      <div key={stat.key} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <span style={{ fontSize: '1.1rem', width: '24px' }}>{stat.icon}</span>
                        <span style={{ flex: 1, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{stat.label}</span>
                        <input
                          type="range"
                          min="1"
                          max="10"
                          value={newParticipantData.tempArmyStats[stat.key as keyof typeof newParticipantData.tempArmyStats]}
                          onChange={(e) => setNewParticipantData({ 
                            ...newParticipantData, 
                            tempArmyStats: {
                              ...newParticipantData.tempArmyStats,
                              [stat.key]: parseInt(e.target.value)
                            }
                          })}
                          style={{ flex: 2 }}
                        />
                        <span style={{ 
                          width: '32px', 
                          textAlign: 'center', 
                          fontWeight: 'bold', 
                          color: 'var(--text-gold)' 
                        }}>
                          {newParticipantData.tempArmyStats[stat.key as keyof typeof newParticipantData.tempArmyStats]}
                        </span>
                      </div>
                    ))}
                  </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    setShowAddParticipantModal(false);
                    setNewParticipantData({
                      type: 'player',
                      team: '',
                      faction_color: '#ef4444',
                      selectedPlayerArmies: [],
                      tempArmyName: '',
                      tempArmyCategory: 'Swordsmen',
                      tempArmyTroops: 100,
                      tempArmyStats: {
                        equipment: 5,
                        discipline: 5,
                        morale: 5,
                        command: 5,
                        logistics: 5
                      }
                    });
                  }}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: 'rgba(100, 100, 120, 0.3)',
                    border: '1px solid rgba(150, 150, 170, 0.5)',
                    borderRadius: '0.5rem',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!activeBattle || !newParticipantData.tempArmyName.trim() || !newParticipantData.team.trim()) return;
                    
                    try {
                      await battleAPI.addParticipant(activeBattle.id, {
                        team_name: newParticipantData.team,
                        faction_color: newParticipantData.faction_color,
                        temp_army_name: newParticipantData.tempArmyName,
                        temp_army_category: newParticipantData.tempArmyCategory,
                        temp_army_troops: newParticipantData.tempArmyTroops,
                        temp_army_stats: newParticipantData.tempArmyStats,
                        is_temporary: true
                      });
                      
                      const updated = await battleAPI.getBattle(activeBattle.id);
                      setActiveBattle(updated);
                      
                      setShowAddParticipantModal(false);
                      setNewParticipantData({
                        type: 'dm',
                        team: '',
                        faction_color: '#ef4444',
                        selectedPlayerArmies: [],
                        tempArmyName: '',
                        tempArmyCategory: 'Swordsmen',
                        tempArmyTroops: 100,
                        tempArmyStats: { equipment: 5, discipline: 5, morale: 5, command: 5, logistics: 5 }
                      });
                      
                      setToastMessage(`AI Army "${newParticipantData.tempArmyName}" added!`);
                      setTimeout(() => setToastMessage(null), 3000);
                    } catch (error) {
                      console.error('Error adding AI army:', error);
                      alert('Failed to add AI army');
                    }
                  }}
                  disabled={!newParticipantData.tempArmyName.trim() || !newParticipantData.team.trim()}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: (newParticipantData.tempArmyName.trim() && newParticipantData.team.trim())
                      ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.3), rgba(22, 163, 74, 0.3))'
                      : 'rgba(100, 100, 120, 0.2)',
                    border: (newParticipantData.tempArmyName.trim() && newParticipantData.team.trim())
                      ? '2px solid rgba(34, 197, 94, 0.5)'
                      : '1px solid rgba(100, 100, 120, 0.3)',
                    borderRadius: '0.5rem',
                    color: (newParticipantData.tempArmyName.trim() && newParticipantData.team.trim()) ? '#4ade80' : 'rgba(255, 255, 255, 0.3)',
                    fontWeight: 'bold',
                    cursor: (newParticipantData.tempArmyName.trim() && newParticipantData.team.trim()) ? 'pointer' : 'not-allowed'
                  }}
                >
                  ✓ Add AI Army
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Invite Players Modal (DM only) */}
        {showInvitePlayersModal && currentCampaign && activeBattle && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.85)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}
            onClick={() => setShowInvitePlayersModal(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: 'linear-gradient(135deg, rgba(26, 26, 46, 0.98), rgba(35, 35, 60, 0.98))',
                border: '2px solid var(--border-gold)',
                borderRadius: '1rem',
                padding: '2rem',
                width: '90%',
                maxWidth: '600px',
                maxHeight: '80vh',
                overflowY: 'auto',
                boxShadow: '0 8px 32px rgba(212, 193, 156, 0.3)'
              }}
            >
              <h2 style={{
                marginTop: 0,
                marginBottom: '1.5rem',
                color: 'var(--text-gold)',
                fontSize: '1.75rem',
                textAlign: 'center',
                borderBottom: '2px solid var(--border-gold)',
                paddingBottom: '0.75rem'
              }}>
                📨 Invite Players to Battle
              </h2>

              <div style={{
                padding: '1rem',
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: '0.5rem',
                marginBottom: '1.5rem',
                fontSize: '0.85rem',
                color: 'var(--text-secondary)'
              }}>
                <strong style={{ color: '#60a5fa' }}>How it works:</strong> Select players to invite. They'll receive a notification and can choose which of their armies to bring into battle.
              </div>

              {/* Team/Faction Configuration */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.75rem', color: 'var(--text-gold)', fontSize: '0.95rem' }}>
                  Team/Faction Name *
                </label>
                <input
                  type="text"
                  value={inviteTeamName}
                  onChange={(e) => setInviteTeamName(e.target.value)}
                  placeholder="e.g., Alliance, Horde, Red Team, Defenders..."
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid rgba(212, 193, 156, 0.3)',
                    borderRadius: '0.5rem',
                    color: 'white',
                    fontSize: '1rem',
                    marginBottom: '0.75rem'
                  }}
                />
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-gold)', fontSize: '0.95rem' }}>
                  Faction Color *
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                  {['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'].map(color => (
                    <button
                      key={color}
                      onClick={() => setInviteTeamColor(color)}
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '0.5rem',
                        background: color,
                        border: inviteTeamColor === color ? '3px solid white' : '1px solid rgba(255,255,255,0.3)',
                        cursor: 'pointer',
                        boxShadow: inviteTeamColor === color ? '0 0 10px rgba(255,255,255,0.5)' : 'none'
                      }}
                    />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <label style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Custom:</label>
                  <input
                    type="color"
                    value={inviteTeamColor}
                    onChange={(e) => setInviteTeamColor(e.target.value)}
                    style={{
                      width: '60px',
                      height: '35px',
                      border: '1px solid rgba(212, 193, 156, 0.3)',
                      borderRadius: '0.5rem',
                      cursor: 'pointer',
                      background: 'transparent'
                    }}
                  />
                  <div style={{
                    padding: '0.5rem 1rem',
                    background: inviteTeamColor,
                    borderRadius: '0.5rem',
                    color: 'white',
                    fontWeight: 'bold',
                    fontSize: '0.9rem',
                    textShadow: '0 1px 2px rgba(0,0,0,0.5)'
                  }}>
                    {inviteTeamName || 'Preview'}
                  </div>
                </div>
              </div>

              {/* Player Selection */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.75rem', color: 'var(--text-gold)', fontSize: '0.95rem' }}>
                  Select Players to Invite *
                </label>
                <div style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(212, 193, 156, 0.3)',
                  borderRadius: '0.5rem',
                  padding: '1rem',
                  maxHeight: '300px',
                  overflowY: 'auto'
                }}>
                  {currentCampaign.characters.length === 0 ? (
                    <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '1rem' }}>
                      No players in this campaign
                    </div>
                  ) : (
                    currentCampaign.characters
                      .filter((char, index, self) => 
                        index === self.findIndex(c => c.player_id === char.player_id)
                      )
                      .map(character => (
                        <label
                          key={character.player_id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            padding: '0.75rem',
                            background: selectedPlayersToInvite.includes(character.player_id)
                              ? 'rgba(59, 130, 246, 0.2)'
                              : 'transparent',
                            border: selectedPlayersToInvite.includes(character.player_id)
                              ? '1px solid rgba(59, 130, 246, 0.4)'
                              : '1px solid transparent',
                            borderRadius: '0.5rem',
                            marginBottom: '0.5rem',
                            cursor: 'pointer'
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedPlayersToInvite.includes(character.player_id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedPlayersToInvite([...selectedPlayersToInvite, character.player_id]);
                              } else {
                                setSelectedPlayersToInvite(selectedPlayersToInvite.filter(id => id !== character.player_id));
                              }
                            }}
                            style={{ cursor: 'pointer' }}
                          />
                          <div style={{ flex: 1 }}>
                            <div style={{ color: 'white', fontWeight: 'bold' }}>
                              {character.name}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              Level {character.level} {character.race} {character.class}
                            </div>
                          </div>
                        </label>
                      ))
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    setShowInvitePlayersModal(false);
                    setSelectedPlayersToInvite([]);
                  }}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: 'rgba(100, 100, 120, 0.3)',
                    border: '1px solid rgba(150, 150, 170, 0.5)',
                    borderRadius: '0.5rem',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (selectedPlayersToInvite.length === 0 || !inviteTeamName.trim()) return;
                    
                    try {
                      await battleAPI.invitePlayers(activeBattle.id, selectedPlayersToInvite, inviteTeamName.trim(), inviteTeamColor);
                      
                      setShowInvitePlayersModal(false);
                      setSelectedPlayersToInvite([]);
                      setInviteTeamName('');
                      setInviteTeamColor('#3b82f6');
                      
                      setToastMessage(`Invited ${selectedPlayersToInvite.length} players to ${inviteTeamName}!`);
                      setTimeout(() => setToastMessage(null), 3000);
                    } catch (error) {
                      console.error('Error inviting players:', error);
                      alert('Failed to invite players');
                    }
                  }}
                  disabled={selectedPlayersToInvite.length === 0 || !inviteTeamName.trim()}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: (selectedPlayersToInvite.length > 0 && inviteTeamName.trim())
                      ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.3), rgba(22, 163, 74, 0.3))'
                      : 'rgba(100, 100, 120, 0.2)',
                    border: (selectedPlayersToInvite.length > 0 && inviteTeamName.trim())
                      ? '2px solid rgba(34, 197, 94, 0.5)'
                      : '1px solid rgba(100, 100, 120, 0.3)',
                    borderRadius: '0.5rem',
                    color: (selectedPlayersToInvite.length > 0 && inviteTeamName.trim()) ? '#4ade80' : 'rgba(255, 255, 255, 0.3)',
                    fontWeight: 'bold',
                    cursor: (selectedPlayersToInvite.length > 0 && inviteTeamName.trim()) ? 'pointer' : 'not-allowed'
                  }}
                >
                  📨 Send Invitations
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Battle Invitations Modal (Player) */}
        {showBattleInvitationsModal && pendingInvitations.length > 0 && currentCampaign && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.85)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}
            onClick={() => setShowBattleInvitationsModal(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: 'linear-gradient(135deg, rgba(26, 26, 46, 0.98), rgba(35, 35, 60, 0.98))',
                border: '2px solid var(--border-gold)',
                borderRadius: '1rem',
                padding: '2rem',
                width: '90%',
                maxWidth: '700px',
                maxHeight: '80vh',
                overflowY: 'auto',
                boxShadow: '0 8px 32px rgba(212, 193, 156, 0.3)'
              }}
            >
              <h2 style={{
                marginTop: 0,
                marginBottom: '1.5rem',
                color: 'var(--text-gold)',
                fontSize: '1.75rem',
                textAlign: 'center',
                borderBottom: '2px solid var(--border-gold)',
                paddingBottom: '0.75rem'
              }}>
                ⚔️ Battle Invitations
              </h2>

              <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', textAlign: 'center' }}>
                You have {pendingInvitations.length} pending battle invitation{pendingInvitations.length !== 1 ? 's' : ''}
              </div>

              {pendingInvitations.map((invitation, index) => (
                <div
                  key={invitation.id}
                  style={{
                    padding: '1.5rem',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '2px solid rgba(212, 193, 156, 0.3)',
                    borderRadius: '0.75rem',
                    marginBottom: index < pendingInvitations.length - 1 ? '1rem' : 0
                  }}
                >
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--text-gold)', marginBottom: '0.5rem' }}>
                      {invitation.battle_name}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                      {invitation.terrain_description || 'No terrain description'}
                    </div>
                    <div style={{
                      display: 'inline-block',
                      padding: '0.25rem 0.75rem',
                      background: invitation.team_name === 'A' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                      border: `1px solid ${invitation.team_name === 'A' ? 'rgba(59, 130, 246, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                      borderRadius: '0.5rem',
                      color: invitation.team_name === 'A' ? '#60a5fa' : '#f87171',
                      fontSize: '0.8rem',
                      fontWeight: 'bold'
                    }}>
                      Team {invitation.team_name}
                    </div>
                  </div>

                  {/* Army Selection */}
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.75rem', color: 'var(--text-gold)', fontSize: '0.9rem' }}>
                      Select Your Armies
                    </label>
                    <div style={{
                      background: 'rgba(0, 0, 0, 0.4)',
                      border: '1px solid rgba(212, 193, 156, 0.2)',
                      borderRadius: '0.5rem',
                      padding: '0.75rem',
                      maxHeight: '200px',
                      overflowY: 'auto'
                    }}>
                      {armies.length === 0 ? (
                        <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '1rem', fontSize: '0.85rem' }}>
                          You don't have any armies yet. Create one in the Armies tab!
                        </div>
                      ) : (
                        armies.map(army => (
                          <label
                            key={army.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.75rem',
                              padding: '0.75rem',
                              background: (selectedPlayersToInvite as any)[invitation.id]?.includes(army.id)
                                ? 'rgba(34, 197, 94, 0.2)'
                                : 'transparent',
                              border: (selectedPlayersToInvite as any)[invitation.id]?.includes(army.id)
                                ? '1px solid rgba(34, 197, 94, 0.4)'
                                : '1px solid transparent',
                              borderRadius: '0.5rem',
                              marginBottom: '0.5rem',
                              cursor: 'pointer'
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={(selectedPlayersToInvite as any)[invitation.id]?.includes(army.id) || false}
                              onChange={(e) => {
                                const inviteArmies = (selectedPlayersToInvite as any)[invitation.id] || [];
                                if (e.target.checked) {
                                  setSelectedPlayersToInvite({
                                    ...selectedPlayersToInvite,
                                    [invitation.id]: [...inviteArmies, army.id]
                                  } as any);
                                } else {
                                  setSelectedPlayersToInvite({
                                    ...selectedPlayersToInvite,
                                    [invitation.id]: inviteArmies.filter((id: number) => id !== army.id)
                                  } as any);
                                }
                              }}
                              style={{ cursor: 'pointer' }}
                            />
                            <div style={{ flex: 1 }}>
                              <div style={{ color: 'white', fontWeight: 'bold', fontSize: '0.9rem' }}>
                                {army.name}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                Total Stats: {army.numbers + army.equipment + army.discipline + army.morale + army.command + army.logistics}
                              </div>
                            </div>
                          </label>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                    <button
                      onClick={async () => {
                        try {
                          await battleAPI.declineInvitation(invitation.id);
                          setPendingInvitations(pendingInvitations.filter(inv => inv.id !== invitation.id));
                          setToastMessage('Invitation declined');
                          setTimeout(() => setToastMessage(null), 3000);
                        } catch (error) {
                          console.error('Error declining invitation:', error);
                        }
                      }}
                      style={{
                        padding: '0.5rem 1rem',
                        background: 'rgba(239, 68, 68, 0.2)',
                        border: '1px solid rgba(239, 68, 68, 0.4)',
                        borderRadius: '0.5rem',
                        color: '#f87171',
                        cursor: 'pointer',
                        fontSize: '0.85rem'
                      }}
                    >
                      Decline
                    </button>
                    <button
                      onClick={async () => {
                        const armyIds = (selectedPlayersToInvite as any)[invitation.id] || [];
                        if (armyIds.length === 0) {
                          alert('Please select at least one army');
                          return;
                        }
                        
                        try {
                          await battleAPI.acceptInvitation(invitation.id, armyIds);
                          setPendingInvitations(pendingInvitations.filter(inv => inv.id !== invitation.id));
                          setToastMessage(`Joined battle with ${armyIds.length} army/armies!`);
                          setTimeout(() => setToastMessage(null), 3000);
                          
                          // Navigate to battlefield
                          setMainView('campaign');
                          setCampaignTab('battlefield');
                        } catch (error) {
                          console.error('Error accepting invitation:', error);
                          alert('Failed to join battle');
                        }
                      }}
                      disabled={!((selectedPlayersToInvite as any)[invitation.id]?.length > 0)}
                      style={{
                        padding: '0.5rem 1rem',
                        background: ((selectedPlayersToInvite as any)[invitation.id]?.length > 0)
                          ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.3), rgba(22, 163, 74, 0.3))'
                          : 'rgba(100, 100, 120, 0.2)',
                        border: ((selectedPlayersToInvite as any)[invitation.id]?.length > 0)
                          ? '2px solid rgba(34, 197, 94, 0.5)'
                          : '1px solid rgba(100, 100, 120, 0.3)',
                        borderRadius: '0.5rem',
                        color: ((selectedPlayersToInvite as any)[invitation.id]?.length > 0) ? '#4ade80' : 'rgba(255, 255, 255, 0.3)',
                        fontWeight: 'bold',
                        cursor: ((selectedPlayersToInvite as any)[invitation.id]?.length > 0) ? 'pointer' : 'not-allowed',
                        fontSize: '0.85rem'
                      }}
                    >
                      ✓ Accept & Join
                    </button>
                  </div>
                </div>
              ))}

              <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                <button
                  onClick={() => setShowBattleInvitationsModal(false)}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: 'rgba(100, 100, 120, 0.3)',
                    border: '1px solid rgba(150, 150, 170, 0.5)',
                    borderRadius: '0.5rem',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer'
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Battle Summary Modal */}
        {battleSummary && (() => {
          // Calculate team scores (exclude armies with 0 troops)
          const teamScores: Record<string, number> = {};
          battleSummary.results.forEach((p: any) => {
            if (!teamScores[p.team_name]) {
              teamScores[p.team_name] = 0;
            }
            // Only add score if army still has troops
            if (p.current_troops > 0) {
              teamScores[p.team_name] += p.current_score;
            }
          });
          
          // Determine winning team
          const sortedTeams = Object.entries(teamScores).sort((a, b) => b[1] - a[1]);
          const winningTeam = sortedTeams[0][0];
          
          // Check if player's team won (or if DM, default to neutral/victory view)
          let playerWon = false;
          
          if (user?.role === 'Dungeon Master') {
            // DM always sees victory screen (neutral perspective)
            playerWon = true;
          } else {
            // Find if current player has an army on the winning team
            const playerParticipant = battleSummary.results.find((p: any) => p.user_id === user?.id);
            playerWon = playerParticipant && playerParticipant.team_name === winningTeam;
          }
          
          return (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: playerWon 
              ? 'rgba(212, 175, 55, 0.3)' 
              : 'rgba(239, 68, 68, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '2rem'
          }}>
            <div style={{
              background: playerWon
                ? 'linear-gradient(135deg, rgba(212, 175, 55, 0.98), rgba(255, 215, 0, 0.98))'
                : 'linear-gradient(135deg, rgba(220, 38, 38, 0.98), rgba(239, 68, 68, 0.98))',
              border: playerWon
                ? '3px solid rgba(255, 215, 0, 0.8)'
                : '3px solid rgba(239, 68, 68, 0.8)',
              borderRadius: '1rem',
              padding: '2rem',
              maxWidth: '800px',
              width: '100%',
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: playerWon
                ? '0 20px 60px rgba(212, 175, 55, 0.6)'
                : '0 20px 60px rgba(239, 68, 68, 0.6)'
            }}>
              <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>
                  {playerWon ? '🏆' : '💀'}
                </div>
                <h3 style={{ 
                  color: playerWon ? '#1a1a1a' : '#fff', 
                  marginBottom: '0.5rem',
                  fontSize: '2rem'
                }}>
                  {playerWon ? 'VICTORY!' : 'DEFEAT'}
                </h3>
                <h4 style={{ 
                  color: playerWon ? '#2a2a2a' : '#fee', 
                  marginBottom: '0.5rem' 
                }}>
                  {battleSummary.battleName}
                </h4>
                <p style={{ 
                  color: playerWon ? '#3a3a3a' : '#fdd', 
                  fontSize: '0.9rem' 
                }}>
                  Battle concluded at {new Date(battleSummary.timestamp).toLocaleTimeString()}
                </p>
              </div>

              {/* Team Scores */}
              <div style={{ marginBottom: '2rem' }}>
                <h5 style={{ 
                  color: playerWon ? '#1a1a1a' : '#fff', 
                  marginBottom: '1rem', 
                  fontSize: '1.3rem',
                  textAlign: 'center'
                }}>
                  📊 Final Standings
                </h5>
                <div style={{ display: 'grid', gap: '1rem' }}>
                  {sortedTeams.map(([teamName, score], index) => {
                    const isWinningTeam = teamName === winningTeam;
                    const teamParticipants = battleSummary.results.filter((p: any) => p.team_name === teamName);
                    const teamStartingScore = teamParticipants.reduce((sum: number, p: any) => sum + p.base_score, 0);
                    const scoreDiff = score - teamStartingScore;
                    
                    return (
                      <div
                        key={teamName}
                        style={{
                          padding: '1.5rem',
                          background: isWinningTeam 
                            ? 'rgba(0, 0, 0, 0.3)'
                            : 'rgba(0, 0, 0, 0.2)',
                          border: isWinningTeam
                            ? '3px solid rgba(0, 0, 0, 0.6)'
                            : '1px solid rgba(0, 0, 0, 0.3)',
                          borderRadius: '0.75rem',
                          position: 'relative'
                        }}
                      >
                        {isWinningTeam && (
                          <div style={{
                            position: 'absolute',
                            top: '-15px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            background: playerWon ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.6)',
                            color: playerWon ? '#1a1a1a' : '#fff',
                            padding: '0.35rem 1.5rem',
                            borderRadius: '1rem',
                            fontSize: '0.85rem',
                            fontWeight: 'bold',
                            border: '2px solid rgba(0, 0, 0, 0.7)'
                          }}>
                            👑 VICTORY
                          </div>
                        )}
                        
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                          <div>
                            <div style={{ 
                              fontSize: '1.5rem', 
                              fontWeight: 'bold',
                              color: playerWon ? '#1a1a1a' : '#fff',
                              marginBottom: '0.5rem'
                            }}>
                              #{index + 1} Team {teamName}
                            </div>
                            <div style={{ fontSize: '0.85rem', color: playerWon ? '#3a3a3a' : '#ccc' }}>
                              {teamParticipants.length} {teamParticipants.length === 1 ? 'Army' : 'Armies'}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ 
                              fontSize: '2.5rem', 
                              fontWeight: 'bold',
                              color: playerWon ? '#1a1a1a' : '#fff'
                            }}>
                              {score}
                            </div>
                            <div style={{ 
                              fontSize: '0.9rem',
                              color: scoreDiff >= 0 
                                ? (playerWon ? '#166534' : '#4ade80')
                                : (playerWon ? '#7f1d1d' : '#f87171'),
                              fontWeight: 'bold'
                            }}>
                              {scoreDiff >= 0 ? '+' : ''}{scoreDiff}
                            </div>
                          </div>
                        </div>
                        
                        {/* Army breakdown */}
                        <div style={{ 
                          paddingTop: '1rem',
                          borderTop: `1px solid ${playerWon ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.1)'}`,
                          display: 'grid',
                          gap: '0.75rem'
                        }}>
                          {teamParticipants.map((p: any) => {
                            // Calculate troop casualties based on score difference
                            const isVictory = teamName === winningTeam;
                            const losingTeamScore = sortedTeams[sortedTeams.length - 1][1];
                            const winningTeamScore = sortedTeams[0][1];
                            const absoluteScoreDiff = Math.abs(winningTeamScore - losingTeamScore);
                            
                            let troopsLostPercent = 0;
                            if (isVictory) {
                              // Winners: aggressive casualties even for victors
                              // Decisive victory (40+ gap): 15-25%
                              // Moderate victory (25-39): 25-35%
                              // Close victory (15-24): 35-45%
                              // Narrow victory (0-14): 45-55%
                              if (absoluteScoreDiff >= 40) {
                                troopsLostPercent = Math.floor(Math.random() * 11) + 15; // 15-25%
                              } else if (absoluteScoreDiff >= 25) {
                                troopsLostPercent = Math.floor(Math.random() * 11) + 25; // 25-35%
                              } else if (absoluteScoreDiff >= 15) {
                                troopsLostPercent = Math.floor(Math.random() * 11) + 35; // 35-45%
                              } else {
                                troopsLostPercent = Math.floor(Math.random() * 11) + 45; // 45-55%
                              }
                            } else {
                              // Losers: devastating casualties
                              // Crushing defeat (40+ gap): 60-75%
                              // Heavy defeat (25-39): 50-60%
                              // Moderate defeat (15-24): 40-50%
                              // Close defeat (0-14): 35-45%
                              if (absoluteScoreDiff >= 40) {
                                troopsLostPercent = Math.floor(Math.random() * 16) + 60; // 60-75%
                              } else if (absoluteScoreDiff >= 25) {
                                troopsLostPercent = Math.floor(Math.random() * 11) + 50; // 50-60%
                              } else if (absoluteScoreDiff >= 15) {
                                troopsLostPercent = Math.floor(Math.random() * 11) + 40; // 40-50%
                              } else {
                                troopsLostPercent = Math.floor(Math.random() * 11) + 35; // 35-45%
                              }
                            }
                            
                            const troopsLost = p.current_troops ? Math.floor(p.current_troops * (troopsLostPercent / 100)) : 0;
                            const survivingTroops = (p.current_troops || 0) - troopsLost;
                            
                            return (
                              <div key={p.id} style={{ 
                                background: playerWon ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                                padding: '0.5rem',
                                borderRadius: '0.375rem'
                              }}>
                                <div style={{ 
                                  display: 'flex', 
                                  justifyContent: 'space-between',
                                  fontSize: '0.85rem',
                                  color: playerWon ? '#2a2a2a' : '#ddd',
                                  marginBottom: '0.25rem'
                                }}>
                                  <span style={{ fontWeight: 'bold' }}>{p.temp_army_name || p.army_name}</span>
                                  <span style={{ fontWeight: 'bold' }}>Score: {p.current_score}</span>
                                </div>
                                {p.current_troops !== undefined && (
                                  <div style={{ 
                                    fontSize: '0.75rem',
                                    color: playerWon ? '#3a3a3a' : '#bbb',
                                    display: 'flex',
                                    justifyContent: 'space-between'
                                  }}>
                                    <span>👥 Troops: {survivingTroops.toLocaleString()} / {(p.army_total_troops || p.current_troops)?.toLocaleString()}</span>
                                    {troopsLost > 0 && (
                                      <span style={{ color: '#ef4444', fontWeight: 'bold' }}>
                                        💀 -{troopsLost.toLocaleString()} ({troopsLostPercent}%)
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ textAlign: 'center' }}>
                <button
                  onClick={() => setBattleSummary(null)}
                  style={{
                    padding: '0.75rem 2rem',
                    background: playerWon
                      ? 'rgba(0, 0, 0, 0.3)'
                      : 'rgba(0, 0, 0, 0.4)',
                    border: playerWon
                      ? '2px solid rgba(0, 0, 0, 0.5)'
                      : '2px solid rgba(0, 0, 0, 0.6)',
                    borderRadius: '0.5rem',
                    color: playerWon ? '#1a1a1a' : '#fff',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    fontSize: '1rem'
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
          );
        })()}
      </div>
    </div>
  );
};

export default CampaignView;
