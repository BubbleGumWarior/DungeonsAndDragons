import { ArmyStats } from '../types/campaignTypes';
import { UNIT_TEMPLATES, ARMY_CATEGORY_GROUPS } from './unitTemplates';

// Army categories organized by type
export const ARMY_CATEGORIES = ARMY_CATEGORY_GROUPS;

// Helper function to get army category icon
export const getArmyCategoryIcon = (category: string): string => {
  return UNIT_TEMPLATES[category]?.icon ?? '⚔️';
};

// Stat presets for army categories — pulled directly from the template definitions
export const getArmyCategoryPresets = (category: string): ArmyStats => {
  const template = UNIT_TEMPLATES[category];
  if (!template) return { equipment: 5, discipline: 5, morale: 5, command: 5, logistics: 5 };
  return { ...template.stats };
};

// Get army movement speed based on category
export const getArmyMovementSpeed = (category: string): number => {
  const template = UNIT_TEMPLATES[category];
  if (!template) return 100;
  if (template.baseType === 'artillery') return 50;
  if (template.baseType === 'cavalry') return 300;
  if (template.baseType === 'covert') return 150;
  return 100;
};

