/**
 * Migration: change fief stats default to 1 (was 5).
 * Also resets all existing fiefs stats to 1 since no buildings have been built yet.
 */
const { pool } = require('../models/database');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Update the column default
    await client.query(`
      ALTER TABLE fiefs
        ALTER COLUMN stats SET DEFAULT '{"economy":1,"military":1,"stability":1}'::jsonb
    `);

    // Reset all existing fiefs to starting stats of 1
    await client.query(`
      UPDATE fiefs SET stats = '{"economy":1,"military":1,"stability":1}'::jsonb
    `);

    await client.query('COMMIT');
    console.log('✅ fief stats default changed to 1, existing fiefs reset');
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
