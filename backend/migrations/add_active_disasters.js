/**
 * Migration: add_active_disasters
 * Adds active_disasters JSONB column to fiefs.
 * Each element: { uid, disaster_id, name, applied_day, resolve_cost: {gold,wood,food,stone},
 *                 daily_damage: {gold,food,wood,stone}, daily_deaths: number }
 */
const { pool } = require('../models/database');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const hasCol = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'fiefs' AND column_name = 'active_disasters'
    `);
    if (hasCol.rows.length === 0) {
      await client.query(`
        ALTER TABLE fiefs ADD COLUMN active_disasters JSONB NOT NULL DEFAULT '[]'::jsonb
      `);
      console.log('✅ fiefs.active_disasters added');
    } else {
      console.log('  fiefs.active_disasters already exists');
    }

    await client.query('COMMIT');
    console.log('✅ add_active_disasters migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ add_active_disasters migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
};

module.exports = migrate;
if (require.main === module) migrate().then(() => process.exit(0)).catch(() => process.exit(1));
