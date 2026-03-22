/**
 * Migration: add_research_system
 * Adds fief_research_queue table and a `research` worker key.
 */
const { pool } = require('../models/database');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── fief_research_queue ───────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS fief_research_queue (
        id                    SERIAL PRIMARY KEY,
        fief_id               INTEGER NOT NULL REFERENCES fiefs(id) ON DELETE CASCADE,
        research_id           VARCHAR(80) NOT NULL,
        status                VARCHAR(20) NOT NULL DEFAULT 'queued',
        queue_position        INTEGER,
        points_accumulated    FLOAT NOT NULL DEFAULT 0,
        campaign_day_started  INTEGER,
        campaign_day_completed INTEGER,
        created_at            TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log('✅ fief_research_queue table created (or already exists)');

    // Index for fast per-fief lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_frq_fief_id ON fief_research_queue(fief_id)
    `);

    // ── fief_research_levels — stores completed research per fief ─────────────
    // Keyed by fief_id + building_type, stores the current reached level.
    await client.query(`
      CREATE TABLE IF NOT EXISTS fief_research_levels (
        id            SERIAL PRIMARY KEY,
        fief_id       INTEGER NOT NULL REFERENCES fiefs(id) ON DELETE CASCADE,
        building_type VARCHAR(80) NOT NULL,
        level         INTEGER NOT NULL DEFAULT 1,
        UNIQUE(fief_id, building_type)
      )
    `);
    console.log('✅ fief_research_levels table created (or already exists)');

    await client.query('COMMIT');
    console.log('✅ add_research_system migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ add_research_system migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
};

module.exports = migrate;
if (require.main === module) migrate().then(() => process.exit(0)).catch(() => process.exit(1));
