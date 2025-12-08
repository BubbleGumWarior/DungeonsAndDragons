import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCampaign } from '../contexts/CampaignContext';
import { characterAPI, inventoryAPI, monsterAPI, InventoryItem, Monster } from '../services/api';
import ConfirmationModal from './ConfirmationModal';
import FigureImage from '../assets/images/Board/Figure.png';
import WorldMapImage from '../assets/images/Campaign/WorldMap.jpg';
import BattleMapImage from '../assets/images/Campaign/BattleMap.jpg';
import io from 'socket.io-client';

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
  const [activeTab, setActiveTab] = useState<'board' | 'sheet' | 'inventory' | 'skills' | 'equip'>('board');
  const [mainView, setMainView] = useState<'character' | 'campaign'>('character');
  const [campaignTab, setCampaignTab] = useState<'map' | 'battle' | 'news' | 'journal' | 'encyclopedia'>('map');
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
  const [draggedCharacter, setDraggedCharacter] = useState<number | null>(null);
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
    if (campaignName && (campaignTab === 'map' || campaignTab === 'battle')) {
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

  // Reset backstory page when character changes
  useEffect(() => {
    setBackstoryPage(0);
    setPageDirection(null);
  }, [selectedCharacter]);

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

  // Socket connection for real-time updates
  useEffect(() => {
    if (currentCampaign) {
      const newSocket = io(process.env.REACT_APP_API_URL || 'http://localhost:5000');
      
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
        console.log('📍 Received battle map character movement:', data);
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
        console.log('📊 Battle movement sync received:', data);
        setRemainingMovement(data.movementState);
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
        console.log('⚔️ Battle combat sync received:', data);
        setCombatants(data.combatants);
        setInitiativeOrder(data.initiativeOrder);
        setCurrentTurnIndex(data.currentTurnIndex);
      });

      // Listen for next turn event (DM resets all movement)
      newSocket.on('turnReset', (data: {
        resetMovement: Record<number, number>;
        timestamp: string;
      }) => {
        console.log('🔄 Turn reset received:', data);
        setRemainingMovement(data.resetMovement);
      });

      // Listen for combat invites (player receives)
      newSocket.on('combatInvite', (data: {
        campaignId: number;
        characterId: number;
        targetPlayerId: number;
        timestamp: string;
      }) => {
        console.log('📣 Combat invite received:', data);
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
        console.log('🛡️ Combatants updated:', data);
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
        console.log('➡️ Turn advanced:', data);
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
        console.log('🔄 Combat reset received:', data);
        // Clear all combat state
        setCombatants([]);
        setInitiativeOrder([]);
        setCurrentTurnIndex(-1);
        // Reload campaign to get updated combat_active flags
        if (campaignName) {
          loadCampaign(campaignName);
        }
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
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      {character.player_name}
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
            {/* Campaign Tab Navigation */}
            <div className="glass-panel" style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                {(['map', 'battle', 'encyclopedia', 'news', 'journal'] as const).map((tab) => (
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
                     tab === 'battle' ? '⚔️ Battle Area' :
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
                      console.log('🎯 Emitting character movement:', moveData);
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
                              src={`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}${character.image_url}`}
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

            {campaignTab === 'battle' && (
              <div className="glass-panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h5 style={{ color: 'var(--text-gold)', margin: 0 }}>⚔️ Battle Area</h5>
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
                                console.log(currentTurnIndex === -1 ? '⚔️ Starting combat' : '🔄 Next turn emitted');
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
                      console.log('🎯 Emitting battle character movement:', moveData);
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
                      ? `${process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:5000'}${character?.image_url || monsterTemplate?.image_url}`
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
                              console.log('🎯 Drag started for:', name, 'at position:', position);
                              setDraggedCharacter(combatant.characterId);
                              setDragStartPosition({ x: position.x, y: position.y });
                              setCurrentDragPosition(null);
                            }
                          }}
                          onDragEnd={() => {
                            console.log('🎯 Drag ended');
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
                        ? `${process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:5000'}${monster.image_url}`
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
                      ? (['board', 'sheet', 'inventory', 'equip'] as const)
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
                         '⚔️ Equipment'}
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
                          src={`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}${selectedCharacterData.image_url}`}
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
                
                {/* Show access denied message for restricted tabs */}
                {(activeTab === 'inventory' || activeTab === 'equip') && !canViewAllTabs(selectedCharacterData.id) && (
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
        {/* End of Character View */}

          </div>
        </div>
        {/* End of Main Content Area */}

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
              console.log('🔄 Combat reset emitted');
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
                            console.log(`📣 Invited ${character.name} to combat`);
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
                        ? `${process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:5000'}${monster.image_url}`
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
                              console.log(`📣 Added ${monster.name} to combat`);
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
                      console.log(`🛡️ Accepted combat invite for ${combatInvite.characterName}`);
                      setShowCombatInviteModal(false);
                      setCombatInvite(null);
                      // Navigate to campaign view and battle tab
                      setMainView('campaign');
                      setCampaignTab('battle');
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
      </div>
    </div>
  );
};

export default CampaignView;
