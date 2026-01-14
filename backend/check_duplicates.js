const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'dungeonlair',
  password: 'admin',
  port: 5432
});

async function checkDuplicates() {
  try {
    // Check for duplicate class features
    const result = await pool.query(`
      SELECT class, level, name, COUNT(*) as count 
      FROM class_features 
      WHERE class = 'Shadow Sovereign' 
      GROUP BY class, level, name 
      HAVING COUNT(*) > 1
      ORDER BY level, name
    `);
    
    console.log('Duplicate class features found:', result.rows.length);
    console.log(result.rows);
    
    // Check level 3 specifically
    const level3 = await pool.query(`
      SELECT * 
      FROM class_features 
      WHERE class = 'Shadow Sovereign' AND level = 3
      ORDER BY name
    `);
    
    console.log('\nLevel 3 features:', level3.rows.length);
    console.log(level3.rows);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkDuplicates();
