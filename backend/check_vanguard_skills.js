const { pool } = require('./models/database');

async function checkVanguardSkills() {
  try {
    console.log('Checking Vanguard skills...\n');
    
    const result = await pool.query(`
      SELECT name, description, allowed_categories 
      FROM skills 
      WHERE LOWER(name) LIKE '%vanguard%' 
      ORDER BY name
    `);
    
    if (result.rows.length === 0) {
      console.log('No vanguard skills found.');
    } else {
      console.table(result.rows);
      
      console.log('\nDetailed breakdown:');
      result.rows.forEach(skill => {
        console.log(`\nSkill: ${skill.name}`);
        console.log(`Description: ${skill.description}`);
        console.log(`Allowed Categories: ${skill.allowed_categories || 'ALL'}`);
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkVanguardSkills();
