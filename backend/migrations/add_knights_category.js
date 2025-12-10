const { pool } = require('../models/database');

async function addKnightsCategory() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // First, drop the old constraint
    await client.query(`
      ALTER TABLE armies 
      DROP CONSTRAINT IF EXISTS armies_category_check;
    `);
    
    // Add the new constraint with Knights included
    await client.query(`
      ALTER TABLE armies 
      ADD CONSTRAINT armies_category_check CHECK (category IN (
        'Royal Guard', 'Knights', 'Assassins', 'Swordsmen', 'Shield Wall', 'Spear Wall', 'Pikemen', 'Heavy Infantry', 'Light Infantry',
        'Longbowmen', 'Crossbowmen', 'Skirmishers', 'Mounted Archers',
        'Shock Cavalry', 'Heavy Cavalry', 'Light Cavalry', 'Lancers',
        'Catapults', 'Trebuchets', 'Ballistae', 'Siege Towers', 'Bombards',
        'Scouts', 'Spies'
      ));
    `);
    
    await client.query('COMMIT');
    console.log('✅ Successfully added Knights to army category constraint');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error adding Knights category:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { addKnightsCategory };

// Run if called directly
if (require.main === module) {
  addKnightsCategory()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
