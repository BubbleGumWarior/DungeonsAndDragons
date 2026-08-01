const { pool } = require('../models/database');

const ALLOWED_CATEGORIES = [
  // Legacy categories
  'Royal Guard', 'Knights', 'Assassins', 'Swordsmen', 'Shield Wall', 'Spear Wall', 'Pikemen',
  'Heavy Infantry', 'Light Infantry', 'Longbowmen', 'Crossbowmen', 'Skirmishers', 'Mounted Archers',
  'Shock Cavalry', 'Heavy Cavalry', 'Light Cavalry', 'Lancers', 'Catapults', 'Trebuchets',
  'Ballistae', 'Siege Towers', 'Bombards', 'Scouts', 'Spies',
  // Modern template-driven categories
  'Recruit', 'Soldier', 'Spearman', 'Pikeman', 'Two-Handed Swordsman', 'Greatsword Master',
  'Skirmisher', 'Ranger', 'Archer', 'Longbowman', 'Crossbowman', 'Arbalest', 'Mounted Archer', 'Horse Archer',
  'Squire', 'Man-at-Arms', 'Knight', 'Lancer', 'Royal Lancer',
  'Watchman', 'Guard', 'Shield Guard', 'Axeman', 'Battle Axeman',
  'Siege Laborer', 'Siege Apprentice', 'Ballista Crew', 'Heavy Ballista', 'Catapult Crew',
  'Trebuchet Crew', 'Siege Tower Operator', 'Bombard Crew', 'Grand Bombard',
  'Street Informant', 'Infiltrator', 'Scout', 'Master Scout', 'Spy', 'Master Spy', 'Assassin', 'Shadow Assassin',
];

const toSqlStringList = (items) => items.map((c) => `'${String(c).replace(/'/g, "''")}'`).join(',\n        ');

async function addArmyCategory() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('🔄 Adding category column to armies table...');
    
    // Keep default aligned with modern templates.
    await client.query(`
      ALTER TABLE armies 
      ADD COLUMN IF NOT EXISTS category VARCHAR(60) DEFAULT 'Recruit';
    `);

    // Normalize any unknown values before (re)applying the check constraint.
    await client.query(`
      UPDATE armies 
      SET category = 'Recruit' 
      WHERE category IS NULL OR category NOT IN (${toSqlStringList(ALLOWED_CATEGORIES)});
    `);

    // Recreate as a merged, backward-compatible constraint so legacy + modern values work.
    await client.query(`
      ALTER TABLE armies DROP CONSTRAINT IF EXISTS armies_category_check;
      ALTER TABLE armies ADD CONSTRAINT armies_category_check CHECK (
        category IN (${toSqlStringList(ALLOWED_CATEGORIES)})
      );
    `);

    await client.query('COMMIT');

    console.log('✅ Successfully added category column to armies table');
    console.log('✅ Migration complete!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error adding category column:', error);
    throw error;
  } finally {
    client.release();
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
