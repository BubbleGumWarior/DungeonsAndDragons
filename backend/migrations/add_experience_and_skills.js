const { pool } = require('../models/database');

async function addExperiencePoints() {
  try {
    console.log('Adding experience_points column to characters table...');
    
    // Add experience_points column (default 0)
    await pool.query(`
      ALTER TABLE characters 
      ADD COLUMN IF NOT EXISTS experience_points INTEGER DEFAULT 0
    `);
    
    console.log('✓ experience_points column added successfully');
    
    // Also let's create a character_skills junction table if it doesn't exist
    console.log('Creating character_skills junction table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS character_skills (
        id SERIAL PRIMARY KEY,
        character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
        skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
        acquired_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(character_id, skill_id)
      )
    `);
    
    console.log('✓ character_skills table created successfully');
    
  } catch (error) {
    console.error('Error adding experience and skills:', error);
    throw error;
  }
}

module.exports = addExperiencePoints;
