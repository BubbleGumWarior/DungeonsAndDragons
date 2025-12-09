const { pool } = require('../models/database');

async function addTroopCounts() {
  try {
    console.log('Adding troop count columns to armies and battle_participants tables...');
    
    // Add total_troops and starting_troops to armies table
    const checkArmiesColumns = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'armies' 
      AND column_name IN ('total_troops', 'starting_troops')
    `);
    
    if (checkArmiesColumns.rows.length < 2) {
      await pool.query(`
        ALTER TABLE armies 
        ADD COLUMN IF NOT EXISTS total_troops INTEGER DEFAULT 100,
        ADD COLUMN IF NOT EXISTS starting_troops INTEGER DEFAULT 100
      `);
      console.log('✅ total_troops and starting_troops columns added to armies');
      
      // Update existing armies to have troop counts based on numbers stat
      await pool.query(`
        UPDATE armies 
        SET total_troops = CASE 
          WHEN numbers = 1 THEN 20
          WHEN numbers = 2 THEN 50
          WHEN numbers = 3 THEN 100
          WHEN numbers = 4 THEN 200
          WHEN numbers = 5 THEN 400
          WHEN numbers = 6 THEN 800
          WHEN numbers = 7 THEN 1600
          WHEN numbers = 8 THEN 3200
          WHEN numbers = 9 THEN 6400
          WHEN numbers = 10 THEN 12800
          ELSE 100
        END,
        starting_troops = CASE 
          WHEN numbers = 1 THEN 20
          WHEN numbers = 2 THEN 50
          WHEN numbers = 3 THEN 100
          WHEN numbers = 4 THEN 200
          WHEN numbers = 5 THEN 400
          WHEN numbers = 6 THEN 800
          WHEN numbers = 7 THEN 1600
          WHEN numbers = 8 THEN 3200
          WHEN numbers = 9 THEN 6400
          WHEN numbers = 10 THEN 12800
          ELSE 100
        END
        WHERE total_troops IS NULL OR starting_troops IS NULL
      `);
      console.log('✅ Updated existing armies with troop counts');
    } else {
      console.log('✅ troop count columns already exist in armies');
    }
    
    // Add current_troops to battle_participants table
    const checkParticipantsColumn = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'battle_participants' 
      AND column_name = 'current_troops'
    `);
    
    if (checkParticipantsColumn.rows.length === 0) {
      await pool.query(`
        ALTER TABLE battle_participants 
        ADD COLUMN current_troops INTEGER DEFAULT 100
      `);
      console.log('✅ current_troops column added to battle_participants');
    } else {
      console.log('✅ current_troops column already exists in battle_participants');
    }
    
    console.log('Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

addTroopCounts();
