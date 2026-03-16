const { pool } = require('./database');

class Kingdom {
  static async create({ campaign_id, player_id }) {
    const result = await pool.query(
      `INSERT INTO kingdoms (campaign_id, player_id, is_active) VALUES ($1, $2, false) RETURNING *`,
      [campaign_id, player_id]
    );
    return result.rows[0];
  }

  static async setName(id, name) {
    const result = await pool.query(
      `UPDATE kingdoms SET name = $1, is_active = true, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [name, id]
    );
    return result.rows[0] || null;
  }

  static async findByCampaign(campaign_id) {
    const result = await pool.query(
      `SELECT k.*, u.username AS player_name
       FROM kingdoms k
       JOIN users u ON k.player_id = u.id
       WHERE k.campaign_id = $1 AND k.is_active = true
       ORDER BY k.created_at ASC`,
      [campaign_id]
    );
    return result.rows;
  }

  static async findById(id) {
    const result = await pool.query(
      `SELECT k.*, u.username AS player_name
       FROM kingdoms k
       JOIN users u ON k.player_id = u.id
       WHERE k.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }
}

module.exports = Kingdom;
