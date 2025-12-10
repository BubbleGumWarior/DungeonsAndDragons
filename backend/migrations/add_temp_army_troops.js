const { pool } = require('../models/database');

async function addTempArmyTroops() {
  try {
    console.log('🔄 Adding temp_army_troops column to battle_participants table...');

    // Add temp_army_troops column
    await pool.query(`
      ALTER TABLE battle_participants
      ADD COLUMN IF NOT EXISTS temp_army_troops INTEGER DEFAULT 100;
    `);

    console.log('✅ Successfully added temp_army_troops column to battle_participants table');
  } catch (error) {
    console.error('❌ Error adding temp_army_troops column:', error);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  addTempArmyTroops()
    .then(() => {
      console.log('✅ Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

module.exports = addTempArmyTroops;
