const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'dungeonlair',
  password: 'admin',
  port: 5432
});

async function checkPrimalBondSubclasses() {
  try {
    const result = await pool.query(`
      SELECT id, name, class 
      FROM subclasses 
      WHERE class = 'Primal Bond' 
      ORDER BY name
    `);
    
    console.log('Primal Bond Subclasses:');
    console.log(result.rows);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkPrimalBondSubclasses();
