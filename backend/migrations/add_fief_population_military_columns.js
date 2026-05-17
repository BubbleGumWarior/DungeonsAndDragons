const { pool } = require('../models/database');

async function addFiefPopulationMilitaryColumns() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE fiefs
      ADD COLUMN IF NOT EXISTS sick_injured_population INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS soldiers INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS prisoners INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS slaves INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS slave_worker_assignments JSONB NOT NULL DEFAULT '{}'::jsonb
    `);

    await client.query(`
      UPDATE fiefs
      SET sick_injured_population = COALESCE(sick_injured_population, 0),
          soldiers = COALESCE(soldiers, 0),
          prisoners = COALESCE(prisoners, 0),
          slaves = COALESCE(slaves, 0),
          slave_worker_assignments = COALESCE(slave_worker_assignments, '{}'::jsonb)
    `);

    await client.query('COMMIT');
    console.log('✅ add_fief_population_military_columns: migration complete');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ add_fief_population_military_columns migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = addFiefPopulationMilitaryColumns;

if (require.main === module) {
  addFiefPopulationMilitaryColumns()
    .then(() => { console.log('Migration completed'); process.exit(0); })
    .catch(err => { console.error('Migration failed:', err); process.exit(1); });
}
