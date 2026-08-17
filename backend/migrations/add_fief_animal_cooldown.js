const { pool } = require('../models/database');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Postpartum cooldown: a female that just gave birth can't be bred again
    // (pen or natural) until the campaign day passes this value.
    await client.query(`
      ALTER TABLE fief_animals
        ADD COLUMN IF NOT EXISTS cooldown_until_day INTEGER
    `);

    await client.query('COMMIT');
    console.log('✅ add_fief_animal_cooldown complete');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ add_fief_animal_cooldown failed:', error.message);
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
