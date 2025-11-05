const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('../models/database');
const Character = require('../models/Character');
const Campaign = require('../models/Campaign');
const Inventory = require('../models/Inventory');
const { authenticateToken } = require('../middleware/auth');

// Configure multer for character image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '..', 'uploads', 'characters');
    // Ensure directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Create unique filename: characterId_timestamp.ext
    const uniqueSuffix = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `character_${req.params.id}_${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    // Accept only image files
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
    }
  }
});

// Get character by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const character = await Character.findById(id);
    
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
    
    // Calculate limb-specific AC
    const limbAC = {
      head: 12,    // Head has base AC of 12 (harder to hit)
      chest: character.armor_class || 10,  // Only chest gets character's base AC
      main_hand: 0,    // Default AC 0 for main hand
      off_hand: 0,     // Default AC 0 for off hand
      feet: 0      // Default AC 0 for unarmored feet
    };
    
    // Apply armor bonuses from equipped items
    for (const [slot, item] of Object.entries(equippedWithSlots)) {
      if (item && item.limb_armor_class) {
        // Add AC from this item to the appropriate limbs
        for (const [limb, ac] of Object.entries(item.limb_armor_class)) {
          // Special handling for shields and hand armor
          if (limb === 'hands') {
            // Apply shield/hand armor to the specific hand slot where it's equipped
            if (slot === 'main_hand') {
              limbAC.main_hand = ac;
            } else if (slot === 'off_hand') {
              limbAC.off_hand = ac;
            }
          } else if (limb === 'head') {
            // Add helmet AC to the base head AC of 12
            limbAC.head = 12 + ac;
          } else if (limbAC.hasOwnProperty(limb)) {
            // For chest armor, replace the base AC; for other limbs, set the AC
            if (limb === 'chest') {
              limbAC[limb] = ac;
            } else {
              limbAC[limb] = ac;
            }
          }
        }
      }
    }
    
    // Convert to the expected format (both hands share the same keys for display)
    const displayLimbAC = {
      head: limbAC.head,
      chest: limbAC.chest,
      hands: Math.max(limbAC.main_hand, limbAC.off_hand), // Show the higher AC for display
      main_hand: limbAC.main_hand,
      off_hand: limbAC.off_hand,
      feet: limbAC.feet
    };
    
    res.json({
      character_id: character.id,
      equipped_items: equippedWithSlots,
      limb_ac: displayLimbAC
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
      off_hand: ['Weapon', 'Tool', 'Armor'] // Weapons, tools, and shields (armor subcategory)
    };

    // Special validation for off-hand armor - only shields allowed
    if (slot === 'off_hand' && item.category === 'Armor' && (!item.subcategory || !item.subcategory.toLowerCase().includes('shield'))) {
      return res.status(400).json({ 
        error: `Only shields can be equipped in the off-hand slot for armor items.` 
      });
    }

    if (!slotItemCompatibility[slot].includes(item.category)) {
      return res.status(400).json({ 
        error: `Cannot equip ${item.category} in ${slot} slot. Valid categories for ${slot}: ${slotItemCompatibility[slot].join(', ')}` 
      });
    }

    // Additional validation for armor items to ensure proper slot assignment
    if (item.category === 'Armor') {
      const subcategory = item.subcategory ? item.subcategory.toLowerCase() : '';
      
      // Shield validation
      if (subcategory.includes('shield')) {
        if (slot !== 'off_hand') {
          return res.status(400).json({ error: 'Shields can only be equipped in the off-hand slot' });
        }
      }
      // Boot validation - boots should only go to feet
      else if (subcategory.includes('boot') || item.item_name.toLowerCase().includes('boot')) {
        if (slot !== 'feet') {
          return res.status(400).json({ error: 'Boots can only be equipped in the feet slot' });
        }
      }
      // Helmet/head armor validation
      else if (subcategory.includes('helmet') || subcategory.includes('hat') || subcategory.includes('circlet') || 
               subcategory === 'Helmet' ||
               item.item_name.toLowerCase().includes('helmet') || item.item_name.toLowerCase().includes('hat') || 
               item.item_name.toLowerCase().includes('circlet') || item.item_name.toLowerCase().includes('crown')) {
        if (slot !== 'head') {
          return res.status(400).json({ error: 'Head armor can only be equipped in the head slot' });
        }
      }
      // General armor (chest pieces) validation
      else if (subcategory.includes('light armor') || subcategory.includes('medium armor') || subcategory.includes('heavy armor') ||
               item.item_name.toLowerCase().includes('mail') || item.item_name.toLowerCase().includes('armor') ||
               item.item_name.toLowerCase().includes('breastplate') || item.item_name.toLowerCase().includes('plate')) {
        if (slot !== 'chest') {
          return res.status(400).json({ error: 'Body armor can only be equipped in the chest slot' });
        }
      }
    }

    // Slot-specific validation to ensure only appropriate items can go in each slot
    if (slot === 'head' && item.category === 'Armor') {
      const subcategory = item.subcategory ? item.subcategory.toLowerCase() : '';
      const itemName = item.item_name.toLowerCase();
      const isHelmet = subcategory.includes('helmet') || subcategory === 'helmet' || 
                      subcategory.includes('hat') || subcategory.includes('circlet') ||
                      itemName.includes('helmet') || itemName.includes('hat') || 
                      itemName.includes('circlet') || itemName.includes('crown');
      
      if (!isHelmet) {
        return res.status(400).json({ error: 'Only head armor (helmets, hats, circlets) can be equipped in head slot' });
      }
    }
    
    if (slot === 'feet' && item.category === 'Armor') {
      const subcategory = item.subcategory ? item.subcategory.toLowerCase() : '';
      const itemName = item.item_name.toLowerCase();
      if (!subcategory.includes('boot') && !subcategory.includes('shoe') && 
          !itemName.includes('boot') && !itemName.includes('shoe')) {
        return res.status(400).json({ error: 'Only foot armor (boots, shoes) can be equipped in feet slot' });
      }
    }
    
    if (slot === 'chest' && item.category === 'Armor') {
      const subcategory = item.subcategory ? item.subcategory.toLowerCase() : '';
      const itemName = item.item_name.toLowerCase();
      if (subcategory.includes('shield') || subcategory.includes('boot') || subcategory.includes('helmet') ||
          itemName.includes('shield') || itemName.includes('boot') || itemName.includes('helmet') ||
          itemName.includes('hat') || itemName.includes('shoe') || itemName.includes('circlet')) {
        return res.status(400).json({ error: 'Only body armor can be equipped in chest slot' });
      }
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

// Add item to character inventory (DM only)
router.post('/:id/add-item', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { itemName } = req.body;
    
    if (!itemName) {
      return res.status(400).json({ error: 'Item name is required' });
    }
    
    const character = await Character.findById(id);
    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // Check if user is DM for this campaign
    const campaign = await Campaign.findById(character.campaign_id);
    if (req.user.role !== 'Dungeon Master' || campaign.dungeon_master_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the dungeon master can add items to character inventories' });
    }

    // Add item to character equipment
    const newEquipment = [...character.equipment, itemName];
    
    const updatedCharacter = await Character.update(id, {
      equipment: newEquipment
    });

    // Emit real-time update via WebSocket
    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${character.campaign_id}`).emit('inventoryChanged', {
        characterId: character.id,
        action: 'add',
        itemName,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      message: 'Item added successfully',
      character: updatedCharacter,
      added_item: itemName
    });
  } catch (error) {
    console.error('Error adding item to inventory:', error);
    res.status(500).json({ error: 'Failed to add item to inventory' });
  }
});

// Remove item from character inventory (DM only)
router.post('/:id/remove-item', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { itemName } = req.body;
    
    if (!itemName) {
      return res.status(400).json({ error: 'Item name is required' });
    }
    
    const character = await Character.findById(id);
    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // Check if user is DM for this campaign
    const campaign = await Campaign.findById(character.campaign_id);
    if (req.user.role !== 'Dungeon Master' || campaign.dungeon_master_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the dungeon master can remove items from character inventories' });
    }

    // Check if character has this item
    if (!character.equipment.includes(itemName)) {
      return res.status(400).json({ error: 'Character does not have this item in their inventory' });
    }

    // Remove item from character equipment (only first occurrence)
    const newEquipment = [...character.equipment];
    const itemIndex = newEquipment.indexOf(itemName);
    if (itemIndex > -1) {
      newEquipment.splice(itemIndex, 1);
    }

    // Also unequip the item if it's equipped
    const equippedItems = character.equipped_items || {};
    const newEquippedItems = { ...equippedItems };
    let unequippedSlot = null;
    
    for (const [slot, equippedItem] of Object.entries(equippedItems)) {
      if (equippedItem === itemName) {
        newEquippedItems[slot] = null;
        unequippedSlot = slot;
        break;
      }
    }
    
    const updatedCharacter = await Character.update(id, {
      equipment: newEquipment,
      equipped_items: newEquippedItems
    });

    // Emit real-time update via WebSocket
    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${character.campaign_id}`).emit('inventoryChanged', {
        characterId: character.id,
        action: 'remove',
        itemName,
        unequippedFrom: unequippedSlot,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      message: 'Item removed successfully',
      character: updatedCharacter,
      removed_item: itemName,
      unequipped_from: unequippedSlot
    });
  } catch (error) {
    console.error('Error removing item from inventory:', error);
    res.status(500).json({ error: 'Failed to remove item from inventory' });
  }
});

// Create custom item and add to character inventory (DM only)
router.post('/:id/create-custom-item', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      itemName, 
      category, 
      subcategory, 
      description, 
      damage_dice,
      damage_type,
      range_normal,
      range_long,
      armor_class,
      weight,
      cost_cp,
      strength_requirement,
      stealth_disadvantage,
      properties,
      rarity,
      attunement_required
    } = req.body;
    
    if (!itemName || !category || !description) {
      return res.status(400).json({ error: 'Item name, category, and description are required' });
    }
    
    const character = await Character.findById(id);
    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // Check if user is DM for this campaign
    const campaign = await Campaign.findById(character.campaign_id);
    if (req.user.role !== 'Dungeon Master' || campaign.dungeon_master_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the dungeon master can create custom items' });
    }

    // Create the custom item in the inventory database
    const customItem = {
      item_name: itemName,
      category: category || 'General',
      subcategory: subcategory || '',
      description: description,
      damage_dice: damage_dice || null,
      damage_type: damage_type || null,
      range_normal: range_normal || null,
      range_long: range_long || null,
      armor_class: armor_class || null,
      weight: weight || null,
      cost_cp: cost_cp || null,
      strength_requirement: strength_requirement || null,
      stealth_disadvantage: stealth_disadvantage || false,
      properties: properties || [],
      rarity: rarity || 'Common',
      attunement_required: attunement_required || false
    };

    try {
      await Inventory.createCustomItem(customItem);
    } catch (error) {
      // If item already exists, that's okay - we'll use the existing one
      console.log('Custom item may already exist:', error.message);
    }

    // Add item to character equipment
    const newEquipment = [...character.equipment, itemName];
    
    const updatedCharacter = await Character.update(id, {
      equipment: newEquipment
    });

    // Emit real-time update via WebSocket
    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${character.campaign_id}`).emit('inventoryChanged', {
        characterId: character.id,
        action: 'add',
        itemName,
        isCustom: true,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      message: 'Custom item created and added successfully',
      character: updatedCharacter,
      custom_item: customItem
    });
  } catch (error) {
    console.error('Error creating custom item:', error);
    res.status(500).json({ error: 'Failed to create custom item' });
  }
});

// Upload character image (Player for own character, DM for any character in their campaign)
router.post('/:id/upload-image', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }
    
    const character = await Character.findById(id);
    if (!character) {
      // Clean up uploaded file if character not found
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Character not found' });
    }

    // Check permissions - only character owner or DM can upload
    const campaign = await Campaign.findById(character.campaign_id);
    const isOwner = character.player_id === req.user.id;
    const isDM = req.user.role === 'Dungeon Master' && campaign.dungeon_master_id === req.user.id;
    
    if (!isOwner && !isDM) {
      // Clean up uploaded file if unauthorized
      fs.unlinkSync(req.file.path);
      return res.status(403).json({ error: 'Only the character owner or dungeon master can upload character images' });
    }

    // Delete old image if it exists
    if (character.image_url) {
      const oldImagePath = path.join(__dirname, '..', 'uploads', 'characters', path.basename(character.image_url));
      if (fs.existsSync(oldImagePath)) {
        try {
          fs.unlinkSync(oldImagePath);
        } catch (err) {
          console.error('Error deleting old image:', err);
        }
      }
    }

    // Update character with new image URL (relative path)
    const imageUrl = `/uploads/characters/${req.file.filename}`;
    const updatedCharacter = await Character.update(id, {
      image_url: imageUrl
    });

    res.json({
      message: 'Character image uploaded successfully',
      image_url: imageUrl,
      character: updatedCharacter
    });
  } catch (error) {
    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error('Error uploading character image:', error);
    res.status(500).json({ error: error.message || 'Failed to upload character image' });
  }
});

// Update character map position (Player for own character, DM for any character in their campaign)
router.put('/:id/map-position', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { x, y } = req.body;
    
    if (x === undefined || y === undefined) {
      return res.status(400).json({ error: 'Both x and y coordinates are required' });
    }
    
    // Validate coordinates are percentages (0-100)
    if (x < 0 || x > 100 || y < 0 || y > 100) {
      return res.status(400).json({ error: 'Coordinates must be between 0 and 100' });
    }
    
    const character = await Character.findById(id);
    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // Check permissions - only character owner or DM can move
    const campaign = await Campaign.findById(character.campaign_id);
    const isOwner = character.player_id === req.user.id;
    const isDM = req.user.role === 'Dungeon Master' && campaign.dungeon_master_id === req.user.id;
    
    if (!isOwner && !isDM) {
      return res.status(403).json({ error: 'Only the character owner or dungeon master can move character on the map' });
    }

    // Update character position
    await pool.query(
      'UPDATE characters SET map_position_x = $1, map_position_y = $2 WHERE id = $3',
      [x, y, id]
    );

    // Emit real-time update via WebSocket
    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${character.campaign_id}`).emit('characterMoved', {
        characterId: character.id,
        characterName: character.name,
        x,
        y,
        movedBy: req.user.username,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      message: 'Character position updated successfully',
      position: { x, y }
    });
  } catch (error) {
    console.error('Error updating character map position:', error);
    res.status(500).json({ error: 'Failed to update character position' });
  }
});

module.exports = router;