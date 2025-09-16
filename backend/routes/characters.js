const express = require('express');
const router = express.Router();
const Character = require('../models/Character');
const Campaign = require('../models/Campaign');
const Inventory = require('../models/Inventory');
const { authenticateToken } = require('../middleware/auth');

// Get character by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const character = await Charact    // Validate item type for slot
    const slotItemCompatibility = {
      head: ['Armor'],
      chest: ['Armor'],
      legs: ['Armor'], 
      feet: ['Armor'],
      main_hand: ['Weapon', 'Tool'], // Only weapons and tools in main hand
      off_hand: ['Weapon', 'Tool'] // Only weapons and tools in off hand (shields are weapons)
    };Id(id);
    
    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }
    
    // Check if user has permission to view this character
    if (req.user.role === 'Player' && character.player_id !== req.user.id) {
      // Check if user is in the same campaign (can see other players' characters)
      const userCharacter = await Character.findByPlayerAndCampaign(req.user.id, character.campaign_id);
      if (!userCharacter) {
        return res.status(403).json({ error: 'You do not have permission to view this character' });
      }
    }
    
    res.json({ character });
  } catch (error) {
    console.error('Error fetching character:', error);
    res.status(500).json({ error: 'Failed to fetch character' });
  }
});

// Get characters for current user
router.get('/my/characters', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'Player') {
      return res.json({ characters: [] });
    }
    
    const characters = await Character.getByPlayer(req.user.id);
    res.json({ characters });
  } catch (error) {
    console.error('Error fetching user characters:', error);
    res.status(500).json({ error: 'Failed to fetch characters' });
  }
});

// Create new character
router.post('/', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'Player') {
      return res.status(403).json({ error: 'Only players can create characters' });
    }
    
    const {
      campaign_id,
      name,
      race,
      class: characterClass,
      background,
      level = 1,
      hit_points,
      armor_class,
      abilities,
      skills = [],
      equipment = [],
      spells = [],
      backstory = '',
      personality_traits = '',
      ideals = '',
      bonds = '',
      flaws = ''
    } = req.body;
    
    // Validate required fields
    const validationErrors = Character.validateCharacterData({
      name,
      race,
      class: characterClass,
      abilities,
      level
    });
    
    if (validationErrors.length > 0) {
      return res.status(400).json({ error: validationErrors.join(', ') });
    }
    
    // Check if campaign exists
    const campaign = await Campaign.findById(campaign_id);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    // Check if user already has a character in this campaign
    const existingCharacter = await Character.findByPlayerAndCampaign(req.user.id, campaign_id);
    if (existingCharacter) {
      return res.status(400).json({ error: 'You already have a character in this campaign' });
    }
    
    const characterData = {
      player_id: req.user.id,
      campaign_id,
      name: name.trim(),
      race,
      class: characterClass,
      background,
      level,
      hit_points,
      armor_class,
      abilities,
      skills,
      equipment,
      spells,
      backstory: backstory.trim(),
      personality_traits: personality_traits.trim(),
      ideals: ideals.trim(),
      bonds: bonds.trim(),
      flaws: flaws.trim()
    };
    
    const character = await Character.create(characterData);
    res.status(201).json({
      message: 'Character created successfully',
      character
    });
  } catch (error) {
    console.error('Error creating character:', error);
    res.status(500).json({ error: 'Failed to create character' });
  }
});

// Update character
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if character exists
    const character = await Character.findById(id);
    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }
    
    // Check permissions
    if (req.user.role === 'Player' && character.player_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only edit your own characters' });
    }
    
    // DMs can edit any character in their campaigns
    if (req.user.role === 'Dungeon Master') {
      const campaign = await Campaign.findById(character.campaign_id);
      if (!campaign || campaign.dungeon_master_id !== req.user.id) {
        return res.status(403).json({ error: 'You can only edit characters in your campaigns' });
      }
    }
    
    const {
      name,
      race,
      class: characterClass,
      background,
      level,
      hit_points,
      armor_class,
      abilities,
      skills,
      equipment,
      spells,
      backstory,
      personality_traits,
      ideals,
      bonds,
      flaws
    } = req.body;
    
    // Validate character data if provided
    if (name || race || characterClass || abilities || level) {
      const validationData = {
        name: name || character.name,
        race: race || character.race,
        class: characterClass || character.class,
        abilities: abilities || character.abilities,
        level: level || character.level
      };
      
      const validationErrors = Character.validateCharacterData(validationData);
      if (validationErrors.length > 0) {
        return res.status(400).json({ error: validationErrors.join(', ') });
      }
    }
    
    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (race !== undefined) updateData.race = race;
    if (characterClass !== undefined) updateData.class = characterClass;
    if (background !== undefined) updateData.background = background;
    if (level !== undefined) updateData.level = level;
    if (hit_points !== undefined) updateData.hit_points = hit_points;
    if (armor_class !== undefined) updateData.armor_class = armor_class;
    if (abilities !== undefined) updateData.abilities = abilities;
    if (skills !== undefined) updateData.skills = skills;
    if (equipment !== undefined) updateData.equipment = equipment;
    if (spells !== undefined) updateData.spells = spells;
    if (backstory !== undefined) updateData.backstory = backstory.trim();
    if (personality_traits !== undefined) updateData.personality_traits = personality_traits.trim();
    if (ideals !== undefined) updateData.ideals = ideals.trim();
    if (bonds !== undefined) updateData.bonds = bonds.trim();
    if (flaws !== undefined) updateData.flaws = flaws.trim();
    
    const updatedCharacter = await Character.update(id, updateData);
    res.json({
      message: 'Character updated successfully',
      character: updatedCharacter
    });
  } catch (error) {
    console.error('Error updating character:', error);
    res.status(500).json({ error: 'Failed to update character' });
  }
});

// Delete character
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if character exists
    const character = await Character.findById(id);
    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }
    
    // Check permissions
    if (req.user.role === 'Player' && character.player_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own characters' });
    }
    
    // DMs can delete any character in their campaigns
    if (req.user.role === 'Dungeon Master') {
      const campaign = await Campaign.findById(character.campaign_id);
      if (!campaign || campaign.dungeon_master_id !== req.user.id) {
        return res.status(403).json({ error: 'You can only delete characters in your campaigns' });
      }
    }
    
    await Character.delete(id);
    res.json({ message: 'Character deleted successfully' });
  } catch (error) {
    console.error('Error deleting character:', error);
    res.status(500).json({ error: 'Failed to delete character' });
  }
});

// Get D&D 5e reference data for character creation
router.get('/reference/data', async (req, res) => {
  try {
    // Get equipment from inventory table
    const equipment = await Inventory.getEquipmentForCharacterCreation();

    const referenceData = {
      races: [
        { name: 'Human', abilities: { any: 1 }, traits: ['Extra Skill', 'Extra Feat'] },
        { name: 'Elf', abilities: { dex: 2 }, traits: ['Darkvision', 'Fey Ancestry', 'Trance'] },
        { name: 'Dwarf', abilities: { con: 2 }, traits: ['Darkvision', 'Dwarven Resilience', 'Stonecunning'] },
        { name: 'Halfling', abilities: { dex: 2 }, traits: ['Lucky', 'Brave', 'Halfling Nimbleness'] },
        { name: 'Dragonborn', abilities: { str: 2, cha: 1 }, traits: ['Draconic Ancestry', 'Breath Weapon', 'Damage Resistance'] },
        { name: 'Gnome', abilities: { int: 2 }, traits: ['Darkvision', 'Gnome Cunning'] },
        { name: 'Half-Elf', abilities: { cha: 2, any: 1 }, traits: ['Darkvision', 'Fey Ancestry', 'Extra Skills'] },
        { name: 'Half-Orc', abilities: { str: 2, con: 1 }, traits: ['Darkvision', 'Relentless Endurance', 'Savage Attacks'] },
        { name: 'Tiefling', abilities: { cha: 2, int: 1 }, traits: ['Darkvision', 'Hellish Resistance', 'Infernal Legacy'] }
      ],
      classes: [
        { name: 'Fighter', hitDie: 10, primaryAbility: ['str', 'dex'], savingThrows: ['str', 'con'] },
        { name: 'Wizard', hitDie: 6, primaryAbility: ['int'], savingThrows: ['int', 'wis'] },
        { name: 'Rogue', hitDie: 8, primaryAbility: ['dex'], savingThrows: ['dex', 'int'] },
        { name: 'Cleric', hitDie: 8, primaryAbility: ['wis'], savingThrows: ['wis', 'cha'] },
        { name: 'Ranger', hitDie: 10, primaryAbility: ['dex', 'wis'], savingThrows: ['str', 'dex'] },
        { name: 'Paladin', hitDie: 10, primaryAbility: ['str', 'cha'], savingThrows: ['wis', 'cha'] },
        { name: 'Barbarian', hitDie: 12, primaryAbility: ['str'], savingThrows: ['str', 'con'] },
        { name: 'Bard', hitDie: 8, primaryAbility: ['cha'], savingThrows: ['dex', 'cha'] },
        { name: 'Druid', hitDie: 8, primaryAbility: ['wis'], savingThrows: ['int', 'wis'] },
        { name: 'Monk', hitDie: 8, primaryAbility: ['dex', 'wis'], savingThrows: ['str', 'dex'] },
        { name: 'Sorcerer', hitDie: 6, primaryAbility: ['cha'], savingThrows: ['con', 'cha'] },
        { name: 'Warlock', hitDie: 8, primaryAbility: ['cha'], savingThrows: ['wis', 'cha'] }
      ],
      backgrounds: [
        'Acolyte', 'Criminal', 'Folk Hero', 'Noble', 'Sage', 'Soldier',
        'Charlatan', 'Entertainer', 'Guild Artisan', 'Hermit', 'Outlander', 'Sailor'
      ],
      skills: [
        'Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception', 'History',
        'Insight', 'Intimidation', 'Investigation', 'Medicine', 'Nature', 'Perception',
        'Performance', 'Persuasion', 'Religion', 'Sleight of Hand', 'Stealth', 'Survival'
      ],
      equipment
    };
    
    res.json(referenceData);
  } catch (error) {
    console.error('Error fetching reference data:', error);
    res.status(500).json({ error: 'Failed to fetch reference data' });
  }
});

// Get all inventory items
router.get('/inventory/all', authenticateToken, async (req, res) => {
  try {
    const items = await Inventory.getAllItems();
    res.json(items);
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({ error: 'Failed to fetch inventory items' });
  }
});

// Get inventory items by category
router.get('/inventory/category/:category', authenticateToken, async (req, res) => {
  try {
    const { category } = req.params;
    const items = await Inventory.getItemsByCategory(category);
    res.json(items);
  } catch (error) {
    console.error('Error fetching inventory by category:', error);
    res.status(500).json({ error: 'Failed to fetch inventory items' });
  }
});

// Get specific item details
router.get('/inventory/item/:itemName', authenticateToken, async (req, res) => {
  try {
    const { itemName } = req.params;
    const item = await Inventory.getItemByName(decodeURIComponent(itemName));
    
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    res.json(item);
  } catch (error) {
    console.error('Error fetching item details:', error);
    res.status(500).json({ error: 'Failed to fetch item details' });
  }
});

// Get character equipment with full details
router.get('/:id/equipment-details', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const character = await Character.findById(id);
    
    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // Check if user owns this character or is the DM
    const campaign = await Campaign.findById(character.campaign_id);
    if (character.player_id !== req.user.id && campaign.dungeon_master_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get full equipment details from inventory
    const equipmentDetails = await Inventory.getItemsByNames(character.equipment);
    
    res.json({
      character_id: character.id,
      character_name: character.name,
      equipment: equipmentDetails
    });
  } catch (error) {
    console.error('Error fetching character equipment details:', error);
    res.status(500).json({ error: 'Failed to fetch equipment details' });
  }
});

// Get character equipped items
router.get('/:id/equipped', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const character = await Character.findById(id);
    
    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // Check permissions
    const campaign = await Campaign.findById(character.campaign_id);
    if (character.player_id !== req.user.id && campaign.dungeon_master_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get equipped items with full details
    const equippedItems = character.equipped_items || {};
    const equippedItemNames = Object.values(equippedItems).filter(Boolean);
    const equippedDetails = await Inventory.getItemsByNames(equippedItemNames);
    
    // Map back to slots
    const equippedWithSlots = {};
    for (const [slot, itemName] of Object.entries(equippedItems)) {
      if (itemName) {
        const itemDetails = equippedDetails.find(item => item.item_name === itemName);
        equippedWithSlots[slot] = itemDetails || { item_name: itemName };
      } else {
        equippedWithSlots[slot] = null;
      }
    }
    
    res.json({
      character_id: character.id,
      equipped_items: equippedWithSlots
    });
  } catch (error) {
    console.error('Error fetching equipped items:', error);
    res.status(500).json({ error: 'Failed to fetch equipped items' });
  }
});

// Equip an item to a specific slot
router.post('/:id/equip', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { itemName, slot } = req.body;
    
    if (!itemName || !slot) {
      return res.status(400).json({ error: 'Item name and slot are required' });
    }
    
    const validSlots = ['head', 'chest', 'legs', 'feet', 'main_hand', 'off_hand'];
    if (!validSlots.includes(slot)) {
      return res.status(400).json({ error: 'Invalid slot. Valid slots are: ' + validSlots.join(', ') });
    }
    
    const character = await Character.findById(id);
    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // Check permissions
    const campaign = await Campaign.findById(character.campaign_id);
    if (character.player_id !== req.user.id && campaign.dungeon_master_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get item details from inventory
    const item = await Inventory.getItemByName(itemName);
    if (!item) {
      return res.status(404).json({ error: 'Item not found in inventory' });
    }

    // Validate item type vs slot compatibility
    const slotItemCompatibility = {
      head: ['Armor'],
      chest: ['Armor'],
      legs: ['Armor'], 
      feet: ['Armor'],
      main_hand: ['Weapon', 'Tool'], // Only weapons and tools in main hand
      off_hand: ['Weapon', 'Tool'] // Only weapons and tools in off hand (shields are weapons)
    };

    if (!slotItemCompatibility[slot].includes(item.category)) {
      return res.status(400).json({ 
        error: `Cannot equip ${item.category} in ${slot} slot. Valid categories for ${slot}: ${slotItemCompatibility[slot].join(', ')}` 
      });
    }

    // Additional validation for specific items
    if (slot === 'head' && item.subcategory && !item.subcategory.toLowerCase().includes('helmet') && !item.subcategory.toLowerCase().includes('hat') && !item.subcategory.toLowerCase().includes('circlet')) {
      return res.status(400).json({ error: 'Only head armor can be equipped in head slot' });
    }
    if ((slot === 'chest' || slot === 'legs') && item.subcategory && item.subcategory.toLowerCase().includes('shield')) {
      return res.status(400).json({ error: 'Shields cannot be equipped in chest or legs slots' });
    }
    if (slot === 'feet' && item.subcategory && !item.subcategory.toLowerCase().includes('boot') && !item.subcategory.toLowerCase().includes('shoe')) {
      return res.status(400).json({ error: 'Only foot armor can be equipped in feet slot' });
    }

    // Check if character has this item in their equipment
    if (!character.equipment.includes(itemName)) {
      return res.status(400).json({ error: 'Character does not have this item in their inventory' });
    }

    // Get current equipped items
    const equippedItems = character.equipped_items || {};
    
    // Check if something is already equipped in this slot
    const currentlyEquipped = equippedItems[slot];
    
    // Update equipped items
    const newEquippedItems = { ...equippedItems };
    newEquippedItems[slot] = itemName;
    
    // Update equipment list (add previously equipped item back)
    let newEquipment = [...character.equipment];
    
    // Don't remove the item being equipped from inventory - it should stay there
    // Items remain in inventory when equipped, they're just hidden in the UI to avoid duplication
    
    // If something was previously equipped in this slot, add it back to inventory if not already there
    if (currentlyEquipped && !newEquipment.includes(currentlyEquipped)) {
      newEquipment.push(currentlyEquipped);
    }

    // Update character in database
    const updatedCharacter = await Character.update(id, {
      equipped_items: newEquippedItems,
      equipment: newEquipment
    });

    // Emit real-time update via WebSocket
    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${character.campaign_id}`).emit('equipmentChanged', {
        characterId: character.id,
        action: 'equip',
        slot,
        itemName,
        previousItem: currentlyEquipped,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      message: 'Item equipped successfully',
      character: updatedCharacter,
      equipped_item: item,
      slot,
      previous_item: currentlyEquipped
    });
  } catch (error) {
    console.error('Error equipping item:', error);
    res.status(500).json({ error: 'Failed to equip item' });
  }
});

// Unequip an item from a specific slot
router.post('/:id/unequip', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { slot } = req.body;
    
    if (!slot) {
      return res.status(400).json({ error: 'Slot is required' });
    }
    
    const validSlots = ['head', 'chest', 'legs', 'feet', 'main_hand', 'off_hand'];
    if (!validSlots.includes(slot)) {
      return res.status(400).json({ error: 'Invalid slot. Valid slots are: ' + validSlots.join(', ') });
    }
    
    const character = await Character.findById(id);
    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // Check permissions
    const campaign = await Campaign.findById(character.campaign_id);
    if (character.player_id !== req.user.id && campaign.dungeon_master_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get current equipped items
    const equippedItems = character.equipped_items || {};
    const itemToUnequip = equippedItems[slot];
    
    if (!itemToUnequip) {
      return res.status(400).json({ error: 'No item equipped in this slot' });
    }

    // Update equipped items
    const newEquippedItems = { ...equippedItems };
    newEquippedItems[slot] = null;
    
    // Items remain in inventory when equipped/unequipped - no need to add back
    // The item is already in the equipment list, just needs to be unequipped from the slot
    const newEquipment = [...character.equipment];

    // Update character in database
    const updatedCharacter = await Character.update(id, {
      equipped_items: newEquippedItems,
      equipment: newEquipment
    });

    // Emit real-time update via WebSocket
    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${character.campaign_id}`).emit('equipmentChanged', {
        characterId: character.id,
        action: 'unequip',
        slot,
        itemName: itemToUnequip,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      message: 'Item unequipped successfully',
      character: updatedCharacter,
      unequipped_item: itemToUnequip,
      slot
    });
  } catch (error) {
    console.error('Error unequipping item:', error);
    res.status(500).json({ error: 'Failed to unequip item' });
  }
});

module.exports = router;