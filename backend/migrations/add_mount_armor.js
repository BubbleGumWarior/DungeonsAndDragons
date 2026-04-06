const { pool } = require('../models/database');

async function addMountArmor() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE campaign_mounts
        ADD COLUMN IF NOT EXISTS armor_head       TEXT DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS armor_body       TEXT DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS armor_front_legs TEXT DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS armor_rear_legs  TEXT DEFAULT NULL
    `);
    console.log('Added mount armor columns to campaign_mounts');

    await client.query('COMMIT');
    console.log('Migration add_mount_armor completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = addMountArmor;
