const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'dungeonlair',
  password: 'admin',
  port: 5432,
});

async function resetCharacterLevelsAndSkills() {
  try {
    console.log('Resetting all characters to level 0...');
    
    // Update all characters to level 0
    const updateResult = await pool.query(`
      UPDATE characters 
      SET level = 0, 
          experience_points = 0,
          hit_points_max = 0,
          updated_at = CURRENT_TIMESTAMP
      RETURNING id, name, level, experience_points, hit_points_max
    `);
    
    console.log(`✓ Updated ${updateResult.rows.length} character(s) to level 0 with 0 EXP and 0 HP`);
    updateResult.rows.forEach(char => {
      console.log(`  - ${char.name} (ID: ${char.id}): Level ${char.level}, ${char.experience_points} EXP, ${char.hit_points_max} HP`);
    });
    
    // Clear all character skills
    console.log('\nClearing all character skills...');
    const deleteSkillsResult = await pool.query(`
      DELETE FROM character_skills
      RETURNING character_id, skill_id
    `);
    console.log(`✓ Removed ${deleteSkillsResult.rows.length} skill assignment(s)`);
    
    // Clear all character subclasses
    console.log('\nClearing all character subclasses...');
    const deleteSubclassesResult = await pool.query(`
      DELETE FROM character_subclasses
      RETURNING character_id, subclass_id
    `);
    console.log(`✓ Removed ${deleteSubclassesResult.rows.length} subclass assignment(s)`);
    
    // Clear all character feature choices
    console.log('\nClearing all character feature choices...');
    const deleteChoicesResult = await pool.query(`
      DELETE FROM character_feature_choices
      RETURNING character_id, feature_id
    `);
    console.log(`✓ Removed ${deleteChoicesResult.rows.length} feature choice(s)`);
    
    console.log('\n✅ All characters reset to level 0 with no skills, subclasses, or feature choices');
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    await pool.end();
    process.exit(1);
  }
}

resetCharacterLevelsAndSkills();
