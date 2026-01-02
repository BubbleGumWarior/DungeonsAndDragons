import { EquipmentSlot } from '../types/campaignTypes';

// Equipment slot definitions for character equipment UI
export const equipmentSlots: EquipmentSlot[] = [
  { id: 'head', name: 'Head', icon: '🪖', className: 'head-slot' },
  { id: 'chest', name: 'Chest', icon: '🦺', className: 'chest-slot' },
  { id: 'hands', name: 'Hands', icon: '🧤', className: 'hands-slot' },
  { id: 'main_hand', name: 'Main Hand', icon: '⚔️', className: 'main-hand-slot' },
  { id: 'off_hand', name: 'Off Hand', icon: '🛡️', className: 'off-hand-slot' },
  { id: 'feet', name: 'Feet', icon: '🥾', className: 'feet-slot', syncWith: 'feet' }
];

// Get dynamic icon for equipment slots
export const getSlotIcon = (slotId: string, equippedItem: any, defaultIcon: string): string => {
  // For hand slots, show shield if shield is equipped, otherwise show swords
  if (slotId === 'main_hand' || slotId === 'off_hand') {
    if (equippedItem && equippedItem.subcategory && equippedItem.subcategory.toLowerCase().includes('shield')) {
      return '🛡️';
    }
    return '⚔️';
  }
  return defaultIcon;
};

// Get subcategory options for inventory items
export const getSubcategoryOptions = (category: string): string[] => {
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
export const getAvailableProperties = (): string[] => {
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

// Get damage types
export const getDamageTypes = (): string[] => {
  return ['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'];
};
