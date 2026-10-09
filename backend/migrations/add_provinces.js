/**
 * Migration: add_provinces
 * Tier 9 provinces. A province belongs to one fief, is run by a governor, and has a loyalty meter.
 * status: active | seceded
 */
const { pool } = require('../models/database');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS provinces (
        id SERIAL PRIMARY KEY,
        fief_id INTEGER NOT NULL REFERENCES fiefs(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        governor_name TEXT NOT NULL DEFAULT '',
        governor_bonus TEXT NOT NULL DEFAULT '',
        population INTEGER NOT NULL DEFAULT 0,
        loyalty NUMERIC NOT NULL DEFAULT 70,
        tribute_pct NUMERIC NOT NULL DEFAULT 25,
        improvements JSONB NOT NULL DEFAULT '{}'::jsonb,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_provinces_fief ON provinces (fief_id, status)`);
    await client.query('COMMIT');
    console.log('✅ add_provinces migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ add_provinces migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
};

module.exports = migrate;
if (require.main === module) migrate().then(() => process.exit(0)).catch(() => process.exit(1));
