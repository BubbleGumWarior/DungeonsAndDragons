const { pool } = require('../models/database');

async function addCharacterNotes() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS character_notes (
        id          SERIAL PRIMARY KEY,
        character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
        title        VARCHAR(200) NOT NULL DEFAULT 'Note',
        content      TEXT NOT NULL DEFAULT '',
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_character_notes_character_id
        ON character_notes(character_id)
    `);
    await client.query('COMMIT');
    console.log('✅ add_character_notes: character_notes table created');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ add_character_notes migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = addCharacterNotes;

if (require.main === module) {
  addCharacterNotes()
    .then(() => { console.log('Migration completed'); process.exit(0); })
    .catch(err => { console.error('Migration failed:', err); process.exit(1); });
}
