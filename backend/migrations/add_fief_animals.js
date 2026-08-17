const { pool } = require('../models/database');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS fief_animals (
        id SERIAL PRIMARY KEY,
        fief_id INTEGER NOT NULL REFERENCES fiefs(id) ON DELETE CASCADE,
        animal_type VARCHAR(30) NOT NULL,
        sex VARCHAR(10) NOT NULL,
        quality INTEGER NOT NULL DEFAULT 20,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_fief_animals_fief
      ON fief_animals (fief_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_fief_animals_type
      ON fief_animals (fief_id, animal_type)
    `);

    await client.query('COMMIT');
    console.log('✅ add_fief_animals complete');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ add_fief_animals failed:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = migrate;
if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
