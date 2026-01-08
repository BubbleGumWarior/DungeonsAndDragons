const { pool } = require('./models/database');

async function checkSkillsSchema() {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'skills' 
      ORDER BY ordinal_position
    `);
    
    console.log('Skills table columns:');
    result.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type}`);
    });
    
    // Also get some sample skills
    const skillsResult = await pool.query(`SELECT * FROM skills LIMIT 10`);
    console.log('\nSample skills:');
    skillsResult.rows.forEach(row => {
      console.log(`  - ${row.skill_name} (${row.class_name || 'General'}, Level ${row.level_requirement || 0})`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkSkillsSchema();
