const { pool } = require('../models/database');

async function addShadowCombatColumns() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE combat_combatants
        ADD COLUMN IF NOT EXISTS is_shadow BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS shadow_id INTEGER REFERENCES character_shadows(id) ON DELETE SET NULL
    `);

    console.log('✅ Shadow combat columns added to combat_combatants');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error adding shadow combat columns:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = addShadowCombatColumns;

if (require.main === module) {
  addShadowCombatColumns()
    .then(() => { console.log('Shadow combat columns migration completed'); process.exit(0); })
    .catch(err => { console.error('Migration failed:', err); process.exit(1); });
}
