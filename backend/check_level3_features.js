const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'dungeonlair',
  password: 'admin',
  port: 5432,
});

async function checkOathknightLevel3Features() {
  try {
    // Check what auto features exist for Oathknight at level 3
    const result = await pool.query(`
      SELECT * FROM class_features
      WHERE class = 'Oathknight' 
        AND level = 3
        AND is_choice = false
      ORDER BY subclass_id, name
    `);
    
    console.log('Oathknight Level 3 Auto Features:');
    result.rows.forEach(row => {
      console.log({
        name: row.name,
        subclass_id: row.subclass_id,
        description: row.description.substring(0, 100)
      });
    });
    
    // Check what subclasses exist
    const subclasses = await pool.query(`
      SELECT * FROM subclasses WHERE class = 'Oathknight'
    `);
    
    console.log('\nOathknight Subclasses:');
    subclasses.rows.forEach(row => {
      console.log({
        id: row.id,
        name: row.name
      });
    });
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    await pool.end();
  }
}

checkOathknightLevel3Features();
