const { pool } = require('../models/database');

async function addConcealedClass() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      ALTER TABLE characters
      ADD COLUMN IF NOT EXISTS concealed_class VARCHAR(100) DEFAULT NULL;
    `);
    await client.query('COMMIT');
    console.log('Migration add_concealed_class: success');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Migration add_concealed_class failed:', e);
    throw e;
  } finally {
    client.release();
  }
}

module.exports = addConcealedClass;

if (require.main === module) {
  addConcealedClass().then(() => process.exit(0)).catch(() => process.exit(1));
}
