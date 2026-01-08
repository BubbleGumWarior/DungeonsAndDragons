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
    console.log('Resetting all characters to level 1...');
    
    // Update all characters to level 1 (can't be 0 due to check constraint)
    const updateResult = await pool.query(`
      UPDATE characters 
      SET level = 1, 
          experience_points = 0,
          hit_points_max = 10,
          updated_at = CURRENT_TIMESTAMP
      RETURNING id, name, level, experience_points, hit_points_max
    `);
    
    console.log(`✓ Updated ${updateResult.rows.length} character(s) to level 1 with 0 EXP and 10 HP`);
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
    
    // Clear all beast companions
    console.log('\nClearing all beast companions...');
    const deleteBeastsResult = await pool.query(`
      DELETE FROM character_beasts
      RETURNING character_id, beast_name, beast_type
    `);
    console.log(`✓ Removed ${deleteBeastsResult.rows.length} beast companion(s)`);
    if (deleteBeastsResult.rows.length > 0) {
      deleteBeastsResult.rows.forEach(beast => {
        console.log(`  - ${beast.beast_name} (${beast.beast_type}) from character ID ${beast.character_id}`);
      });
    }
    
    // Assign level 1 skills to all characters
    console.log('\n📚 Assigning level 1 skills to all characters...');
    const characters = await pool.query(`SELECT id, class FROM characters`);
    
    for (const char of characters.rows) {
      const skillsResult = await pool.query(`
        SELECT id FROM skills 
        WHERE class_restriction = $1 AND level_requirement = 1
      `, [char.class]);
      
      for (const skill of skillsResult.rows) {
        await pool.query(`
          INSERT INTO character_skills (character_id, skill_id)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
        `, [char.id, skill.id]);
      }
      
      console.log(`  - Assigned ${skillsResult.rows.length} level 1 skills to character ID ${char.id} (${char.class})`);
    }
    
    console.log('\n✅ All characters reset to level 1 with level 1 skills, no subclasses, feature choices, or beast companions');
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    await pool.end();
    process.exit(1);
  }
}

resetCharacterLevelsAndSkills();
