const { pool } = require('../models/database');

// Foreign keys that Postgres has to check whenever a kingdom/fief is deleted (ON DELETE CASCADE /
// SET NULL) but that had no index on the referencing column. Each deleted row forced a full scan of
// the child table, so deleting a kingdom with thousands of buildings or animals became quadratic and
// could run for minutes while holding the kingdom row lock.
const INDEXES = [
  ['fief_buildings', 'parent_building_id'],
  ['fief_animals', 'pregnant_by_animal_id'],
  ['armies', 'source_fief_id'],
  ['kingdom_events', 'fief_id'],
  ['kingdom_actions', 'fief_id'],
  ['kingdom_prayer_casts', 'target_fief_id'],
  ['fief_training', 'linked_army_id'],
];

async function migrate() {
  const client = await pool.connect();
  try {
    for (const [table, column] of INDEXES) {
      const exists = await client.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
        [table, column]
      );
      if (exists.rows.length === 0) continue;
      await client.query(`CREATE INDEX IF NOT EXISTS idx_${table}_${column} ON ${table} (${column})`);
    }
    console.log('✅ Cascade foreign key indexes ready');
  } finally {
    client.release();
  }
}

module.exports = migrate;
