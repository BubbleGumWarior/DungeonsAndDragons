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
  isAlly?: boolean;
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

// ── Combat System Types ────────────────────────────────────────────────────

export type CombatCondition =
  | 'Blinded' | 'Charmed' | 'Deafened' | 'Frightened' | 'Grappled'
  | 'Incapacitated' | 'Invisible' | 'Paralyzed' | 'Petrified' | 'Poisoned'
  | 'Prone' | 'Restrained' | 'Stunned' | 'Unconscious' | 'Dead' | 'Stable'
  | string; // allow custom conditions

export interface CombatLogEntry {
  id: number;
  session_id: number;
  actor_name: string | null;
  action_type: string;
  target_name: string | null;
  limb_name: string | null;
  roll_result: number | null;
  damage: number | null;
  details: string | null;
  created_at: string;
}

export interface DeathSaves {
  successes: number;
  failures: number;
  is_stable: boolean;
  is_dead: boolean;
}

export interface ActionEconomy {
  action_used: boolean;
  bonus_action_used: boolean;
  reaction_used: boolean;
}

export interface DiceGroup {
  count: number;
  diceType: string; // e.g. 'd6', 'd20'
}

export interface CombatDiceRequest {
  requestId: number;
  requesterName: string;
  targetCharacterName: string;
  diceType: string;
  rollPurpose: 'attack' | 'damage' | 'saving_throw' | 'ability_check' | 'death_save' | 'initiative';
  purposeDetail: string;
  campaignId: number;
  modifier?: string; // 'none' | 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha' | 'prof'
  precomputedModifier?: number | null; // pre-calculated modifier (e.g. from Quick Roll skill lookup)
  diceGroups?: DiceGroup[]; // multi-dice request (e.g. 2d6 + 1d8)
}

// Outcome panel shown to DM after a player submits a dice roll
export interface CombatRollOutcome {
  requestId: number;
  rollerName: string;
  rawRoll: number;
  modifier: string;
  modifierValue: number;
  total: number;
  campaignId: number;
  diceType?: string;
  rollPurpose?: 'attack' | 'damage' | 'saving_throw' | 'ability_check' | 'death_save' | 'initiative';
  purposeDetail?: string;
  // Attack-specific extras (present when this result came from an attack roll sequence)
  attackerKey?: string;
  targetKey?: string;
  targetName?: string;
  hitRoll?: number;
  damageRoll?: number;
  isAttackResult?: boolean;
}

// Attack request sent by player to DM
export interface AttackRequest {
  requestId: number;      // timestamp-based unique id
  campaignId: number;
  attackerKey: string;
  attackerName: string;
  targetKey: string;
  targetName: string;
  targetPlayerId?: number;
}

// Attack dice config sent by DM back to player
export interface AttackDiceConfig {
  requestId: number;
  campaignId: number;
  attackerKey: string;
  attackerName: string;
  targetKey: string;
  targetName: string;
  hitDie: string;   // e.g. 'd20'
  damageDie: string; // e.g. 'd6' (legacy / first group fallback)
  damageDiceGroups?: DiceGroup[]; // multi-damage e.g. 2d6 + 1d8
  dmName: string;
}

// Damage-over-time condition applied by DM
export interface DotCondition {
  type: 'Burning' | 'Bleeding' | 'Poison';
  fixedDamage: number | null;       // set damage per tick, OR
  damageDice: string | null;        // dice the DM rolls each tick (e.g. 'd6')
  requireRoll: boolean;             // true = DM requests player to roll each tick
  limbTarget: string | null;        // which limb receives DOT damage (e.g. 'chest', 'head')
  turnsRemaining: number | null;    // null = indefinite; Burning auto-expires at 0
}

export type ChatMessageType = 'player' | 'dm' | 'server' | 'roll_result' | 'npc_reveal';

export interface CampaignNPC {
  id: number;
  campaign_id: number;
  name: string;
  age: string;
  description: string;
  image_url: string | null;
  created_by: number;
  created_at: string;
}

export interface ChatMessage {
  id: number;
  campaign_id: number;
  sender_id: number | null;
  sender_name: string;
  message_type: ChatMessageType;
  content: string;
  roll_data: {
    requestId: number;
    diceType: string;
    rollPurpose: string;
    purposeDetail?: string;
    modifier: number;
    rolls: number[];
    total: number;
    characterName?: string;
    diceGroups?: { diceType: string; rolls: number[] }[];
  } | null;
  created_at: string;
}

export interface OutOfCombatRollRequest {
  requestId: number;
  campaignId: number;
  targetPlayerId: number;
  targetCharacterName: string;
  diceType: string;
  rollPurpose: string;
  purposeDetail: string;
  modifier: number;
  precomputedModifier?: string;
  requesterName: string;
  diceGroups?: DiceGroup[]; // multi-dice request (e.g. 2d6 + 1d8)
}

