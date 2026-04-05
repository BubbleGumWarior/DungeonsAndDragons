const { pool } = require('../models/database');

async function addResistancesToCharacters() {
  try {
    await pool.query(`
      ALTER TABLE characters
      ADD COLUMN IF NOT EXISTS resistances JSONB DEFAULT '{"resistances":[],"immunities":[],"vulnerabilities":[]}'::jsonb
    `);
    console.log('✅ add_resistances_to_characters: resistances column added/verified');
  } catch (error) {
    console.warn('⚠️  add_resistances_to_characters failed:', error.message);
    throw error;
  }
}

module.exports = addResistancesToCharacters;
