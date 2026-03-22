const { pool } = require('./database');

class FiefEventLog {
  static async findByFief(fiefId, page = 1, limit = 50) {
    const offset = (page - 1) * limit;
    const result = await pool.query(
      `SELECT * FROM fief_event_log
       WHERE fief_id = $1
       ORDER BY campaign_day DESC, id DESC
       LIMIT $2 OFFSET $3`,
      [fiefId, limit, offset]
    );
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM fief_event_log WHERE fief_id = $1`,
      [fiefId]
    );
    return {
      entries: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
    };
  }

  static async create({ fief_id, campaign_day, event_type, title, details = {} }) {
    const result = await pool.query(
      `INSERT INTO fief_event_log (fief_id, campaign_day, event_type, title, details)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [fief_id, campaign_day, event_type, title, JSON.stringify(details)]
    );
    return result.rows[0];
  }
}

module.exports = FiefEventLog;
