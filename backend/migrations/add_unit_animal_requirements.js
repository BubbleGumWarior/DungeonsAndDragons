const { pool } = require('../models/database');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Mounted / beast-bonded troops lock an animal when they are trained. assigned_unit_type is
    // the troop the animal is bound to; while it is set the animal cannot breed, be paired in a
    // breeding pen or be slaughtered, but it still eats and still needs farmers.
    await client.query(`
      ALTER TABLE fief_animals
        ADD COLUMN IF NOT EXISTS assigned_unit_type TEXT
    `);

    // Animal types a DM-authored troop needs (any one of them satisfies it); [] = none.
    await client.query(`
      ALTER TABLE kingdom_custom_units
        ADD COLUMN IF NOT EXISTS required_animal_types JSONB NOT NULL DEFAULT '[]'::jsonb
    `);

    await client.query('COMMIT');
    console.log('✅ add_unit_animal_requirements complete');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ add_unit_animal_requirements failed:', error.message);
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
