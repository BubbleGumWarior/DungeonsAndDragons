const { pool } = require('../models/database');

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('ALTER TABLE armies ADD COLUMN IF NOT EXISTS is_garrisoned BOOLEAN DEFAULT true');
    // Armies without a fief linkage default to false (field armies)
    await client.query('UPDATE armies SET is_garrisoned = false WHERE source_fief_id IS NULL AND is_garrisoned IS NULL');
    await client.query('COMMIT');
    console.log('✅ add_army_garrison_column: done');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = run;
