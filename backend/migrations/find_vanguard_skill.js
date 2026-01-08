const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'dungeonlair',
  password: 'admin',
  port: 5432,
});

async function findVanguardSkill() {
  try {
    const result = await pool.query(`
      SELECT * FROM skills 
      WHERE name LIKE '%Crusader%' OR name LIKE '%Vanguard%' OR name LIKE '%Crushing%'
    `);
    
    console.log('Vanguard-related skills:');
    console.log(result.rows);
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    await pool.end();
  }
}

findVanguardSkill();
