const { pool } = require('../models/database');

async function addMountedCombat() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE combat_combatants
        ADD COLUMN IF NOT EXISTS is_mounted      BOOLEAN  DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS mount_id        INTEGER  REFERENCES campaign_mounts(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS mount_current_hp INTEGER DEFAULT NULL
    `);
    console.log('Added mounted combat columns to combat_combatants');

    await client.query('COMMIT');
    console.log('Migration add_mounted_combat completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = addMountedCombat;
