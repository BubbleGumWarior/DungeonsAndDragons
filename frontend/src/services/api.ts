import axios from 'axios';

const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://dungeonlair.ddns.net/api' 
  : 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export interface User {
  id: number;
  username: string;
  email: string;
  role: 'Dungeon Master' | 'Player';
}

export interface Campaign {
  id: number;
  name: string;
  description: string;
  dungeon_master_id: number;
  dm_username: string;
  created_at: string;
  updated_at: string;
}

export interface Character {
  id: number;
  player_id: number;
  campaign_id: number;
  name: string;
  race: string;
  class: string;
  background: string;
  level: number;
  hit_points: number;
  armor_class: number;
  abilities: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
  skills: string[];
  equipment: string[];
  equipped_items?: EquippedItems;
  spells: string[];
  backstory: string;
  personality_traits: string;
  ideals: string;
  bonds: string;
  flaws: string;
  image_url?: string;
  map_position_x?: number;
  map_position_y?: number;
  battle_position_x?: number;
  battle_position_y?: number;
  movement_speed?: number;
  combat_active?: boolean;
  initiative?: number;
  player_name?: string;
  campaign_name?: string;
  created_at: string;
  updated_at: string;
}

export interface EquippedItems {
  head?: string | null;
  chest?: string | null;
  legs?: string | null;
  feet?: string | null;
  main_hand?: string | null;
  off_hand?: string | null;
}

export interface CampaignDetails {
  campaign: Campaign;
  players: Array<{id: number; username: string; email: string}>;
  characters: Character[];
  userCharacter: Character | null;
}

export interface InventoryItem {
  item_name: string;
  category: 'Weapon' | 'Armor' | 'Tool' | 'General' | 'Magic Item' | 'Consumable';
  subcategory: string;
  description: string;
  damage_dice?: string;
  damage_type?: string;
  range_normal?: number;
  range_long?: number;
  weight?: number;
  cost_cp?: number;
  armor_class?: number;
  strength_requirement?: number;
  stealth_disadvantage?: boolean;
  properties: string[];
  rarity: 'Common' | 'Uncommon' | 'Rare' | 'Very Rare' | 'Legendary' | 'Artifact';
  attunement_required?: boolean;
  created_at: string;
  updated_at: string;
}

export interface Monster {
  id: number;
  campaign_id: number;
  name: string;
  description?: string;
  image_url?: string;
  limb_health?: {
    head: number;
    chest: number;
    left_arm: number;
    right_arm: number;
    left_leg: number;
    right_leg: number;
  };
  limb_ac?: {
    head: number;
    chest: number;
    left_arm: number;
    right_arm: number;
    left_leg: number;
    right_leg: number;
  };
  visible_to_players: boolean;
  created_at: string;
  updated_at: string;
}

export interface MonsterInstance {
  id: number;
  monster_id: number;
  campaign_id: number;
  instance_number: number;
  current_limb_health: {
    head: number;
    chest: number;
    left_arm: number;
    right_arm: number;
    left_leg: number;
    right_leg: number;
  };
  in_combat: boolean;
  initiative: number;
  battle_position_x: number;
  battle_position_y: number;
  created_at: string;
}

export interface D5eReferenceData {
  races: Array<{
    name: string;
    abilities: Record<string, number>;
    traits: string[];
  }>;
  classes: Array<{
    name: string;
    hitDie: number;
    primaryAbility: string[];
    savingThrows: string[];
  }>;
  backgrounds: string[];
  skills: string[];
  equipment: {
    weapons: InventoryItem[];
    armor: InventoryItem[];
    tools: InventoryItem[];
    general: InventoryItem[];
  };
}

export interface AuthResponse {
  message: string;
  user: User;
  token: string;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export const authAPI = {
  register: async (data: RegisterData): Promise<AuthResponse> => {
    const response = await api.post('/auth/register', data);
    return response.data;
  },

  login: async (data: LoginData): Promise<AuthResponse> => {
    const response = await api.post('/auth/login', data);
    return response.data;
  },

  getProfile: async (): Promise<{ user: User }> => {
    const response = await api.get('/auth/profile');
    return response.data;
  },

  verifyToken: async (): Promise<{ valid: boolean; user: User }> => {
    const response = await api.get('/auth/verify');
    return response.data;
  },
};

export const campaignAPI = {
  getAll: async (): Promise<{ campaigns: Campaign[] }> => {
    const response = await api.get('/campaigns');
    return response.data;
  },

  getMyCampaigns: async (): Promise<{ campaigns: Campaign[] }> => {
    const response = await api.get('/campaigns/my-campaigns');
    return response.data;
  },

  getById: async (id: number): Promise<CampaignDetails> => {
    const response = await api.get(`/campaigns/${id}`);
    return response.data;
  },

  getByUrlName: async (urlName: string): Promise<CampaignDetails> => {
    const response = await api.get(`/campaigns/${urlName}`);
    return response.data;
  },

  create: async (data: { name: string; description?: string }): Promise<{ message: string; campaign: Campaign }> => {
    const response = await api.post('/campaigns', data);
    return response.data;
  },

  update: async (id: number, data: { name?: string; description?: string }): Promise<{ message: string; campaign: Campaign }> => {
    const response = await api.put(`/campaigns/${id}`, data);
    return response.data;
  },

  delete: async (id: number): Promise<{ message: string }> => {
    const response = await api.delete(`/campaigns/${id}`);
    return response.data;
  },

  checkCharacter: async (campaignId: number): Promise<{ hasCharacter: boolean; character: Character | null }> => {
    const response = await api.get(`/campaigns/${campaignId}/check-character`);
    return response.data;
  },

  getUrlName: async (campaignId: number): Promise<{ urlName: string }> => {
    const response = await api.get(`/campaigns/${campaignId}/url-name`);
    return response.data;
  }
};

export const characterAPI = {
  getById: async (id: number): Promise<{ character: Character }> => {
    const response = await api.get(`/characters/${id}`);
    return response.data;
  },

  getMyCharacters: async (): Promise<{ characters: Character[] }> => {
    const response = await api.get('/characters/my/characters');
    return response.data;
  },

  create: async (data: Partial<Character>): Promise<{ message: string; character: Character }> => {
    const response = await api.post('/characters', data);
    return response.data;
  },

  update: async (id: number, data: Partial<Character>): Promise<{ message: string; character: Character }> => {
    const response = await api.put(`/characters/${id}`, data);
    return response.data;
  },

  delete: async (id: number): Promise<{ message: string }> => {
    const response = await api.delete(`/characters/${id}`);
    return response.data;
  },

  getReferenceData: async (): Promise<D5eReferenceData> => {
    const response = await api.get('/characters/reference/data');
    return response.data;
  },

  getEquipmentDetails: async (characterId: number): Promise<{ character_id: number; character_name: string; equipment: InventoryItem[] }> => {
    const response = await api.get(`/characters/${characterId}/equipment-details`);
    return response.data;
  },

  getEquippedItems: async (characterId: number): Promise<{ 
    character_id: number; 
    equipped_items: Record<string, InventoryItem | null>;
    limb_ac?: { head: number; chest: number; hands: number; main_hand: number; off_hand: number; feet: number };
  }> => {
    const response = await api.get(`/characters/${characterId}/equipped`);
    return response.data;
  },

  equipItem: async (characterId: number, itemName: string, slot: string): Promise<{ message: string; character: Character; equipped_item: InventoryItem; slot: string; previous_item?: string }> => {
    const response = await api.post(`/characters/${characterId}/equip`, { itemName, slot });
    return response.data;
  },

  unequipItem: async (characterId: number, slot: string): Promise<{ message: string; character: Character; unequipped_item: string; slot: string }> => {
    const response = await api.post(`/characters/${characterId}/unequip`, { slot });
    return response.data;
  },

  addItemToInventory: async (characterId: number, itemName: string): Promise<{ message: string; character: Character; added_item: string }> => {
    const response = await api.post(`/characters/${characterId}/add-item`, { itemName });
    return response.data;
  },

  removeItemFromInventory: async (characterId: number, itemName: string): Promise<{ message: string; character: Character; removed_item: string; unequipped_from?: string }> => {
    const response = await api.post(`/characters/${characterId}/remove-item`, { itemName });
    return response.data;
  },

  createCustomItem: async (characterId: number, itemData: any): Promise<{ message: string; character: Character; custom_item: InventoryItem }> => {
    const response = await api.post(`/characters/${characterId}/create-custom-item`, itemData);
    return response.data;
  },

  uploadCharacterImage: async (characterId: number, imageFile: File): Promise<{ message: string; image_url: string; character: Character }> => {
    const formData = new FormData();
    formData.append('image', imageFile);
    
    const response = await api.post(`/characters/${characterId}/upload-image`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  updateMapPosition: async (characterId: number, x: number, y: number): Promise<{ message: string; position: { x: number; y: number } }> => {
    const response = await api.put(`/characters/${characterId}/map-position`, { x, y });
    return response.data;
  },

  updateBattlePosition: async (characterId: number, x: number, y: number): Promise<{ message: string; position: { x: number; y: number } }> => {
    const response = await api.put(`/characters/${characterId}/battle-position`, { x, y });
    return response.data;
  }
};

export const inventoryAPI = {
  getAllItems: async (): Promise<InventoryItem[]> => {
    const response = await api.get('/characters/inventory/all');
    return response.data;
  },

  getItemsByCategory: async (category: string): Promise<InventoryItem[]> => {
    const response = await api.get(`/characters/inventory/category/${category}`);
    return response.data;
  },

  getItemByName: async (itemName: string): Promise<InventoryItem> => {
    const response = await api.get(`/characters/inventory/item/${encodeURIComponent(itemName)}`);
    return response.data;
  }
};

export const monsterAPI = {
  getCampaignMonsters: async (campaignId: number): Promise<Monster[]> => {
    const response = await api.get(`/monsters/campaign/${campaignId}`);
    return response.data;
  },

  createMonster: async (monsterData: Partial<Monster>): Promise<Monster> => {
    const response = await api.post('/monsters', monsterData);
    return response.data;
  },

  uploadMonsterImage: async (monsterId: number, imageFile: File): Promise<Monster> => {
    const formData = new FormData();
    formData.append('image', imageFile);
    const response = await api.post(`/monsters/${monsterId}/image`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  updateMonster: async (monsterId: number, updates: Partial<Monster>): Promise<Monster> => {
    const response = await api.put(`/monsters/${monsterId}`, updates);
    return response.data;
  },

  toggleVisibility: async (monsterId: number): Promise<Monster> => {
    const response = await api.patch(`/monsters/${monsterId}/toggle-visibility`);
    return response.data;
  },

  deleteMonster: async (monsterId: number): Promise<{ message: string }> => {
    const response = await api.delete(`/monsters/${monsterId}`);
    return response.data;
  }
};

export const monsterInstanceAPI = {
  getCampaignInstances: async (campaignId: number): Promise<MonsterInstance[]> => {
    const response = await api.get(`/monster-instances/campaign/${campaignId}`);
    return response.data;
  },

  getActiveInstances: async (campaignId: number): Promise<MonsterInstance[]> => {
    const response = await api.get(`/monster-instances/campaign/${campaignId}/active`);
    return response.data;
  },

  updateHealth: async (instanceId: number, limbHealth: any): Promise<MonsterInstance> => {
    const response = await api.patch(`/monster-instances/${instanceId}/health`, { limbHealth });
    return response.data;
  },

  removeFromCombat: async (instanceId: number): Promise<MonsterInstance> => {
    const response = await api.patch(`/monster-instances/${instanceId}/remove-from-combat`);
    return response.data;
  }
};

// Army types
export interface Army {
  id: number;
  player_id: number;
  campaign_id: number;
  name: string;
  category: string;
  numbers: number;
  equipment: number;
  discipline: number;
  morale: number;
  command: number;
  logistics: number;
  total_troops?: number;
  starting_troops?: number;
  created_at: string;
  updated_at: string;
  player_name?: string;
  owner_name?: string;
  battle_history?: ArmyBattleHistory[];
}

export interface ArmyBattleHistory {
  id: number;
  army_id: number;
  battle_name: string;
  start_score: number;
  end_score: number;
  enemy_name: string;
  enemy_start_score: number;
  enemy_end_score: number;
  result: 'victory' | 'defeat' | 'stalemate';
  goals_chosen: any[];
  battle_date: string;
  troops_lost?: number;
}

export interface Battle {
  id: number;
  campaign_id: number;
  battle_name: string;
  terrain_description: string;
  status: 'planning' | 'goal_selection' | 'resolution' | 'completed' | 'cancelled';
  current_round: number;
  total_rounds?: number;
  created_at: string;
  updated_at: string;
  participants?: BattleParticipant[];
  current_goals?: BattleGoal[];
}

export interface BattleParticipant {
  id: number;
  battle_id: number;
  army_id: number | null;
  team_name: string;
  faction_color?: string;
  is_temporary: boolean;
  temp_army_name?: string;
  temp_army_category?: string;
  temp_army_troops?: number;
  temp_army_stats?: {
    equipment: number;
    discipline: number;
    morale: number;
    command: number;
    logistics: number;
  };
  current_score: number;
  base_score: number;
  position_x: number;
  position_y: number;
  has_selected_goal?: boolean;
  army_name?: string;
  army_category?: string;
  player_name?: string;
  user_id?: number;
  current_troops?: number;
  army_total_troops?: number;
  numbers?: number;
  equipment?: number;
  discipline?: number;
  morale?: number;
  command?: number;
  logistics?: number;
}

export interface BattleGoal {
  id: number;
  battle_id: number;
  round_number: number;
  participant_id: number;
  goal_name: string;
  target_participant_id: number | null;
  test_type: string;
  character_modifier: number;
  army_stat_modifier: number;
  dice_roll: number | null;
  dc_required: number | null;
  success: boolean | null;
  modifier_applied: number;
  locked_in: boolean;
  created_at: string;
  team_name?: string;
  target_team_name?: string;
}

// Army API
export const armyAPI = {
  getPlayerArmies: async (campaignId: number, playerId: number): Promise<Army[]> => {
    const response = await api.get(`/armies/campaign/${campaignId}/player/${playerId}`);
    return response.data;
  },

  getCampaignArmies: async (campaignId: number): Promise<Army[]> => {
    const response = await api.get(`/armies/campaign/${campaignId}`);
    return response.data;
  },

  createArmy: async (armyData: Partial<Army>): Promise<Army> => {
    const response = await api.post('/armies', armyData);
    return response.data;
  },

  updateArmy: async (armyId: number, stats: Partial<Army>): Promise<Army> => {
    const response = await api.put(`/armies/${armyId}`, stats);
    return response.data;
  },

  deleteArmy: async (armyId: number): Promise<{ message: string }> => {
    const response = await api.delete(`/armies/${armyId}`);
    return response.data;
  },

  getBattleHistory: async (armyId: number): Promise<ArmyBattleHistory[]> => {
    const response = await api.get(`/armies/${armyId}/history`);
    return response.data;
  },

  updateTroops: async (armyId: number, troopChange: number): Promise<Army> => {
    const response = await api.patch(`/armies/${armyId}/troops`, { troop_change: troopChange });
    return response.data;
  }
};

// Battle API
export const battleAPI = {
  createBattle: async (battleData: Partial<Battle>): Promise<Battle> => {
    const response = await api.post('/armies/battles', battleData);
    return response.data;
  },

  getActiveBattle: async (campaignId: number): Promise<Battle | null> => {
    const response = await api.get(`/armies/battles/campaign/${campaignId}/active`);
    return response.data;
  },

  getBattle: async (battleId: number): Promise<Battle> => {
    const response = await api.get(`/armies/battles/${battleId}`);
    return response.data;
  },

  updateStatus: async (battleId: number, status: string): Promise<Battle> => {
    const response = await api.put(`/armies/battles/${battleId}/status`, { status });
    return response.data;
  },

  advanceRound: async (battleId: number): Promise<Battle> => {
    const response = await api.post(`/armies/battles/${battleId}/advance-round`);
    return response.data;
  },

  addParticipant: async (battleId: number, participantData: Partial<BattleParticipant>): Promise<BattleParticipant> => {
    const response = await api.post(`/armies/battles/${battleId}/participants`, participantData);
    return response.data;
  },

  updateParticipantPosition: async (participantId: number, x: number, y: number): Promise<void> => {
    await api.put(`/armies/battles/participants/${participantId}/position`, { x, y });
  },

  calculateBaseScores: async (battleId: number): Promise<Battle> => {
    const response = await api.post(`/armies/battles/${battleId}/calculate-base-scores`);
    return response.data;
  },

  setGoal: async (battleId: number, goalData: Partial<BattleGoal>): Promise<BattleGoal> => {
    const response = await api.post(`/armies/battles/${battleId}/goals`, goalData);
    return response.data;
  },

  lockGoal: async (goalId: number, locked: boolean): Promise<BattleGoal> => {
    const response = await api.put(`/armies/battles/goals/${goalId}/lock`, { locked });
    return response.data;
  },

  updateGoalRoll: async (goalId: number, diceRoll: number): Promise<BattleGoal> => {
    const response = await api.put(`/armies/battles/goals/${goalId}/roll`, { dice_roll: diceRoll });
    return response.data;
  },

  resolveGoal: async (goalId: number, dcRequired: number, success: boolean, modifierApplied: number, rollTotal?: number): Promise<BattleGoal> => {
    const response = await api.put(`/armies/battles/goals/${goalId}/resolve`, {
      dc_required: dcRequired,
      success,
      modifier_applied: modifierApplied,
      roll_total: rollTotal
    });
    return response.data;
  },

  applyModifiers: async (battleId: number, roundNumber: number): Promise<Battle> => {
    const response = await api.post(`/armies/battles/${battleId}/apply-modifiers`, { round_number: roundNumber });
    return response.data;
  },

  completeBattle: async (battleId: number): Promise<{ message: string; results: BattleParticipant[] }> => {
    const response = await api.post(`/armies/battles/${battleId}/complete`);
    return response.data;
  },

  // Battle invitations
  invitePlayers: async (battleId: number, playerIds: number[], teamName: string, factionColor: string = '#808080'): Promise<any[]> => {
    const response = await api.post(`/armies/battles/${battleId}/invite`, {
      player_ids: playerIds,
      team_name: teamName,
      faction_color: factionColor
    });
    return response.data;
  },

  getPlayerInvitations: async (playerId: number, campaignId: number): Promise<any[]> => {
    const response = await api.get(`/armies/battles/invitations/player/${playerId}/campaign/${campaignId}`);
    return response.data;
  },

  getBattleInvitations: async (battleId: number): Promise<any[]> => {
    const response = await api.get(`/armies/battles/${battleId}/invitations`);
    return response.data;
  },

  acceptInvitation: async (invitationId: number, armyIds: number[]): Promise<any> => {
    const response = await api.post(`/armies/battles/invitations/${invitationId}/accept`, {
      army_ids: armyIds
    });
    return response.data;
  },

  declineInvitation: async (invitationId: number): Promise<any> => {
    const response = await api.post(`/armies/battles/invitations/${invitationId}/decline`);
    return response.data;
  }
};

export default api;