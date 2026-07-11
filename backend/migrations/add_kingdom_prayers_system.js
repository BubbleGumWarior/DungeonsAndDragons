const { pool } = require('../models/database');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS kingdom_prayer_casts (
        id SERIAL PRIMARY KEY,
        kingdom_id INTEGER NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
        prayer_key VARCHAR(120) NOT NULL,
        cast_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        target_fief_id INTEGER REFERENCES fiefs(id) ON DELETE SET NULL,
        faith_spent FLOAT NOT NULL DEFAULT 0,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_kingdom_prayer_casts_kingdom
      ON kingdom_prayer_casts (kingdom_id)
    `);

    await client.query('COMMIT');
    console.log('✅ add_kingdom_prayers_system complete');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ add_kingdom_prayers_system failed:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = migrate;
if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
