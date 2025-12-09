const { pool } = require('../models/database');

async function addTeamNameToBattleGoals() {
  try {
    console.log('Adding team_name column to battle_goals table...');
    
    // Check if column exists
    const checkColumn = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'battle_goals' 
      AND column_name = 'team_name'
    `);
    
    if (checkColumn.rows.length === 0) {
      // Add team_name column
      await pool.query(`
        ALTER TABLE battle_goals 
        ADD COLUMN team_name VARCHAR(100)
      `);
      console.log('✅ team_name column added to battle_goals');
    } else {
      console.log('✅ team_name column already exists in battle_goals');
    }
    
    // Check if team_name exists in battle_participants
    const checkParticipantColumn = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'battle_participants' 
      AND column_name = 'team_name'
    `);
    
    if (checkParticipantColumn.rows.length === 0) {
      // Add team_name column to battle_participants
      await pool.query(`
        ALTER TABLE battle_participants 
        ADD COLUMN team_name VARCHAR(100)
      `);
      console.log('✅ team_name column added to battle_participants');
    } else {
      console.log('✅ team_name column already exists in battle_participants');
    }
    
    console.log('Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

addTeamNameToBattleGoals();
