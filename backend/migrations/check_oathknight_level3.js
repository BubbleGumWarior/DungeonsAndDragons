const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'dungeonlair',
  password: 'admin',
  port: 5432,
});

async function checkOathknightLevel3() {
  try {
    console.log('\n=== Checking Skills Table Structure ===\n');
    
    const tableStructure = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'skills'
    `);
    
    console.log('Skills table columns:');
    tableStructure.rows.forEach(col => {
      console.log(`- ${col.column_name}: ${col.data_type}`);
    });
    
    console.log('\n=== Checking Oathknight Skills at Level 3 ===\n');
    
    const skillsResult = await pool.query(`
      SELECT *
      FROM skills
      WHERE class_restriction = 'Oathknight'
      LIMIT 5
    `);
    
    console.log('First 5 Oathknight skills:');
    console.log(skillsResult.rows);
    
    console.log('\n=== Checking Oathknight Class Features at Level 3 ===\n');
    
    const featuresResult = await pool.query(`
      SELECT cf.id, cf.name, cf.description, s.name as subclass_name, cf.is_choice, cf.choice_type
      FROM class_features cf
      LEFT JOIN subclasses s ON cf.subclass_id = s.id
      WHERE cf.class = 'Oathknight' AND cf.level = 3
      ORDER BY cf.subclass_id NULLS LAST
    `);
    
    console.log('Class_features table entries for Oathknight Level 3:');
    featuresResult.rows.forEach(feature => {
      console.log(`- ${feature.name} (subclass: ${feature.subclass_name || 'Base class'}, is_choice: ${feature.is_choice}, choice_type: ${feature.choice_type})`);
    });
    
    console.log('\n=== Checking Oathknight Subclasses ===\n');
    
    const subclassesResult = await pool.query(`
      SELECT id, name
      FROM subclasses
      WHERE class = 'Oathknight'
    `);
    
    console.log('Oathknight subclasses:');
    subclassesResult.rows.forEach(subclass => {
      console.log(`- ${subclass.name} (ID: ${subclass.id})`);
    });
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    await pool.end();
    process.exit(1);
  }
}

checkOathknightLevel3();
