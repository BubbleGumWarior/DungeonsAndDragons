/**
 * Migration: add_tier4_upgrade
 * Adds tier_upgrade_days_remaining_4 to fiefs, enabling the Tier 3 → Tier 4
 * fief upgrade (unlocks tier-4 buildings/research and a further legendary
 * character slot per fief, mirroring the tier_upgrade_days_remaining_3 column
 * added for the Tier 2 → Tier 3 upgrade).
 */
const { pool } = require('../models/database');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const hasCol = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'fiefs' AND column_name = 'tier_upgrade_days_remaining_4'
    `);
    if (hasCol.rows.length === 0) {
      await client.query(`
        ALTER TABLE fiefs ADD COLUMN tier_upgrade_days_remaining_4 INTEGER DEFAULT 0
      `);
      console.log('✅ fiefs.tier_upgrade_days_remaining_4 added');
    } else {
      console.log('  fiefs.tier_upgrade_days_remaining_4 already exists');
    }

    await client.query('COMMIT');
    console.log('✅ add_tier4_upgrade migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ add_tier4_upgrade migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
};

module.exports = migrate;
if (require.main === module) migrate().then(() => process.exit(0)).catch(() => process.exit(1));
