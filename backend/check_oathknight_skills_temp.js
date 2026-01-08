const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'dungeonlair',
  password: 'admin',
  port: 5432,
});

async function checkOathknightSkills() {
  try {
    const result = await pool.query(`
      SELECT * FROM skills 
      WHERE class_restriction = 'Oathknight' 
        AND level_requirement = 3
    `);
    
    console.log('Oathknight skills at level 3:');
    console.log(result.rows);
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    await pool.end();
  }
}

checkOathknightSkills();
