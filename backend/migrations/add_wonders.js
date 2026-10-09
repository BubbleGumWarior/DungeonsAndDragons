/**
 * Migration: add_wonders
 * Tier 10 Wonders. A row is created when a player starts one (under_construction) or when the DM
 * places one (built). A partial unique index makes "one of each Wonder per campaign" and "one Wonder
 * per fief" hold even under concurrent requests. NPC-held Wonders carry a holder name instead of a fief.
 */
const { pool } = require('../models/database');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS wonders (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER NOT NULL,
        wonder_key TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'under_construction',
        fief_id INTEGER REFERENCES fiefs(id) ON DELETE SET NULL,
        npc_holder_name TEXT,
        notes TEXT NOT NULL DEFAULT '',
        start_day INTEGER,
        days_total INTEGER,
        built_day INTEGER,
        paid_cost JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_wonders_key_per_campaign
      ON wonders (campaign_id, wonder_key) WHERE status IN ('under_construction', 'built')
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_wonders_one_per_fief
      ON wonders (fief_id) WHERE fief_id IS NOT NULL AND status IN ('under_construction', 'built')
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_wonders_one_per_npc_holder
      ON wonders (campaign_id, lower(npc_holder_name)) WHERE npc_holder_name IS NOT NULL AND status IN ('under_construction', 'built')
    `);
    await client.query('COMMIT');
    console.log('✅ add_wonders migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ add_wonders migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
};

module.exports = migrate;
if (require.main === module) migrate().then(() => process.exit(0)).catch(() => process.exit(1));
