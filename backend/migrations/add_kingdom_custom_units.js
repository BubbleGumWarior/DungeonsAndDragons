const { pool } = require('../models/database');

// DM-authored troop types that belong to a single kingdom. A custom unit hangs off any unit already in
// the troop tree (Militia, a built-in unit, or another custom unit) through parent_unit_type, so it is
// reached by upgrading that parent. When requires_building is true the unit only unlocks in fiefs that
// have completed the referenced kingdom_custom_buildings row.
async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS kingdom_custom_units (
        id SERIAL PRIMARY KEY,
        kingdom_id INTEGER NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
        name VARCHAR(60) NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        parent_unit_type VARCHAR(60) NOT NULL,
        base_days INTEGER NOT NULL DEFAULT 10,
        requires_building BOOLEAN NOT NULL DEFAULT false,
        custom_building_id INTEGER REFERENCES kingdom_custom_buildings(id) ON DELETE RESTRICT,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_kingdom_custom_units_name
      ON kingdom_custom_units (kingdom_id, LOWER(name))
    `);

    await client.query('COMMIT');
    console.log('✅ add_kingdom_custom_units complete');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ add_kingdom_custom_units failed:', error.message);
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
