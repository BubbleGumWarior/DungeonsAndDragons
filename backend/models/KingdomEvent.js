const { pool } = require('./database');

class KingdomEvent {
  static async findByKingdom(kingdomId) {
    const result = await pool.query(
      `SELECT ke.*, u.username AS created_by_name
       FROM kingdom_events ke
       LEFT JOIN users u ON ke.created_by = u.id
       WHERE ke.kingdom_id = $1
       ORDER BY ke.created_at DESC`,
      [kingdomId]
    );
    return result.rows;
  }

  static async create({ kingdom_id, fief_id = null, title, description = '', event_type = 'announcement', severity = 'low', created_by = null }) {
    const result = await pool.query(
      `INSERT INTO kingdom_events
         (kingdom_id, fief_id, title, description, event_type, severity, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [kingdom_id, fief_id, title, description, event_type, severity, created_by]
    );
    return result.rows[0];
  }

  static async resolve(eventId) {
    const result = await pool.query(
      `UPDATE kingdom_events
       SET is_resolved = true, resolved_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [eventId]
    );
    return result.rows[0] || null;
  }
}

module.exports = KingdomEvent;
