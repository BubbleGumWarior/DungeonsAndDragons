const { pool } = require('../models/database');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Age/pregnancy tracking on individual animals.
    // - born_on_day: the campaign day this animal was born. Purchased/DM-added
    //   animals are stamped as already a year old (born_on_day = current_day - 365)
    //   so they count as adults immediately; bred offspring get born_on_day = the
    //   day they're actually born and age up naturally.
    // - pregnant_due_day / pregnancy_avg_quality / pregnant_by_animal_id: set on a
    //   female when a breeding roll succeeds. Quality is snapshotted at conception
    //   so a sire being sold/slaughtered mid-pregnancy doesn't change the outcome.
    await client.query(`
      ALTER TABLE fief_animals
        ADD COLUMN IF NOT EXISTS born_on_day INTEGER,
        ADD COLUMN IF NOT EXISTS pregnant_due_day INTEGER,
        ADD COLUMN IF NOT EXISTS pregnancy_avg_quality NUMERIC,
        ADD COLUMN IF NOT EXISTS pregnant_by_animal_id INTEGER REFERENCES fief_animals(id) ON DELETE SET NULL
    `);

    // Selective/"gene" breeding pen pairs — a deliberately chosen male+female
    // moved into a Breeding Pen together. Natural breeding (unpaired adults)
    // does not use this table; it picks a random eligible pair each long rest.
    await client.query(`
      CREATE TABLE IF NOT EXISTS fief_breeding_pairs (
        id SERIAL PRIMARY KEY,
        fief_id INTEGER NOT NULL REFERENCES fiefs(id) ON DELETE CASCADE,
        male_animal_id INTEGER NOT NULL UNIQUE REFERENCES fief_animals(id) ON DELETE CASCADE,
        female_animal_id INTEGER NOT NULL UNIQUE REFERENCES fief_animals(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_fief_breeding_pairs_fief
      ON fief_breeding_pairs (fief_id)
    `);

    await client.query('COMMIT');
    console.log('✅ add_fief_animal_breeding complete');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ add_fief_animal_breeding failed:', error.message);
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
