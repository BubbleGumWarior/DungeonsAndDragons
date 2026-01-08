const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'dungeonlair',
  password: 'admin',
  port: 5432,
});

async function debugLevelUp() {
  try {
    // Check character 2 (Oathknight)
    const charResult = await pool.query(`
      SELECT c.*, cs.subclass_id 
      FROM characters c
      LEFT JOIN character_subclasses cs ON c.id = cs.character_id
      WHERE c.id = 2
    `);
    
    console.log('\n=== Character Info ===');
    console.log(charResult.rows[0]);
    
    const character = charResult.rows[0];
    const newLevel = character.level + 1;
    
    // Check for subclass choice feature
    console.log('\n=== Checking for subclass choice at level', newLevel, '===');
    const choiceFeaturesResult = await pool.query(`
      SELECT * FROM class_features
      WHERE class = $1 
        AND level = $2 
        AND is_choice = true
      ORDER BY choice_type, name
    `, [character.class, newLevel]);
    
    console.log('All choice features:', choiceFeaturesResult.rows);
    
    const subclassChoice = choiceFeaturesResult.rows.find(f => f.choice_type === 'subclass');
    console.log('\nSubclass choice feature found:', subclassChoice);
    console.log('Character has subclass_id:', character.subclass_id);
    console.log('needsSubclass would be:', !!subclassChoice && !character.subclass_id);
    
    // Check available subclasses
    if (subclassChoice) {
      const subclassesResult = await pool.query(`
        SELECT * FROM subclasses WHERE class = $1 ORDER BY name
      `, [character.class]);
      console.log('\nAvailable subclasses:', subclassesResult.rows);
    }
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    await pool.end();
  }
}

debugLevelUp();
