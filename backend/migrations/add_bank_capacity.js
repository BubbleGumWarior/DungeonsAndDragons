/*
 * Migration: give gold its own Bank storage pool (Tier 4+), separate from the general
 * Warehouse — mirrors the Granary/food split. Unlike food there's no free tier-based
 * base: gold only banks in a Bank you've built, so bank_capacity starts at 0 and any
 * fief without a Bank keeps gold flowing through the general Warehouse pool via the
 * overflow rule in Campaign.applyStorageCapacity.
 */
const { pool } = require('../models/database');

async function addBankCapacity() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE fiefs
      ADD COLUMN IF NOT EXISTS bank_capacity INTEGER NOT NULL DEFAULT 0
    `);

    await client.query('COMMIT');
    console.log('✅ add_bank_capacity: migration complete');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ add_bank_capacity migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = addBankCapacity;

if (require.main === module) {
  addBankCapacity()
    .then(() => { console.log('Migration completed'); process.exit(0); })
    .catch(err => { console.error('Migration failed:', err); process.exit(1); });
}
