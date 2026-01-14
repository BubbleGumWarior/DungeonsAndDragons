const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'dungeonlair',
  password: 'admin',
  port: 5432
});

async function checkLevel6Skills() {
  try {
    const result = await pool.query(`
      SELECT name, class_restriction, level_requirement 
      FROM skills 
      WHERE class_restriction = 'Primal Bond' 
        AND level_requirement = 6
      ORDER BY name
    `);
    
    console.log('Level 6 Primal Bond Skills:');
    console.log(result.rows);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkLevel6Skills();
