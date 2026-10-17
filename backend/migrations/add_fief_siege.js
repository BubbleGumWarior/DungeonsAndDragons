/**
 * Migration: add_fief_siege
 * Adds an is_under_siege flag to fiefs. The DM toggles it from the Kingdoms
 * tab; while set, the daily tick raises unrest at 10x the normal rate, halves
 * all production (after every other bonus) and stalls population growth.
 */
const { pool } = require('../models/database');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const hasCol = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'fiefs' AND column_name = 'is_under_siege'
    `);
    if (hasCol.rows.length === 0) {
      await client.query(`
        ALTER TABLE fiefs ADD COLUMN is_under_siege BOOLEAN NOT NULL DEFAULT FALSE
      `);
      console.log('✅ fiefs.is_under_siege added');
    } else {
      console.log('  fiefs.is_under_siege already exists');
    }

    await client.query('COMMIT');
    console.log('✅ add_fief_siege migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ add_fief_siege migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
};

module.exports = migrate;
if (require.main === module) migrate().then(() => process.exit(0)).catch(() => process.exit(1));
