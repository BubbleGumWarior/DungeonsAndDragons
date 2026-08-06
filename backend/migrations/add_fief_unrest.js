/**
 * Migration: add_fief_unrest
 * Adds unrest tracking to fiefs for the Tier 5 civic-stability mechanic.
 * Unrest (0-100) climbs when a fief's population outgrows its civic
 * infrastructure (guard chain, faith chain, governance buildings) and only
 * accrues at Tier 5+. High unrest saps production efficiency; at extreme
 * unrest a revolt can break out, costing both garrisoned reserve units
 * (dying to suppress it) and civilian population (rebels who die putting it
 * down).
 */
const { pool } = require('../models/database');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const hasCol = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'fiefs' AND column_name = 'unrest'
    `);
    if (hasCol.rows.length === 0) {
      await client.query(`
        ALTER TABLE fiefs ADD COLUMN unrest DOUBLE PRECISION NOT NULL DEFAULT 0
      `);
      console.log('✅ fiefs.unrest added');
    } else {
      console.log('  fiefs.unrest already exists');
    }

    await client.query('COMMIT');
    console.log('✅ add_fief_unrest migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ add_fief_unrest migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
};

module.exports = migrate;
if (require.main === module) migrate().then(() => process.exit(0)).catch(() => process.exit(1));
