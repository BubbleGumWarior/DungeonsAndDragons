const express = require('express');
const router = express.Router();
const { pool } = require('../models/database');
const { authenticateToken } = require('../middleware/auth');
const createSkillsTable = require('../migrations/create_skills_table');
const addPrimalBondSkills = require('../migrations/add_primal_bond_skills');
const addShadowSovereignSkills = require('../migrations/add_shadow_sovereign_skills');
const addCharlatanSkills = require('../migrations/add_charlatan_skills');
const addOrderClericDomain = require('../migrations/add_order_cleric_domain');

// Levels at which a Warlock's Eldritch Blast cantrip gains an additional beam (RAW 5e:
// 2 beams at 5th, 3 at 11th, 4 at 17th). Used to swap the character's Eldritch Blast
// skill for the correct beam-count tier as they level up — see add_eldritch_blast_scaling.js.
const ELDRITCH_BLAST_TIERS = {
  5: 'Eldritch Blast (2 Beams)',
  11: 'Eldritch Blast (3 Beams)',
  17: 'Eldritch Blast (4 Beams)'
};

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
    
    if (expAmount === undefined || expAmount === null || expAmount === 0) {
      return res.status(400).json({ error: 'Invalid experience amount' });
    }
    
    // Update experience for all selected characters (floor at 0 when reducing)
    const result = await pool.query(`
      UPDATE characters
      SET experience_points = GREATEST(experience_points + $1, 0),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ANY($2) AND campaign_id = $3
      RETURNING id, name, level, experience_points
    `, [expAmount, characterIds, campaignId]);
    
    // Emit socket event for real-time updates
    if (req.io) {
      const action = expAmount < 0 ? 'reduced' : 'granted';
      console.log(`🔔 Emitting experienceGranted to campaign room: campaign_${campaignId} (${action})`);
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
      message: expAmount < 0
        ? `Removed ${Math.abs(expAmount)} EXP from ${result.rows.length} character(s)`
        : `Granted ${expAmount} EXP to ${result.rows.length} character(s)`,
      characters: result.rows
    });
  } catch (error) {
    console.error('Error granting experience:', error);
    res.status(500).json({ error: 'Failed to grant experience' });
  }
});

// Level down characters by 1 (DM only). Only touches level and experience_points —
// HP, skills, subclasses, beasts, etc. are left untouched and must be fixed up manually.
router.post('/level-down/:campaignId', authenticateToken, async (req, res) => {
  try {
    // Verify user is DM
    if (req.user.role !== 'Dungeon Master') {
      return res.status(403).json({ error: 'Only Dungeon Masters can level down characters' });
    }

    const { campaignId } = req.params;
    const { characterIds } = req.body;

    if (!Array.isArray(characterIds) || characterIds.length === 0) {
      return res.status(400).json({ error: 'No characters selected' });
    }

    // Floor at level 1, reset EXP to 0 so the level bar starts clean at the lower level
    const result = await pool.query(`
      UPDATE characters
      SET level = GREATEST(level - 1, 1),
          experience_points = 0,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ANY($1) AND campaign_id = $2
      RETURNING id, name, level, experience_points
    `, [characterIds, campaignId]);

    // Emit socket event for real-time updates
    if (req.io) {
      req.io.to(`campaign_${campaignId}`).emit('characterLeveledDown', {
        campaignId: parseInt(campaignId),
        characters: result.rows,
        timestamp: new Date().toISOString()
      });
    } else {
      console.warn('⚠️ Socket.io not available for level-down emission');
    }

    res.json({
      message: `Leveled down ${result.rows.length} character(s)`,
      characters: result.rows
    });
  } catch (error) {
    console.error('Error leveling down characters:', error);
    res.status(500).json({ error: 'Failed to level down characters' });
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
      'Primal Bond': 10,
      'Shadow Sovereign': 10,
      'Reaver': 8,
      'Bard': 8,
      'Charlatan': 8,
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
      SELECT DISTINCT ON (name, description) *
      FROM class_features
      WHERE class = $1 
        AND level = $2 
        AND is_choice = false
        AND (subclass_id IS NULL OR subclass_id = $3)
      ORDER BY name, description, id
    `, [character.class, newLevel, character.subclass_id]);
    
    // Get choice-based features for this level (excluding subclass choice)
    const choiceFeaturesResult = await pool.query(`
      SELECT DISTINCT ON (name, choice_type) *
      FROM class_features
      WHERE class = $1 
        AND level = $2 
        AND is_choice = true
        AND choice_type != 'subclass'
        AND (subclass_id IS NULL OR subclass_id = $3)
      ORDER BY name, choice_type, id
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
        // Strip a leading "The " so "The High Roller" → "High Roller" to match "Skill (High Roller)"
        const shortSubclassName = subclassName.replace(/^The\s+/i, '');
        const lastSubclassWord = subclassName.trim().split(/\s+/).pop() || '';
        
        // Look for skills that have the subclass name in the name (e.g., "Crusader Might (Vanguard)")
        // Also try matching just the last word (e.g. "Vanguard" from "Oath of the Vanguard")
        skillResult = await pool.query(`
          SELECT * FROM skills
          WHERE class_restriction = $1 
            AND level_requirement = $2
            AND (name ILIKE $3 OR name ILIKE $4 OR name ILIKE $5)
          LIMIT 1
        `, [character.class, newLevel, `%(${shortSubclassName})%`, `%${subclassName}%`, `%(${lastSubclassWord})%`]);
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
    
    // Check if this is a Primal Bond character leveling to beast arrival level
    let needsBeastSelection = false;
    let availableBeastTypes = [];
    
    if (character.class === 'Primal Bond') {
      // Check if beast already exists
      const existingBeastResult = await pool.query(`
        SELECT id FROM character_beasts WHERE character_id = $1
      `, [characterId]);
      
      const hasExistingBeast = existingBeastResult.rows.length > 0;
      
      // Determine if this level triggers beast selection
      // For Agile Hunter: level 3, Packbound: level 6, Colossal Bond: level 10
      let shouldGetBeast = false;
      let determinedSubclass = null;
      
      if (character.subclass_id) {
        // Already has subclass, get its name
        const subclassResult = await pool.query(`
          SELECT name FROM subclasses WHERE id = $1
        `, [character.subclass_id]);
        
        if (subclassResult.rows.length > 0) {
          determinedSubclass = subclassResult.rows[0].name;
        }
      } else if (subclassChoice && availableSubclasses.length > 0) {
        // Will be selecting subclass this level - all Primal Bond subclasses get beast at level 3
        // We'll show all possible beasts and determine which to show based on their choice
        if (newLevel === 3) {
          shouldGetBeast = true;
          // Show beasts for all subclasses since we don't know which they'll pick yet
          availableBeastTypes = [
            { type: 'Cheetah', name: 'Cheetah', description: 'A swift predator focused on speed and precision', subclass: 'Agile Hunter' },
            { type: 'Leopard', name: 'Leopard', description: 'A stealthy ambusher with deadly strikes', subclass: 'Agile Hunter' },
            { type: 'AlphaWolf', name: 'Alpha Wolf', description: 'A commanding pack leader that inspires allies', subclass: 'Packbound' },
            { type: 'OmegaWolf', name: 'Omega Wolf', description: 'A fierce lone hunter with relentless determination', subclass: 'Packbound' },
            { type: 'Elephant', name: 'Elephant', description: 'A massive defender with incredible resilience', subclass: 'Colossal Bond' },
            { type: 'Owlbear', name: 'Owlbear', description: 'A terrifying hybrid of raw power and aggression', subclass: 'Colossal Bond' }
          ];
          needsBeastSelection = !hasExistingBeast;
        }
      }
      
      // If we determined a subclass, check if this level gets a beast
      if (determinedSubclass && !hasExistingBeast) {
        let beastArrivalLevel = 0;
        
        if (determinedSubclass === 'Agile Hunter') {
          beastArrivalLevel = 3;
          availableBeastTypes = [
            { type: 'Cheetah', name: 'Cheetah', description: 'A swift predator focused on speed and precision' },
            { type: 'Leopard', name: 'Leopard', description: 'A stealthy ambusher with deadly strikes' }
          ];
        } else if (determinedSubclass === 'Packbound') {
          beastArrivalLevel = 6;
          availableBeastTypes = [
            { type: 'AlphaWolf', name: 'Alpha Wolf', description: 'A commanding pack leader that inspires allies' },
            { type: 'OmegaWolf', name: 'Omega Wolf', description: 'A fierce lone hunter with relentless determination' }
          ];
        } else if (determinedSubclass === 'Colossal Bond') {
          beastArrivalLevel = 10;
          availableBeastTypes = [
            { type: 'Elephant', name: 'Elephant', description: 'A massive defender with incredible resilience' },
            { type: 'Owlbear', name: 'Owlbear', description: 'A terrifying hybrid of raw power and aggression' }
          ];
        }
        
        // Check if character is leveling to the beast arrival level
        if (newLevel === beastArrivalLevel) {
          needsBeastSelection = true;
        }
      }
    }
    
    // Preview an Eldritch Blast beam upgrade (Warlock only, levels 5/11/17)
    let eldritchBlastUpgrade = null;
    if (character.class === 'Warlock' && ELDRITCH_BLAST_TIERS[newLevel]) {
      const tierResult = await pool.query(`
        SELECT * FROM skills WHERE name = $1
      `, [ELDRITCH_BLAST_TIERS[newLevel]]);
      if (tierResult.rows.length > 0) {
        eldritchBlastUpgrade = tierResult.rows[0];
      }
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
      needsSubclass: !!subclassChoice && !character.subclass_id,
      needsBeastSelection,
      availableBeastTypes,
      eldritchBlastUpgrade
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
    const { hpIncrease, subclassId, featureChoices, beastSelection, abilityIncreases } = req.body;

    // Get character details, including any subclass already chosen in a previous level-up
    const charResult = await pool.query(`
      SELECT c.*, cs.subclass_id AS existing_subclass_id
      FROM characters c
      LEFT JOIN character_subclasses cs ON c.id = cs.character_id
      WHERE c.id = $1
    `, [characterId]);

    if (charResult.rows.length === 0) {
      return res.status(404).json({ error: 'Character not found' });
    }

    const character = charResult.rows[0];
    // Use the subclass being picked this level-up if present, otherwise fall back to the
    // character's existing subclass — so subclass-flavored skills (e.g. a Warlock patron's
    // features at 6th/10th/14th level) keep getting granted on every level, not just the
    // level the subclass was originally chosen.
    const effectiveSubclassId = subclassId || character.existing_subclass_id || null;
    
    // Verify this is the player's character or user is DM
    if (character.player_id !== req.user.id && req.user.role !== 'Dungeon Master') {
      return res.status(403).json({ error: 'You can only level up your own character' });
    }
    
    const newLevel = character.level + 1;
    const newHP = (character.hit_points_max || character.hit_points || 0) + hpIncrease;
    
    // Apply ability score increases - create a copy to avoid mutation issues
    const currentAbilities = { ...character.abilities };
    if (abilityIncreases && typeof abilityIncreases === 'object') {
      for (const [ability, increase] of Object.entries(abilityIncreases)) {
        if (increase && typeof increase === 'number' && increase > 0) {
          currentAbilities[ability] = (currentAbilities[ability] || 10) + increase;
        }
      }
    }
    
    // Update character level, HP (both current and max), abilities, and reset experience to 0
    await pool.query(`
      UPDATE characters
      SET level = $1,
          hit_points_max = $2,
          hit_points = LEAST(hit_points + $3, $2),
          abilities = $4,
          experience_points = 0,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
    `, [newLevel, newHP, hpIncrease, JSON.stringify(currentAbilities), characterId]);

    // If the character has per-limb combat damage tracked, distribute the HP gain across limbs
    let updatedLimbHealth = character.limb_health ?? null;
    if (character.limb_health && hpIncrease > 0) {
      const conMod = Math.floor(((currentAbilities.con || 10) - 10) / 2);
      const conBonus = Math.max(0, conMod * 0.1);
      const limbMax = {
        head:      Math.floor(newHP * Math.min(1.0, 0.25 + conBonus)),
        chest:     Math.floor(newHP * Math.min(2.0, 1.0  + conBonus)),
        left_arm:  Math.floor(newHP * Math.min(1.0, 0.15 + conBonus)),
        right_arm: Math.floor(newHP * Math.min(1.0, 0.15 + conBonus)),
        left_leg:  Math.floor(newHP * Math.min(1.0, 0.40 + conBonus)),
        right_leg: Math.floor(newHP * Math.min(1.0, 0.40 + conBonus)),
      };
      const healed = typeof character.limb_health === 'string'
        ? JSON.parse(character.limb_health)
        : { ...character.limb_health };
      // Ensure all limb keys exist
      for (const limb of Object.keys(limbMax)) {
        if (healed[limb] == null) healed[limb] = limbMax[limb];
      }
      // Priority 1: vital limbs (head, chest)
      let remaining = hpIncrease;
      for (const limb of ['head', 'chest']) {
        if (remaining <= 0) break;
        const cur = healed[limb]; const max = limbMax[limb];
        const give = Math.min(max - cur, remaining);
        if (give > 0) { healed[limb] = cur + give; remaining -= give; }
      }
      // Priority 2: distribute remaining evenly across arms/legs
      if (remaining > 0) {
        const others = ['left_arm', 'right_arm', 'left_leg', 'right_leg'];
        let pass = 0;
        while (remaining > 0 && pass < 100) {
          pass++;
          let gave = 0;
          for (const limb of others) {
            if (remaining <= 0) break;
            const cur = healed[limb]; const max = limbMax[limb];
            if (cur < max) { healed[limb] = cur + 1; remaining--; gave++; }
          }
          if (gave === 0) break;
        }
      }
      // If all limbs now at max, clear to null (full-health convention)
      const allFull = Object.keys(limbMax).every(l => (healed[l] ?? limbMax[l]) >= limbMax[l]);
      updatedLimbHealth = allFull ? null : healed;
      await pool.query('UPDATE characters SET limb_health = $1 WHERE id = $2', [
        updatedLimbHealth ? JSON.stringify(updatedLimbHealth) : null, characterId
      ]);
    }
    
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

    if (effectiveSubclassId) {
      // Get subclass name
      const subclassResult = await pool.query(`
        SELECT name, class FROM subclasses WHERE id = $1
      `, [effectiveSubclassId]);
      
      if (subclassResult.rows.length > 0) {
        const subclassName = subclassResult.rows[0].name;
        const className = subclassResult.rows[0].class;
        // Strip a leading "The " so "The High Roller" → "High Roller" to match "Skill (High Roller)"
        const shortSubclassName = subclassName.replace(/^The\s+/i, '');
        const lastSubclassWord = subclassName.trim().split(/\s+/).pop() || '';
        
        // Special handling for Primal Bond subclasses (they use beast names in skills)
        // Also include last word pattern (e.g. "Vanguard" from "Oath of the Vanguard")
        let searchPatterns = [`%(${shortSubclassName})%`, `%${subclassName}%`, `%(${lastSubclassWord})%`];
        
        if (className === 'Primal Bond' && beastSelection && beastSelection.beastType) {
          // For Primal Bond, use the specific beast type selected
          const beastType = beastSelection.beastType;
          searchPatterns = [`%${beastType}%`, `%(${beastType})%`];
        } else if (className === 'Primal Bond') {
          // If no beast selected yet, check if character already has a beast
          const existingBeast = await pool.query(`
            SELECT beast_type FROM character_beasts WHERE character_id = $1
          `, [characterId]);
          
          if (existingBeast.rows.length > 0) {
            const beastType = existingBeast.rows[0].beast_type;
            searchPatterns = [`%${beastType}%`, `%(${beastType})%`];
          }
        }
        
        // Look for skills that match the subclass or beast patterns
        const subclassSkillResult = await pool.query(`
          SELECT * FROM skills
          WHERE class_restriction = $1 
            AND level_requirement = $2
            AND (${searchPatterns.map((_, i) => `name ILIKE $${i + 3}`).join(' OR ')})
          LIMIT 1
        `, [character.class, newLevel, ...searchPatterns]);
        
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
      // Exclude subclass-specific skills (name contains "(Subclass)") for non-Primal-Bond classes
      // Primal Bond has its own beast-name logic handled below
      let query = `
        SELECT * FROM skills
        WHERE (class_restriction = $1 OR class_restriction IS NULL)
          AND level_requirement = $2
          ${character.class !== 'Primal Bond' ? "AND name NOT LIKE '%(%)%'" : ''}
      `;
      let queryParams = [character.class, newLevel];
      
      if (character.class === 'Primal Bond') {
        // Check if character has a beast selected
        const beastCheck = await pool.query(`
          SELECT beast_type FROM character_beasts WHERE character_id = $1
        `, [characterId]);
        
        if (beastCheck.rows.length > 0) {
          const characterBeast = beastCheck.rows[0].beast_type;
          // Exclude skills with beast names in parentheses that don't match this character's beast
          query += ` AND (name NOT LIKE '%(%)' OR name ILIKE $3)`;
          queryParams.push(`%${characterBeast}%`);
        }
      }
      
      query += ` ORDER BY class_restriction DESC NULLS LAST LIMIT 1`;
      
      const skillResult = await pool.query(query, queryParams);
      
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
    if (effectiveSubclassId) {
      const subclassFeatures = await pool.query(`
        SELECT cf.*, s.name as subclass_name
        FROM class_features cf
        JOIN subclasses s ON cf.subclass_id = s.id
        WHERE cf.class = $1 AND cf.level = $2 AND cf.subclass_id = $3
          AND cf.is_choice = false
      `, [character.class, newLevel, effectiveSubclassId]);
      
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
    
    // Warlock Eldritch Blast beam upgrade — replaces the character's current Eldritch Blast
    // skill entry with the correct beam-count tier at 5th/11th/17th level (see ELDRITCH_BLAST_TIERS).
    let eldritchBlastUpgrade = null;
    if (character.class === 'Warlock' && ELDRITCH_BLAST_TIERS[newLevel]) {
      const tierResult = await pool.query(`
        SELECT * FROM skills WHERE name = $1
      `, [ELDRITCH_BLAST_TIERS[newLevel]]);

      if (tierResult.rows.length > 0) {
        const newTier = tierResult.rows[0];
        // Drop whichever Eldritch Blast tier the character currently has, then grant the new one
        await pool.query(`
          DELETE FROM character_skills
          WHERE character_id = $1
            AND skill_id IN (SELECT id FROM skills WHERE name LIKE 'Eldritch Blast%')
        `, [characterId]);
        await pool.query(`
          INSERT INTO character_skills (character_id, skill_id)
          VALUES ($1, $2)
          ON CONFLICT (character_id, skill_id) DO NOTHING
        `, [characterId, newTier.id]);
        eldritchBlastUpgrade = newTier;
      }
    }

    // Create beast companion if beast was selected during level-up
    let beastCreated = null;
    if (beastSelection && beastSelection.beastType) {
      // Define base stats for each beast type
      const beastStats = {
        'Cheetah': {
          hit_points_max: 30,
          armor_class: 15,
          speed: 60,
          attack_bonus: 5,
          damage_dice: '1d6',
          damage_type: 'slashing',
          abilities: { str: 12, dex: 18, con: 14, int: 3, wis: 12, cha: 6 },
          special_abilities: ['Sprint', 'Pounce']
        },
        'Leopard': {
          hit_points_max: 28,
          armor_class: 14,
          speed: 50,
          attack_bonus: 5,
          damage_dice: '1d6',
          damage_type: 'piercing',
          abilities: { str: 14, dex: 16, con: 13, int: 3, wis: 14, cha: 6 },
          special_abilities: ['Stealth', 'Ambush']
        },
        'AlphaWolf': {
          hit_points_max: 45,
          armor_class: 14,
          speed: 50,
          attack_bonus: 6,
          damage_dice: '2d4',
          damage_type: 'piercing',
          abilities: { str: 14, dex: 15, con: 14, int: 4, wis: 12, cha: 10 },
          special_abilities: ['Pack Tactics', 'Leadership']
        },
        'OmegaWolf': {
          hit_points_max: 40,
          armor_class: 15,
          speed: 50,
          attack_bonus: 6,
          damage_dice: '2d4',
          damage_type: 'piercing',
          abilities: { str: 16, dex: 15, con: 14, int: 3, wis: 12, cha: 6 },
          special_abilities: ['Lone Hunter', 'Relentless']
        },
        'Elephant': {
          hit_points_max: 80,
          armor_class: 13,
          speed: 40,
          attack_bonus: 8,
          damage_dice: '3d8',
          damage_type: 'bludgeoning',
          abilities: { str: 20, dex: 9, con: 17, int: 3, wis: 11, cha: 6 },
          special_abilities: ['Trample', 'Bulwark']
        },
        'Owlbear': {
          hit_points_max: 70,
          armor_class: 14,
          speed: 40,
          attack_bonus: 8,
          damage_dice: '2d8',
          damage_type: 'slashing',
          abilities: { str: 18, dex: 12, con: 16, int: 3, wis: 12, cha: 7 },
          special_abilities: ['Multiattack', 'Ferocity']
        }
      };
      
      const stats = beastStats[beastSelection.beastType];
      if (stats) {
        const beastResult = await pool.query(`
          INSERT INTO character_beasts (
            character_id, beast_type, beast_name, level_acquired,
            hit_points_max, hit_points_current, armor_class,
            abilities, speed, attack_bonus, damage_dice, damage_type, special_abilities
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING *
        `, [
          characterId,
          beastSelection.beastType,
          beastSelection.beastName || beastSelection.beastType,
          newLevel,
          stats.hit_points_max,
          stats.hit_points_max,
          stats.armor_class,
          JSON.stringify(stats.abilities),
          stats.speed,
          stats.attack_bonus,
          stats.damage_dice,
          stats.damage_type,
          JSON.stringify(stats.special_abilities)
        ]);
        beastCreated = beastResult.rows[0];
      }
    }
    
    // Emit socket event for real-time updates (EXP reset to 0, level increased)
    if (req.io) {
      req.io.to(`campaign_${character.campaign_id}`).emit('characterLeveledUp', {
        characterId: parseInt(characterId),
        newLevel,
        newHP,
        updatedAbilities: currentAbilities,
        experiencePoints: 0,
        skillGained,
        beastCreated,
        eldritchBlastUpgrade,
        timestamp: new Date().toISOString()
      });
      // Sync HP bars — includes updated limb health so combat health state stays accurate
      req.io.to(`campaign_${character.campaign_id}`).emit('healthUpdated', {
        type: 'character',
        characterId: parseInt(characterId),
        newHP,
        maxHP: newHP,
        limbHealth: updatedLimbHealth,
        isDead: false,
        campaignId: character.campaign_id,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({
      message: `Leveled up to ${newLevel}!`,
      newLevel,
      newHP,
      updatedAbilities: currentAbilities,
      skillGained,
      beastCreated,
      eldritchBlastUpgrade
    });
  } catch (error) {
    console.error('Error leveling up character:', error);
    res.status(500).json({ error: 'Failed to level up character' });
  }
});

// Get available subclasses for a character's class (used for retroactive assignment)
router.get('/available-subclasses/:characterId', authenticateToken, async (req, res) => {
  try {
    const { characterId } = req.params;

    const charResult = await pool.query(
      `SELECT c.id, c.class, c.player_id FROM characters c WHERE c.id = $1`,
      [characterId]
    );
    if (charResult.rows.length === 0) {
      return res.status(404).json({ error: 'Character not found' });
    }
    const character = charResult.rows[0];

    if (character.player_id !== req.user.id && req.user.role !== 'Dungeon Master') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const subclassesResult = await pool.query(
      `SELECT * FROM subclasses WHERE class = $1 ORDER BY name`,
      [character.class]
    );

    return res.json({ subclasses: subclassesResult.rows });
  } catch (error) {
    console.error('Error fetching available subclasses:', error);
    return res.status(500).json({ error: 'Failed to fetch subclasses' });
  }
});

// Retroactive subclass selection (for characters who missed subclass at level-up)
router.post('/select-subclass/:characterId', authenticateToken, async (req, res) => {
  try {
    const { characterId } = req.params;
    const { subclassId } = req.body;

    if (!subclassId) {
      return res.status(400).json({ error: 'subclassId is required' });
    }

    const charResult = await pool.query(`
      SELECT c.*, cs.subclass_id AS existing_subclass_id
      FROM characters c
      LEFT JOIN character_subclasses cs ON c.id = cs.character_id
      WHERE c.id = $1
    `, [characterId]);

    if (charResult.rows.length === 0) {
      return res.status(404).json({ error: 'Character not found' });
    }

    const character = charResult.rows[0];

    if (character.player_id !== req.user.id && req.user.role !== 'Dungeon Master') {
      return res.status(403).json({ error: 'You can only update your own character' });
    }

    if (character.existing_subclass_id && req.user.role !== 'Dungeon Master') {
      return res.status(400).json({ error: 'Character already has a subclass selected' });
    }

    const subclassResult = await pool.query(`
      SELECT name FROM subclasses WHERE id = $1 AND class = $2
    `, [subclassId, character.class]);

    if (subclassResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid subclass for this character class' });
    }

    const subclassName = subclassResult.rows[0].name;

    await pool.query(`
      INSERT INTO character_subclasses (character_id, subclass_id)
      VALUES ($1, $2)
      ON CONFLICT (character_id) DO UPDATE SET subclass_id = $2
    `, [characterId, subclassId]);

    // Find the level at which this class selects its subclass
    const subclassLevelResult = await pool.query(`
      SELECT level FROM class_features
      WHERE class = $1 AND is_choice = true AND choice_type = 'subclass'
      LIMIT 1
    `, [character.class]);

    const subclassLevel = subclassLevelResult.rows.length > 0 ? subclassLevelResult.rows[0].level : null;

    // Award the subclass-specific skill for that level
    let skillGranted = null;
    if (subclassLevel) {
      const shortSubclassName = subclassName.replace(/^The\s+/i, '');
      const lastSubclassWord = subclassName.trim().split(/\s+/).pop() || '';
      const skillResult = await pool.query(`
        SELECT * FROM skills
        WHERE class_restriction = $1
          AND level_requirement = $2
          AND (name ILIKE $3 OR name ILIKE $4 OR name ILIKE $5)
        LIMIT 1
      `, [character.class, subclassLevel, `%(${shortSubclassName})%`, `%${subclassName}%`, `%(${lastSubclassWord})%`]);

      if (skillResult.rows.length > 0) {
        const skill = skillResult.rows[0];
        await pool.query(`
          INSERT INTO character_skills (character_id, skill_id)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
        `, [characterId, skill.id]);
        skillGranted = skill;
      }
    }

    res.json({ success: true, subclassName, skillGranted });
  } catch (error) {
    console.error('Error selecting subclass retroactively:', error);
    res.status(500).json({ error: 'Failed to select subclass' });
  }
});

// ─── DB Reset: Remove all custom skills and detach all skills from all characters ───
// DM only. Deletes all rows from character_skills, then deletes all non-default skills.
router.delete('/reset', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'Dungeon Master') {
      return res.status(403).json({ error: 'Only Dungeon Masters can reset skills' });
    }

    // Step 1: Remove all skill associations from all characters
    const charSkillsResult = await pool.query('DELETE FROM character_skills');
    const charSkillsDeleted = charSkillsResult.rowCount;

    // Step 2: Delete all non-default skills (default skills are seeded; identified by is_default = true)
    // Fall back to keeping skills that have is_default column = true; if column doesn't exist, keep nothing
    let customDeleted = 0;
    try {
      const customResult = await pool.query(`DELETE FROM skills WHERE is_default IS NOT TRUE`);
      customDeleted = customResult.rowCount;
    } catch {
      // is_default column might not exist yet — delete all skills as fallback
      const allResult = await pool.query('DELETE FROM skills');
      customDeleted = allResult.rowCount;
    }

    console.log(`🗑️  Skills DB Reset: removed ${charSkillsDeleted} character-skill links, ${customDeleted} custom/default skills`);

    // Step 3: Re-seed all default skills
    console.log('Re-seeding default skills...');
    await createSkillsTable();
    await addPrimalBondSkills();
    await addShadowSovereignSkills();
    await addCharlatanSkills();
    await addOrderClericDomain();
    console.log('✅ Default skills re-seeded successfully');

    res.json({
      message: 'Skills database reset and reseeded successfully',
      characterSkillsRemoved: charSkillsDeleted,
      customSkillsDeleted: customDeleted,
    });
  } catch (error) {
    console.error('Error resetting skills:', error);
    res.status(500).json({ error: 'Failed to reset skills database' });
  }
});

module.exports = router;
