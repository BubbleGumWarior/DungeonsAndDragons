/**
 * Migration: add_tier3_upgrade
 * Adds tier 3 upgrade tracking to fiefs table
 */
const { pool } = require('../models/database');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Add tier 3 upgrade columns
    await client.query(`
      ALTER TABLE fiefs
      ADD COLUMN IF NOT EXISTS tier_upgrade_days_remaining_3 INTEGER DEFAULT 0
    `);
    console.log('✅ tier_upgrade_days_remaining_3 column added to fiefs table');

    await client.query('COMMIT');
    console.log('✅ add_tier3_upgrade migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ add_tier3_upgrade migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
};

module.exports = migrate;
