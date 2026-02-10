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
  experience_points?: number;
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

export interface Skill {
  id: number;
  name: string;
  description: string;
  damage_dice?: string;
  damage_type?: string;
  range_size?: string;
  usage_frequency?: string;
  level_requirement: number;
  class_restriction?: string;
  acquired_at?: string;
  created_at: string;
}

export interface Beast {
  id: number;
  character_id: number;
  beast_type: 'Cheetah' | 'Leopard' | 'AlphaWolf' | 'OmegaWolf' | 'Elephant' | 'Owlbear';
  beast_name: string;
  level_acquired: number;
  hit_points_max: number;
  hit_points_current: number;
  armor_class: number;
  abilities: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
  speed: number;
  attack_bonus: number;
  damage_dice: string;
  damage_type: string;
  special_abilities: string;
  created_at: string;
  updated_at: string;
}

export interface Subclass {
  id: number;
  class: string;
  name: string;
  description: string;
  created_at: string;
}

export interface ClassFeature {
  id: number;
  class: string;
  subclass_id: number | null;
  level: number;
  name: string;
  description: string;
  is_choice: boolean;
  choice_count: number;
  choice_type: string | null;
  created_at: string;
}

export interface LevelUpInfo {
  currentLevel: number;
  newLevel: number;
  hitDie: number;
  hitDieAverage: number;
  currentHP: number;
  autoFeatures: ClassFeature[];
  choiceFeatures: ClassFeature[];
  availableSubclasses: Subclass[];
  skillGained: Skill | null;
  needsSubclass: boolean;
}

export interface FeatureChoice {
  featureId: number;
  choiceName: string;
  choiceDescription?: string;
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
  total_rounds: number;
  created_at: string;
  updated_at: string;
  participants?: BattleParticipant[];
  current_goals?: BattleGoal[];
}

export interface BattleGoal {
  id: number;
  battle_id: number;
  round_number: number;
  participant_id: number;
  team_name: string;
  goal_key: string;
  goal_name: string;
  goal_type: 'attack' | 'defend' | 'logistics' | 'custom' | 'commander';
  target_participant_id?: number | null;
  status: 'selected' | 'resolved' | 'applied';
  attacker_roll?: number | null;
  defender_roll?: number | null;
  logistics_roll?: number | null;
  roll_details?: any;
  advantage?: 'attacker' | 'defender' | 'none';
  casualties_target?: number;
  casualties_self?: number;
  score_change_target?: number;
  score_change_self?: number;
  notes?: string;
  executor_army_name?: string;
  target_army_name?: string;
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
  character_abilities?: any;
  has_selected_goal?: boolean;
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

  updateParticipantTroops: async (participantId: number, troopChange: number): Promise<BattleParticipant> => {
    const response = await api.put(`/armies/battles/participants/${participantId}/troops`, { troop_change: troopChange });
    return response.data;
  },

  updateParticipantScore: async (participantId: number, scoreChange: number): Promise<BattleParticipant> => {
    const response = await api.put(`/armies/battles/participants/${participantId}/score`, { score_change: scoreChange });
    return response.data;
  },

  calculateBaseScores: async (battleId: number): Promise<Battle> => {
    const response = await api.post(`/armies/battles/${battleId}/calculate-base-scores`);
    return response.data;
  },

  getGoals: async (battleId: number, round?: number): Promise<BattleGoal[]> => {
    const query = round ? `?round=${round}` : '';
    const response = await api.get(`/armies/battles/${battleId}/goals${query}`);
    return response.data;
  },

  setGoal: async (battleId: number, data: { participant_id: number; goal_key: string; target_participant_id?: number | null }): Promise<BattleGoal> => {
    const response = await api.post(`/armies/battles/${battleId}/goals`, data);
    return response.data;
  },

  resolveGoal: async (battleId: number, goalId: number): Promise<BattleGoal> => {
    const response = await api.post(`/armies/battles/${battleId}/goals/${goalId}/resolve`);
    return response.data;
  },

  updateGoalResult: async (battleId: number, goalId: number, updates: { casualties_target: number; casualties_self: number; score_change_target: number; score_change_self: number; notes?: string }): Promise<BattleGoal> => {
    const response = await api.patch(`/armies/battles/${battleId}/goals/${goalId}`, updates);
    return response.data;
  },

  applyGoalResults: async (battleId: number): Promise<{ goals: BattleGoal[]; battle: Battle }> => {
    const response = await api.post(`/armies/battles/${battleId}/goals/apply`);
    return response.data;
  },

  completeBattle: async (battleId: number): Promise<{ message: string; results: BattleParticipant[]; summary?: any }> => {
    const response = await api.post(`/armies/battles/${battleId}/complete`);
    return response.data;
  },

  // Battle invitations
  invitePlayers: async (battleId: number, playerIds: number[], teamName: string, factionColor?: string): Promise<any[]> => {
    const payload: { player_ids: number[]; team_name: string; faction_color?: string } = {
      player_ids: playerIds,
      team_name: teamName
    };
    if (factionColor) {
      payload.faction_color = factionColor;
    }
    const response = await api.post(`/armies/battles/${battleId}/invite`, payload);
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

export const skillAPI = {
  getAll: async (): Promise<Skill[]> => {
    const response = await api.get('/skills');
    return response.data;
  },

  getByName: async (name: string): Promise<Skill> => {
    const response = await api.get(`/skills/name/${encodeURIComponent(name)}`);
    return response.data;
  },

  getCharacterSkills: async (characterId: number): Promise<Skill[]> => {
    const response = await api.get(`/skills/characters/${characterId}`);
    return response.data;
  },

  addSkillToCharacter: async (characterId: number, skillId: number): Promise<Skill> => {
    const response = await api.post(`/skills/characters/${characterId}`, { skillId });
    return response.data;
  },

  createSkill: async (skillData: Partial<Skill>): Promise<Skill> => {
    const response = await api.post('/skills', skillData);
    return response.data;
  },

  removeSkillFromCharacter: async (characterId: number, skillId: number): Promise<void> => {
    await api.delete(`/skills/characters/${characterId}/${skillId}`);
  },

  grantExperience: async (campaignId: number, characterIds: number[], expAmount: number): Promise<any> => {
    const response = await api.post(`/skills/grant-exp/${campaignId}`, {
      characterIds,
      expAmount
    });
    return response.data;
  },

  getLevelUpInfo: async (characterId: number): Promise<LevelUpInfo> => {
    const response = await api.get(`/skills/level-up-info/${characterId}`);
    return response.data;
  },

  levelUp: async (characterId: number, levelUpData: {
    hpIncrease: number;
    subclassId?: number;
    featureChoices?: FeatureChoice[];
    beastSelection?: { beastType: string; beastName: string };
    abilityIncreases?: { [key: string]: number };
  }): Promise<any> => {
    const response = await api.post(`/skills/level-up/${characterId}`, levelUpData);
    return response.data;
  }
};

export const beastAPI = {
  getBeast: async (characterId: number): Promise<Beast | null> => {
    try {
      const response = await api.get(`/beasts/${characterId}`);
      return response.data.beast;
    } catch (error: any) {
      // 404 means no beast exists yet - this is normal
      if (error?.response?.status === 404) {
        return null;
      }
      throw error;
    }
  },

  createOrUpdateBeast: async (characterId: number, beastData: {
    beast_type: string;
    beast_name: string;
    level_acquired: number;
    hit_points_max: number;
    armor_class: number;
    abilities: {
      str: number;
      dex: number;
      con: number;
      int: number;
      wis: number;
      cha: number;
    };
    speed: number;
    attack_bonus: number;
    damage_dice: string;
    damage_type: string;
    special_abilities: string;
  }): Promise<Beast> => {
    const response = await api.post(`/beasts/${characterId}`, beastData);
    return response.data.beast;
  },

  updateBeastHP: async (characterId: number, hit_points_current: number): Promise<Beast> => {
    const response = await api.patch(`/beasts/${characterId}/hp`, { hit_points_current });
    return response.data.beast;
  },

  deleteBeast: async (characterId: number): Promise<void> => {
    await api.delete(`/beasts/${characterId}`);
  }
};

export default api;