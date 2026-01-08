const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:admin@localhost:5432/dungeonlair'
});

async function convertOdisToPrimalBond() {
  try {
    console.log('Converting Odis the Oathbearer to Primal Bond class...\n');
    
    // 1. Find the character
    const findChar = await pool.query(`
      SELECT id, name, class, level, experience_points, hit_points_max
      FROM characters
      WHERE name ILIKE '%Odis%' OR name ILIKE '%Oathbearer%'
    `);
    
    if (findChar.rows.length === 0) {
      console.log('❌ Character not found. Searching for all Oathknights...');
      const allOathknights = await pool.query(`
        SELECT id, name, class, level FROM characters WHERE class = 'Oathknight'
      `);
      console.log('Found Oathknights:', allOathknights.rows);
      return;
    }
    
    const character = findChar.rows[0];
    console.log('✅ Found character:');
    console.log(`   ID: ${character.id}`);
    console.log(`   Name: ${character.name}`);
    console.log(`   Current Class: ${character.class}`);
    console.log(`   Current Level: ${character.level}`);
    console.log(`   Current XP: ${character.experience_points}`);
    console.log(`   Current HP: ${character.hit_points_max}\n`);
    
    // 2. Remove any existing subclass
    await pool.query(`
      DELETE FROM character_subclasses WHERE character_id = $1
    `, [character.id]);
    console.log('✅ Removed subclass association');
    
    // 3. Remove any existing beast companion
    await pool.query(`
      DELETE FROM character_beasts WHERE character_id = $1
    `, [character.id]);
    console.log('✅ Removed any existing beast companion');
    
    // 4. Remove any class-specific skills
    await pool.query(`
      DELETE FROM character_skills 
      WHERE character_id = $1 
        AND skill_id IN (
          SELECT id FROM skills WHERE class_restriction IN ('Oathknight', 'Primal Bond')
        )
    `, [character.id]);
    console.log('✅ Removed class-specific skills');
    
    // 5. Update character to Primal Bond level 1
    // Primal Bond uses d10 hit die, so starting HP at level 1 = 10 + CON modifier
    // We'll set it to 10 for now (will update with CON when they level up)
    await pool.query(`
      UPDATE characters
      SET class = 'Primal Bond',
          level = 1,
          experience_points = 0,
          hit_points_max = 10,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [character.id]);
    console.log('✅ Updated character to Primal Bond level 1\n');
    
    // 6. Verify the change
    const verify = await pool.query(`
      SELECT id, name, class, level, experience_points, hit_points_max
      FROM characters
      WHERE id = $1
    `, [character.id]);
    
    const updated = verify.rows[0];
    console.log('✅ Character updated successfully:');
    console.log(`   Name: ${updated.name}`);
    console.log(`   New Class: ${updated.class}`);
    console.log(`   New Level: ${updated.level}`);
    console.log(`   New XP: ${updated.experience_points}`);
    console.log(`   New HP: ${updated.hit_points_max}\n`);
    
    console.log('🎉 Odis is now ready to test the Primal Bond class!');
    console.log('   - Level up to 3 to choose a subclass');
    console.log('   - Choose Agile Hunter, Packbound, or Colossal Bond');
    console.log('   - Select your beast companion at the appropriate level');
    
  } catch (error) {
    console.error('❌ Error converting character:', error);
  } finally {
    await pool.end();
  }
}

convertOdisToPrimalBond();
