const { pool } = require('../models/database');

// DM-authored buildings that belong to a single kingdom. The definition lives in
// kingdom_custom_buildings; every copy that gets built is an ordinary fief_buildings row
// (building_type = 'custom_<id>') carrying a snapshot of the flat per-day output
// (resource_output, already summed by the production code) and the percentage lane bonuses
// (production_bonus_pct, new).
async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS kingdom_custom_buildings (
        id SERIAL PRIMARY KEY,
        kingdom_id INTEGER NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        tier_required INTEGER NOT NULL DEFAULT 1,
        days INTEGER NOT NULL DEFAULT 1,
        max_per_fief INTEGER NOT NULL DEFAULT 0,
        cost JSONB NOT NULL DEFAULT '{}'::jsonb,
        resource_output JSONB NOT NULL DEFAULT '{}'::jsonb,
        bonus_pct JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_kingdom_custom_buildings_kingdom
      ON kingdom_custom_buildings (kingdom_id)
    `);

    await client.query(`
      ALTER TABLE fief_buildings
      ADD COLUMN IF NOT EXISTS production_bonus_pct JSONB NOT NULL DEFAULT '{}'::jsonb
    `);

    await client.query('COMMIT');
    console.log('✅ add_kingdom_custom_buildings complete');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ add_kingdom_custom_buildings failed:', error.message);
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
