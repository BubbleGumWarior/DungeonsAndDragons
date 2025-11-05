const { pool } = require('./database');

class Monster {
  static async create(monsterData) {
    const {
      campaign_id,
      name,
      description = '',
      image_url = null,
      limb_health = { head: 10, chest: 30, left_arm: 15, right_arm: 15, left_leg: 20, right_leg: 20 },
      limb_ac = { head: 10, chest: 12, left_arm: 10, right_arm: 10, left_leg: 10, right_leg: 10 },
      visible_to_players = false
    } = monsterData;

    const result = await pool.query(
      `INSERT INTO monsters (
        campaign_id, name, description, image_url, limb_health, limb_ac, visible_to_players
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [campaign_id, name, description, image_url, JSON.stringify(limb_health), JSON.stringify(limb_ac), visible_to_players]
    );

    return result.rows[0];
  }

  static async findById(id) {
    const result = await pool.query(
      'SELECT * FROM monsters WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  static async findByCampaignId(campaignId) {
    const result = await pool.query(
      'SELECT * FROM monsters WHERE campaign_id = $1 ORDER BY name ASC',
      [campaignId]
    );
    return result.rows;
  }

  static async update(id, updates) {
    const allowedFields = ['name', 'description', 'image_url', 'limb_health', 'limb_ac', 'visible_to_players'];
    const setClause = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key) && value !== undefined) {
        setClause.push(`${key} = $${paramIndex}`);
        if (key === 'limb_health' || key === 'limb_ac') {
          values.push(JSON.stringify(value));
        } else {
          values.push(value);
        }
        paramIndex++;
      }
    }

    if (setClause.length === 0) {
      throw new Error('No valid fields to update');
    }

    setClause.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const result = await pool.query(
      `UPDATE monsters SET ${setClause.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    return result.rows[0];
  }

  static async delete(id) {
    const result = await pool.query(
      'DELETE FROM monsters WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0];
  }

  static async toggleVisibility(id) {
    const result = await pool.query(
      'UPDATE monsters SET visible_to_players = NOT visible_to_players, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0];
  }
}

module.exports = Monster;
