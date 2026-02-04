// Campaign-related TypeScript interfaces and types

export interface ArmyStats {
  equipment: number;
  discipline: number;
  morale: number;
  command: number;
  logistics: number;
}

export interface EquipmentSlot {
  id: string;
  name: string;
  icon: string;
  className: string;
  syncWith?: string;
}

export interface CharacterPosition {
  x: number;
  y: number;
}

export interface Combatant {
  characterId: number;
  playerId: number;
  name: string;
  initiative: number;
  movement_speed: number;
  isMonster?: boolean;
  monsterId?: number;
  instanceNumber?: number;
}

export interface DeleteModalState {
  isOpen: boolean;
  characterId: number | null;
  characterName: string;
}

export interface LimbAC {
  head: number;
  chest: number;
  hands: number;
  main_hand: number;
  off_hand: number;
  feet: number;
}

export interface MonsterFormData {
  name: string;
  description: string;
  limb_health: {
    head: number;
    chest: number;
    left_arm: number;
    right_arm: number;
    left_leg: number;
    right_leg: number;
  };
  limb_ac: {
    head: number;
    chest: number;
    left_arm: number;
    right_arm: number;
    left_leg: number;
    right_leg: number;
  };
}

export interface NewArmyData {
  name: string;
  category: string;
  total_troops: number;
  equipment: number;
  discipline: number;
  morale: number;
  command: number;
  logistics: number;
}

export interface NewBattleData {
  name: string;
  terrain_description: string;
  total_rounds: number;
}

export interface NewParticipantData {
  type: 'player' | 'dm';
  team: string;
  faction_color: string;
  selectedPlayerArmies: number[];
  tempArmyName: string;
  tempArmyCategory: string;
  tempArmyTroops: number;
  tempArmyStats: ArmyStats;
}

export interface BattleSummary {
  battleName: string;
  results: any[];
  timestamp: string;
}

export interface ViewImageModal {
  imageUrl: string;
  name: string;
}

export interface CombatInvite {
  characterId: number;
  characterName: string;
}

export interface ImageToCrop {
  file: File;
  url: string;
  characterId: number;
}
