const { pool } = require('./database');

class Kingdom {
  static async create({ campaign_id, player_id }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const kingdomResult = await client.query(
        `INSERT INTO kingdoms (campaign_id, player_id, is_active) VALUES ($1, $2, false) RETURNING *`,
        [campaign_id, player_id]
      );
      const kingdom = kingdomResult.rows[0];
      // Auto-create capital fief with 3-day construction timer and starting stats of 1
      await client.query(
        `INSERT INTO fiefs (kingdom_id, name, is_capital, construction_days_remaining, stats) VALUES ($1, $2, true, 3, $3)`,
        [kingdom.id, 'Capital', JSON.stringify({ economy: 1, military: 1, stability: 1 })]
      );
      await client.query('COMMIT');
      return kingdom;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
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

  static async findByCampaignWithDetails(campaign_id) {
    const kingdoms = await pool.query(
      `SELECT k.*, u.username AS player_name
       FROM kingdoms k
       JOIN users u ON k.player_id = u.id
       WHERE k.campaign_id = $1 AND k.is_active = true
       ORDER BY k.created_at ASC`,
      [campaign_id]
    );
    const result = [];
    for (const k of kingdoms.rows) {
      const fiefs = await pool.query(
        `SELECT id, name, tier, population, is_capital, construction_days_remaining, worker_assignments, stats, resources FROM fiefs WHERE kingdom_id = $1 ORDER BY is_capital DESC, created_at ASC`,
        [k.id]
      );
      result.push({ ...k, fiefs: fiefs.rows });
    }
    return result;
  }

  static async findByIdFull(id) {
    const kResult = await pool.query(
      `SELECT k.*, u.username AS player_name
       FROM kingdoms k
       JOIN users u ON k.player_id = u.id
       WHERE k.id = $1`,
      [id]
    );
    const kingdom = kResult.rows[0];
    if (!kingdom) return null;

    const fiefResult = await pool.query(
      `SELECT * FROM fiefs WHERE kingdom_id = $1 ORDER BY is_capital DESC, created_at ASC`,
      [id]
    );
    const fiefs = [];
    for (const fief of fiefResult.rows) {
      const buildings = await pool.query(
        `SELECT * FROM fief_buildings WHERE fief_id = $1 ORDER BY is_complete DESC, id ASC`,
        [fief.id]
      );
      fiefs.push({ ...fief, buildings: buildings.rows });
    }

    const events = await pool.query(
      `SELECT ke.*, u.username AS created_by_name
       FROM kingdom_events ke LEFT JOIN users u ON ke.created_by = u.id
       WHERE ke.kingdom_id = $1 ORDER BY ke.created_at DESC LIMIT 20`,
      [id]
    );
    const actions = await pool.query(
      `SELECT * FROM kingdom_actions WHERE kingdom_id = $1 ORDER BY is_completed ASC, created_at DESC`,
      [id]
    );

    return { ...kingdom, fiefs, events: events.rows, actions: actions.rows };
  }

  static async updateResources(id, resources) {
    const result = await pool.query(
      `UPDATE kingdoms SET resources = $1 WHERE id = $2 RETURNING *`,
      [JSON.stringify(resources), id]
    );
    return result.rows[0];
  }

  static async updateStats(id, stats) {
    const result = await pool.query(
      `UPDATE kingdoms SET stats = $1 WHERE id = $2 RETURNING *`,
      [JSON.stringify(stats), id]
    );
    return result.rows[0];
  }

  static async updatePopulation(id, population) {
    const result = await pool.query(
      `UPDATE kingdoms SET population = $1 WHERE id = $2 RETURNING *`,
      [population, id]
    );
    return result.rows[0];
  }

  static async upgradeTier(id) {
    const result = await pool.query(
      `UPDATE kingdoms SET tier = LEAST(tier + 1, 10) WHERE id = $1 RETURNING *`,
      [id]
    );
    return result.rows[0];
  }

  static async delete(id) {
    await pool.query('DELETE FROM kingdoms WHERE id = $1', [id]);
  }
}

module.exports = Kingdom;
