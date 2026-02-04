const { pool } = require('../models/database');

async function dropBattleGoalsTable() {
  try {
    console.log('🔄 Dropping battle_goals table and related structures...');
    
    // Drop the battle_goals table (this will also drop all related indexes and constraints)
    await pool.query('DROP TABLE IF EXISTS battle_goals CASCADE');
    console.log('✅ battle_goals table dropped successfully');
    
    // Drop has_selected_goal column from battle_participants if it exists
    const checkColumn = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'battle_participants' 
      AND column_name = 'has_selected_goal'
    `);
    
    if (checkColumn.rows.length > 0) {
      await pool.query('ALTER TABLE battle_participants DROP COLUMN IF EXISTS has_selected_goal');
      console.log('✅ has_selected_goal column dropped from battle_participants');
    }
    
    // Update battles table status constraint to remove goal_selection
    await pool.query(`
      ALTER TABLE battles DROP CONSTRAINT IF EXISTS battles_status_check
    `);
    
    await pool.query(`
      ALTER TABLE battles 
      ADD CONSTRAINT battles_status_check 
      CHECK (status IN ('planning', 'resolution', 'completed', 'cancelled'))
    `);
    console.log('✅ Updated battles status constraint (removed goal_selection)');
    
    console.log('✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

module.exports = dropBattleGoalsTable;

// Allow running directly as a script
if (require.main === module) {
  dropBattleGoalsTable()
    .then(() => {
      console.log('🎉 Migration completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}
