const { pool } = require('../models/database');

async function addTempLimbHealth() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE characters
      ADD COLUMN IF NOT EXISTS temp_limb_health JSONB DEFAULT NULL
    `);

    await client.query(`
      ALTER TABLE monster_instances
      ADD COLUMN IF NOT EXISTS temp_limb_health JSONB DEFAULT NULL
    `);

    console.log('✅ temp_limb_health column added to characters and monster_instances (or already exists)');

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = addTempLimbHealth;
