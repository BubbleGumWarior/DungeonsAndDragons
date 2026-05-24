const { pool } = require('./database');

class Kingdom {
  static async create({ campaign_id, player_id }) {
    const existing = await pool.query(
      `SELECT * FROM kingdoms WHERE campaign_id = $1 AND player_id = $2 LIMIT 1`,
      [campaign_id, player_id]
    );
    if (existing.rows[0]) return existing.rows[0];

    const result = await pool.query(
      `INSERT INTO kingdoms (campaign_id, player_id)
       VALUES ($1, $2)
       RETURNING *`,
      [campaign_id, player_id]
    );
    return result.rows[0];
  }

  static async findById(id) {
    const result = await pool.query(`SELECT * FROM kingdoms WHERE id = $1`, [id]);
    return result.rows[0] || null;
  }

  static async getByCampaign(campaignId) {
    const result = await pool.query(
      `SELECT k.*, u.username AS player_username
       FROM kingdoms k
       JOIN users u ON u.id = k.player_id
       WHERE k.campaign_id = $1
       ORDER BY k.created_at ASC`,
      [campaignId]
    );

    if (result.rows.length === 0) return [];

    const ids = result.rows.map((k) => Number(k.id));
    const fiefsResult = await pool.query(
      `SELECT f.*
       FROM fiefs f
       WHERE f.kingdom_id = ANY($1::int[])
       ORDER BY f.is_capital DESC, f.id ASC`,
      [ids]
    );

    const byKingdom = new Map();
    for (const fief of fiefsResult.rows) {
      const key = Number(fief.kingdom_id);
      if (!byKingdom.has(key)) byKingdom.set(key, []);
      byKingdom.get(key).push(fief);
    }

    return result.rows.map((k) => ({ ...k, fiefs: byKingdom.get(Number(k.id)) || [] }));
  }

  static async setName(kingdomId, name, capitalName = 'Capital') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const kingdomResult = await client.query(
        `UPDATE kingdoms
         SET name = $2, is_active = true, updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [kingdomId, name]
      );
      const kingdom = kingdomResult.rows[0];
      if (!kingdom) {
        await client.query('ROLLBACK');
        return null;
      }

      const capitalExists = await client.query(
        `SELECT id FROM fiefs WHERE kingdom_id = $1 AND is_capital = true LIMIT 1`,
        [kingdomId]
      );

      if (capitalExists.rows.length === 0) {
        const newFiefResult = await client.query(
          `INSERT INTO fiefs (kingdom_id, name, tier, population, is_capital)
           VALUES ($1, $2, 1, 10, true)
           RETURNING id`,
          [kingdomId, capitalName]
        );
        const fiefId = Number(newFiefResult.rows[0].id);

        const hasTier1Columns = await client.query(
          `SELECT column_name
           FROM information_schema.columns
           WHERE table_name = 'fiefs'
             AND column_name = ANY($1::text[])`,
          [[
            'storage_capacity',
            'stored_resources',
            'worker_assignments',
            'unlocked_resources',
            'max_workers_per_resource',
            'location_modifiers',
          ]]
        );
        const cols = new Set(hasTier1Columns.rows.map((r) => r.column_name));

        if (cols.has('storage_capacity')) {
          await client.query(`UPDATE fiefs SET storage_capacity = 100 WHERE id = $1`, [fiefId]);
        }
        if (cols.has('stored_resources')) {
          await client.query(
            `UPDATE fiefs
             SET stored_resources = '{"food":40,"wood":25,"stone":0,"minerals":0,"faith":0,"research":0}'::jsonb
             WHERE id = $1`,
            [fiefId]
          );
        }
        if (cols.has('worker_assignments')) {
          await client.query(
            `UPDATE fiefs
             SET worker_assignments = '{"meat":0,"vegetables":0,"wood":0,"stone":0,"iron":0,"research":0,"faith":0,"building":0}'::jsonb
             WHERE id = $1`,
            [fiefId]
          );
        }
        if (cols.has('unlocked_resources')) {
          await client.query(
            `UPDATE fiefs
             SET unlocked_resources = '{"meat":false,"vegetables":false,"wood":true,"stone":false,"iron":false,"research":false,"faith":false,"building":true}'::jsonb
             WHERE id = $1`,
            [fiefId]
          );
        }
        if (cols.has('max_workers_per_resource')) {
          await client.query(
            `UPDATE fiefs
             SET max_workers_per_resource = '{"meat":10,"vegetables":10,"wood":10,"stone":10,"iron":10,"research":10,"faith":10,"building":10}'::jsonb
             WHERE id = $1`,
            [fiefId]
          );
        }

        if (cols.has('location_modifiers')) {
          const kingdomMods = kingdom.location_modifiers;
          if (kingdomMods && typeof kingdomMods === 'object' && Object.keys(kingdomMods).length > 0) {
            await client.query(
              `UPDATE fiefs SET location_modifiers = $2::jsonb WHERE id = $1`,
              [fiefId, JSON.stringify(kingdomMods)]
            );
          }
        }

        const queueCol = await client.query(
          `SELECT 1
           FROM information_schema.columns
           WHERE table_name = 'fief_buildings' AND column_name = 'queue_position'`
        );
        const hasQueuePosition = queueCol.rows.length > 0;

        for (let i = 0; i < 4; i++) {
          if (hasQueuePosition) {
            await client.query(
              `INSERT INTO fief_buildings
               (fief_id, name, building_type, level, description, construction_days_required, days_remaining, is_complete, resource_output, resource_cost, built_at, queue_position)
               VALUES
               ($1, 'Tent', 'housing', 1, 'Basic shelter', 0, 0, true, '{}'::jsonb, '{}'::jsonb, NOW(), NULL)`,
              [fiefId]
            );
          } else {
            await client.query(
              `INSERT INTO fief_buildings
               (fief_id, name, building_type, level, description, construction_days_required, days_remaining, is_complete, resource_output, resource_cost, built_at)
               VALUES
               ($1, 'Tent', 'housing', 1, 'Basic shelter', 0, 0, true, '{}'::jsonb, '{}'::jsonb, NOW())`,
              [fiefId]
            );
          }
        }
      }

      await client.query('COMMIT');
      return kingdom;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = Kingdom;
