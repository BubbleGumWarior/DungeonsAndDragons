const { pool } = require('./database');

class Army {
  // Create a new army
  static async create(armyData) {
    const {
      player_id,
      campaign_id,
      name,
      numbers = 5,
      equipment = 5,
      discipline = 5,
      morale = 5,
      command = 5,
      logistics = 5
    } = armyData;
    
    try {
      const result = await pool.query(
        `INSERT INTO armies (
          player_id, campaign_id, name, numbers, equipment, discipline, morale, command, logistics
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
        RETURNING *`,
        [player_id, campaign_id, name, numbers, equipment, discipline, morale, command, logistics]
      );
      
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }
  
  // Find army by ID
  static async findById(id) {
    try {
      const result = await pool.query(
        `SELECT a.*, u.username as player_name 
         FROM armies a
         JOIN users u ON a.player_id = u.id
         WHERE a.id = $1`,
        [id]
      );
      
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      throw error;
    }
  }
  
  // Find all armies for a player in a campaign
  static async findByPlayerAndCampaign(playerId, campaignId) {
    try {
      const result = await pool.query(
        `SELECT * FROM armies 
         WHERE player_id = $1 AND campaign_id = $2
         ORDER BY created_at DESC`,
        [playerId, campaignId]
      );
      
      return result.rows;
    } catch (error) {
      throw error;
    }
  }
  
  // Find all armies in a campaign
  static async findByCampaign(campaignId) {
    try {
      const result = await pool.query(
        `SELECT a.*, u.username as player_name 
         FROM armies a
         JOIN users u ON a.player_id = u.id
         WHERE a.campaign_id = $1
         ORDER BY a.player_id, a.created_at DESC`,
        [campaignId]
      );
      
      return result.rows;
    } catch (error) {
      throw error;
    }
  }
  
  // Update army stats
  static async updateStats(id, stats) {
    const {
      name,
      numbers,
      equipment,
      discipline,
      morale,
      command,
      logistics
    } = stats;
    
    try {
      const result = await pool.query(
        `UPDATE armies 
         SET name = COALESCE($2, name),
             numbers = COALESCE($3, numbers),
             equipment = COALESCE($4, equipment),
             discipline = COALESCE($5, discipline),
             morale = COALESCE($6, morale),
             command = COALESCE($7, command),
             logistics = COALESCE($8, logistics),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [id, name, numbers, equipment, discipline, morale, command, logistics]
      );
      
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }
  
  // Delete army (cascade deletes battle history)
  static async delete(id) {
    try {
      await pool.query('DELETE FROM armies WHERE id = $1', [id]);
      return true;
    } catch (error) {
      throw error;
    }
  }
  
  // Get battle history for an army
  static async getBattleHistory(armyId) {
    try {
      const result = await pool.query(
        `SELECT * FROM army_battle_history 
         WHERE army_id = $1
         ORDER BY battle_date DESC`,
        [armyId]
      );
      
      return result.rows;
    } catch (error) {
      throw error;
    }
  }
  
  // Add battle history record
  static async addBattleHistory(historyData) {
    const {
      army_id,
      battle_name,
      start_score,
      end_score,
      enemy_name,
      enemy_start_score,
      enemy_end_score,
      result,
      goals_chosen
    } = historyData;
    
    try {
      const result_query = await pool.query(
        `INSERT INTO army_battle_history (
          army_id, battle_name, start_score, end_score, 
          enemy_name, enemy_start_score, enemy_end_score, result, goals_chosen
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [army_id, battle_name, start_score, end_score, enemy_name, enemy_start_score, enemy_end_score, result, JSON.stringify(goals_chosen)]
      );
      
      return result_query.rows[0];
    } catch (error) {
      throw error;
    }
  }
}

module.exports = Army;
