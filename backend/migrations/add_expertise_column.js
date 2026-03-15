const { pool } = require('../models/database');

async function addExpertiseColumn() {
  try {
    console.log('Adding expertise column to characters table...');

    await pool.query(`
      ALTER TABLE characters 
      ADD COLUMN IF NOT EXISTS expertise JSONB DEFAULT '[]'::jsonb
    `);

    console.log('✓ expertise column added successfully');
  } catch (error) {
    console.error('Error adding expertise column:', error);
    throw error;
  }
}

module.exports = addExpertiseColumn;
