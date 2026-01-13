const { pool } = require('./models/database');

async function checkAllBattleTables() {
  try {
    console.log('='.repeat(80));
    console.log('CHECKING ALL BATTLE-RELATED TABLES');
    console.log('='.repeat(80));
    
    // Check battles table
    console.log('\n📋 BATTLES TABLE:');
    const battlesResult = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'battles' 
      ORDER BY ordinal_position
    `);
    console.table(battlesResult.rows);
    
    // Check battle_participants table
    console.log('\n👥 BATTLE_PARTICIPANTS TABLE:');
    const participantsResult = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'battle_participants' 
      ORDER BY ordinal_position
    `);
    console.table(participantsResult.rows);
    
    // Check battle_goals table
    console.log('\n🎯 BATTLE_GOALS TABLE:');
    const goalsResult = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'battle_goals' 
      ORDER BY ordinal_position
    `);
    console.table(goalsResult.rows);
    
    // Check battle_invitations table
    console.log('\n📧 BATTLE_INVITATIONS TABLE:');
    const invitationsResult = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'battle_invitations' 
      ORDER BY ordinal_position
    `);
    console.table(invitationsResult.rows);
    
    // Check armies table
    console.log('\n⚔️  ARMIES TABLE:');
    const armiesResult = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'armies' 
      ORDER BY ordinal_position
    `);
    console.table(armiesResult.rows);
    
    console.log('\n' + '='.repeat(80));
    console.log('VERIFICATION SUMMARY');
    console.log('='.repeat(80));
    
    // Verify critical columns
    const criticalChecks = {
      battles: ['total_rounds', 'status', 'current_round'],
      battle_participants: ['temp_army_troops', 'current_troops', 'team_name', 'faction_color', 'has_selected_goal'],
      battle_goals: ['team_name', 'participant_id', 'target_participant_id', 'goal_name', 'test_type'],
      battle_invitations: ['player_id', 'battle_id', 'team_name', 'faction_color', 'status'],
      armies: ['total_troops', 'starting_troops', 'category']
    };
    
    let allGood = true;
    
    for (const [table, columns] of Object.entries(criticalChecks)) {
      const tableResult = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = $1
      `, [table]);
      
      const existingColumns = tableResult.rows.map(r => r.column_name);
      const missingColumns = columns.filter(col => !existingColumns.includes(col));
      
      if (missingColumns.length > 0) {
        console.log(`\n❌ ${table.toUpperCase()}: MISSING COLUMNS: ${missingColumns.join(', ')}`);
        allGood = false;
      } else {
        console.log(`\n✅ ${table.toUpperCase()}: All critical columns present`);
      }
    }
    
    console.log('\n' + '='.repeat(80));
    if (allGood) {
      console.log('✅ ALL REQUIRED COLUMNS ARE PRESENT!');
    } else {
      console.log('❌ SOME REQUIRED COLUMNS ARE MISSING!');
    }
    console.log('='.repeat(80));
    
    process.exit(allGood ? 0 : 1);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkAllBattleTables();
