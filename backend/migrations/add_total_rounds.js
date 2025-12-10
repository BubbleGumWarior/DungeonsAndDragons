const { pool } = require('../models/database');

async function addTotalRounds() {
  try {
    console.log('🔄 Adding total_rounds column to battles table...');

    // Add total_rounds column
    await pool.query(`
      ALTER TABLE battles
      ADD COLUMN IF NOT EXISTS total_rounds INTEGER DEFAULT 5;
    `);

    console.log('✅ Successfully added total_rounds column to battles table');
  } catch (error) {
    console.error('❌ Error adding total_rounds column:', error);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  addTotalRounds()
    .then(() => {
      console.log('✅ Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

module.exports = addTotalRounds;
