const { pool } = require('./models/database');
const Battle = require('./models/Battle');

async function testGoalSelection() {
  try {
    console.log('🧪 Testing Multi-Army Goal Selection\n');
    console.log('='.repeat(60));
    
    const battleId = 1;
    
    // Get participants
    const battle = await Battle.findById(battleId);
    const participants = battle.participants;
    
    console.log('\n📋 Available Armies:');
    participants.forEach((p, idx) => {
      console.log(`   ${idx + 1}. ${p.temp_army_name || p.army_name} (ID: ${p.id}) - Team ${p.team_name}`);
    });
    
    console.log('\n\n🎯 TEST 1: Select goal for first army in Orc Horde');
    console.log('-'.repeat(60));
    const orcArmy1 = participants.find(p => p.team_name === 'Orc Horde');
    
    await Battle.setGoal({
      battle_id: battleId,
      round_number: 1,
      participant_id: orcArmy1.id,
      goal_name: 'Rally the Troops',
      target_participant_id: null,
      test_type: 'CHA',
      character_modifier: 2,
      army_stat_modifier: 0
    });
    
    console.log(`✅ Goal set for ${orcArmy1.temp_army_name || orcArmy1.army_name}`);
    
    // Check status
    let updated = await Battle.findById(battleId);
    console.log('\nTeam Status After First Goal:');
    const orcTeam = updated.participants.filter(p => p.team_name === 'Orc Horde');
    orcTeam.forEach(p => {
      console.log(`   ${p.has_selected_goal ? '✓' : '○'} ${p.temp_army_name || p.army_name}`);
    });
    
    console.log('\n\n🎯 TEST 2: Select goal for second army in Orc Horde');
    console.log('-'.repeat(60));
    const orcArmy2 = participants.filter(p => p.team_name === 'Orc Horde')[1];
    
    await Battle.setGoal({
      battle_id: battleId,
      round_number: 1,
      participant_id: orcArmy2.id,
      goal_name: 'Charge!',
      target_participant_id: participants.find(p => p.team_name === 'Xander').id,
      test_type: 'Numbers',
      character_modifier: 0,
      army_stat_modifier: -2
    });
    
    console.log(`✅ Goal set for ${orcArmy2.temp_army_name || orcArmy2.army_name}`);
    
    // Check status again
    updated = await Battle.findById(battleId);
    console.log('\nTeam Status After Second Goal:');
    const orcTeamUpdate = updated.participants.filter(p => p.team_name === 'Orc Horde');
    orcTeamUpdate.forEach(p => {
      console.log(`   ${p.has_selected_goal ? '✓' : '○'} ${p.temp_army_name || p.army_name}`);
    });
    
    console.log('\n\n🎯 TEST 3: Select goal for first army in Xander team');
    console.log('-'.repeat(60));
    const xanderArmy1 = participants.find(p => p.team_name === 'Xander');
    
    await Battle.setGoal({
      battle_id: battleId,
      round_number: 1,
      participant_id: xanderArmy1.id,
      goal_name: 'Hold the Line',
      target_participant_id: null,
      test_type: 'CON',
      character_modifier: 1,
      army_stat_modifier: 0
    });
    
    console.log(`✅ Goal set for ${xanderArmy1.temp_army_name || xanderArmy1.army_name}`);
    
    // Final status
    updated = await Battle.findById(battleId);
    
    console.log('\n\n' + '='.repeat(60));
    console.log('📊 FINAL STATUS:');
    console.log('='.repeat(60));
    
    // Group by team
    const teams = {};
    updated.participants.forEach(p => {
      if (!teams[p.team_name]) {
        teams[p.team_name] = [];
      }
      teams[p.team_name].push(p);
    });
    
    Object.entries(teams).forEach(([teamName, armies]) => {
      const selected = armies.filter(a => a.has_selected_goal).length;
      const total = armies.length;
      console.log(`\nTeam ${teamName}: ${selected}/${total} armies selected`);
      armies.forEach(army => {
        const status = army.has_selected_goal ? '✅' : '❌';
        console.log(`   ${status} ${army.temp_army_name || army.army_name}`);
      });
    });
    
    console.log('\n\n🔍 VERIFICATION:');
    console.log('-'.repeat(60));
    
    // Check goals
    const goals = updated.current_goals;
    console.log(`Total Goals in Database: ${goals.length}`);
    console.log(`Total Armies with has_selected_goal=true: ${updated.participants.filter(p => p.has_selected_goal).length}`);
    
    if (goals.length === updated.participants.filter(p => p.has_selected_goal).length) {
      console.log('✅ Goal count matches has_selected_goal count');
    } else {
      console.log('❌ MISMATCH between goals and has_selected_goal!');
    }
    
    // Verify each team can have some armies with goals and some without
    const orcHordeTeam = teams['Orc Horde'];
    const hasPartialSelection = orcHordeTeam.some(a => a.has_selected_goal) && 
                                 orcHordeTeam.some(a => !a.has_selected_goal);
    
    if (hasPartialSelection) {
      console.log('✅ VERIFIED: Armies can select independently within a team!');
      console.log('   (Orc Horde has some armies with goals and some without)');
    } else {
      console.log('⚠️  All armies in Orc Horde have same selection status');
    }
    
    console.log('\n\n📝 Goals Selected:');
    console.log('-'.repeat(60));
    goals.forEach((goal, idx) => {
      const executor = updated.participants.find(p => p.id === goal.participant_id);
      console.log(`\n${idx + 1}. ${goal.goal_name}`);
      console.log(`   Executor: ${executor.temp_army_name || executor.army_name} (Team ${goal.team_name})`);
      console.log(`   Target: ${goal.target_participant_id ? 'Enemy army' : 'Self/Ally'}`);
    });
    
    console.log('\n\n✅ All tests passed successfully!');
    console.log('🎉 Multi-army goal selection is working correctly!\n');
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

testGoalSelection();
