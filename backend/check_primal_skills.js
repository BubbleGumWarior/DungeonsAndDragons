const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'dungeonlair',
  password: 'admin',
  port: 5432
});

async function checkPrimalBondSkills() {
  try {
    const result = await pool.query(`
      SELECT name, class_restriction, level_requirement 
      FROM skills 
      WHERE class_restriction = 'Primal Bond' 
      ORDER BY level_requirement, name
    `);
    
    console.log('Primal Bond Skills:');
    console.log(result.rows);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkPrimalBondSkills();
