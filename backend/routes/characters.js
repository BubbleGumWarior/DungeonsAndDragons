const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { pool } = require('../models/database');
const Character = require('../models/Character');
const Campaign = require('../models/Campaign');
const Inventory = require('../models/Inventory');
const { authenticateToken } = require('../middleware/auth');

// Configure multer for in-memory character image uploads (stored in database)
const upload = multer({
  storage: multer.memoryStorage(),
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
      level = 0,
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
    
    // Automatically assign level 1 skills for the character's class
    try {
      const { pool } = require('../models/database');
      const level1Skills = await pool.query(`
        SELECT id FROM skills 
        WHERE class_restriction = $1 AND level_requirement = 1
      `, [characterClass]);
      
      for (const skill of level1Skills.rows) {
        await pool.query(`
          INSERT INTO character_skills (character_id, skill_id)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
        `, [character.id, skill.id]);
      }
      
      console.log(`âœ… Assigned ${level1Skills.rows.length} level 1 skills to new character ${character.name} (${characterClass})`);
    } catch (skillError) {
      console.error('Error assigning level 1 skills:', skillError);
      // Don't fail character creation if skill assignment fails
    }
    
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
      expertise,
      equipment,
      spells,
      backstory,
      personality_traits,
      ideals,
      bonds,
      flaws,
      movement_speed,
      resistances,
      proficiencies,
      gold
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
    if (hit_points !== undefined) { updateData.hit_points = hit_points; updateData.hit_points_max = hit_points; }
    if (armor_class !== undefined) updateData.armor_class = armor_class;
    if (abilities !== undefined) updateData.abilities = abilities;
    if (skills !== undefined) updateData.skills = skills;
    if (expertise !== undefined) updateData.expertise = expertise;
    if (equipment !== undefined) updateData.equipment = equipment;
    if (spells !== undefined) updateData.spells = spells;
    if (backstory !== undefined) updateData.backstory = backstory.trim();
    if (personality_traits !== undefined) updateData.personality_traits = personality_traits.trim();
    if (ideals !== undefined) updateData.ideals = ideals.trim();
    if (bonds !== undefined) updateData.bonds = bonds.trim();
    if (flaws !== undefined) updateData.flaws = flaws.trim();
    if (movement_speed !== undefined) updateData.movement_speed = movement_speed;
    if (resistances !== undefined) updateData.resistances = resistances;
    if (proficiencies !== undefined) updateData.proficiencies = proficiencies;
    if (gold !== undefined) updateData.gold = Math.max(0, parseInt(gold, 10) || 0);
    
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
    
    const deletedCharacter = await Character.delete(id);

    // Remove this character's ID from the campaign's party_member_ids so it
    // doesn't leave a ghost entry that inflates the party count.
    if (deletedCharacter) {
      try {
        await pool.query(
          `UPDATE campaigns
             SET party_member_ids = (
               SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
               FROM jsonb_array_elements(COALESCE(party_member_ids, '[]'::jsonb)) AS elem
               WHERE elem::int != $1
             )
           WHERE id = $2`,
          [parseInt(id), character.campaign_id]
        );
      } catch (pgErr) {
        console.warn('Could not remove deleted character from party_member_ids:', pgErr.message);
      }
    }

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
      { name: 'High Elf', abilities: { dex: 2, int: 1 }, traits: ['Darkvision', 'Fey Ancestry', 'Trance', 'Cantrip'] },
      { name: 'Wood Elf', abilities: { dex: 2, wis: 1 }, traits: ['Darkvision', 'Fey Ancestry', 'Trance', 'Fleet of Foot', 'Mask of the Wild'] },
      { name: 'Drow (Dark Elf)', abilities: { dex: 2, cha: 1 }, traits: ['Superior Darkvision', 'Fey Ancestry', 'Trance', 'Sunlight Sensitivity', 'Drow Magic'] },
      { name: 'Hill Dwarf', abilities: { con: 2, wis: 1 }, traits: ['Darkvision', 'Dwarven Resilience', 'Stonecunning', 'Dwarven Toughness'] },
      { name: 'Mountain Dwarf', abilities: { con: 2, str: 2 }, traits: ['Darkvision', 'Dwarven Resilience', 'Stonecunning', 'Dwarven Armor Training'] },
      { name: 'Duergar', abilities: { con: 2, str: 1 }, traits: ['Superior Darkvision', 'Duergar Resilience', 'Duergar Magic', 'Sunlight Sensitivity'] },
      { name: 'Lightfoot Halfling', abilities: { dex: 2, cha: 1 }, traits: ['Lucky', 'Brave', 'Halfling Nimbleness', 'Naturally Stealthy'] },
      { name: 'Stout Halfling', abilities: { dex: 2, con: 1 }, traits: ['Lucky', 'Brave', 'Halfling Nimbleness', 'Stout Resilience'] },
      { name: 'Ghostwise Halfling', abilities: { dex: 2, wis: 1 }, traits: ['Lucky', 'Brave', 'Halfling Nimbleness', 'Silent Speech'] },
      { name: 'Dragonborn', abilities: { str: 2, cha: 1 }, traits: ['Draconic Ancestry', 'Breath Weapon', 'Damage Resistance'] },
      { name: 'Forest Gnome', abilities: { int: 2, dex: 1 }, traits: ['Darkvision', 'Gnome Cunning', 'Natural Illusionist', 'Speak with Small Beasts'] },
      { name: 'Rock Gnome', abilities: { int: 2, con: 1 }, traits: ['Darkvision', 'Gnome Cunning', 'Artificer\'s Lore', 'Tinker'] },
      { name: 'Deep Gnome (Svirfneblin)', abilities: { int: 2, dex: 1 }, traits: ['Superior Darkvision', 'Gnome Cunning', 'Stone Camouflage'] },
      { name: 'Half-Elf (High)', abilities: { cha: 2, int: 1 }, traits: ['Darkvision', 'Fey Ancestry', 'Extra Skills', 'Cantrip'] },
      { name: 'Half-Elf (Wood)', abilities: { cha: 2, wis: 1 }, traits: ['Darkvision', 'Fey Ancestry', 'Extra Skills', 'Fleet of Foot', 'Mask of the Wild'] },
      { name: 'Half-Elf (Drow)', abilities: { cha: 2, dex: 1 }, traits: ['Superior Darkvision', 'Fey Ancestry', 'Extra Skills', 'Drow Magic', 'Sunlight Sensitivity'] },
      { name: 'Half-Orc', abilities: { str: 2, con: 1 }, traits: ['Darkvision', 'Relentless Endurance', 'Savage Attacks'] },
      { name: 'Tiefling', abilities: { cha: 2, int: 1 }, traits: ['Darkvision', 'Hellish Resistance', 'Infernal Legacy'] },
      { name: 'Aasimar', abilities: { cha: 2 }, traits: ['Darkvision', 'Celestial Resistance', 'Healing Hands', 'Light Bearer'] },
      { name: 'Aarakocra', abilities: { dex: 2, wis: 1 }, traits: ['Flight', 'Talons'] },
      { name: 'Genasi (Air)', abilities: { con: 2, dex: 1 }, traits: ['Unending Breath', 'Mingle with the Wind'] },
      { name: 'Genasi (Earth)', abilities: { con: 2, str: 1 }, traits: ['Earth Walk', 'Merge with Stone'] },
      { name: 'Genasi (Fire)', abilities: { con: 2, int: 1 }, traits: ['Darkvision', 'Fire Resistance', 'Reach to the Blaze'] },
      { name: 'Genasi (Water)', abilities: { con: 2, wis: 1 }, traits: ['Acid Resistance', 'Amphibious', 'Swim', 'Call to the Wave'] },
      { name: 'Goliath', abilities: { str: 2, con: 1 }, traits: ['Natural Athlete', 'Stone\'s Endurance', 'Powerful Build', 'Mountain Born'] },
      { name: 'Firbolg', abilities: { wis: 2, str: 1 }, traits: ['Firbolg Magic', 'Hidden Step', 'Powerful Build', 'Speech of Beast and Leaf'] },
      { name: 'Kenku', abilities: { dex: 2, wis: 1 }, traits: ['Expert Forgery', 'Kenku Training', 'Mimicry'] },
      { name: 'Tabaxi', abilities: { dex: 2, cha: 1 }, traits: ['Darkvision', 'Feline Agility', 'Cat\'s Claws', 'Cat\'s Talent'] },
      { name: 'Triton', abilities: { str: 1, con: 1, cha: 1 }, traits: ['Amphibious', 'Control Air and Water', 'Emissary of the Sea', 'Guardians of the Depths'] },
      { name: 'Yuan-ti Pureblood', abilities: { cha: 2, int: 1 }, traits: ['Darkvision', 'Innate Spellcasting', 'Magic Resistance', 'Poison Immunity'] },
      { name: 'Lizardfolk', abilities: { con: 2, wis: 1 }, traits: ['Bite', 'Cunning Artisan', 'Hold Breath', 'Hunter\'s Lore', 'Natural Armor', 'Hungry Jaws'] },
      { name: 'Hobgoblin', abilities: { con: 2, int: 1 }, traits: ['Darkvision', 'Martial Training', 'Saving Face'] },
      { name: 'Goblin', abilities: { dex: 2, con: 1 }, traits: ['Darkvision', 'Fury of the Small', 'Nimble Escape'] },
      { name: 'Bugbear', abilities: { str: 2, dex: 1 }, traits: ['Darkvision', 'Long-Limbed', 'Powerful Build', 'Sneaky', 'Surprise Attack'] },
      { name: 'Kobold', abilities: { dex: 2 }, traits: ['Darkvision', 'Grovel, Cower, and Beg', 'Pack Tactics', 'Sunlight Sensitivity'] },
      { name: 'Orc', abilities: { str: 2, con: 1 }, traits: ['Darkvision', 'Aggressive', 'Menacing', 'Powerful Build'] },
      { name: 'Tortle', abilities: { str: 2, wis: 1 }, traits: ['Claws', 'Hold Breath', 'Natural Armor', 'Shell Defense', 'Survival Instinct'] },
      { name: 'Kalashtar', abilities: { wis: 2, cha: 1 }, traits: ['Dual Mind', 'Mental Discipline', 'Mind Link', 'Severed from Dreams'] },
      { name: 'Simic Hybrid', abilities: { con: 2, any: 1 }, traits: ['Animal Enhancement', 'Darkvision'] },
      { name: 'Vedalken', abilities: { int: 2, wis: 1 }, traits: ['Vedalken Dispassion', 'Tireless Precision', 'Partially Amphibious'] },
      { name: 'Loxodon', abilities: { con: 2, wis: 1 }, traits: ['Powerful Build', 'Loxodon Serenity', 'Natural Armor', 'Trunk', 'Keen Smell'] },
      { name: 'Minotaur', abilities: { str: 2, con: 1 }, traits: ['Horns', 'Goring Rush', 'Hammering Horns', 'Imposing Presence', 'Labyrinthine Recall'] },
      { name: 'Centaur', abilities: { str: 2, wis: 1 }, traits: ['Charge', 'Hooves', 'Equine Build', 'Survivor'] },
      { name: 'Leonin', abilities: { con: 2, str: 1 }, traits: ['Darkvision', 'Claws', 'Hunter\'s Instincts', 'Daunting Roar'] },
      { name: 'Satyr', abilities: { cha: 2, dex: 1 }, traits: ['Fey', 'Magic Resistance', 'Mirthful Leaps', 'Ram', 'Reveler'] },
      { name: 'Verdan', abilities: { cha: 2, con: 1 }, traits: ['Black Blood Healing', 'Limited Telepathy', 'Persuasive', 'Telepathic Insight'] },
      { name: 'Owlin', abilities: { dex: 2, wis: 1 }, traits: ['Darkvision', 'Flight', 'Silent Feathers'] },
      { name: 'Fairy', abilities: { dex: 2, cha: 1 }, traits: ['Fey', 'Flight', 'Fairy Magic'] },
      { name: 'Harengon', abilities: { dex: 2, any: 1 }, traits: ['Hare-Trigger', 'Leporine Senses', 'Lucky Footwork', 'Rabbit Hop'] },
      { name: 'Autognome', abilities: { con: 2, any: 1 }, traits: ['Constructed Resilience', 'Healing Machine', 'Mechanical Nature', 'Sentry\'s Rest'] },
      { name: 'Plasmoid', abilities: { con: 2, any: 1 }, traits: ['Amorphous', 'Darkvision', 'Hold Breath', 'Natural Resilience'] },
      { name: 'Giff', abilities: { str: 2, con: 1 }, traits: ['Astral Spark', 'Firearms Mastery', 'Hippo Build'] },
      { name: 'Hadozee', abilities: { dex: 2, wis: 1 }, traits: ['Dexterous Feet', 'Glide', 'Hadozee Resilience'] },
      { name: 'Thri-kreen', abilities: { dex: 2, wis: 1 }, traits: ['Chameleon Carapace', 'Darkvision', 'Secondary Arms', 'Sleepless Revitalization'] },
      { name: 'Owlin', abilities: { dex: 2, wis: 1 }, traits: ['Darkvision', 'Flight', 'Silent Feathers'] }
      ],
      classes: [
        { name: 'Barbarian', hitDie: 12, primaryAbility: ['str'], savingThrows: ['str', 'con'] },
        { name: 'Bard', hitDie: 8, primaryAbility: ['cha'], savingThrows: ['dex', 'cha'] },
        { name: 'Cleric', hitDie: 8, primaryAbility: ['wis'], savingThrows: ['wis', 'cha'] },
        { name: 'Druid', hitDie: 8, primaryAbility: ['wis'], savingThrows: ['int', 'wis'] },
        { name: 'Fighter', hitDie: 10, primaryAbility: ['str', 'dex'], savingThrows: ['str', 'con'] },
        { name: 'Monk', hitDie: 8, primaryAbility: ['dex', 'wis'], savingThrows: ['str', 'dex'] },
        { name: 'Oathknight', hitDie: 12, primaryAbility: ['con'], savingThrows: ['con', 'wis'] },
        { name: 'Paladin', hitDie: 10, primaryAbility: ['str', 'cha'], savingThrows: ['wis', 'cha'] },
        { name: 'Primal Bond', hitDie: 10, primaryAbility: ['str', 'dex'], savingThrows: ['str', 'con'] },
        { name: 'Ranger', hitDie: 10, primaryAbility: ['dex', 'wis'], savingThrows: ['str', 'dex'] },
        { name: 'Reaver', hitDie: 8, primaryAbility: ['dex', 'wis'], savingThrows: ['dex', 'int'] },
        { name: 'Rogue', hitDie: 8, primaryAbility: ['dex'], savingThrows: ['dex', 'int'] },
        { name: 'Shadow Sovereign', hitDie: 10, primaryAbility: ['dex'], savingThrows: ['dex', 'con'] },
        { name: 'Sorcerer', hitDie: 6, primaryAbility: ['cha'], savingThrows: ['con', 'cha'] },
        { name: 'Charlatan', hitDie: 8, primaryAbility: ['cha'], savingThrows: ['dex', 'cha'] },
        { name: 'Warlock', hitDie: 8, primaryAbility: ['cha'], savingThrows: ['wis', 'cha'] },
        { name: 'Wizard', hitDie: 6, primaryAbility: ['int'], savingThrows: ['int', 'wis'] }
      ],
      backgrounds: [
        'Adventurer', 'Acolyte', 'Criminal', 'Folk Hero', 'Noble', 'Sage', 'Soldier',
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

// Update an inventory item — DM only
router.put('/inventory/item/:itemName', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'Dungeon Master') {
      return res.status(403).json({ error: 'Only the Dungeon Master can update inventory items' });
    }
    const { itemName } = req.params;
    const updateData = req.body;
    const updated = await Inventory.updateItem(decodeURIComponent(itemName), updateData);
    if (!updated) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json(updated);
  } catch (error) {
    console.error('Error updating inventory item:', error);
    res.status(500).json({ error: 'Failed to update inventory item' });
  }
});

// Delete an inventory item — DM only
router.delete('/inventory/item/:itemName', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'Dungeon Master') {
      return res.status(403).json({ error: 'Only the Dungeon Master can delete inventory items' });
    }
    const { itemName } = req.params;
    const deleted = await Inventory.deleteItem(decodeURIComponent(itemName));
    if (!deleted) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json({ message: 'Item deleted', item_name: deleted.item_name });
  } catch (error) {
    console.error('Error deleting inventory item:', error);
    res.status(500).json({ error: 'Failed to delete inventory item' });
  }
});

// Manually adjust character health (heal or damage) — DM only
router.patch('/:id/health', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'Dungeon Master') {
      return res.status(403).json({ error: 'Only the Dungeon Master can manually adjust health' });
    }

    const { id } = req.params;
    const { amount, limbName, isHeal, campaignId } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }

    const character = await Character.findById(id);
    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    const hit_points_max = (character.hit_points_max != null) ? character.hit_points_max : character.hit_points;

    const abilities = typeof character.abilities === 'string' ? JSON.parse(character.abilities) : (character.abilities || {});
    const con = abilities.con ?? 10;
    const conMod = Math.floor((con - 10) / 2);
    const conBonus = Math.max(0, conMod * 0.1);
    const makeLimbMaxes = (hp) => ({
      head:      Math.floor(hp * Math.min(1.0, 0.25 + conBonus)),
      chest:     Math.floor(hp * Math.min(2.0, 1.0 + conBonus)),
      left_arm:  Math.floor(hp * Math.min(1.0, 0.15 + conBonus)),
      right_arm: Math.floor(hp * Math.min(1.0, 0.15 + conBonus)),
      left_leg:  Math.floor(hp * Math.min(1.0, 0.40 + conBonus)),
      right_leg: Math.floor(hp * Math.min(1.0, 0.40 + conBonus)),
    });

    const limbMaxes = makeLimbMaxes(hit_points_max || 1);
    const allLimbs = ['head', 'chest', 'left_arm', 'right_arm', 'left_leg', 'right_leg'];

    let limbHealth;
    if (character.limb_health) {
      limbHealth = typeof character.limb_health === 'string' ? JSON.parse(character.limb_health) : { ...character.limb_health };
    } else {
      limbHealth = makeLimbMaxes(character.hit_points || 1);
    }

    if (!limbName || limbName === 'all') {
      const totalMax = allLimbs.reduce((s, l) => s + (limbMaxes[l] || 0), 0) || 1;
      for (const l of allLimbs) {
        const share = Math.round(amount * ((limbMaxes[l] || 0) / totalMax));
        if (isHeal) {
          limbHealth[l] = Math.min((limbHealth[l] || 0) + share, limbMaxes[l] || 0);
        } else {
          limbHealth[l] = Math.max((limbHealth[l] || 0) - share, 0);
        }
      }
    } else {
      const validLimb = limbHealth[limbName] !== undefined ? limbName : 'chest';
      if (isHeal) {
        limbHealth[validLimb] = Math.min((limbHealth[validLimb] || 0) + amount, limbMaxes[validLimb] || 0);
      } else {
        limbHealth[validLimb] = Math.max((limbHealth[validLimb] || 0) - amount, 0);
      }
    }

    const newHP = Math.max(0, allLimbs.reduce((s, l) => s + (limbHealth[l] || 0), 0));

    await pool.query(
      'UPDATE characters SET hit_points = $1, limb_health = $2 WHERE id = $3',
      [newHP, JSON.stringify(limbHealth), id]
    );

    const limbLabel = !limbName || limbName === 'all' ? '' : ` (${limbName.replace(/_/g, ' ')})`;
    const charName = character.name || `Character ${id}`;
    const toastMessage = isHeal
      ? `${charName} was healed for ${amount} HP${limbLabel}`
      : `${charName} took ${amount} damage${limbLabel ? ` to their${limbLabel}` : ''}`;

    if (campaignId) {
      const io = req.app.get('io');
      if (io) {
        io.to(`campaign_${campaignId}`).emit('healthAdjusted', {
          type: 'character',
          characterId: parseInt(id, 10),
          newHP,
          maxHP: hit_points_max,
          limbHealth,
          isDead: newHP <= 0,
          toastMessage,
          campaignId,
          timestamp: new Date().toISOString(),
        });
      }
    }

    res.json({ newHP, maxHP: hit_points_max, limbHealth, isDead: newHP <= 0, toastMessage });
  } catch (error) {
    console.error('Error adjusting character health:', error);
    res.status(500).json({ error: 'Failed to adjust health' });
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
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    const isOwner = character.player_id === req.user.id;
    const isDM = req.user.role === 'Dungeon Master' && campaign.dungeon_master_id === req.user.id;
    
    if (!isOwner && !isDM) {
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
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    const isOwner = character.player_id === req.user.id;
    const isDM = req.user.role === 'Dungeon Master' && campaign.dungeon_master_id === req.user.id;
    
    if (!isOwner && !isDM) {
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
    
    // Calculate limb-specific AC (item bonuses only â€” base AC percentages applied on the frontend)
    const limbAC = {
      head: 0,       // Helmet item AC bonus
      chest: 0,      // Chest armour item AC bonus
      main_hand: 0,  // Shield / gauntlet item AC bonus (main hand)
      off_hand: 0,   // Shield / gauntlet item AC bonus (off hand)
      feet: 0        // Leggings / boots item AC bonus
    };
    
    // Apply armor bonuses from equipped items
    for (const [slot, item] of Object.entries(equippedWithSlots)) {
      if (!item) continue;
      if (item.limb_armor_class && Object.keys(item.limb_armor_class).length > 0) {
        for (const [limb, ac] of Object.entries(item.limb_armor_class)) {
          if (limb === 'hands') {
            // Apply to the specific hand slot where it's equipped
            if (slot === 'main_hand') {
              limbAC.main_hand = ac;
            } else if (slot === 'off_hand') {
              limbAC.off_hand = ac;
            } else if (slot === 'hands') {
              limbAC.main_hand = ac;
            }
          } else if (limbAC.hasOwnProperty(limb)) {
            limbAC[limb] = ac;
          }
        }
      } else if (item.armor_class) {
        // Fallback for items without limb_armor_class: derive bonus from the slot they occupy
        if (slot === 'head') limbAC.head = item.armor_class;
        else if (slot === 'chest') limbAC.chest = item.armor_class;
        else if (slot === 'feet') limbAC.feet = item.armor_class;
        else if (slot === 'main_hand') limbAC.main_hand = item.armor_class;
        else if (slot === 'off_hand') limbAC.off_hand = item.armor_class;
        else if (slot === 'hands') limbAC.main_hand = item.armor_class;
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
    
    const validSlots = ['head', 'chest', 'legs', 'feet', 'hands', 'main_hand', 'off_hand', 'lower_left_hand', 'lower_right_hand'];
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
      head: ['Armor', 'Magic Item'],
      chest: ['Armor', 'Magic Item'],
      legs: ['Armor', 'Magic Item'],
      feet: ['Armor', 'Magic Item'],
      hands: ['Armor', 'Magic Item'],   // Gloves / gauntlets / magic rings
      main_hand: ['Weapon', 'Tool'],    // Only weapons and tools in main hand
      off_hand: ['Weapon', 'Tool', 'Armor', 'Magic Item'], // Weapons, tools, shields, gauntlets, magic items
      lower_left_hand: ['Weapon', 'Tool'], // Thri-kreen lower arms can hold weapons/tools
      lower_right_hand: ['Weapon', 'Tool']
    };

    // Special validation for off-hand armor - only shields OR gloves/gauntlets allowed
    if (slot === 'off_hand' && item.category === 'Armor') {
      const subcat = (item.subcategory || '').toLowerCase();
      const iname = item.item_name.toLowerCase();
      const isShield = subcat.includes('shield');
      const isHandArmor = subcat.includes('glove') || subcat.includes('gauntlet') || subcat.includes('bracer')
        || iname.includes('glove') || iname.includes('gauntlet') || iname.includes('bracer');
      if (!isShield && !isHandArmor) {
        return res.status(400).json({ 
          error: `Only shields or hand armor (gloves, gauntlets) can be equipped in the off-hand slot.` 
        });
      }
    }

    if (!slotItemCompatibility[slot] || !slotItemCompatibility[slot].includes(item.category)) {
      const validCategories = slotItemCompatibility[slot] ? slotItemCompatibility[slot].join(', ') : 'none';
      return res.status(400).json({ 
        error: `Cannot equip ${item.category} in ${slot} slot. Valid categories for ${slot}: ${validCategories}` 
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
      // Glove/gauntlet validation - hand armor goes to 'hands' or 'off_hand'
      else if (subcategory.includes('glove') || subcategory.includes('gauntlet') || subcategory.includes('bracer') ||
               item.item_name.toLowerCase().includes('glove') || item.item_name.toLowerCase().includes('gauntlet') ||
               item.item_name.toLowerCase().includes('bracer')) {
        if (slot !== 'hands' && slot !== 'off_hand') {
          return res.status(400).json({ error: 'Gloves and gauntlets can only be equipped in the hands or off-hand slot' });
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
    
    if (slot === 'hands' && item.category === 'Armor') {
      const subcategory = item.subcategory ? item.subcategory.toLowerCase() : '';
      const itemName = item.item_name.toLowerCase();
      const isHandArmor = subcategory.includes('glove') || subcategory.includes('gauntlet') || subcategory.includes('bracer')
        || itemName.includes('glove') || itemName.includes('gauntlet') || itemName.includes('bracer');
      if (!isHandArmor) {
        return res.status(400).json({ error: 'Only hand armor (gloves, gauntlets, bracers) can be equipped in hands slot' });
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
    
    const validSlots = ['head', 'chest', 'legs', 'feet', 'hands', 'main_hand', 'off_hand', 'lower_left_hand', 'lower_right_hand'];
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

// Get character image as base64 data URL
router.get('/:id/image', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const imageData = await Character.getImage(id);
    if (!imageData || !imageData.image_data) {
      return res.status(404).json({ error: 'No image found for this character' });
    }

    // Convert binary data to base64 data URL
    const base64Image = imageData.image_data.toString('base64');
    const dataUrl = `data:${imageData.image_mime_type};base64,${base64Image}`;

    res.json({
      image_url: dataUrl,
      mime_type: imageData.image_mime_type
    });
  } catch (error) {
    console.error('Error retrieving character image:', error);
    res.status(500).json({ error: 'Failed to retrieve character image' });
  }
});

// Update character image (Player for own character, DM for any character in their campaign)
router.post('/:id/upload-image', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }
    
    const character = await Character.findById(id);
    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // Check permissions - only character owner or DM can upload
    const campaign = await Campaign.findById(character.campaign_id);
    const isOwner = character.player_id === req.user.id;
    const isDM = req.user.role === 'Dungeon Master' && campaign.dungeon_master_id === req.user.id;
    
    if (!isOwner && !isDM) {
      return res.status(403).json({ error: 'Only the character owner or dungeon master can upload character images' });
    }

    // Store image in database
    const mimeType = req.file.mimetype;
    await Character.storeImage(id, req.file.buffer, mimeType);

    // Create data URL for client-side display
    const base64Image = req.file.buffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64Image}`;

    res.json({
      message: 'Character image uploaded successfully',
      image_url: dataUrl,
      character: { id, image_mime_type: mimeType }
    });
  } catch (error) {
    console.error('Error uploading character image:', error);
    res.status(500).json({ error: error.message || 'Failed to upload character image' });
  }
});

// Delete character image (DM only)
router.delete('/:id/image', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const character = await Character.findById(id);
    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // Check permissions - only DM can delete character images
    const campaign = await Campaign.findById(character.campaign_id);
    const isDM = req.user.role === 'Dungeon Master' && campaign.dungeon_master_id === req.user.id;
    
    if (!isDM) {
      return res.status(403).json({ error: 'Only the dungeon master can delete character images' });
    }

    // Delete image from database
    await Character.deleteImage(id);

    res.json({
      message: 'Character image deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting character image:', error);
    res.status(500).json({ error: error.message || 'Failed to delete character image' });
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

// Update character battle position (Player for own character, DM for any character in their campaign)
router.put('/:id/battle-position', authenticateToken, async (req, res) => {
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
      return res.status(403).json({ error: 'Only the character owner or dungeon master can move character on the battle map' });
    }

    // Update character battle position
    await pool.query(
      'UPDATE characters SET battle_position_x = $1, battle_position_y = $2 WHERE id = $3',
      [x, y, id]
    );

    res.json({
      message: 'Character battle position updated successfully',
      position: { x, y }
    });
  } catch (error) {
    console.error('Error updating character battle position:', error);
    res.status(500).json({ error: 'Failed to update character battle position' });
  }
});

// â”€â”€â”€ Spell Slot Routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// GET current spell slot usage for a character
router.get('/:id/spell-slots', authenticateToken, async (req, res) => {
  try {
    const charId = parseInt(req.params.id, 10);
    const result = await pool.query(
      `SELECT spell_slots_used, ki_points_remaining, class, level, abilities
       FROM characters WHERE id = $1`,
      [charId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Character not found' });
    const row = result.rows[0];
    res.json({
      spell_slots_used: row.spell_slots_used || {},
      ki_points_remaining: row.ki_points_remaining,
      class: row.class,
      level: row.level,
    });
  } catch (error) {
    console.error('Error fetching spell slots:', error);
    res.status(500).json({ error: 'Failed to fetch spell slots' });
  }
});

// POST use a spell slot (increment used count for a level)
router.post('/:id/use-spell-slot', authenticateToken, async (req, res) => {
  try {
    const charId = parseInt(req.params.id, 10);
    const { slotLevel } = req.body;
    if (!slotLevel || slotLevel < 1 || slotLevel > 9) return res.status(400).json({ error: 'Invalid slot level' });

    const result = await pool.query(
      `UPDATE characters
       SET spell_slots_used = jsonb_set(
         COALESCE(spell_slots_used, '{}'::jsonb),
         ARRAY[$1::text],
         (COALESCE((spell_slots_used->>$1::text)::int, 0) + 1)::text::jsonb
       )
       WHERE id = $2
       RETURNING spell_slots_used`,
      [String(slotLevel), charId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Character not found' });
    res.json({ spell_slots_used: result.rows[0].spell_slots_used });
  } catch (error) {
    console.error('Error using spell slot:', error);
    res.status(500).json({ error: 'Failed to use spell slot' });
  }
});

// POST restore a spell slot (decrement used count â€” for DM manual restore)
router.post('/:id/restore-spell-slot', authenticateToken, async (req, res) => {
  try {
    const charId = parseInt(req.params.id, 10);
    const { slotLevel } = req.body;
    if (!slotLevel || slotLevel < 1 || slotLevel > 9) return res.status(400).json({ error: 'Invalid slot level' });

    const result = await pool.query(
      `UPDATE characters
       SET spell_slots_used = jsonb_set(
         COALESCE(spell_slots_used, '{}'::jsonb),
         ARRAY[$1::text],
         GREATEST(0, COALESCE((spell_slots_used->>$1::text)::int, 0) - 1)::text::jsonb
       )
       WHERE id = $2
       RETURNING spell_slots_used`,
      [String(slotLevel), charId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Character not found' });
    res.json({ spell_slots_used: result.rows[0].spell_slots_used });
  } catch (error) {
    console.error('Error restoring spell slot:', error);
    res.status(500).json({ error: 'Failed to restore spell slot' });
  }
});

// POST use a ki point (decrement remaining)
router.post('/:id/use-ki-point', authenticateToken, async (req, res) => {
  try {
    const charId = parseInt(req.params.id, 10);
    const result = await pool.query(
      `UPDATE characters
       SET ki_points_remaining = GREATEST(0, COALESCE(ki_points_remaining, level) - 1)
       WHERE id = $1
       RETURNING ki_points_remaining, level`,
      [charId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Character not found' });
    res.json({ ki_points_remaining: result.rows[0].ki_points_remaining });
  } catch (error) {
    console.error('Error using ki point:', error);
    res.status(500).json({ error: 'Failed to use ki point' });
  }
});

// POST restore a ki point (increment remaining, capped at level)
router.post('/:id/restore-ki-point', authenticateToken, async (req, res) => {
  try {
    const charId = parseInt(req.params.id, 10);
    const result = await pool.query(
      `UPDATE characters
       SET ki_points_remaining = LEAST(level, COALESCE(ki_points_remaining, level) + 1)
       WHERE id = $1
       RETURNING ki_points_remaining, level`,
      [charId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Character not found' });
    res.json({ ki_points_remaining: result.rows[0].ki_points_remaining });
  } catch (error) {
    console.error('Error restoring ki point:', error);
    res.status(500).json({ error: 'Failed to restore ki point' });
  }
});

// ─── Conceal / Reveal character class (DM only) ───
// Sets or clears concealed_class — what non-DM players see instead of the real class.
router.put('/:id/concealed-class', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'Dungeon Master') {
      return res.status(403).json({ error: 'Only Dungeon Masters can conceal a character class' });
    }

    const { id } = req.params;
    const { concealedClass } = req.body; // null or undefined = reveal

    const character = await Character.findById(id);
    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    const value = concealedClass || null;
    await pool.query(
      `UPDATE characters SET concealed_class = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [value, id]
    );

    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${character.campaign_id}`).emit('characterConcealmentChanged', {
        characterId: character.id,
        concealedClass: value,
      });
    }

    res.json({ message: value ? `Character concealed as ${value}` : 'Character revealed', concealedClass: value });
  } catch (error) {
    console.error('Error setting concealed class:', error);
    res.status(500).json({ error: 'Failed to update concealed class' });
  }
});

// ─── Feats ───────────────────────────────────────────────────────────────────

const getFeatStateForCharacter = async (characterId) => {
  const characterResult = await pool.query(
    `SELECT id, campaign_id, player_id FROM characters WHERE id = $1`,
    [characterId]
  );
  if (characterResult.rows.length === 0) return null;

  const character = characterResult.rows[0];

  const [catalogResult, chosenResult, grantResult, usedResult] = await Promise.all([
    pool.query(
      `SELECT id, campaign_id, name, description, is_custom, created_by_user_id, created_at
         FROM feat_catalog
        WHERE campaign_id = $1
        ORDER BY LOWER(name) ASC`,
      [character.campaign_id]
    ),
    pool.query(
      `SELECT cf.id, cf.feat_id, cf.picked_at,
              fc.name, fc.description, fc.is_custom
         FROM character_feats cf
         JOIN feat_catalog fc ON fc.id = cf.feat_id
        WHERE cf.character_id = $1
        ORDER BY cf.picked_at DESC`,
      [character.id]
    ),
    pool.query(
      `SELECT granted_count FROM campaign_feat_grants WHERE character_id = $1`,
      [character.id]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS used_count FROM character_feats WHERE character_id = $1`,
      [character.id]
    )
  ]);

  const grantedCount = grantResult.rows[0]?.granted_count || 0;
  const usedCount = usedResult.rows[0]?.used_count || 0;
  const remainingCount = Math.max(0, grantedCount - usedCount);

  return {
    characterId: Number(character.id),
    campaignId: Number(character.campaign_id),
    playerId: Number(character.player_id),
    grantedCount,
    usedCount,
    remainingCount,
    availableFeats: catalogResult.rows,
    chosenFeats: chosenResult.rows,
  };
};

// Get feat state for a character (owner or DM)
router.get('/:id/feats', authenticateToken, async (req, res) => {
  try {
    const characterId = Number(req.params.id);
    if (!Number.isFinite(characterId)) return res.status(400).json({ error: 'Invalid character ID' });

    const featState = await getFeatStateForCharacter(characterId);
    if (!featState) return res.status(404).json({ error: 'Character not found' });

    const campaign = await Campaign.findById(featState.campaignId);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const isOwner = Number(featState.playerId) === Number(req.user.id);
    const isDM = req.user.role === 'Dungeon Master' && Number(campaign.dungeon_master_id) === Number(req.user.id);
    if (!isOwner && !isDM) return res.status(403).json({ error: 'Access denied' });

    res.json(featState);
  } catch (error) {
    console.error('Error fetching character feats:', error);
    res.status(500).json({ error: 'Failed to fetch feats' });
  }
});

// DM: grant +1 feat pick to all characters in a campaign
router.post('/campaign/:campaignId/feats/grant-all', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const campaignId = Number(req.params.campaignId);
    if (!Number.isFinite(campaignId)) return res.status(400).json({ error: 'Invalid campaign ID' });

    if (req.user.role !== 'Dungeon Master') {
      return res.status(403).json({ error: 'Only the Dungeon Master can grant feats to all' });
    }

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (Number(campaign.dungeon_master_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'You can only manage campaigns you own' });
    }

    await client.query('BEGIN');

    const characterCountResult = await client.query(
      `SELECT COUNT(*)::int AS count FROM characters WHERE campaign_id = $1`,
      [campaignId]
    );

    const characterCount = characterCountResult.rows[0]?.count || 0;

    await client.query(
      `INSERT INTO campaign_feat_grants (character_id, granted_count, updated_at)
       SELECT id, 1, NOW()
         FROM characters
        WHERE campaign_id = $1
       ON CONFLICT (character_id)
       DO UPDATE
         SET granted_count = campaign_feat_grants.granted_count + 1,
             updated_at = NOW()`,
      [campaignId]
    );

    await client.query('COMMIT');

    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${campaignId}`).emit('featGrantedToAll', {
        campaignId,
        grantedBy: req.user.id,
        grantAmount: 1,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      message: `Granted +1 feat pick to ${characterCount} character(s)`,
      campaignId,
      characterCount,
      grantAmount: 1,
    });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('Error granting feats to all:', error);
    res.status(500).json({ error: 'Failed to grant feats to all' });
  } finally {
    client.release();
  }
});

// DM: create a custom campaign feat
router.post('/campaign/:campaignId/feats/custom', authenticateToken, async (req, res) => {
  try {
    const campaignId = Number(req.params.campaignId);
    if (!Number.isFinite(campaignId)) return res.status(400).json({ error: 'Invalid campaign ID' });

    if (req.user.role !== 'Dungeon Master') {
      return res.status(403).json({ error: 'Only the Dungeon Master can create custom feats' });
    }

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (Number(campaign.dungeon_master_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'You can only manage campaigns you own' });
    }

    const name = String(req.body?.name || '').trim();
    const description = String(req.body?.description || '').trim();

    if (!name) return res.status(400).json({ error: 'Feat name is required' });
    if (!description) return res.status(400).json({ error: 'Feat description is required' });

    const result = await pool.query(
      `INSERT INTO feat_catalog (campaign_id, name, description, is_custom, created_by_user_id)
       VALUES ($1, $2, $3, TRUE, $4)
       RETURNING id, campaign_id, name, description, is_custom, created_by_user_id, created_at`,
      [campaignId, name.slice(0, 120), description, req.user.id]
    );

    const feat = result.rows[0];

    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${campaignId}`).emit('featCatalogUpdated', {
        campaignId,
        feat,
        timestamp: new Date().toISOString(),
      });
    }

    res.status(201).json({ message: 'Custom feat created', feat });
  } catch (error) {
    if (error?.code === '23505') {
      return res.status(400).json({ error: 'A feat with this name already exists in this campaign' });
    }
    console.error('Error creating custom feat:', error);
    res.status(500).json({ error: 'Failed to create custom feat' });
  }
});

// Choose a feat for a character (owner or DM)
router.post('/:id/feats/choose', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const characterId = Number(req.params.id);
    const featId = Number(req.body?.featId);

    if (!Number.isFinite(characterId)) return res.status(400).json({ error: 'Invalid character ID' });
    if (!Number.isFinite(featId)) return res.status(400).json({ error: 'Invalid feat ID' });

    const featState = await getFeatStateForCharacter(characterId);
    if (!featState) return res.status(404).json({ error: 'Character not found' });

    const campaign = await Campaign.findById(featState.campaignId);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const isOwner = Number(featState.playerId) === Number(req.user.id);
    const isDM = req.user.role === 'Dungeon Master' && Number(campaign.dungeon_master_id) === Number(req.user.id);
    if (!isOwner && !isDM) return res.status(403).json({ error: 'Access denied' });

    const feat = featState.availableFeats.find((f) => Number(f.id) === featId);
    if (!feat) return res.status(404).json({ error: 'Feat not found for this campaign' });

    if (featState.remainingCount <= 0) {
      return res.status(400).json({ error: 'No feat picks remaining for this character' });
    }

    await client.query('BEGIN');

    const insertResult = await client.query(
      `INSERT INTO character_feats (character_id, feat_id)
       VALUES ($1, $2)
       RETURNING id, character_id, feat_id, picked_at`,
      [characterId, featId]
    );

    await client.query('COMMIT');

    const chosen = {
      ...insertResult.rows[0],
      name: feat.name,
      description: feat.description,
      is_custom: feat.is_custom,
    };

    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${featState.campaignId}`).emit('featChosen', {
        campaignId: featState.campaignId,
        characterId,
        feat: chosen,
        timestamp: new Date().toISOString(),
      });
    }

    res.status(201).json({ message: 'Feat chosen', feat: chosen });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    if (error?.code === '23505') {
      return res.status(400).json({ error: 'This character already has that feat' });
    }
    console.error('Error choosing feat:', error);
    res.status(500).json({ error: 'Failed to choose feat' });
  } finally {
    client.release();
  }
});

// ── Character Notes ──────────────────────────────────────────────────────────

// Get all notes for a character (owner or DM of campaign)
router.get('/:id/notes', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const character = await Character.findById(id);
    if (!character) return res.status(404).json({ error: 'Character not found' });

    const isDM = req.user.role === 'Dungeon Master';
    const isOwner = character.player_id === req.user.id;

    if (!isOwner && !isDM) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await pool.query(
      `SELECT id, title, content, created_at, updated_at
         FROM character_notes
        WHERE character_id = $1
        ORDER BY created_at DESC`,
      [id]
    );
    res.json({ notes: result.rows });
  } catch (error) {
    console.error('Error fetching character notes:', error);
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

// Create a note (owner only)
router.post('/:id/notes', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { title = 'Note', content = '' } = req.body;
    const character = await Character.findById(id);
    if (!character) return res.status(404).json({ error: 'Character not found' });

    if (character.player_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the character owner can create notes' });
    }

    const result = await pool.query(
      `INSERT INTO character_notes (character_id, title, content)
       VALUES ($1, $2, $3)
       RETURNING id, title, content, created_at, updated_at`,
      [id, title.slice(0, 200), content]
    );
    res.status(201).json({ note: result.rows[0] });
  } catch (error) {
    console.error('Error creating character note:', error);
    res.status(500).json({ error: 'Failed to create note' });
  }
});

// Update a note (owner only)
router.put('/:id/notes/:noteId', authenticateToken, async (req, res) => {
  try {
    const { id, noteId } = req.params;
    const { title, content } = req.body;
    const character = await Character.findById(id);
    if (!character) return res.status(404).json({ error: 'Character not found' });

    if (character.player_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the character owner can edit notes' });
    }

    const result = await pool.query(
      `UPDATE character_notes
          SET title = COALESCE($1, title),
              content = COALESCE($2, content),
              updated_at = NOW()
        WHERE id = $3 AND character_id = $4
       RETURNING id, title, content, created_at, updated_at`,
      [title ? title.slice(0, 200) : null, content ?? null, noteId, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Note not found' });
    res.json({ note: result.rows[0] });
  } catch (error) {
    console.error('Error updating character note:', error);
    res.status(500).json({ error: 'Failed to update note' });
  }
});

// Delete a note (owner only)
router.delete('/:id/notes/:noteId', authenticateToken, async (req, res) => {
  try {
    const { id, noteId } = req.params;
    const character = await Character.findById(id);
    if (!character) return res.status(404).json({ error: 'Character not found' });

    if (character.player_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the character owner can delete notes' });
    }

    const result = await pool.query(
      `DELETE FROM character_notes WHERE id = $1 AND character_id = $2 RETURNING id`,
      [noteId, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Note not found' });
    res.json({ message: 'Note deleted' });
  } catch (error) {
    console.error('Error deleting character note:', error);
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

module.exports = router;
