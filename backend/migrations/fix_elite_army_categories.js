const { pool } = require('../models/database');

async function fixEliteArmyCategories() {
  try {
    console.log('🔄 Fixing elite army categories that were incorrectly reset to Swordsmen...');
    
    // First, let's see what armies exist and their current categories
    const allArmies = await pool.query('SELECT id, name, category FROM armies ORDER BY category, name');
    console.log('📋 Current armies in database:');
    allArmies.rows.forEach(row => {
      console.log(`   - ${row.name} (ID: ${row.id}) → Category: ${row.category}`);
    });
    
    // Map of army names to their correct elite categories
    const categoryMap = {
      'Knights': 'Knights',
      'Assassins': 'Assassins',
      'Royal Guard': 'Royal Guard',
      'Scouts': 'Scouts',
      'Spies': 'Spies'
    };

    // Update armies with these names if they're currently set to Swordsmen
    for (const [armyName, correctCategory] of Object.entries(categoryMap)) {
      console.log(`\n🔍 Checking for army named "${armyName}"...`);
      const result = await pool.query(
        `UPDATE armies 
         SET category = $1 
         WHERE name = $2 AND category = 'Swordsmen'
         RETURNING id, name, category`,
        [correctCategory, armyName]
      );

      if (result.rows.length > 0) {
        console.log(`✅ Fixed ${result.rows.length} army(ies) named "${armyName}" back to category "${correctCategory}"`);
        result.rows.forEach(row => {
          console.log(`   - Army ID ${row.id}: ${row.name} → ${row.category}`);
        });
      } else {
        // Let's check what the current category is for this army
        const checkResult = await pool.query(
          `SELECT id, name, category FROM armies WHERE name = $1`,
          [armyName]
        );
        if (checkResult.rows.length > 0) {
          console.log(`   - Army "${armyName}" exists with category: ${checkResult.rows[0].category} (not Swordsmen, no fix needed)`);
        } else {
          console.log(`   - Army "${armyName}" not found in database`);
        }
      }
    }

    // Show final state of elite armies
    console.log('\n📋 Final elite armies state:');
    const eliteArmies = await pool.query(
      `SELECT id, name, category FROM armies 
       WHERE name IN ('Knights', 'Assassins', 'Royal Guard', 'Scouts', 'Spies')
       ORDER BY name`
    );
    eliteArmies.rows.forEach(row => {
      console.log(`   - ${row.name} (ID: ${row.id}) → Category: ${row.category}`);
    });

    console.log('✅ Elite army categories fixed successfully');
    
  } catch (error) {
    console.error('❌ Error fixing army categories:', error);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  fixEliteArmyCategories()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = fixEliteArmyCategories;
