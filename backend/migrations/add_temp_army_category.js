const { pool } = require('../models/database');

async function addTempArmyCategory() {
  try {
    console.log('🔄 Adding temp_army_category column to battle_participants table...');
    
    // Add temp_army_category column
    await pool.query(`
      ALTER TABLE battle_participants 
      ADD COLUMN IF NOT EXISTS temp_army_category VARCHAR(50) DEFAULT 'Swordsmen';
    `);

    console.log('✅ Successfully added temp_army_category column to battle_participants table');
    console.log('✅ Migration complete!');
    
  } catch (error) {
    console.error('❌ Error adding temp_army_category column:', error);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  addTempArmyCategory()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = addTempArmyCategory;
