const { pool } = require('./database');

class Army {
  // Helper function to calculate numbers stat from troop count
  static calculateNumbersStat(troopCount) {
    if (troopCount <= 20) return 1;
    if (troopCount <= 50) return 2;
    if (troopCount <= 100) return 3;
    if (troopCount <= 200) return 4;
    if (troopCount <= 400) return 5;
    if (troopCount <= 800) return 6;
    if (troopCount <= 1600) return 7;
    if (troopCount <= 3200) return 8;
    if (troopCount <= 6400) return 9;
    return 10;
  }

  // Create a new army
  static async create(armyData) {
    const {
      player_id,
      campaign_id,
      name,
      category = 'Swordsmen',
      total_troops,
      equipment = 5,
      discipline = 5,
      morale = 5,
      command = 5,
      logistics = 5
    } = armyData;
    
    // Calculate numbers stat from troop count
    const numbers = this.calculateNumbersStat(total_troops);
    const starting_troops = total_troops;
    
    try {
      const result = await pool.query(
        `INSERT INTO armies (
          player_id, campaign_id, name, category, numbers, total_troops, starting_troops,
          equipment, discipline, morale, command, logistics
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
        RETURNING *`,
        [player_id, campaign_id, name, category, numbers, total_troops, starting_troops,
         equipment, discipline, morale, command, logistics]
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
      total_troops,
      equipment,
      discipline,
      morale,
      command,
      logistics
    } = stats;
    
    // Recalculate numbers stat if total_troops is provided
    const numbers = total_troops !== undefined ? this.calculateNumbersStat(total_troops) : undefined;
    
    try {
      const result = await pool.query(
        `UPDATE armies 
         SET name = COALESCE($2, name),
             total_troops = COALESCE($3, total_troops),
             numbers = COALESCE($4, numbers),
             equipment = COALESCE($5, equipment),
             discipline = COALESCE($6, discipline),
             morale = COALESCE($7, morale),
             command = COALESCE($8, command),
             logistics = COALESCE($9, logistics),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [id, name, total_troops, numbers, equipment, discipline, morale, command, logistics]
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
      goals_chosen,
      troops_lost = 0
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
      
      // Update army's current troop count
      if (troops_lost > 0) {
        await pool.query(
          `UPDATE armies 
           SET total_troops = GREATEST(0, total_troops - $2)
           WHERE id = $1`,
          [army_id, troops_lost]
        );
      }
      
      return result_query.rows[0];
    } catch (error) {
      throw error;
    }
  }
  
  // Update troop count for an army
  static async updateTroops(armyId, troopChange) {
    try {
      const result = await pool.query(
        `UPDATE armies 
         SET total_troops = GREATEST(0, total_troops + $2),
             numbers = CASE 
               WHEN (total_troops + $2) <= 20 THEN 1
               WHEN (total_troops + $2) <= 50 THEN 2
               WHEN (total_troops + $2) <= 100 THEN 3
               WHEN (total_troops + $2) <= 200 THEN 4
               WHEN (total_troops + $2) <= 400 THEN 5
               WHEN (total_troops + $2) <= 800 THEN 6
               WHEN (total_troops + $2) <= 1600 THEN 7
               WHEN (total_troops + $2) <= 3200 THEN 8
               WHEN (total_troops + $2) <= 6400 THEN 9
               ELSE 10
             END
         WHERE id = $1
         RETURNING *`,
        [armyId, troopChange]
      );
      
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }
}

module.exports = Army;
