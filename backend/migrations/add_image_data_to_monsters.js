const { pool } = require('../models/database');

const addImageDataToMonsters = async () => {
  try {
    console.log('Adding image_data and image_mime_type columns to monsters table...');

    await pool.query(`
      ALTER TABLE monsters
      ADD COLUMN IF NOT EXISTS image_data BYTEA,
      ADD COLUMN IF NOT EXISTS image_mime_type VARCHAR(100)
    `);

    console.log('✓ Successfully added image storage columns to monsters table');
  } catch (error) {
    console.error('Error adding image data columns:', error);
    throw error;
  }
};

module.exports = addImageDataToMonsters;
