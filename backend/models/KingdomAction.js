const { pool } = require('./database');

class KingdomAction {
  static async findByKingdom(kingdomId) {
    const result = await pool.query(
      `SELECT * FROM kingdom_actions
       WHERE kingdom_id = $1
       ORDER BY is_completed ASC, created_at DESC`,
      [kingdomId]
    );
    return result.rows;
  }

  static async create({ kingdom_id, fief_id = null, title, description = '', action_type = '' }) {
    const result = await pool.query(
      `INSERT INTO kingdom_actions (kingdom_id, fief_id, title, description, action_type)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [kingdom_id, fief_id, title, description, action_type]
    );
    return result.rows[0];
  }

  static async complete(actionId) {
    const result = await pool.query(
      `UPDATE kingdom_actions
       SET is_completed = true, completed_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [actionId]
    );
    return result.rows[0] || null;
  }
}

module.exports = KingdomAction;
