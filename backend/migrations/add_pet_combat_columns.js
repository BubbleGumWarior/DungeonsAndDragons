const { pool } = require('../models/database');

async function addPetCombatColumns() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE combat_combatants
        ADD COLUMN IF NOT EXISTS is_pet  BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS pet_id  INTEGER REFERENCES character_pets(id) ON DELETE SET NULL
    `);

    console.log('✅ Pet combat columns added to combat_combatants');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error adding pet combat columns:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = addPetCombatColumns;

if (require.main === module) {
  addPetCombatColumns()
    .then(() => { console.log('Pet combat columns migration completed'); process.exit(0); })
    .catch(err => { console.error('Migration failed:', err); process.exit(1); });
}
