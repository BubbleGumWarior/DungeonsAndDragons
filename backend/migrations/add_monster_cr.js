const { pool } = require('../models/database');

const addMonsterCR = async () => {
  try {
    await pool.query(`
      ALTER TABLE monsters
      ADD COLUMN IF NOT EXISTS cr NUMERIC(5, 3) DEFAULT 0
    `);
    console.log('✓ add_monster_cr: cr column added to monsters table');
  } catch (error) {
    console.warn('add_monster_cr:', error.message);
  }
};

module.exports = addMonsterCR;
