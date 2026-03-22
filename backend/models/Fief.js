const { pool } = require('./database');

class Fief {
  static async findByKingdom(kingdomId) {
    const result = await pool.query(
      `SELECT * FROM fiefs WHERE kingdom_id = $1 ORDER BY is_capital DESC, created_at ASC`,
      [kingdomId]
    );
    return result.rows;
  }

  static async findByIdFull(id) {
    const fiefResult = await pool.query(`SELECT * FROM fiefs WHERE id = $1`, [id]);
    const fief = fiefResult.rows[0];
    if (!fief) return null;

    const buildingsResult = await pool.query(
      `SELECT * FROM fief_buildings WHERE fief_id = $1 ORDER BY is_complete DESC, built_at ASC`,
      [id]
    );
    fief.buildings = buildingsResult.rows;

    const trainingResult = await pool.query(
      `SELECT * FROM fief_training WHERE fief_id = $1 ORDER BY created_at ASC`,
      [id]
    );
    fief.training_queue = trainingResult.rows;

    if (!fief.garrison) fief.garrison = { infantry: 0, archers: 0, cavalry: 0 };

    return fief;
  }

  static async create({ kingdom_id, name, is_capital = false, construction_days_remaining = 3 }) {
    const defaultStats = JSON.stringify({ economy: 1, military: 1, stability: 1 });
    const result = await pool.query(
      `INSERT INTO fiefs (kingdom_id, name, is_capital, construction_days_remaining, stats)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [kingdom_id, name, is_capital, construction_days_remaining, defaultStats]
    );
    return result.rows[0];
  }

  static async updateResources(id, resources) {
    const result = await pool.query(
      `UPDATE fiefs SET resources = $1 WHERE id = $2 RETURNING *`,
      [JSON.stringify(resources), id]
    );
    return result.rows[0];
  }

  static async updateStats(id, stats) {
    const result = await pool.query(
      `UPDATE fiefs SET stats = $1 WHERE id = $2 RETURNING *`,
      [JSON.stringify(stats), id]
    );
    return result.rows[0];
  }

  static async updatePopulation(id, population) {
    const result = await pool.query(
      `UPDATE fiefs SET population = $1 WHERE id = $2 RETURNING *`,
      [population, id]
    );
    return result.rows[0];
  }

  static async upgradeTier(id) {
    const result = await pool.query(
      `UPDATE fiefs SET tier = LEAST(tier + 1, 10), tier_upgrade_days_remaining = 0 WHERE id = $1 RETURNING *`,
      [id]
    );
    return result.rows[0];
  }

  static async startTierUpgrade(id, daysRequired) {
    const result = await pool.query(
      `UPDATE fiefs SET tier_upgrade_days_remaining = $1 WHERE id = $2 RETURNING *`,
      [daysRequired, id]
    );
    return result.rows[0];
  }

  static async setTier(id, tier) {
    const result = await pool.query(
      `UPDATE fiefs SET tier = $1 WHERE id = $2 RETURNING *`,
      [Math.min(Math.max(1, tier), 10), id]
    );
    return result.rows[0];
  }

  static async updateWorkerAssignments(id, assignments) {
    const result = await pool.query(
      `UPDATE fiefs SET worker_assignments = $1 WHERE id = $2 RETURNING *`,
      [JSON.stringify(assignments), id]
    );
    return result.rows[0];
  }
}

module.exports = Fief;
