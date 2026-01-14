const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function migrateTeamBasedGoals() {
  const { pool } = require('../models/database');
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    console.log('🔄 Starting team-based goals migration...');

    // Add team_name column to battle_goals
    await client.query(`
      ALTER TABLE battle_goals 
      ADD COLUMN IF NOT EXISTS team_name VARCHAR(255);
    `);
    console.log('✅ Added team_name column to battle_goals');

    // Make participant_id nullable (goals belong to teams, not specific participants)
    await client.query(`
      ALTER TABLE battle_goals 
      ALTER COLUMN participant_id DROP NOT NULL;
    `);
    console.log('✅ Made participant_id nullable in battle_goals');

    // Add team_name column to battle_participants if not exists (for has_selected_goal tracking)
    // Actually, we'll track goal selection at the team level differently
    
    // Check if there are duplicate team goals that would prevent the unique index
    const duplicates = await client.query(`
      SELECT battle_id, round_number, team_name, COUNT(*) as count
      FROM battle_goals
      WHERE team_name IS NOT NULL
      GROUP BY battle_id, round_number, team_name
      HAVING COUNT(*) > 1
    `);
    
    if (duplicates.rows.length > 0) {
      console.log('⚠️  Found duplicate team goals - skipping team-based unique constraint');
      console.log('   (Will be replaced by participant-based constraint in next migration)');
    } else {
      // Create a unique index to ensure only 1 goal per team per round
      // NOTE: This will be replaced by idx_battle_goals_participant_round in enable_multi_army_goals migration
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_battle_goals_team_round 
        ON battle_goals(battle_id, round_number, team_name);
      `);
      console.log('✅ Created unique index for team-based goal selection');
    }

    // Remove old participant-based index for goals (no longer needed)
    await client.query(`
      DROP INDEX IF EXISTS idx_battle_goals_participant;
    `);
    console.log('✅ Removed old participant-based index');

    await client.query('COMMIT');
    console.log('✅ Migration completed successfully!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = migrateTeamBasedGoals;

// Allow running directly as a script
if (require.main === module) {
  migrateTeamBasedGoals()
    .then(() => {
      console.log('🎉 Migration completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}
