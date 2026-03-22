/**
 * Migration: add worker_assignments JSONB column to fiefs.
 * Stores how the player allocates their workable population across resources.
 */
const { pool } = require('../models/database');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const hasCol = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'fiefs' AND column_name = 'worker_assignments'
    `);
    if (hasCol.rows.length === 0) {
      await client.query(`
        ALTER TABLE fiefs
          ADD COLUMN worker_assignments JSONB DEFAULT '{"gold":0,"food":0,"wood":0,"stone":0}'::jsonb
      `);
      console.log('✅ fiefs.worker_assignments added');
    } else {
      console.log('  fiefs.worker_assignments already exists');
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
