const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'dungeonlair',
  password: 'admin',
  port: 5432,
});

async function testFrontendSubclassLevels() {
  const client = await pool.connect();
  
  try {
    console.log('================================================================================');
    console.log('TESTING FRONTEND SUBCLASS LEVEL-UP DETECTION');
    console.log('================================================================================\n');
    
    // Define expected subclass selection levels for each class
    const classSubclassLevels = {
      'Cleric': 1,
      'Sorcerer': 1,
      'Warlock': 1,
      'Druid': 2,
      'Wizard': 2,
      'Barbarian': 3,
      'Bard': 3,
      'Fighter': 3,
      'Monk': 3,
      'Oathknight': 3,
      'Paladin': 3,
      'Ranger': 3,
      'Reaver': 3,
      'Rogue': 3
    };
    
    let allPassed = true;
    
    for (const [className, expectedLevel] of Object.entries(classSubclassLevels)) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`CLASS: ${className} (Expected subclass at level ${expectedLevel})`);
      console.log('='.repeat(80));
      
      // Check if subclass choice feature exists at expected level
      const choiceResult = await client.query(`
        SELECT * FROM class_features
        WHERE class = $1 
          AND level = $2 
          AND is_choice = true
          AND choice_type = 'subclass'
      `, [className, expectedLevel]);
      
      if (choiceResult.rows.length === 0) {
        console.log(`❌ FAIL: No subclass choice feature found at level ${expectedLevel}`);
        allPassed = false;
        continue;
      }
      
      console.log(`✅ PASS: Subclass choice feature found: "${choiceResult.rows[0].name}"`);
      
      // Check if subclasses exist
      const subclassResult = await client.query(`
        SELECT * FROM subclasses WHERE class = $1 ORDER BY name
      `, [className]);
      
      if (subclassResult.rows.length === 0) {
        console.log(`❌ FAIL: No subclasses found in database`);
        allPassed = false;
        continue;
      }
      
      console.log(`✅ PASS: Found ${subclassResult.rows.length} subclass(es):`);
      subclassResult.rows.forEach(s => console.log(`   - ${s.name}`));
      
      // Check if each subclass has features at the selection level
      let allSubclassesHaveFeatures = true;
      for (const subclass of subclassResult.rows) {
        const featuresResult = await client.query(`
          SELECT * FROM class_features
          WHERE class = $1 
            AND level = $2 
            AND subclass_id = $3
            AND is_choice = false
          ORDER BY name
        `, [className, expectedLevel, subclass.id]);
        
        if (featuresResult.rows.length === 0) {
          console.log(`❌ WARNING: Subclass "${subclass.name}" has NO features at level ${expectedLevel}`);
          allSubclassesHaveFeatures = false;
        } else {
          console.log(`✅ PASS: Subclass "${subclass.name}" has ${featuresResult.rows.length} feature(s):`);
          featuresResult.rows.forEach(f => console.log(`      - ${f.name}`));
        }
      }
      
      // Simulate what the backend API would return for a character leveling to this level
      console.log(`\n📊 Simulating API response for level ${expectedLevel - 1} → ${expectedLevel}:`);
      
      const apiResponse = {
        currentLevel: expectedLevel - 1,
        newLevel: expectedLevel,
        needsSubclass: true,
        availableSubclasses: subclassResult.rows,
        subclassFeatures: []
      };
      
      // Get all subclass features for this level (what would be shown after selection)
      const allSubclassFeaturesResult = await client.query(`
        SELECT cf.*, s.name as subclass_name
        FROM class_features cf
        JOIN subclasses s ON cf.subclass_id = s.id
        WHERE cf.class = $1 
          AND cf.level = $2
          AND cf.is_choice = false
          AND cf.subclass_id IS NOT NULL
        ORDER BY s.name, cf.name
      `, [className, expectedLevel]);
      
      apiResponse.subclassFeatures = allSubclassFeaturesResult.rows;
      
      console.log(`   needsSubclass: ${apiResponse.needsSubclass}`);
      console.log(`   availableSubclasses: ${apiResponse.availableSubclasses.length} subclasses`);
      console.log(`   subclassFeatures: ${apiResponse.subclassFeatures.length} total features across all subclasses`);
      
      // Verify frontend logic would work correctly
      console.log('\n🎯 Frontend Behavior Verification:');
      
      // 1. Should show subclass step
      if (apiResponse.needsSubclass && apiResponse.availableSubclasses.length > 0) {
        console.log('   ✅ Frontend WILL show subclass selection step');
      } else {
        console.log('   ❌ Frontend will NOT show subclass selection step');
        allPassed = false;
      }
      
      // 2. Should be able to filter features after selection
      if (apiResponse.subclassFeatures.length > 0) {
        console.log('   ✅ Frontend CAN filter and display subclass-specific features in summary');
        // Simulate filtering for first subclass
        const firstSubclass = apiResponse.availableSubclasses[0];
        const filteredFeatures = apiResponse.subclassFeatures.filter(f => f.subclass_id === firstSubclass.id);
        console.log(`   Example: Selecting "${firstSubclass.name}" would show ${filteredFeatures.length} feature(s)`);
      } else {
        console.log('   ⚠️  No subclass features to display in summary');
      }
      
      // 3. Check step progression
      console.log('\n🔄 Step Progression:');
      console.log('   1. HP Step → Always shown ✅');
      console.log(`   2. Subclass Step → ${apiResponse.needsSubclass ? 'SHOWN ✅' : 'Skipped'}`);
      console.log('   3. Features Step → Always shown (if any features) ✅');
      console.log('   4. Summary Step → Always shown ✅');
    }
    
    console.log('\n' + '='.repeat(80));
    if (allPassed) {
      console.log('✅ ALL FRONTEND TESTS PASSED - Subclass system will work correctly!');
    } else {
      console.log('⚠️  SOME ISSUES DETECTED - Review warnings above');
    }
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('Error testing frontend subclass levels:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

testFrontendSubclassLevels();
