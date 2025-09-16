const { pool } = require('./database');

class Campaign {
  // Create a new campaign
  static async create(campaignData) {
    const { name, description, dungeon_master_id } = campaignData;
    
    try {
      const result = await pool.query(
        `INSERT INTO campaigns (name, description, dungeon_master_id) 
         VALUES ($1, $2, $3) 
         RETURNING id, name, description, dungeon_master_id, created_at, updated_at`,
        [name, description, dungeon_master_id]
      );
      
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }
  
  // Find campaign by ID with DM info
  static async findById(id) {
    try {
      const result = await pool.query(
        `SELECT c.*, u.username as dm_username 
         FROM campaigns c 
         JOIN users u ON c.dungeon_master_id = u.id 
         WHERE c.id = $1`,
        [id]
      );
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }
  
  // Find campaign by name
  static async findByName(name) {
    try {
      const result = await pool.query(
        `SELECT c.*, u.username as dm_username 
         FROM campaigns c 
         JOIN users u ON c.dungeon_master_id = u.id 
         WHERE c.name = $1`,
        [name]
      );
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }
  
  // Get all campaigns with DM info
  static async getAll() {
    try {
      const result = await pool.query(
        `SELECT c.*, u.username as dm_username 
         FROM campaigns c 
         JOIN users u ON c.dungeon_master_id = u.id 
         ORDER BY c.created_at DESC`
      );
      return result.rows;
    } catch (error) {
      throw error;
    }
  }
  
  // Get campaigns created by a specific DM
  static async getByDungeonMaster(dungeonMasterId) {
    try {
      const result = await pool.query(
        `SELECT c.*, u.username as dm_username 
         FROM campaigns c 
         JOIN users u ON c.dungeon_master_id = u.id 
         WHERE c.dungeon_master_id = $1 
         ORDER BY c.created_at DESC`,
        [dungeonMasterId]
      );
      return result.rows;
    } catch (error) {
      throw error;
    }
  }
  
  // Get campaigns where a player has a character
  static async getByPlayer(playerId) {
    try {
      const result = await pool.query(
        `SELECT DISTINCT c.*, u.username as dm_username 
         FROM campaigns c 
         JOIN users u ON c.dungeon_master_id = u.id 
         JOIN characters ch ON ch.campaign_id = c.id 
         WHERE ch.player_id = $1 
         ORDER BY c.created_at DESC`,
        [playerId]
      );
      return result.rows;
    } catch (error) {
      throw error;
    }
  }
  
  // Get all players in a campaign
  static async getPlayersInCampaign(campaignId) {
    try {
      const result = await pool.query(
        `SELECT DISTINCT u.id, u.username, u.email 
         FROM users u 
         JOIN characters ch ON ch.player_id = u.id 
         WHERE ch.campaign_id = $1 
         ORDER BY u.username`,
        [campaignId]
      );
      return result.rows;
    } catch (error) {
      throw error;
    }
  }
  
  // Update campaign
  static async update(id, updateData) {
    const { name, description } = updateData;
    
    try {
      const result = await pool.query(
        `UPDATE campaigns 
         SET name = COALESCE($2, name), 
             description = COALESCE($3, description), 
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1 
         RETURNING id, name, description, dungeon_master_id, created_at, updated_at`,
        [id, name, description]
      );
      
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }
  
  // Delete campaign and all associated characters
  static async delete(id) {
    try {
      // Start a transaction to ensure all deletes happen together
      await pool.query('BEGIN');
      
      // First delete all characters in this campaign
      await pool.query(
        'DELETE FROM characters WHERE campaign_id = $1',
        [id]
      );
      
      // Then delete the campaign
      const result = await pool.query(
        'DELETE FROM campaigns WHERE id = $1 RETURNING id',
        [id]
      );
      
      // Commit the transaction
      await pool.query('COMMIT');
      
      return result.rows[0];
    } catch (error) {
      // Rollback on error
      await pool.query('ROLLBACK');
      throw error;
    }
  }
  
  // Check if user is DM of campaign
  static async isDungeonMaster(campaignId, userId) {
    try {
      const result = await pool.query(
        'SELECT id FROM campaigns WHERE id = $1 AND dungeon_master_id = $2',
        [campaignId, userId]
      );
      return result.rows.length > 0;
    } catch (error) {
      throw error;
    }
  }
  
  // Generate URL-safe campaign name (replace spaces with underscores)
  static generateUrlName(campaignName) {
    return campaignName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  }
  
  // Get campaign by URL name
  static async findByUrlName(urlName) {
    try {
      // Convert URL name back to possible campaign name patterns
      const possibleNames = [
        urlName.replace(/_/g, ' '), // underscores to spaces
        urlName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), // title case
        urlName // exact match
      ];
      
      const result = await pool.query(
        `SELECT c.*, u.username as dm_username 
         FROM campaigns c 
         JOIN users u ON c.dungeon_master_id = u.id 
         WHERE LOWER(REPLACE(c.name, ' ', '_')) = LOWER($1)`,
        [urlName]
      );
      
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }
}

module.exports = Campaign;