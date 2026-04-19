const { pool } = require('../models/database');

async function addCharacterGold() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE characters
      ADD COLUMN IF NOT EXISTS gold INTEGER NOT NULL DEFAULT 0
    `);
    console.log('Added gold column to characters table (stored as total copper pieces)');

    await client.query('COMMIT');
    console.log('Migration complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = addCharacterGold;
