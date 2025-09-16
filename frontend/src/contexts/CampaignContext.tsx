import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Campaign, Character, CampaignDetails, campaignAPI, characterAPI } from '../services/api';

interface CampaignContextType {
  campaigns: Campaign[];
  currentCampaign: CampaignDetails | null;
  currentCharacter: Character | null;
  isLoading: boolean;
  error: string | null;
  
  // Campaign actions
  loadMyCampaigns: () => Promise<void>;
  loadAllCampaigns: () => Promise<void>;
  loadCampaign: (identifier: string | number) => Promise<CampaignDetails>;
  createCampaign: (data: { name: string; description?: string }) => Promise<Campaign>;
  updateCampaign: (id: number, data: { name?: string; description?: string }) => Promise<Campaign>;
  deleteCampaign: (id: number) => Promise<void>;
  
  // Character actions
  loadCharacter: (id: number) => Promise<void>;
  createCharacter: (data: Partial<Character>) => Promise<Character>;
  updateCharacter: (id: number, data: Partial<Character>) => Promise<Character>;
  deleteCharacter: (id: number) => Promise<void>;
  checkCharacterInCampaign: (campaignId: number) => Promise<{ hasCharacter: boolean; character: Character | null }>;
  
  // Utility actions
  generateCampaignUrl: (campaignName: string) => string;
  clearError: () => void;
  clearCurrentCampaign: () => void;
  clearCurrentCharacter: () => void;
}

const CampaignContext = createContext<CampaignContextType | undefined>(undefined);

export const useCampaign = () => {
  const context = useContext(CampaignContext);
  if (context === undefined) {
    throw new Error('useCampaign must be used within a CampaignProvider');
  }
  return context;
};

interface CampaignProviderProps {
  children: ReactNode;
}

export const CampaignProvider: React.FC<CampaignProviderProps> = ({ children }) => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [currentCampaign, setCurrentCampaign] = useState<CampaignDetails | null>(null);
  const [currentCharacter, setCurrentCharacter] = useState<Character | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);
  const clearCurrentCampaign = useCallback(() => setCurrentCampaign(null), []);
  const clearCurrentCharacter = useCallback(() => setCurrentCharacter(null), []);

  // Campaign actions
  const loadMyCampaigns = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const { campaigns } = await campaignAPI.getMyCampaigns();
      setCampaigns(campaigns);
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Failed to load campaigns';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadAllCampaigns = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const { campaigns } = await campaignAPI.getAll();
      setCampaigns(campaigns);
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Failed to load campaigns';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadCampaign = useCallback(async (identifier: string | number) => {
    try {
      setIsLoading(true);
      setError(null);
      let campaignDetails: CampaignDetails;
      
      if (typeof identifier === 'number') {
        campaignDetails = await campaignAPI.getById(identifier);
      } else {
        campaignDetails = await campaignAPI.getByUrlName(identifier);
      }
      
      setCurrentCampaign(campaignDetails);
      
      // Set current character if user has one in this campaign
      if (campaignDetails.userCharacter) {
        setCurrentCharacter(campaignDetails.userCharacter);
      }
      
      return campaignDetails;
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Failed to load campaign';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createCampaign = useCallback(async (data: { name: string; description?: string }) => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await campaignAPI.create(data);
      
      // Add to campaigns list
      setCampaigns(prev => [result.campaign, ...prev]);
      
      return result.campaign;
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Failed to create campaign';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateCampaign = useCallback(async (id: number, data: { name?: string; description?: string }) => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await campaignAPI.update(id, data);
      
      // Update campaigns list
      setCampaigns(prev => prev.map(c => c.id === id ? result.campaign : c));
      
      // Update current campaign if it's the one being updated
      if (currentCampaign && currentCampaign.campaign.id === id) {
        setCurrentCampaign(prev => prev ? { ...prev, campaign: result.campaign } : null);
      }
      
      return result.campaign;
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Failed to update campaign';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [currentCampaign]);

  const deleteCampaign = useCallback(async (id: number) => {
    try {
      setIsLoading(true);
      setError(null);
      await campaignAPI.delete(id);
      
      // Remove from campaigns list
      setCampaigns(prev => prev.filter(c => c.id !== id));
      
      // Clear current campaign if it's the one being deleted
      if (currentCampaign && currentCampaign.campaign.id === id) {
        setCurrentCampaign(null);
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Failed to delete campaign';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [currentCampaign]);

  // Character actions
  const loadCharacter = useCallback(async (id: number) => {
    try {
      setIsLoading(true);
      setError(null);
      const { character } = await characterAPI.getById(id);
      setCurrentCharacter(character);
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Failed to load character';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createCharacter = useCallback(async (data: Partial<Character>) => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await characterAPI.create(data);
      
      // Set as current character
      setCurrentCharacter(result.character);
      
      // Update current campaign's userCharacter and characters list
      if (currentCampaign && data.campaign_id === currentCampaign.campaign.id) {
        setCurrentCampaign(prev => prev ? {
          ...prev,
          userCharacter: result.character,
          characters: [...prev.characters, result.character]
        } : null);
      }
      
      return result.character;
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Failed to create character';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [currentCampaign]);

  const updateCharacter = useCallback(async (id: number, data: Partial<Character>) => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await characterAPI.update(id, data);
      
      // Update current character if it's the one being updated
      if (currentCharacter && currentCharacter.id === id) {
        setCurrentCharacter(result.character);
      }
      
      // Update current campaign's characters list
      if (currentCampaign) {
        setCurrentCampaign(prev => prev ? {
          ...prev,
          characters: prev.characters.map(c => c.id === id ? result.character : c),
          userCharacter: prev.userCharacter?.id === id ? result.character : prev.userCharacter
        } : null);
      }
      
      return result.character;
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Failed to update character';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [currentCharacter, currentCampaign]);

  const deleteCharacter = useCallback(async (id: number) => {
    try {
      setIsLoading(true);
      setError(null);
      await characterAPI.delete(id);
      
      // Clear current character if it's the one being deleted
      if (currentCharacter && currentCharacter.id === id) {
        setCurrentCharacter(null);
      }
      
      // Update current campaign's characters list
      if (currentCampaign) {
        setCurrentCampaign(prev => prev ? {
          ...prev,
          characters: prev.characters.filter(c => c.id !== id),
          userCharacter: prev.userCharacter?.id === id ? null : prev.userCharacter
        } : null);
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Failed to delete character';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [currentCharacter, currentCampaign]);

  const checkCharacterInCampaign = useCallback(async (campaignId: number) => {
    try {
      const result = await campaignAPI.checkCharacter(campaignId);
      return result;
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Failed to check character';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, []);

  // Utility functions
  const generateCampaignUrl = useCallback((campaignName: string) => {
    return campaignName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  }, []);

  const value: CampaignContextType = {
    campaigns,
    currentCampaign,
    currentCharacter,
    isLoading,
    error,
    loadMyCampaigns,
    loadAllCampaigns,
    loadCampaign,
    createCampaign,
    updateCampaign,
    deleteCampaign,
    loadCharacter,
    createCharacter,
    updateCharacter,
    deleteCharacter,
    checkCharacterInCampaign,
    generateCampaignUrl,
    clearError,
    clearCurrentCampaign,
    clearCurrentCharacter,
  };

  return (
    <CampaignContext.Provider value={value}>
      {children}
    </CampaignContext.Provider>
  );
};