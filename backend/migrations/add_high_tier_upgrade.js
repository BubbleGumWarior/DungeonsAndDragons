/**
 * Migration: add_high_tier_upgrade
 * Adds the generic upgrade timer used for fief tiers 6-10:
 *   - tier_upgrade_days_remaining_high: days left on the in-progress upgrade
 *   - tier_upgrade_target: the tier that upgrade will complete at (0 = none)
 * Only one upgrade can run at a time, so one pair of columns covers every tier
 * from 6 up (tiers 2-5 keep their original per-tier columns).
 */
const { pool } = require('../models/database');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`ALTER TABLE fiefs ADD COLUMN IF NOT EXISTS tier_upgrade_days_remaining_high INTEGER DEFAULT 0`);
    await client.query(`ALTER TABLE fiefs ADD COLUMN IF NOT EXISTS tier_upgrade_target INTEGER DEFAULT 0`);
    await client.query('COMMIT');
    console.log('✅ add_high_tier_upgrade migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ add_high_tier_upgrade migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
};

module.exports = migrate;
if (require.main === module) migrate().then(() => process.exit(0)).catch(() => process.exit(1));
