const { pool } = require('../models/database');

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      ALTER TABLE fiefs
      ADD COLUMN IF NOT EXISTS faith FLOAT DEFAULT 0;
    `);
    await client.query(`UPDATE fiefs SET faith = 0 WHERE faith IS NULL`);
    await client.query('COMMIT');
    console.log('Migration add_faith_column: success');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Migration add_faith_column failed:', e);
    throw e;
  } finally {
    client.release();
  }
}

module.exports = run;

if (require.main === module) {
  run().then(() => process.exit(0)).catch(() => process.exit(1));
}
