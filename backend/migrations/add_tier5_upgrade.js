/**
 * Migration: add_tier5_upgrade
 * Adds tier_upgrade_days_remaining_5 to fiefs, enabling the Tier 4 → Tier 5
 * fief upgrade (unlocks tier-5 buildings/research, a further legendary
 * character slot, and the civic-stability/unrest mechanic), mirroring the
 * tier_upgrade_days_remaining_4 column added for the Tier 3 → Tier 4 upgrade.
 */
const { pool } = require('../models/database');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const hasCol = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'fiefs' AND column_name = 'tier_upgrade_days_remaining_5'
    `);
    if (hasCol.rows.length === 0) {
      await client.query(`
        ALTER TABLE fiefs ADD COLUMN tier_upgrade_days_remaining_5 INTEGER DEFAULT 0
      `);
      console.log('✅ fiefs.tier_upgrade_days_remaining_5 added');
    } else {
      console.log('  fiefs.tier_upgrade_days_remaining_5 already exists');
    }

    await client.query('COMMIT');
    console.log('✅ add_tier5_upgrade migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ add_tier5_upgrade migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
};

module.exports = migrate;
if (require.main === module) migrate().then(() => process.exit(0)).catch(() => process.exit(1));
