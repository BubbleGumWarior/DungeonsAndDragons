const { pool } = require('./models/database');

async function checkBattleParticipantsTable() {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'battle_participants' 
      ORDER BY ordinal_position
    `);
    
    console.log('Battle_participants table columns:');
    console.table(result.rows);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkBattleParticipantsTable();
