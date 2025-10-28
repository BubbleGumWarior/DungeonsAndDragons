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

  getEquippedItems: async (characterId: number): Promise<{ character_id: number; equipped_items: Record<string, InventoryItem | null> }> => {
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

export default api;