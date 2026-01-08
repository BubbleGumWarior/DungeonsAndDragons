const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'dungeonlair',
  password: 'admin',
  port: 5432
});

async function checkOathknightFeatures() {
  try {
    const result = await pool.query(`
      SELECT 
        cf.id,
        cf.name,
        cf.level,
        cf.subclass_id,
        s.name as subclass_name
      FROM class_features cf
      LEFT JOIN subclasses s ON cf.subclass_id = s.id
      WHERE cf.class = 'Oathknight' AND cf.level = 3
      ORDER BY cf.subclass_id, cf.name
    `);
    
    console.log('Oathknight Level 3 Features:');
    console.log(JSON.stringify(result.rows, null, 2));
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    await pool.end();
  }
}

checkOathknightFeatures();
