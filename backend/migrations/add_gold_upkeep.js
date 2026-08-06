/**
 * Migration: add_gold_upkeep
 * Adds consecutive_gold_shortage_days to fiefs — tracks how many days in a row
 * a Tier 4+ fief has failed to cover its gold upkeep (population + garrisoned
 * units), mirroring consecutive_starvation_days for food. A sustained gold
 * shortage causes population to emigrate, the same way a sustained food
 * shortage causes starvation deaths.
 */
const { pool } = require('../models/database');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const hasCol = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'fiefs' AND column_name = 'consecutive_gold_shortage_days'
    `);
    if (hasCol.rows.length === 0) {
      await client.query(`
        ALTER TABLE fiefs ADD COLUMN consecutive_gold_shortage_days INTEGER NOT NULL DEFAULT 0
      `);
      console.log('✅ fiefs.consecutive_gold_shortage_days added');
    } else {
      console.log('  fiefs.consecutive_gold_shortage_days already exists');
    }

    await client.query('COMMIT');
    console.log('✅ add_gold_upkeep migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ add_gold_upkeep migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
};

module.exports = migrate;
if (require.main === module) migrate().then(() => process.exit(0)).catch(() => process.exit(1));
