const { pool } = require('../models/database');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // One row per fief+animal-type the player has opted into auto-slaughter for.
    // adult_limit is the desired adult headcount to keep — whenever a long rest's
    // animal tick pushes the adult count for that type above it (most commonly a
    // juvenile maturing into an adult), the lowest-quality adult(s) are slaughtered
    // automatically and the meat is credited to the fief's granary. No row for a
    // given fief+type means auto-slaughter is off for it.
    await client.query(`
      CREATE TABLE IF NOT EXISTS fief_animal_slaughter_limits (
        fief_id INTEGER NOT NULL REFERENCES fiefs(id) ON DELETE CASCADE,
        animal_type VARCHAR(30) NOT NULL,
        adult_limit INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (fief_id, animal_type)
      )
    `);

    await client.query('COMMIT');
    console.log('✅ add_fief_animal_auto_slaughter complete');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ add_fief_animal_auto_slaughter failed:', error.message);
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
