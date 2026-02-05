const { pool } = require('../models/database');

async function addArmyCategory() {
  try {
    console.log('🔄 Adding category column to armies table...');
    
    // Add category column with default value that matches our constraint
    await pool.query(`
      ALTER TABLE armies 
      ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'Swordsmen';
    `);

    // Update any existing NULL or invalid values to 'Swordsmen'
    await pool.query(`
      UPDATE armies 
      SET category = 'Swordsmen' 
      WHERE category IS NULL OR category NOT IN (
        'Royal Guard',
        'Knights',
        'Assassins',
        'Swordsmen',
        'Shield Wall',
        'Spear Wall',
        'Pikemen',
        'Heavy Infantry',
        'Light Infantry',
        'Longbowmen',
        'Crossbowmen',
        'Skirmishers',
        'Mounted Archers',
        'Shock Cavalry',
        'Heavy Cavalry',
        'Light Cavalry',
        'Lancers',
        'Catapults',
        'Trebuchets',
        'Ballistae',
        'Siege Towers',
        'Bombards',
        'Scouts',
        'Spies'
      );
    `);

    // Add check constraint for valid categories
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'armies_category_check'
        ) THEN
          ALTER TABLE armies 
          ADD CONSTRAINT armies_category_check 
          CHECK (category IN (
            'Royal Guard',
            'Knights',
            'Assassins',
            'Swordsmen',
            'Shield Wall',
            'Spear Wall',
            'Pikemen',
            'Heavy Infantry',
            'Light Infantry',
            'Longbowmen',
            'Crossbowmen',
            'Skirmishers',
            'Mounted Archers',
            'Shock Cavalry',
            'Heavy Cavalry',
            'Light Cavalry',
            'Lancers',
            'Catapults',
            'Trebuchets',
            'Ballistae',
            'Siege Towers',
            'Bombards',
            'Scouts',
            'Spies'
          ));
        END IF;
      END $$;
    `);

    console.log('✅ Successfully added category column to armies table');
    console.log('✅ Migration complete!');
    
  } catch (error) {
    console.error('❌ Error adding category column:', error);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  addArmyCategory()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = addArmyCategory;
