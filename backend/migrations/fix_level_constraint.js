const { pool } = require('../models/database');

async function removeLeveCheckConstraint() {
  try {
    console.log('Removing level check constraint...');
    
    // Drop the constraint that prevents level 0
    await pool.query(`
      ALTER TABLE characters 
      DROP CONSTRAINT IF EXISTS characters_level_check
    `);
    
    console.log('✓ Level check constraint removed');
    
    // Add a new constraint that allows 0-20
    await pool.query(`
      ALTER TABLE characters 
      ADD CONSTRAINT characters_level_check CHECK (level >= 0 AND level <= 20)
    `);
    
    console.log('✓ New level check constraint added (0-20)');
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

removeLeveCheckConstraint();
