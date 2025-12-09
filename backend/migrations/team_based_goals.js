const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function migrate() {
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
    
    // Create a unique index to ensure only 1 goal per team per round
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_battle_goals_team_round 
      ON battle_goals(battle_id, round_number, team_name);
    `);
    console.log('✅ Created unique index for team-based goal selection');

    // Remove old participant-based index for goals (no longer needed)
    await client.query(`
      DROP INDEX IF EXISTS idx_battle_goals_participant;
    `);
    console.log('✅ Removed old participant-based index');

    await client.query('COMMIT');
    console.log('🎉 Migration completed successfully!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(console.error);
