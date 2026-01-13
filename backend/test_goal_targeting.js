const { pool } = require('./models/database');

async function testGoalTargeting() {
  try {
    console.log('='.repeat(80));
    console.log('TESTING GOAL TARGETING INTEGRITY');
    console.log('='.repeat(80));
    
    // Step 1: Check if there are any battles with goals
    const battlesWithGoals = await pool.query(`
      SELECT DISTINCT b.id, b.battle_name, b.current_round
      FROM battles b
      JOIN battle_goals bg ON b.id = bg.battle_id
      WHERE b.status IN ('goal_selection', 'resolution', 'completed')
      LIMIT 5
    `);
    
    if (battlesWithGoals.rows.length === 0) {
      console.log('\n⚠️  No battles with goals found. Create a battle and select some goals first.');
      process.exit(0);
    }
    
    console.log(`\n✅ Found ${battlesWithGoals.rows.length} battles with goals\n`);
    
    for (const battle of battlesWithGoals.rows) {
      console.log('='.repeat(80));
      console.log(`Battle: ${battle.battle_name} (ID: ${battle.id}), Round: ${battle.current_round}`);
      console.log('='.repeat(80));
      
      // Get all participants
      const participants = await pool.query(`
        SELECT id, team_name, 
               COALESCE(temp_army_name, 'Army #' || id) as army_display_name,
               army_id
        FROM battle_participants
        WHERE battle_id = $1
        ORDER BY team_name, id
      `, [battle.id]);
      
      console.log('\nParticipants:');
      participants.rows.forEach(p => {
        console.log(`  [ID: ${p.id}] Team "${p.team_name}" - ${p.army_display_name}`);
      });
      
      // Get goals with full detail
      const goals = await pool.query(`
        SELECT bg.*,
               bp_executor.team_name as executor_team_name,
               COALESCE(bp_executor.temp_army_name, 'Army #' || bp_executor.id) as executor_army_name,
               bp_target.team_name as target_team_name,
               COALESCE(bp_target.temp_army_name, 'Army #' || bp_target.id) as target_army_name,
               bp_target.id as target_id_verified
        FROM battle_goals bg
        LEFT JOIN battle_participants bp_executor ON bg.participant_id = bp_executor.id
        LEFT JOIN battle_participants bp_target ON bg.target_participant_id = bp_target.id
        WHERE bg.battle_id = $1 AND bg.round_number = $2
        ORDER BY bg.team_name
      `, [battle.id, battle.current_round]);
      
      console.log(`\nGoals for Round ${battle.current_round}:`);
      
      if (goals.rows.length === 0) {
        console.log('  (No goals set for this round)');
      } else {
        goals.rows.forEach((goal, index) => {
          console.log(`\n  Goal #${index + 1}:`);
          console.log(`    Team: ${goal.team_name}`);
          console.log(`    Goal Name: ${goal.goal_name}`);
          console.log(`    Executor Participant ID: ${goal.participant_id}`);
          console.log(`    Executor Army: ${goal.executor_army_name || 'N/A'}`);
          
          if (goal.target_participant_id) {
            console.log(`    Target Participant ID: ${goal.target_participant_id}`);
            console.log(`    Target ID Verified: ${goal.target_id_verified}`);
            console.log(`    Target Team: ${goal.target_team_name || 'ERROR: Team not found!'}`);
            console.log(`    Target Army: ${goal.target_army_name || 'ERROR: Army not found!'}`);
            
            // Verify the target actually exists
            if (!goal.target_id_verified) {
              console.log(`    ⚠️  WARNING: Target participant ${goal.target_participant_id} not found!`);
            } else if (goal.target_participant_id !== goal.target_id_verified) {
              console.log(`    ❌ ERROR: Target ID mismatch! Stored: ${goal.target_participant_id}, Found: ${goal.target_id_verified}`);
            } else {
              console.log(`    ✅ Target correctly points to participant ${goal.target_id_verified}`);
            }
          } else {
            console.log(`    Target: None (non-targeted goal)`);
          }
        });
      }
      console.log('');
    }
    
    console.log('='.repeat(80));
    console.log('TARGET VERIFICATION COMPLETE');
    console.log('='.repeat(80));
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testGoalTargeting();
