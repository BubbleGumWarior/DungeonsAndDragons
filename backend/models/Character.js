const { pool } = require('./database');

class Character {
  // Helper function to safely parse JSON or return the object if it's already parsed
  static parseJsonField(field) {
    if (typeof field === 'string') {
      try {
        return JSON.parse(field);
      } catch (error) {
        console.error('Error parsing JSON field:', error);
        return field;
      }
    }
    return field;
  }

  // Create a new character
  static async create(characterData) {
    const {
      player_id,
      campaign_id,
      name,
      race,
      class: characterClass,
      background,
      level = 1,
      hit_points,
      armor_class,
      abilities, // JSON object with str, dex, con, int, wis, cha
      skills, // JSON array of skill names
      equipment, // JSON array of equipment items
      spells, // JSON array of spells (if applicable)
      backstory = '',
      personality_traits = '',
      ideals = '',
      bonds = '',
      flaws = ''
    } = characterData;
    
    try {
      const result = await pool.query(
        `INSERT INTO characters (
          player_id, campaign_id, name, race, class, background, level,
          hit_points, armor_class, abilities, skills, equipment, spells,
          backstory, personality_traits, ideals, bonds, flaws
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) 
        RETURNING *`,
        [
          player_id, campaign_id, name, race, characterClass, background, level,
          hit_points, armor_class, JSON.stringify(abilities), JSON.stringify(skills),
          JSON.stringify(equipment), JSON.stringify(spells), backstory,
          personality_traits, ideals, bonds, flaws
        ]
      );
      
      // Parse JSON fields for return
      const character = result.rows[0];
      character.abilities = this.parseJsonField(character.abilities);
      character.skills = this.parseJsonField(character.skills);
      character.equipment = this.parseJsonField(character.equipment);
      character.spells = this.parseJsonField(character.spells);
      
      return character;
    } catch (error) {
      throw error;
    }
  }
  
  // Find character by ID
  static async findById(id) {
    try {
      const result = await pool.query(
        `SELECT ch.*, u.username as player_name, c.name as campaign_name 
         FROM characters ch
         JOIN users u ON ch.player_id = u.id
         JOIN campaigns c ON ch.campaign_id = c.id
         WHERE ch.id = $1`,
        [id]
      );
      
      if (result.rows.length === 0) return null;
      
      const character = result.rows[0];
      // Parse JSON fields
      character.abilities = this.parseJsonField(character.abilities);
      character.skills = this.parseJsonField(character.skills);
      character.equipment = this.parseJsonField(character.equipment);
      character.spells = this.parseJsonField(character.spells);
      
      return character;
    } catch (error) {
      throw error;
    }
  }
  
  // Find character by player and campaign
  static async findByPlayerAndCampaign(playerId, campaignId) {
    try {
      const result = await pool.query(
        `SELECT ch.*, u.username as player_name, c.name as campaign_name 
         FROM characters ch
         JOIN users u ON ch.player_id = u.id
         JOIN campaigns c ON ch.campaign_id = c.id
         WHERE ch.player_id = $1 AND ch.campaign_id = $2`,
        [playerId, campaignId]
      );
      
      if (result.rows.length === 0) return null;
      
      const character = result.rows[0];
      // Parse JSON fields
      character.abilities = this.parseJsonField(character.abilities);
      character.skills = this.parseJsonField(character.skills);
      character.equipment = this.parseJsonField(character.equipment);
      character.spells = this.parseJsonField(character.spells);
      
      return character;
    } catch (error) {
      throw error;
    }
  }
  
  // Get all characters for a player
  static async getByPlayer(playerId) {
    try {
      const result = await pool.query(
        `SELECT ch.*, c.name as campaign_name 
         FROM characters ch
         JOIN campaigns c ON ch.campaign_id = c.id
         WHERE ch.player_id = $1 
         ORDER BY ch.created_at DESC`,
        [playerId]
      );
      
      return result.rows.map(character => {
        character.abilities = this.parseJsonField(character.abilities);
        character.skills = this.parseJsonField(character.skills);
        character.equipment = this.parseJsonField(character.equipment);
        character.spells = this.parseJsonField(character.spells);
        return character;
      });
    } catch (error) {
      throw error;
    }
  }
  
  // Get all characters in a campaign
  static async getByCampaign(campaignId) {
    try {
      const result = await pool.query(
        `SELECT ch.*, u.username as player_name 
         FROM characters ch
         JOIN users u ON ch.player_id = u.id
         WHERE ch.campaign_id = $1 
         ORDER BY ch.name`,
        [campaignId]
      );
      
      return result.rows.map(character => {
        character.abilities = this.parseJsonField(character.abilities);
        character.skills = this.parseJsonField(character.skills);
        character.equipment = this.parseJsonField(character.equipment);
        character.spells = this.parseJsonField(character.spells);
        return character;
      });
    } catch (error) {
      throw error;
    }
  }
  
  // Update character
  static async update(id, updateData) {
    const {
      name, race, class: characterClass, background, level,
      hit_points, armor_class, abilities, skills, equipment, spells,
      backstory, personality_traits, ideals, bonds, flaws, equipped_items, image_url
    } = updateData;
    
    try {
      const result = await pool.query(
        `UPDATE characters 
         SET name = COALESCE($2, name),
             race = COALESCE($3, race),
             class = COALESCE($4, class),
             background = COALESCE($5, background),
             level = COALESCE($6, level),
             hit_points = COALESCE($7, hit_points),
             armor_class = COALESCE($8, armor_class),
             abilities = COALESCE($9, abilities),
             skills = COALESCE($10, skills),
             equipment = COALESCE($11, equipment),
             spells = COALESCE($12, spells),
             backstory = COALESCE($13, backstory),
             personality_traits = COALESCE($14, personality_traits),
             ideals = COALESCE($15, ideals),
             bonds = COALESCE($16, bonds),
             flaws = COALESCE($17, flaws),
             equipped_items = COALESCE($18, equipped_items),
             image_url = COALESCE($19, image_url),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 
         RETURNING *`,
        [
          id, name, race, characterClass, background, level,
          hit_points, armor_class,
          abilities ? JSON.stringify(abilities) : null,
          skills ? JSON.stringify(skills) : null,
          equipment ? JSON.stringify(equipment) : null,
          spells ? JSON.stringify(spells) : null,
          backstory, personality_traits, ideals, bonds, flaws,
          equipped_items ? JSON.stringify(equipped_items) : null,
          image_url
        ]
      );
      
      if (result.rows.length === 0) return null;
      
      const character = result.rows[0];
      // Parse JSON fields
      character.abilities = this.parseJsonField(character.abilities);
      character.skills = this.parseJsonField(character.skills);
      character.equipment = this.parseJsonField(character.equipment);
      character.spells = this.parseJsonField(character.spells);
      
      return character;
    } catch (error) {
      throw error;
    }
  }
  
  // Delete character
  static async delete(id) {
    try {
      const result = await pool.query(
        'DELETE FROM characters WHERE id = $1 RETURNING id',
        [id]
      );
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }
  
  // Check if player owns character
  static async isPlayerOwner(characterId, playerId) {
    try {
      const result = await pool.query(
        'SELECT id FROM characters WHERE id = $1 AND player_id = $2',
        [characterId, playerId]
      );
      return result.rows.length > 0;
    } catch (error) {
      throw error;
    }
  }
  
  // Calculate ability modifier
  static getAbilityModifier(score) {
    return Math.floor((score - 10) / 2);
  }
  
  // Get proficiency bonus by level
  static getProficiencyBonus(level) {
    return Math.ceil(level / 4) + 1;
  }
  
  // Validate character data
  static validateCharacterData(characterData) {
    const errors = [];
    
    if (!characterData.name || characterData.name.trim().length === 0) {
      errors.push('Character name is required');
    }
    
    if (!characterData.race) {
      errors.push('Character race is required');
    }
    
    if (!characterData.class) {
      errors.push('Character class is required');
    }
    
    if (!characterData.abilities) {
      errors.push('Character abilities are required');
    } else {
      const requiredAbilities = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
      for (const ability of requiredAbilities) {
        if (!characterData.abilities[ability] || characterData.abilities[ability] < 1 || characterData.abilities[ability] > 20) {
          errors.push(`${ability.toUpperCase()} must be between 1 and 20`);
        }
      }
    }
    
    if (characterData.level && (characterData.level < 1 || characterData.level > 20)) {
      errors.push('Character level must be between 1 and 20');
    }
    
    return errors;
  }
}

module.exports = Character;