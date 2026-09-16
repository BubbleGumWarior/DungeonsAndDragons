const { pool } = require('../models/database');

async function addCharacterAgeOverride() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Every ordinary character's age is derived purely from race + campaign day (see
    // getCharacterAge on the frontend) — this column stays NULL for all of them. It's only
    // set when a character is created by assigning a family-tree member to a player, so a
    // young child doesn't jump to a generic adult age the moment they become played. Stored
    // as "age as of day 1", the same convention family_members.base_age already uses, so the
    // same +floor((day-1)/365) formula keeps aging it forward correctly from then on.
    await client.query(`
      ALTER TABLE characters
      ADD COLUMN IF NOT EXISTS age_override INTEGER DEFAULT NULL
    `);
    console.log('Added age_override column to characters table');

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

module.exports = addCharacterAgeOverride;
