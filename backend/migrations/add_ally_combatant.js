const { pool } = require('../models/database');

async function addAllyCombatant() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      ALTER TABLE combat_combatants
        ADD COLUMN IF NOT EXISTS is_ally BOOLEAN NOT NULL DEFAULT FALSE
    `);
    await client.query('COMMIT');
    console.log('✅ add_ally_combatant: is_ally column added to combat_combatants');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ add_ally_combatant migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = addAllyCombatant;

if (require.main === module) {
  addAllyCombatant()
    .then(() => { console.log('Migration completed'); process.exit(0); })
    .catch(err => { console.error('Migration failed:', err); process.exit(1); });
}
