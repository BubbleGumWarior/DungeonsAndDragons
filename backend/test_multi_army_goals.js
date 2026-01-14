const { pool } = require('./models/database');

async function testMultiArmyGoals() {
  try {
    console.log('🧪 Testing Multi-Army Goal Selection System\n');
    console.log('='.repeat(60));

    // 1. Check for existing battles
    console.log('\n📊 Checking for active battles...');
    const battleResult = await pool.query(
      `SELECT b.id, b.battle_name, b.status, b.current_round, b.total_rounds
       FROM battles b
       WHERE b.status IN ('planning', 'goal_selection', 'active')
       ORDER BY b.created_at DESC
       LIMIT 1`
    );

    if (battleResult.rows.length === 0) {
      console.log('❌ No active battles found. Create a battle first.');
      process.exit(0);
    }

    const battle = battleResult.rows[0];
    console.log(`✅ Found battle: "${battle.battle_name}" (ID: ${battle.id})`);
    console.log(`   Status: ${battle.status}, Round: ${battle.current_round}/${battle.total_rounds}`);

    // 2. Check battle participants
    console.log('\n👥 Checking battle participants...');
    const participantsResult = await pool.query(
      `SELECT bp.id, bp.team_name, bp.has_selected_goal, bp.faction_color,
              COALESCE(bp.temp_army_name, a.name, 'Army #' || bp.id) as army_name,
              COALESCE(bp.temp_army_category, a.category, 'Swordsmen') as army_category,
              COALESCE(bp.current_troops, a.total_troops, 0) as troops
       FROM battle_participants bp
       LEFT JOIN armies a ON bp.army_id = a.id
       WHERE bp.battle_id = $1
       ORDER BY bp.team_name, bp.id`,
      [battle.id]
    );

    if (participantsResult.rows.length === 0) {
      console.log('❌ No participants in battle. Add armies first.');
      process.exit(0);
    }

    console.log(`✅ Found ${participantsResult.rows.length} participants:\n`);
    
    // Group by team
    const teams = {};
    participantsResult.rows.forEach(p => {
      if (!teams[p.team_name]) {
        teams[p.team_name] = {
          color: p.faction_color || '#808080',
          armies: []
        };
      }
      teams[p.team_name].armies.push(p);
    });

    Object.entries(teams).forEach(([teamName, teamData]) => {
      const selected = teamData.armies.filter(a => a.has_selected_goal).length;
      const total = teamData.armies.length;
      console.log(`   Team ${teamName} (${teamData.color}):`);
      console.log(`   └─ ${selected}/${total} armies have selected goals`);
      teamData.armies.forEach(army => {
        const status = army.has_selected_goal ? '✓' : '○';
        console.log(`      ${status} ${army.army_name} (${army.army_category}, ${army.troops} troops)`);
      });
      console.log('');
    });

    // 3. Check existing goals
    console.log('\n🎯 Checking existing goals for current round...');
    const goalsResult = await pool.query(
      `SELECT bg.id, bg.participant_id, bg.team_name, bg.goal_name, 
              bg.target_participant_id, bg.locked_in,
              COALESCE(bp.temp_army_name, a.name, 'Army #' || bp.id) as executor_name,
              COALESCE(bp_target.temp_army_name, a_target.name, 'Army #' || bp_target.id) as target_name
       FROM battle_goals bg
       LEFT JOIN battle_participants bp ON bg.participant_id = bp.id
       LEFT JOIN armies a ON bp.army_id = a.id
       LEFT JOIN battle_participants bp_target ON bg.target_participant_id = bp_target.id
       LEFT JOIN armies a_target ON bp_target.army_id = a_target.id
       WHERE bg.battle_id = $1 AND bg.round_number = $2
       ORDER BY bg.team_name, bg.id`,
      [battle.id, battle.current_round]
    );

    if (goalsResult.rows.length === 0) {
      console.log('   No goals selected yet for current round.');
    } else {
      console.log(`   Found ${goalsResult.rows.length} goals:\n`);
      goalsResult.rows.forEach((goal, idx) => {
        console.log(`   Goal #${idx + 1}:`);
        console.log(`   ├─ Executor: ${goal.executor_name} (Team ${goal.team_name})`);
        console.log(`   ├─ Goal: ${goal.goal_name}`);
        console.log(`   ├─ Target: ${goal.target_name || 'None (friendly)'}`);
        console.log(`   └─ Status: ${goal.locked_in ? 'Locked' : 'Can be changed'}\n`);
      });
    }

    // 4. Test the new logic - verify unique participant goals
    console.log('\n🔍 Verifying goal selection logic...');
    const duplicateCheck = await pool.query(
      `SELECT participant_id, COUNT(*) as goal_count
       FROM battle_goals
       WHERE battle_id = $1 AND round_number = $2
       GROUP BY participant_id
       HAVING COUNT(*) > 1`,
      [battle.id, battle.current_round]
    );

    if (duplicateCheck.rows.length > 0) {
      console.log('❌ ERROR: Some armies have multiple goals!');
      console.table(duplicateCheck.rows);
    } else {
      console.log('✅ Each army has at most one goal (correct behavior)');
    }

    // 5. Summary
    console.log('\n' + '='.repeat(60));
    console.log('📝 SUMMARY:');
    console.log('='.repeat(60));
    
    const totalArmies = participantsResult.rows.length;
    const selectedArmies = participantsResult.rows.filter(p => p.has_selected_goal).length;
    const totalGoals = goalsResult.rows.length;
    
    console.log(`Total Armies: ${totalArmies}`);
    console.log(`Armies with Selected Goals: ${selectedArmies}`);
    console.log(`Goals in Database: ${totalGoals}`);
    console.log(`\nStatus: ${selectedArmies === totalGoals ? '✅ MATCHING' : '❌ MISMATCH'}`);
    
    if (selectedArmies === totalArmies) {
      console.log('\n🎉 All armies have selected their goals!');
    } else {
      console.log(`\n⏳ ${totalArmies - selectedArmies} armies still need to select goals.`);
    }

    // 6. Check if has_selected_goal is per-army (not per-team)
    console.log('\n🧪 Testing per-army selection (not per-team)...');
    const teamCheck = Object.entries(teams).map(([teamName, teamData]) => {
      const allSelected = teamData.armies.every(a => a.has_selected_goal);
      const noneSelected = teamData.armies.every(a => !a.has_selected_goal);
      const someSelected = !allSelected && !noneSelected;
      
      return {
        team: teamName,
        allSelected,
        noneSelected,
        someSelected,
        status: someSelected ? '✅ Independent' : (noneSelected ? 'None yet' : 'All selected')
      };
    });

    console.table(teamCheck);
    
    const hasIndependent = teamCheck.some(t => t.someSelected);
    if (hasIndependent) {
      console.log('✅ VERIFIED: Armies can select independently (some teams have partial selection)');
    } else {
      console.log('⚠️  Cannot verify independence - all teams are either fully selected or not selected');
      console.log('   Try selecting goals for some (but not all) armies in a team to test.');
    }

    console.log('\n✅ Test completed successfully!\n');

  } catch (error) {
    console.error('❌ Error during testing:', error);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

testMultiArmyGoals();
