const express = require('express');
const router = express.Router();
const { pool } = require('../models/database');
const { authenticateToken } = require('../middleware/auth');

// Get all available skills
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM skills 
      ORDER BY class_restriction NULLS FIRST, level_requirement, name
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching skills:', error);
    res.status(500).json({ error: 'Failed to fetch skills' });
  }
});

// Get skills for a specific character
router.get('/characters/:characterId', authenticateToken, async (req, res) => {
  try {
    const { characterId } = req.params;
    
    const result = await pool.query(`
      SELECT s.*, cs.acquired_at
      FROM character_skills cs
      JOIN skills s ON cs.skill_id = s.id
      WHERE cs.character_id = $1
      ORDER BY cs.acquired_at DESC
    `, [characterId]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching character skills:', error);
    res.status(500).json({ error: 'Failed to fetch character skills' });
  }
});

// Add skill to character (DM only)
router.post('/characters/:characterId', authenticateToken, async (req, res) => {
  try {
    const { characterId } = req.params;
    const { skillId } = req.body;
    
    // Verify user is DM
    if (req.user.role !== 'Dungeon Master') {
      return res.status(403).json({ error: 'Only Dungeon Masters can add skills' });
    }
    
    // Add skill to character
    await pool.query(`
      INSERT INTO character_skills (character_id, skill_id)
      VALUES ($1, $2)
      ON CONFLICT (character_id, skill_id) DO NOTHING
    `, [characterId, skillId]);
    
    // Get the added skill details
    const result = await pool.query(`
      SELECT s.*, cs.acquired_at
      FROM character_skills cs
      JOIN skills s ON cs.skill_id = s.id
      WHERE cs.character_id = $1 AND cs.skill_id = $2
    `, [characterId, skillId]);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error adding skill to character:', error);
    res.status(500).json({ error: 'Failed to add skill' });
  }
});

// Create custom skill (DM only)
router.post('/', authenticateToken, async (req, res) => {
  try {
    // Verify user is DM
    if (req.user.role !== 'Dungeon Master') {
      return res.status(403).json({ error: 'Only Dungeon Masters can create skills' });
    }
    
    const {
      name,
      description,
      damage_dice,
      damage_type,
      range_size,
      usage_frequency,
      level_requirement,
      class_restriction
    } = req.body;
    
    const result = await pool.query(`
      INSERT INTO skills (
        name, description, damage_dice, damage_type, 
        range_size, usage_frequency, level_requirement, class_restriction
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      name,
      description,
      damage_dice,
      damage_type,
      range_size,
      usage_frequency,
      level_requirement || 1,
      class_restriction
    ]);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating skill:', error);
    res.status(500).json({ error: 'Failed to create skill' });
  }
});

// Remove skill from character (DM only)
router.delete('/characters/:characterId/:skillId', authenticateToken, async (req, res) => {
  try {
    const { characterId, skillId } = req.params;
    
    // Verify user is DM
    if (req.user.role !== 'Dungeon Master') {
      return res.status(403).json({ error: 'Only Dungeon Masters can remove skills' });
    }
    
    await pool.query(`
      DELETE FROM character_skills
      WHERE character_id = $1 AND skill_id = $2
    `, [characterId, skillId]);
    
    res.json({ message: 'Skill removed successfully' });
  } catch (error) {
    console.error('Error removing skill:', error);
    res.status(500).json({ error: 'Failed to remove skill' });
  }
});

// Grant experience to characters (DM only)
router.post('/grant-exp/:campaignId', authenticateToken, async (req, res) => {
  try {
    // Verify user is DM
    if (req.user.role !== 'Dungeon Master') {
      return res.status(403).json({ error: 'Only Dungeon Masters can grant experience' });
    }
    
    const { campaignId } = req.params;
    const { characterIds, expAmount } = req.body;
    
    if (!Array.isArray(characterIds) || characterIds.length === 0) {
      return res.status(400).json({ error: 'No characters selected' });
    }
    
    if (!expAmount || expAmount <= 0) {
      return res.status(400).json({ error: 'Invalid experience amount' });
    }
    
    // Update experience for all selected characters
    const result = await pool.query(`
      UPDATE characters
      SET experience_points = experience_points + $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ANY($2) AND campaign_id = $3
      RETURNING id, name, level, experience_points
    `, [expAmount, characterIds, campaignId]);
    
    // Emit socket event for real-time updates
    if (req.io) {
      console.log(`🔔 Emitting experienceGranted to campaign room: campaign_${campaignId}`);
      req.io.to(`campaign_${campaignId}`).emit('experienceGranted', {
        campaignId: parseInt(campaignId),
        characters: result.rows,
        expAmount,
        timestamp: new Date().toISOString()
      });
    } else {
      console.warn('⚠️ Socket.io not available for experience grant emission');
    }

    res.json({
      message: `Granted ${expAmount} EXP to ${result.rows.length} character(s)`,
      characters: result.rows
    });
  } catch (error) {
    console.error('Error granting experience:', error);
    res.status(500).json({ error: 'Failed to grant experience' });
  }
});

// Get level-up information for a character (without actually leveling up yet)
router.get('/level-up-info/:characterId', authenticateToken, async (req, res) => {
  try {
    const { characterId } = req.params;
    
    // Get character details
    const charResult = await pool.query(`
      SELECT c.*, cs.subclass_id 
      FROM characters c
      LEFT JOIN character_subclasses cs ON c.id = cs.character_id
      WHERE c.id = $1
    `, [characterId]);
    
    if (charResult.rows.length === 0) {
      return res.status(404).json({ error: 'Character not found' });
    }
    
    const character = charResult.rows[0];
    
    // Verify this is the player's character or user is DM
    if (character.player_id !== req.user.id && req.user.role !== 'Dungeon Master') {
      return res.status(403).json({ error: 'You can only view your own character' });
    }
    
    const newLevel = character.level + 1;
    
    // Get hit die info for the class
    const hitDice = {
      'Barbarian': 12,
      'Oathknight': 12,
      'Fighter': 10,
      'Paladin': 10,
      'Ranger': 10,
      'Reaver': 8,
      'Bard': 8,
      'Cleric': 8,
      'Druid': 8,
      'Monk': 8,
      'Rogue': 8,
      'Warlock': 8,
      'Sorcerer': 6,
      'Wizard': 6
    };
    
    const hitDie = hitDice[character.class] || 8;
    
    // Get automatic features for this level (general class features)
    const autoFeaturesResult = await pool.query(`
      SELECT * FROM class_features
      WHERE class = $1 
        AND level = $2 
        AND is_choice = false
        AND (subclass_id IS NULL OR subclass_id = $3)
      ORDER BY name
    `, [character.class, newLevel, character.subclass_id]);
    
    // Get choice-based features for this level (excluding subclass choice)
    const choiceFeaturesResult = await pool.query(`
      SELECT * FROM class_features
      WHERE class = $1 
        AND level = $2 
        AND is_choice = true
        AND choice_type != 'subclass'
        AND (subclass_id IS NULL OR subclass_id = $3)
      ORDER BY choice_type, name
    `, [character.class, newLevel, character.subclass_id]);
    
    // Check separately for subclass choice at this level
    let availableSubclasses = [];
    const subclassChoiceResult = await pool.query(`
      SELECT * FROM class_features
      WHERE class = $1 
        AND level = $2 
        AND is_choice = true
        AND choice_type = 'subclass'
      LIMIT 1
    `, [character.class, newLevel]);
    
    const subclassChoice = subclassChoiceResult.rows[0];
    if (subclassChoice) {
      const subclassesResult = await pool.query(`
        SELECT * FROM subclasses WHERE class = $1 ORDER BY name
      `, [character.class]);
      availableSubclasses = subclassesResult.rows;
    }
    
    // Get class-specific skill for this level
    let skillResult;
    if (character.subclass_id) {
      // Get subclass name
      const subclassResult = await pool.query(`
        SELECT name FROM subclasses WHERE id = $1
      `, [character.subclass_id]);
      
      if (subclassResult.rows.length > 0) {
        const subclassName = subclassResult.rows[0].name;
        
        // Look for skills that have the subclass name in the name (e.g., "Crusader Might (Vanguard)")
        skillResult = await pool.query(`
          SELECT * FROM skills
          WHERE class_restriction = $1 
            AND level_requirement = $2
            AND (name ILIKE $3 OR name ILIKE $4)
          LIMIT 1
        `, [character.class, newLevel, `%${subclassName}%`, `%(${subclassName.split(' ').pop()})%`]);
      }
    }
    
    // If no subclass-specific skill found, look for general class skill
    if (!skillResult || skillResult.rows.length === 0) {
      skillResult = await pool.query(`
        SELECT * FROM skills
        WHERE (class_restriction = $1 OR class_restriction IS NULL)
          AND level_requirement = $2
          AND NOT (description ILIKE '%choose your path%' OR description ILIKE '%ascended oath%')
          AND NOT (name ILIKE '%(%)%')
        ORDER BY class_restriction DESC NULLS LAST
        LIMIT 1
      `, [character.class, newLevel]);
    }
    
    // Get all subclass-specific features for this level (for display after subclass selection)
    let subclassFeatures = [];
    if (subclassChoice) {
      const subclassFeaturesResult = await pool.query(`
        SELECT * FROM class_features
        WHERE class = $1 
          AND level = $2
          AND is_choice = false
          AND subclass_id IS NOT NULL
        ORDER BY name
      `, [character.class, newLevel]);
      subclassFeatures = subclassFeaturesResult.rows;
    }
    
    res.json({
      currentLevel: character.level,
      newLevel,
      hitDie,
      hitDieAverage: Math.floor(hitDie / 2) + 1,
      currentHP: character.hit_points_max || 0,
      autoFeatures: autoFeaturesResult.rows,
      choiceFeatures: choiceFeaturesResult.rows,
      availableSubclasses,
      subclassFeatures,
      skillGained: skillResult.rows[0] || null,
      needsSubclass: !!subclassChoice && !character.subclass_id
    });
  } catch (error) {
    console.error('Error getting level-up info:', error);
    res.status(500).json({ error: 'Failed to get level-up information' });
  }
});

// Complete level up with player choices
router.post('/level-up/:characterId', authenticateToken, async (req, res) => {
  try {
    const { characterId } = req.params;
    const { hpIncrease, subclassId, featureChoices } = req.body;
    
    // Get character details
    const charResult = await pool.query(`
      SELECT * FROM characters WHERE id = $1
    `, [characterId]);
    
    if (charResult.rows.length === 0) {
      return res.status(404).json({ error: 'Character not found' });
    }
    
    const character = charResult.rows[0];
    
    // Verify this is the player's character or user is DM
    if (character.player_id !== req.user.id && req.user.role !== 'Dungeon Master') {
      return res.status(403).json({ error: 'You can only level up your own character' });
    }
    
    const newLevel = character.level + 1;
    const newHP = (character.hit_points_max || 0) + hpIncrease;
    
    // Update character level, HP, and reset experience to 0
    await pool.query(`
      UPDATE characters
      SET level = $1, hit_points_max = $2, experience_points = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [newLevel, newHP, characterId]);
    
    // If subclass was selected, save it
    if (subclassId) {
      await pool.query(`
        INSERT INTO character_subclasses (character_id, subclass_id)
        VALUES ($1, $2)
        ON CONFLICT (character_id) DO UPDATE SET subclass_id = $2
      `, [characterId, subclassId]);
    }
    
    // Save feature choices
    if (featureChoices && Array.isArray(featureChoices)) {
      for (const choice of featureChoices) {
        await pool.query(`
          INSERT INTO character_feature_choices (character_id, feature_id, choice_name, choice_description)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (character_id, feature_id, choice_name) DO NOTHING
        `, [characterId, choice.featureId, choice.choiceName, choice.choiceDescription || '']);
      }
    }
    
    // Get class-specific skill for this level (legacy system - skills table)
    // First, check if character has a subclass and look for subclass-specific skills
    let skillGained = null;
    
    if (subclassId) {
      // Get subclass name
      const subclassResult = await pool.query(`
        SELECT name FROM subclasses WHERE id = $1
      `, [subclassId]);
      
      if (subclassResult.rows.length > 0) {
        const subclassName = subclassResult.rows[0].name;
        
        // Look for skills that have the subclass name in the name (e.g., "Crusader Might (Vanguard)")
        const subclassSkillResult = await pool.query(`
          SELECT * FROM skills
          WHERE class_restriction = $1 
            AND level_requirement = $2
            AND (name ILIKE $3 OR name ILIKE $4)
          LIMIT 1
        `, [character.class, newLevel, `%${subclassName}%`, `%(${subclassName.split(' ').pop()})%`]);
        
        if (subclassSkillResult.rows.length > 0) {
          const skill = subclassSkillResult.rows[0];
          await pool.query(`
            INSERT INTO character_skills (character_id, skill_id)
            VALUES ($1, $2)
            ON CONFLICT (character_id, skill_id) DO NOTHING
          `, [characterId, skill.id]);
          skillGained = skill;
        }
      }
    }
    
    // If no subclass-specific skill found, look for general class skill
    if (!skillGained) {
      const skillResult = await pool.query(`
        SELECT * FROM skills
        WHERE (class_restriction = $1 OR class_restriction IS NULL)
          AND level_requirement = $2
        ORDER BY class_restriction DESC NULLS LAST
        LIMIT 1
      `, [character.class, newLevel]);
      
      // If there's a skill for this level, add it to the character
      if (skillResult.rows.length > 0) {
        const skill = skillResult.rows[0];
        // Only add non-subclass-choice skills
        if (!skill.description.toLowerCase().includes('choose your path') && 
            !skill.description.toLowerCase().includes('ascended oath')) {
          await pool.query(`
            INSERT INTO character_skills (character_id, skill_id)
            VALUES ($1, $2)
            ON CONFLICT (character_id, skill_id) DO NOTHING
          `, [characterId, skill.id]);
          skillGained = skill;
        }
      }
    }
    
    // Get subclass-specific class features for this level (if character has a subclass)
    if (subclassId) {
      const subclassFeatures = await pool.query(`
        SELECT cf.*, s.name as subclass_name
        FROM class_features cf
        JOIN subclasses s ON cf.subclass_id = s.id
        WHERE cf.class = $1 AND cf.level = $2 AND cf.subclass_id = $3
          AND cf.is_choice = false
      `, [character.class, newLevel, subclassId]);
      
      // Convert subclass features to skill format for display
      if (subclassFeatures.rows.length > 0) {
        skillGained = {
          name: subclassFeatures.rows.map(f => f.name).join(', '),
          description: subclassFeatures.rows.map(f => f.description).join('\n\n'),
          class_restriction: character.class,
          level_requirement: newLevel
        };
      }
    }
    
    // Emit socket event for real-time updates (EXP reset to 0, level increased)
    if (req.io) {
      req.io.to(`campaign_${character.campaign_id}`).emit('characterLeveledUp', {
        characterId: parseInt(characterId),
        newLevel,
        newHP,
        experiencePoints: 0,
        skillGained,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({
      message: `Leveled up to ${newLevel}!`,
      newLevel,
      newHP,
      skillGained
    });
  } catch (error) {
    console.error('Error leveling up character:', error);
    res.status(500).json({ error: 'Failed to level up character' });
  }
});

module.exports = router;
