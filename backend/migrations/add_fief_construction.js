/**
 * Migration: add construction_days_remaining to fiefs table.
 * Existing fiefs default to 0 (already established).
 * New fiefs will be created with construction_days_remaining = 3.
 */
const { pool } = require('../models/database');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const hasCol = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'fiefs' AND column_name = 'construction_days_remaining'
    `);
    if (hasCol.rows.length === 0) {
      await client.query(`ALTER TABLE fiefs ADD COLUMN construction_days_remaining INT DEFAULT 0`);
      console.log('✅ fiefs.construction_days_remaining added');
    } else {
      console.log('  fiefs.construction_days_remaining already exists');
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
