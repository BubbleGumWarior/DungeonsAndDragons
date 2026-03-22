/**
 * Migration: add tier_upgrade_days_remaining to fiefs.
 * When a fief upgrade is started, this is set to N days.
 * advanceDays decrements it; when it hits 0 the tier actually increases.
 */
const { pool } = require('../models/database');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const hasUpgradeDays = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'fiefs' AND column_name = 'tier_upgrade_days_remaining'
    `);
    if (hasUpgradeDays.rows.length === 0) {
      await client.query(`ALTER TABLE fiefs ADD COLUMN tier_upgrade_days_remaining INT DEFAULT 0`);
      console.log('✅ fiefs.tier_upgrade_days_remaining added');
    } else {
      console.log('  fiefs.tier_upgrade_days_remaining already exists');
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

if (require.main === module) {
  migrate().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = migrate;
