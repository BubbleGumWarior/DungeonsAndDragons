const { pool } = require('./models/database');

async function fixConstraint() {
  try {
    console.log('🔍 Checking battle_goals constraints...\n');
    
    const constraints = await pool.query(`
      SELECT constraint_name, constraint_type 
      FROM information_schema.table_constraints 
      WHERE table_name = 'battle_goals' 
      AND constraint_type IN ('UNIQUE', 'PRIMARY KEY')
    `);
    
    console.log('Current constraints:');
    console.table(constraints.rows);
    
    console.log('\n🔧 Dropping old team-based unique constraint...');
    await pool.query('DROP INDEX IF EXISTS idx_battle_goals_team_round');
    console.log('✅ Old constraint dropped');
    
    console.log('\n🔧 Creating new participant-based unique constraint...');
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_battle_goals_participant_round 
      ON battle_goals (battle_id, round_number, participant_id)
    `);
    console.log('✅ New constraint created');
    
    console.log('\n📋 Updated constraints:');
    const newConstraints = await pool.query(`
      SELECT indexname as constraint_name, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'battle_goals' 
      AND indexdef LIKE '%UNIQUE%'
    `);
    console.table(newConstraints.rows);
    
    console.log('\n✅ Database schema updated successfully!');
    console.log('   Each army can now select its own goal per round.\n');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

fixConstraint();
