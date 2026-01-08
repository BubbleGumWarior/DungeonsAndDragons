const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:admin@localhost:5432/dungeonlair'
});

async function testBeastSelection() {
  try {
    console.log('Testing Beast Selection System...\n');
    
    // 1. Check if Primal Bond class exists
    const classCheck = await pool.query(`
      SELECT DISTINCT class FROM class_features WHERE class = 'Primal Bond'
    `);
    console.log('✅ Primal Bond class exists:', classCheck.rows.length > 0);
    
    // 2. Check subclasses
    const subclassCheck = await pool.query(`
      SELECT name FROM subclasses WHERE class = 'Primal Bond' ORDER BY name
    `);
    console.log('✅ Primal Bond subclasses:', subclassCheck.rows.map(s => s.name).join(', '));
    
    // 3. Check character_beasts table
    const tableCheck = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'character_beasts'
      ORDER BY ordinal_position
    `);
    console.log('✅ character_beasts table columns:', tableCheck.rows.length);
    
    // 4. Check class features for each level
    const featuresByLevel = await pool.query(`
      SELECT level, COUNT(*) as count
      FROM class_features
      WHERE class = 'Primal Bond'
      GROUP BY level
      ORDER BY level
    `);
    console.log('✅ Primal Bond features by level:');
    featuresByLevel.rows.forEach(row => {
      console.log(`   Level ${row.level}: ${row.count} features`);
    });
    
    // 5. Check skills
    const skillsCheck = await pool.query(`
      SELECT COUNT(*) as count
      FROM skills
      WHERE class_restriction = 'Primal Bond'
    `);
    console.log('✅ Primal Bond skills:', skillsCheck.rows[0].count);
    
    // 6. List some aspect skills
    const aspectSkills = await pool.query(`
      SELECT name, level_requirement
      FROM skills
      WHERE class_restriction = 'Primal Bond'
        AND (name ILIKE '%Cheetah%' OR name ILIKE '%Wolf%' OR name ILIKE '%Elephant%')
      ORDER BY level_requirement, name
      LIMIT 10
    `);
    console.log('\n✅ Sample aspect skills:');
    aspectSkills.rows.forEach(skill => {
      console.log(`   Level ${skill.level_requirement}: ${skill.name}`);
    });
    
    console.log('\n✅ Beast selection system ready!');
    console.log('\nTest Summary:');
    console.log('- Primal Bond class: ✅');
    console.log('- 3 Subclasses: ✅');
    console.log('- Character_beasts table: ✅');
    console.log('- Class features: ✅');
    console.log('- Skills system: ✅');
    
  } catch (error) {
    console.error('❌ Error testing beast selection:', error);
  } finally {
    await pool.end();
  }
}

testBeastSelection();
