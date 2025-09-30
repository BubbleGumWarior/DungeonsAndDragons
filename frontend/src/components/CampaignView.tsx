import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCampaign } from '../contexts/CampaignContext';
import { characterAPI, InventoryItem } from '../services/api';
import ConfirmationModal from './ConfirmationModal';
import FigureImage from '../assets/images/Board/Figure.png';
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
  const [activeTab, setActiveTab] = useState<'board' | 'inventory' | 'skills' | 'equip'>('board');
  const [equipmentDetails, setEquipmentDetails] = useState<{ [characterId: number]: InventoryItem[] }>({});
  const [equippedItems, setEquippedItems] = useState<{ [characterId: number]: Record<string, InventoryItem | null> }>({});
  const [socket, setSocket] = useState<any>(null);
  const [draggedItem, setDraggedItem] = useState<{ item: InventoryItem; fromSlot?: string } | null>(null);
  const [showUnequipZone, setShowUnequipZone] = useState(false);
  const [inventoryFilter, setInventoryFilter] = useState<'all' | 'weapon' | 'armor' | 'tool'>('all');

  useEffect(() => {
    if (campaignName) {
      loadCampaign(campaignName).catch(() => {
        // Error is handled by the context
      });
    }
  }, [campaignName, loadCampaign]);

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

  const handleBackToDashboard = () => {
    navigate('/dashboard');
  };

  const handleDeleteCharacter = (characterId: number, characterName: string) => {
    setDeleteModal({ 
      isOpen: true, 
      characterId, 
      characterName 
    });
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
      
      setSocket(newSocket);
      
      return () => {
        newSocket.emit('leaveCampaign', currentCampaign.campaign.id);
        newSocket.disconnect();
      };
    }
  }, [currentCampaign, loadEquippedItems, loadEquipmentDetails]);

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
      { id: 'head', name: 'Helmet/Hat', className: 'head', icon: '🪖' },
      { id: 'chest', name: 'Armor/Clothing', className: 'chest', icon: '🛡️' },
      { id: 'legs', name: 'Leggings', className: 'pelvis', icon: '👖' },
      { id: 'main_hand', name: 'Main Hand', className: 'left-hand', icon: '⚔️' },
      { id: 'off_hand', name: 'Off Hand', className: 'right-hand', icon: '🛡️' },
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
                          {slot.icon}
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
                  {['all Item', 'weapon', 'armor', 'tool'].map(filter => (
                    <button
                      key={filter}
                      className={`filter-button ${inventoryFilter === filter ? 'active' : ''}`}
                      onClick={() => setInventoryFilter(filter as any)}
                    >
                      {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}s
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
          <h6>🎒 Equipment & Inventory</h6>
          {character.equipment && character.equipment.length > 0 ? (
            <div style={{ display: 'grid', gap: '1rem' }}>
              {character.equipment.map((itemName: string, index: number) => {
                // Find detailed information for this item
                const itemDetails = characterEquipmentDetails.find(detail => detail.item_name === itemName);
                
                return (
                  <div key={index} style={{ 
                    padding: '1rem', 
                    background: 'rgba(255, 255, 255, 0.08)',
                    borderRadius: '0.75rem',
                    border: '1px solid rgba(212, 193, 156, 0.3)',
                    transition: 'all 0.2s ease'
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                      <div>
                        <div className="text-gold" style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '0.25rem' }}>
                          {itemName}
                        </div>
                        {itemDetails && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {itemDetails.category} {itemDetails.subcategory && `• ${itemDetails.subcategory}`}
                          </div>
                        )}
                      </div>
                      {itemDetails?.rarity && itemDetails.rarity !== 'Common' && (
                        <span style={{
                          fontSize: '0.7rem',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '1rem',
                          background: itemDetails.rarity === 'Rare' ? 'rgba(59, 130, 246, 0.2)' : 
                                    itemDetails.rarity === 'Uncommon' ? 'rgba(34, 197, 94, 0.2)' : 
                                    'rgba(212, 193, 156, 0.2)',
                          color: itemDetails.rarity === 'Rare' ? '#60a5fa' : 
                               itemDetails.rarity === 'Uncommon' ? '#4ade80' : 
                               'var(--text-gold)',
                          border: '1px solid currentColor'
                        }}>
                          {itemDetails.rarity}
                        </span>
                      )}
                    </div>

                    {/* Item Description */}
                    {itemDetails?.description ? (
                      <div style={{ 
                        fontSize: '0.9rem', 
                        color: 'var(--text-secondary)', 
                        lineHeight: '1.5',
                        marginBottom: '0.75rem'
                      }}>
                        {itemDetails.description}
                      </div>
                    ) : (
                      <div style={{ 
                        fontSize: '0.85rem', 
                        color: 'var(--text-muted)', 
                        fontStyle: 'italic',
                        marginBottom: '0.75rem'
                      }}>
                        {hasDetailedData ? 'Item details not found in inventory database' : 'Loading item details...'}
                      </div>
                    )}

                    {/* Item Stats */}
                    {itemDetails && (
                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', 
                        gap: '0.75rem',
                        padding: '0.75rem',
                        background: 'rgba(255, 255, 255, 0.05)',
                        borderRadius: '0.5rem',
                        border: '1px solid rgba(212, 193, 156, 0.2)'
                      }}>
                        {itemDetails.damage_dice && (
                          <div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>
                              Damage
                            </div>
                            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                              {itemDetails.damage_dice} {itemDetails.damage_type}
                            </div>
                          </div>
                        )}
                        {itemDetails.range_normal && (
                          <div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>
                              Range
                            </div>
                            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                              {itemDetails.range_normal}/{itemDetails.range_long} ft
                            </div>
                          </div>
                        )}
                        {itemDetails.armor_class && (
                          <div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>
                              Armor Class
                            </div>
                            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                              {itemDetails.armor_class > 10 ? itemDetails.armor_class : `+${itemDetails.armor_class}`}
                            </div>
                          </div>
                        )}
                        {itemDetails.weight && (
                          <div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>
                              Weight
                            </div>
                            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                              {itemDetails.weight} lb
                            </div>
                          </div>
                        )}
                        {itemDetails.cost_cp && (
                          <div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>
                              Value
                            </div>
                            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                              {itemDetails.cost_cp >= 100 ? `${Math.floor(itemDetails.cost_cp / 100)} gp` : `${itemDetails.cost_cp} cp`}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Item Properties */}
                    {itemDetails?.properties && itemDetails.properties.length > 0 && (
                      <div style={{ marginTop: '0.75rem' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                          Properties
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                          {itemDetails.properties.map((prop, propIndex) => (
                            <span key={propIndex} style={{
                              fontSize: '0.75rem',
                              padding: '0.25rem 0.5rem',
                              background: 'rgba(212, 193, 156, 0.2)',
                              color: 'var(--text-gold)',
                              borderRadius: '0.75rem',
                              border: '1px solid rgba(212, 193, 156, 0.3)'
                            }}>
                              {prop}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Special Warnings */}
                    {itemDetails?.stealth_disadvantage && (
                      <div style={{ 
                        marginTop: '0.75rem',
                        padding: '0.5rem',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '0.5rem',
                        fontSize: '0.8rem',
                        color: '#fca5a5'
                      }}>
                        ⚠️ This armor gives disadvantage on Stealth checks
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
  const isDungeonMaster = user?.role === 'Dungeon Master' && campaign.dungeon_master_id === user.id;

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

        {/* Campaign Content */}
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
          {/* Character List */}
          <div style={{ flex: '0 0 300px' }}>
            <div className="glass-panel">
              <h6>👥 Characters ({characters.length})</h6>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {characters.map((character) => (
                  <div 
                    key={character.id}
                    onClick={() => setSelectedCharacter(character.id)}
                    style={{
                      padding: '1rem',
                      background: selectedCharacter === character.id 
                        ? 'rgba(212, 193, 156, 0.2)' 
                        : 'rgba(255, 255, 255, 0.08)',
                      border: selectedCharacter === character.id 
                        ? '2px solid var(--primary-gold)' 
                        : '1px solid rgba(212, 193, 156, 0.2)',
                      borderRadius: '0.75rem',
                      cursor: 'pointer',
                      transition: 'all var(--transition-normal)'
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
                    <div className="text-gold" style={{ fontWeight: 'bold', fontSize: '1rem', marginBottom: '0.5rem' }}>
                      {character.name}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                      Level {character.level} {character.race} {character.class}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Player: {character.player_name}
                    </div>
                    
                    {/* Delete button for DM */}
                    {isDungeonMaster && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCharacter(character.id, character.name);
                        }}
                        style={{
                          marginTop: '0.5rem',
                          padding: '0.25rem 0.5rem',
                          background: 'rgba(220, 53, 69, 0.2)',
                          border: '1px solid rgba(220, 53, 69, 0.4)',
                          borderRadius: '0.25rem',
                          color: '#f5c6cb',
                          fontSize: '0.7rem',
                          cursor: 'pointer',
                          float: 'right'
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Character Details Panel */}
          <div style={{ flex: '1', minWidth: 0 }}>
            {selectedCharacterData ? (
              <div>
                {/* Character Tab Navigation */}
                <div className="glass-panel" style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <h5 style={{ margin: 0, color: 'var(--text-gold)' }}>{selectedCharacterData.name}</h5>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {(['board', 'inventory', 'equip'] as const).map((tab) => (
                        <button
                          key={tab}
                          onClick={() => setActiveTab(tab)}
                          className={`tab-button ${activeTab === tab ? 'active' : ''}`}
                          style={{
                            padding: '0.5rem 1rem',
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
                           tab === 'inventory' ? '🎒 Inventory' : 
                           '⚔️ Equipment'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Tab Content */}
                {activeTab === 'board' && (
                  <div className="glass-panel">
                    <h6>📋 Character Overview</h6>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                      <div>
                        <h6 className="text-gold">Basic Info</h6>
                        <p><strong>Race:</strong> {selectedCharacterData.race}</p>
                        <p><strong>Class:</strong> {selectedCharacterData.class}</p>
                        <p><strong>Level:</strong> {selectedCharacterData.level}</p>
                        <p><strong>Background:</strong> {selectedCharacterData.background || 'None'}</p>
                      </div>
                      <div>
                        <h6 className="text-gold">Combat Stats</h6>
                        <p><strong>Hit Points:</strong> {selectedCharacterData.hit_points}</p>
                        <p><strong>Armor Class:</strong> {selectedCharacterData.armor_class}</p>
                      </div>
                      <div>
                        <h6 className="text-gold">Abilities</h6>
                        {Object.entries(selectedCharacterData.abilities).map(([ability, score]) => (
                          <p key={ability}>
                            <strong>{ability.toUpperCase()}:</strong> {score as number} 
                            ({Math.floor((score as number - 10) / 2) >= 0 ? '+' : ''}{Math.floor((score as number - 10) / 2)})
                          </p>
                        ))}
                      </div>
                    </div>
                    
                    {selectedCharacterData.backstory && (
                      <div style={{ marginTop: '2rem' }}>
                        <h6 className="text-gold">Backstory</h6>
                        <p style={{ lineHeight: '1.6' }}>{selectedCharacterData.backstory}</p>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'inventory' && renderInventoryTab(selectedCharacterData)}
                {activeTab === 'equip' && renderEquipTab(selectedCharacterData)}
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
        </div>

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
      </div>
    </div>
  );
};

export default CampaignView;