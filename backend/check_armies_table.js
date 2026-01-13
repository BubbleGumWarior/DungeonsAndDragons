const { pool } = require('./models/database');

async function checkArmiesTable() {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'armies' 
      ORDER BY ordinal_position
    `);
    
    console.log('Armies table columns:');
    console.table(result.rows);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkArmiesTable();
