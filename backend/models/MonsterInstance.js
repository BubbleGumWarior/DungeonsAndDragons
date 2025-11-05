const { pool } = require('./database');

class MonsterInstance {
  static async create(monsterInstanceData) {
    const { monster_id, campaign_id, instance_number, current_limb_health, initiative } = monsterInstanceData;
    
    const result = await pool.query(
      `INSERT INTO monster_instances 
       (monster_id, campaign_id, instance_number, current_limb_health, in_combat, initiative) 
       VALUES ($1, $2, $3, $4, TRUE, $5) 
       RETURNING *`,
      [monster_id, campaign_id, instance_number, JSON.stringify(current_limb_health), initiative]
    );
    
    return result.rows[0];
  }

  static async findById(id) {
    const result = await pool.query(
      'SELECT * FROM monster_instances WHERE id = $1',
      [id]
    );
    
    return result.rows[0];
  }

  static async findByCampaignId(campaignId) {
    const result = await pool.query(
      'SELECT * FROM monster_instances WHERE campaign_id = $1 ORDER BY instance_number',
      [campaignId]
    );
    
    return result.rows;
  }

  static async findActiveByCampaignId(campaignId) {
    const result = await pool.query(
      'SELECT * FROM monster_instances WHERE campaign_id = $1 AND in_combat = TRUE ORDER BY instance_number',
      [campaignId]
    );
    
    return result.rows;
  }

  static async getNextInstanceNumber(monsterId, campaignId) {
    const result = await pool.query(
      `SELECT COALESCE(MAX(instance_number), 0) + 1 as next_number 
       FROM monster_instances 
       WHERE monster_id = $1 AND campaign_id = $2`,
      [monsterId, campaignId]
    );
    
    return result.rows[0].next_number;
  }

  static async updateHealth(id, limbHealth) {
    const result = await pool.query(
      'UPDATE monster_instances SET current_limb_health = $1 WHERE id = $2 RETURNING *',
      [JSON.stringify(limbHealth), id]
    );
    
    return result.rows[0];
  }

  static async updatePosition(id, x, y) {
    const result = await pool.query(
      'UPDATE monster_instances SET battle_position_x = $1, battle_position_y = $2 WHERE id = $3 RETURNING *',
      [x, y, id]
    );
    
    return result.rows[0];
  }

  static async removeFromCombat(id) {
    const result = await pool.query(
      'UPDATE monster_instances SET in_combat = FALSE WHERE id = $1 RETURNING *',
      [id]
    );
    
    return result.rows[0];
  }

  static async removeAllFromCombat(campaignId) {
    const result = await pool.query(
      'UPDATE monster_instances SET in_combat = FALSE WHERE campaign_id = $1',
      [campaignId]
    );
    
    return result.rowCount;
  }

  static async delete(id) {
    const result = await pool.query(
      'DELETE FROM monster_instances WHERE id = $1 RETURNING *',
      [id]
    );
    
    return result.rows[0];
  }

  static async deleteAllByCampaign(campaignId) {
    const result = await pool.query(
      'DELETE FROM monster_instances WHERE campaign_id = $1',
      [campaignId]
    );
    
    return result.rowCount;
  }
}

module.exports = MonsterInstance;
