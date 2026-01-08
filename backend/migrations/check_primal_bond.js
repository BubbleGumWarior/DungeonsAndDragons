const { pool } = require('../models/database');

async function checkPrimalBondSkills() {
  try {
    const result = await pool.query(`
      SELECT name FROM skills 
      WHERE class_restriction = 'Primal Bond' 
      ORDER BY level_requirement
    `);
    
    console.log(`Found ${result.rows.length} Primal Bond skills:`);
    result.rows.forEach(skill => {
      console.log(`  - ${skill.name}`);
    });
    
    const classFeatures = await pool.query(`
      SELECT cf.name, s.name as subclass, cf.level 
      FROM class_features cf
      LEFT JOIN subclasses s ON cf.subclass_id = s.id
      WHERE cf.class = 'Primal Bond'
      ORDER BY cf.level, s.name
    `);
    
    console.log(`\nFound ${classFeatures.rows.length} Primal Bond class features:`);
    classFeatures.rows.forEach(feature => {
      console.log(`  Level ${feature.level}: ${feature.name}${feature.subclass ? ` (${feature.subclass})` : ''}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkPrimalBondSkills();
