const { pool } = require('../models/database');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS kingdom_trade_depots (
        id SERIAL PRIMARY KEY,
        kingdom_id INTEGER NOT NULL UNIQUE REFERENCES kingdoms(id) ON DELETE CASCADE,
        resources JSONB NOT NULL DEFAULT '{}'::jsonb,
        population INTEGER NOT NULL DEFAULT 0,
        slaves INTEGER NOT NULL DEFAULT 0,
        desired_resource_text TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_kingdom_trade_depots_kingdom
      ON kingdom_trade_depots (kingdom_id)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS kingdom_trade_depot_events (
        id SERIAL PRIMARY KEY,
        kingdom_id INTEGER NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
        actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        action VARCHAR(60) NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_kingdom_trade_depot_events_kingdom
      ON kingdom_trade_depot_events (kingdom_id)
    `);

    await client.query('COMMIT');
    console.log('✅ add_kingdom_trade_depot complete');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ add_kingdom_trade_depot failed:', error.message);
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
