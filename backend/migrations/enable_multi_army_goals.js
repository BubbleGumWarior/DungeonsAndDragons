/**
 * Migration: Update battle_goals constraint for multi-army goal selection
 * 
 * Purpose: Allow each army in a faction to select its own goal, rather than
 *          limiting each team/faction to one goal per round.
 * 
 * Changes:
 * - Remove: idx_battle_goals_team_round (battle_id, round_number, team_name)
 * - Add: idx_battle_goals_participant_round (battle_id, round_number, participant_id)
 * 
 * Impact: Each army can now independently select a goal, maximizing battlefield
 *         effectiveness for factions with multiple armies.
 */

const { pool } = require('../models/database');

async function migrate() {
  try {
    console.log('🔄 Starting migration: multi-army goal selection support\n');
    
    // Check if new constraint already exists
    const checkNew = await pool.query(`
      SELECT 1 FROM pg_indexes 
      WHERE indexname = 'idx_battle_goals_participant_round'
    `);
    
    if (checkNew.rows.length > 0) {
      console.log('✅ Migration already applied (idx_battle_goals_participant_round exists)');
      return;
    }
    
    // Drop old team-based unique constraint (if exists)
    console.log('Dropping old constraint: idx_battle_goals_team_round (if exists)');
    await pool.query('DROP INDEX IF EXISTS idx_battle_goals_team_round');
    console.log('✅ Old constraint removed\n');
    
    // Create new participant-based unique constraint
    console.log('Creating new constraint: idx_battle_goals_participant_round');
    await pool.query(`
      CREATE UNIQUE INDEX idx_battle_goals_participant_round 
      ON battle_goals (battle_id, round_number, participant_id)
    `);
    console.log('✅ New constraint created\n');
    
    console.log('✅ Migration completed successfully!');
    console.log('   Each army can now select its own goal per round.\n');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  migrate()
    .then(() => {
      pool.end();
      process.exit(0);
    })
    .catch(err => {
      console.error(err);
      pool.end();
      process.exit(1);
    });
}

module.exports = migrate;
