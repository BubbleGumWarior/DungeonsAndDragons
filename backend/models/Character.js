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

  // Convert image binary data to base64 data URL
  static convertImageToDataUrl(character) {
    if (character && character.image_data) {
      const base64 = character.image_data.toString('base64');
      character.image_url = `data:${character.image_mime_type};base64,${base64}`;
      // Remove the raw binary data from the response to reduce payload size
      delete character.image_data;
      delete character.image_mime_type;
    } else if (character && character.image_url && character.image_url.startsWith('/uploads/')) {
      // Old filesystem path with no image_data - clear it to avoid 404 errors
      character.image_url = null;
    }
    return character;
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
      flaws = '',
      movement_speed = 30
    } = characterData;
    
    try {
      const result = await pool.query(
        `INSERT INTO characters (
          player_id, campaign_id, name, race, class, background, level,
          hit_points, hit_points_max, armor_class, abilities, skills, equipment, spells,
          backstory, personality_traits, ideals, bonds, flaws, movement_speed
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) 
        RETURNING *`,
        [
          player_id, campaign_id, name, race, characterClass, background, level,
          hit_points, armor_class, JSON.stringify(abilities), JSON.stringify(skills),
          JSON.stringify(equipment), JSON.stringify(spells), backstory,
          personality_traits, ideals, bonds, flaws, movement_speed
        ]
      );
      
      // Parse JSON fields for return
      const character = result.rows[0];
      character.abilities = this.parseJsonField(character.abilities);
      character.skills = this.parseJsonField(character.skills);
      character.equipment = this.parseJsonField(character.equipment);
      character.spells = this.parseJsonField(character.spells);
      character.resistances = this.parseJsonField(character.resistances) || { resistances: [], immunities: [], vulnerabilities: [] };
      character.proficiencies = this.parseJsonField(character.proficiencies) || { weapons: [], armor: [], tools: [], languages: [] };
      
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
      character.expertise = this.parseJsonField(character.expertise) || [];
      character.equipment = this.parseJsonField(character.equipment);
      character.spells = this.parseJsonField(character.spells);
      character.resistances = this.parseJsonField(character.resistances) || { resistances: [], immunities: [], vulnerabilities: [] };
      character.proficiencies = this.parseJsonField(character.proficiencies) || { weapons: [], armor: [], tools: [], languages: [] };
      
      // Convert image data to data URL
      this.convertImageToDataUrl(character);
      
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
      character.expertise = this.parseJsonField(character.expertise) || [];
      character.equipment = this.parseJsonField(character.equipment);
      character.spells = this.parseJsonField(character.spells);
      character.resistances = this.parseJsonField(character.resistances) || { resistances: [], immunities: [], vulnerabilities: [] };
      character.proficiencies = this.parseJsonField(character.proficiencies) || { weapons: [], armor: [], tools: [], languages: [] };
      
      // Convert image data to data URL
      this.convertImageToDataUrl(character);
      
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
        character.expertise = this.parseJsonField(character.expertise) || [];
        character.equipment = this.parseJsonField(character.equipment);
        character.spells = this.parseJsonField(character.spells);
        character.resistances = this.parseJsonField(character.resistances) || { resistances: [], immunities: [], vulnerabilities: [] };
        character.proficiencies = this.parseJsonField(character.proficiencies) || { weapons: [], armor: [], tools: [], languages: [] };
        this.convertImageToDataUrl(character);
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
        `SELECT ch.*, u.username as player_name, s.name as subclass_name
         FROM characters ch
         JOIN users u ON ch.player_id = u.id
         LEFT JOIN character_subclasses cs ON cs.character_id = ch.id
         LEFT JOIN subclasses s ON s.id = cs.subclass_id
         WHERE ch.campaign_id = $1 
         ORDER BY ch.name`,
        [campaignId]
      );
      
      return result.rows.map(character => {
        character.abilities = this.parseJsonField(character.abilities);
        character.skills = this.parseJsonField(character.skills);
        character.expertise = this.parseJsonField(character.expertise) || [];
        character.equipment = this.parseJsonField(character.equipment);
        character.spells = this.parseJsonField(character.spells);
        character.resistances = this.parseJsonField(character.resistances) || { resistances: [], immunities: [], vulnerabilities: [] };
        character.proficiencies = this.parseJsonField(character.proficiencies) || { weapons: [], armor: [], tools: [], languages: [] };
        this.convertImageToDataUrl(character);
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
      hit_points, hit_points_max, armor_class, abilities, skills, expertise, equipment, spells,
      backstory, personality_traits, ideals, bonds, flaws, equipped_items, image_url,
      movement_speed, resistances, proficiencies, gold
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
             hit_points_max = COALESCE($8, hit_points_max),
             armor_class = COALESCE($9, armor_class),
             abilities = COALESCE($10, abilities),
             skills = COALESCE($11, skills),
             expertise = COALESCE($12, expertise),
             equipment = COALESCE($13, equipment),
             spells = COALESCE($14, spells),
             backstory = COALESCE($15, backstory),
             personality_traits = COALESCE($16, personality_traits),
             ideals = COALESCE($17, ideals),
             bonds = COALESCE($18, bonds),
             flaws = COALESCE($19, flaws),
             equipped_items = COALESCE($20, equipped_items),
             image_url = COALESCE($21, image_url),
             movement_speed = COALESCE($22, movement_speed),
             resistances = COALESCE($23, resistances),
             proficiencies = COALESCE($24, proficiencies),
             gold = COALESCE($25, gold),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 
         RETURNING *`,
        [
          id, name, race, characterClass, background, level,
          hit_points !== undefined ? hit_points : null,
          hit_points_max !== undefined ? hit_points_max : null,
          armor_class,
          abilities ? JSON.stringify(abilities) : null,
          skills ? JSON.stringify(skills) : null,
          expertise ? JSON.stringify(expertise) : null,
          equipment ? JSON.stringify(equipment) : null,
          spells ? JSON.stringify(spells) : null,
          backstory, personality_traits, ideals, bonds, flaws,
          equipped_items ? JSON.stringify(equipped_items) : null,
          image_url,
          movement_speed !== undefined ? movement_speed : null,
          resistances ? JSON.stringify(resistances) : null,
          proficiencies ? JSON.stringify(proficiencies) : null,
          gold !== undefined ? gold : null
        ]
      );
      
      if (result.rows.length === 0) return null;
      
      const character = result.rows[0];
      // Parse JSON fields
      character.abilities = this.parseJsonField(character.abilities);
      character.skills = this.parseJsonField(character.skills);
      character.expertise = this.parseJsonField(character.expertise) || [];
      character.equipment = this.parseJsonField(character.equipment);
      character.spells = this.parseJsonField(character.spells);
      character.resistances = this.parseJsonField(character.resistances) || { resistances: [], immunities: [], vulnerabilities: [] };
      character.proficiencies = this.parseJsonField(character.proficiencies) || { weapons: [], armor: [], tools: [], languages: [] };
      
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
  
  // Store image data for a character
  static async storeImage(characterId, imageBuffer, mimeType) {
    try {
      const result = await pool.query(
        `UPDATE characters SET image_data = $1, image_mime_type = $2 WHERE id = $3 RETURNING id, image_mime_type`,
        [imageBuffer, mimeType, characterId]
      );
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }
  
  // Get image data for a character
  static async getImage(characterId) {
    try {
      const result = await pool.query(
        `SELECT image_data, image_mime_type FROM characters WHERE id = $1`,
        [characterId]
      );
      if (result.rows.length === 0) return null;
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }
  
  // Delete image data for a character
  static async deleteImage(characterId) {
    try {
      await pool.query(
        `UPDATE characters SET image_data = NULL, image_mime_type = NULL WHERE id = $1`,
        [characterId]
      );
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
        if (!characterData.abilities[ability] || characterData.abilities[ability] < 1 || characterData.abilities[ability] > 40) {
          errors.push(`${ability.toUpperCase()} must be between 1 and 40`);
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