const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'dungeonlair',
  password: 'admin',
  port: 5432,
});

// Expected subclass selection levels based on CharacterCreation.tsx
const EXPECTED_SUBCLASS_LEVELS = {
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

async function verifyAllClasses() {
  try {
    console.log('='.repeat(80));
    console.log('VERIFYING SUBCLASS SELECTION FOR ALL CLASSES');
    console.log('='.repeat(80));
    
    let allPassed = true;
    
    for (const [className, expectedLevel] of Object.entries(EXPECTED_SUBCLASS_LEVELS)) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`CLASS: ${className} (Expected subclass at level ${expectedLevel})`);
      console.log('='.repeat(80));
      
      // Check 1: Does the class have a subclass choice feature at the expected level?
      const subclassFeatureResult = await pool.query(`
        SELECT * FROM class_features
        WHERE class = $1 
          AND level = $2 
          AND is_choice = true
          AND choice_type = 'subclass'
      `, [className, expectedLevel]);
      
      if (subclassFeatureResult.rows.length === 0) {
        console.log(`❌ FAIL: No subclass choice feature found at level ${expectedLevel}`);
        allPassed = false;
      } else {
        console.log(`✅ PASS: Subclass choice feature found: "${subclassFeatureResult.rows[0].name}"`);
      }
      
      // Check 2: Does the class have subclasses defined?
      const subclassesResult = await pool.query(`
        SELECT * FROM subclasses WHERE class = $1 ORDER BY name
      `, [className]);
      
      if (subclassesResult.rows.length === 0) {
        console.log(`⚠️  WARNING: No subclasses found in database`);
      } else {
        console.log(`✅ PASS: Found ${subclassesResult.rows.length} subclass(es):`);
        subclassesResult.rows.forEach(sc => {
          console.log(`   - ${sc.name}`);
        });
      }
      
      // Check 3: Does each subclass have at least one feature at the subclass selection level?
      for (const subclass of subclassesResult.rows) {
        const subclassFeaturesResult = await pool.query(`
          SELECT * FROM class_features
          WHERE class = $1 
            AND level = $2
            AND subclass_id = $3
        `, [className, expectedLevel, subclass.id]);
        
        if (subclassFeaturesResult.rows.length === 0) {
          console.log(`⚠️  WARNING: Subclass "${subclass.name}" has no features at level ${expectedLevel}`);
        } else {
          console.log(`✅ PASS: Subclass "${subclass.name}" has ${subclassFeaturesResult.rows.length} feature(s) at level ${expectedLevel}:`);
          subclassFeaturesResult.rows.forEach(f => {
            console.log(`   - ${f.name}`);
          });
        }
      }
      
      // Check 4: Are there any general class features at this level?
      const generalFeaturesResult = await pool.query(`
        SELECT * FROM class_features
        WHERE class = $1 
          AND level = $2
          AND subclass_id IS NULL
          AND choice_type != 'subclass'
      `, [className, expectedLevel]);
      
      if (generalFeaturesResult.rows.length > 0) {
        console.log(`📋 INFO: ${generalFeaturesResult.rows.length} general class feature(s) at level ${expectedLevel}:`);
        generalFeaturesResult.rows.forEach(f => {
          console.log(`   - ${f.name} (choice: ${f.is_choice})`);
        });
      }
    }
    
    console.log('\n' + '='.repeat(80));
    if (allPassed) {
      console.log('✅ ALL CHECKS PASSED');
    } else {
      console.log('❌ SOME CHECKS FAILED - See details above');
    }
    console.log('='.repeat(80));
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    await pool.end();
    process.exit(1);
  }
}

verifyAllClasses();
