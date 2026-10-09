/**
 * Migration: add_espionage_missions
 * Tier 7 espionage. A player requests a mission (target text + spies from the fief's reserve),
 * the DM approves it with a duration and success rate, and the player only ever sees a progress bar.
 *
 * Lifecycle: pending -> in_progress -> failed | stationed -> returning -> returned   (or cancelled)
 * `outcome` and `fail_fraction` are rolled when the DM approves and are never sent to players.
 */
const { pool } = require('../models/database');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS espionage_missions (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER NOT NULL,
        fief_id INTEGER NOT NULL REFERENCES fiefs(id) ON DELETE CASCADE,
        kingdom_id INTEGER NOT NULL,
        requested_by INTEGER,
        target TEXT NOT NULL,
        spies JSONB NOT NULL DEFAULT '{}'::jsonb,
        status TEXT NOT NULL DEFAULT 'pending',
        days_total INTEGER,
        success_rate NUMERIC,
        outcome TEXT,
        fail_fraction NUMERIC,
        start_day INTEGER,
        recall_day INTEGER,
        resolved_day INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_espionage_campaign_status ON espionage_missions (campaign_id, status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_espionage_fief ON espionage_missions (fief_id)`);
    await client.query('COMMIT');
    console.log('✅ add_espionage_missions migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ add_espionage_missions migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
};

module.exports = migrate;
if (require.main === module) migrate().then(() => process.exit(0)).catch(() => process.exit(1));
