const { pool } = require('../models/database');

const addImageDataToCharacters = async () => {
  try {
    console.log('Adding image_data and image_mime_type columns to characters table...');

    // Add image_data column (BYTEA for binary data)
    await pool.query(`
      ALTER TABLE characters
      ADD COLUMN IF NOT EXISTS image_data BYTEA,
      ADD COLUMN IF NOT EXISTS image_mime_type VARCHAR(50)
    `);

    console.log('✓ Successfully added image storage columns to characters table');
  } catch (error) {
    console.error('Error adding image data columns:', error);
    throw error;
  }
};

module.exports = addImageDataToCharacters;
