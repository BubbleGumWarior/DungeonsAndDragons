const { pool } = require('../models/database');

async function addResistancesToMonsters() {
  try {
    await pool.query(`
      ALTER TABLE monsters
      ADD COLUMN IF NOT EXISTS resistances JSONB DEFAULT '{"resistances":[],"immunities":[],"vulnerabilities":[]}'::jsonb
    `);
    console.log('✅ add_resistances_to_monsters: resistances column added/verified');
  } catch (error) {
    console.warn('⚠️  add_resistances_to_monsters failed:', error.message);
    throw error;
  }
}

module.exports = addResistancesToMonsters;
