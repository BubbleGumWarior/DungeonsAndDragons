const { pool } = require('../models/database');

async function addProficienciesToCharacters() {
  try {
    await pool.query(`
      ALTER TABLE characters
      ADD COLUMN IF NOT EXISTS proficiencies JSONB DEFAULT '{"weapons":[],"armor":[],"tools":[],"languages":[]}'::jsonb
    `);
    console.log('✅ add_proficiencies_to_characters: proficiencies column added/verified');
  } catch (error) {
    console.warn('⚠️  add_proficiencies_to_characters failed:', error.message);
    throw error;
  }
}

module.exports = addProficienciesToCharacters;


module.exports = addProficienciesToCharacters;
