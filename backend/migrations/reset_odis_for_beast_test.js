const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:admin@localhost:5432/dungeonlair'
});

async function resetOdisForBeastTest() {
  try {
    console.log('Resetting Odis to test beast selection...\n');
    
    // Find Odis
    const findChar = await pool.query(`
      SELECT id, name, class, level FROM characters
      WHERE name ILIKE '%Odis%'
    `);
    
    if (findChar.rows.length === 0) {
      console.log('❌ Odis not found');
      return;
    }
    
    const odis = findChar.rows[0];
    console.log(`Found: ${odis.name} (Level ${odis.level} ${odis.class})\n`);
    
    // Reset to level 2 with enough XP to level up
    await pool.query(`
      UPDATE characters
      SET level = 2,
          experience_points = 300,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [odis.id]);
    
    console.log('✅ Reset Odis to Level 2 with 300 XP');
    console.log('   Next level-up will trigger subclass AND beast selection');
    console.log('   Level 2 → 3: Choose subclass, then choose beast\n');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

resetOdisForBeastTest();
