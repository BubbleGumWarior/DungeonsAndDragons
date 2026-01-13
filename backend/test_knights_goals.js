const { pool } = require('./models/database');

async function testKnightsGoals() {
  try {
    console.log('Testing Knights armies goal eligibility...\n');

    // Get Knights armies
    const knightsResult = await pool.query(
      `SELECT a.id, a.name, a.category, u.username 
       FROM armies a 
       LEFT JOIN users u ON a.player_id = u.id 
       WHERE a.category = 'Knights' 
       ORDER BY a.name`
    );

    if (knightsResult.rows.length === 0) {
      console.log('❌ No Knights armies found!');
      process.exit(1);
    }

    console.log('✅ Found Knights armies:');
    console.table(knightsResult.rows);
    console.log('');

    // Get cavalry armies (for Cavalry Charge)
    const cavalryResult = await pool.query(
      `SELECT a.id, a.name, a.category, u.username 
       FROM armies a 
       LEFT JOIN users u ON a.player_id = u.id 
       WHERE a.category IN ('Light Cavalry', 'Heavy Cavalry', 'Knights', 'Lancers') 
       ORDER BY a.category, a.name`
    );

    console.log('✅ Armies eligible for Cavalry Charge:');
    console.table(cavalryResult.rows);
    console.log('');

    // Elite Vanguard goal requirements
    const eliteVanguardCategories = ['Royal Guard', 'Knights'];
    console.log('Elite Vanguard Goal Requirements:');
    console.log(`- Required Categories: ${eliteVanguardCategories.join(', ')}`);
    console.log('');

    console.log('Elite Vanguard Eligibility:');
    knightsResult.rows.forEach(army => {
      const isEligible = eliteVanguardCategories.includes(army.category);
      console.log(`${isEligible ? '✅' : '❌'} ${army.name} (${army.username}) - Category: ${army.category}`);
    });
    console.log('');

    // Cavalry Charge goal requirements
    const cavalryChargeCategories = ['Light Cavalry', 'Heavy Cavalry', 'Knights', 'Lancers'];
    console.log('Cavalry Charge Goal Requirements:');
    console.log(`- Required Categories: ${cavalryChargeCategories.join(', ')}`);
    console.log('');

    console.log('Cavalry Charge Eligibility:');
    cavalryResult.rows.forEach(army => {
      const isEligible = cavalryChargeCategories.includes(army.category);
      console.log(`${isEligible ? '✅' : '❌'} ${army.name} (${army.username}) - Category: ${army.category}`);
    });
    console.log('');

    // Test with actual battle scenario
    const battleResult = await pool.query(
      `SELECT b.id, b.battle_name, b.status 
       FROM battles b 
       WHERE b.status IN ('planning', 'active') 
       ORDER BY b.created_at DESC 
       LIMIT 1`
    );

    if (battleResult.rows.length > 0) {
      const battle = battleResult.rows[0];
      console.log(`Testing with Battle: "${battle.battle_name}" (ID: ${battle.id})`);
      
      const participantsResult = await pool.query(
        `SELECT bp.id, bp.team_name, 
                COALESCE(a.name, bp.temp_army_name) as army_name,
                COALESCE(a.category, bp.temp_army_category) as army_category
         FROM battle_participants bp
         LEFT JOIN armies a ON bp.army_id = a.id
         WHERE bp.battle_id = $1
         ORDER BY bp.team_name`,
        [battle.id]
      );

      console.log('\nBattle Participants:');
      console.table(participantsResult.rows);
      
      console.log('\nParticipant Goal Eligibility:');
      participantsResult.rows.forEach(p => {
        const canUseEliteVanguard = eliteVanguardCategories.includes(p.army_category);
        const canUseCavalryCharge = cavalryChargeCategories.includes(p.army_category);
        
        console.log(`\n${p.army_name} (${p.team_name}):`);
        console.log(`  Category: ${p.army_category}`);
        console.log(`  ${canUseEliteVanguard ? '✅' : '❌'} Elite Vanguard`);
        console.log(`  ${canUseCavalryCharge ? '✅' : '❌'} Cavalry Charge`);
      });
    } else {
      console.log('No active battles found to test participants.');
    }

    console.log('\n✅ Test complete!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testKnightsGoals();
