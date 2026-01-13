const pool = require('../models/database').pool;

async function addCancelledStatus() {
  try {
    console.log('🔄 Adding "cancelled" status to battles table...');
    
    // Drop the old constraint
    await pool.query(`
      ALTER TABLE battles 
      DROP CONSTRAINT IF EXISTS battles_status_check;
    `);
    
    // Add new constraint with 'cancelled' included
    await pool.query(`
      ALTER TABLE battles 
      ADD CONSTRAINT battles_status_check 
      CHECK (status IN ('planning', 'goal_selection', 'resolution', 'completed', 'cancelled'));
    `);
    
    console.log('✅ Added "cancelled" status to battles table');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

module.exports = addCancelledStatus;

// Allow running directly as a script
if (require.main === module) {
  addCancelledStatus()
    .then(() => {
      console.log('🎉 Migration completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}
