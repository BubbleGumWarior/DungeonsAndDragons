// Migration: add_player_army_training.js
// Adds new columns to armies and fief_training for the full branching army training system.
// New buildings (Siege Workshop, Thieves Guild, Foundry, Shadow Order) are added to the
// BUILDING_CATALOGUE in the frontend and can be constructed by players like any other building.

const { pool } = require('../models/database');

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Add unit_type and source_fief_id to armies
    await client.query(`
      ALTER TABLE armies
        ADD COLUMN IF NOT EXISTS unit_type VARCHAR(60),
        ADD COLUMN IF NOT EXISTS source_fief_id INTEGER REFERENCES fiefs(id) ON DELETE SET NULL
    `);

    // 2. Drop old category CHECK constraint and add new one with all 44 template names
    await client.query(`ALTER TABLE armies DROP CONSTRAINT IF EXISTS armies_category_check`);

    // 2a. Remap old category names to new template names
    const categoryRemaps = [
      ['Swordsmen',    'Soldier'],
      ['Spearmen',     'Spearman'],
      ['Pikemen',      'Pikeman'],
      ['Archers',      'Archer'],
      ['Longbowmen',   'Longbowman'],
      ['Crossbowmen',  'Crossbowman'],
      ['Cavalry',      'Man-at-Arms'],
      ['Knights',      'Knight'],
      ['Guards',       'Guard'],
      ['Axemen',       'Axeman'],
      ['Siege Engine', 'Catapult Crew'],
      ['Siege Crew',   'Ballista Crew'],
      ['Scouts',       'Scout'],
      ['Spies',        'Spy'],
      ['Assassins',    'Assassin'],
      ['Skirmishers',  'Skirmisher'],
    ];
    for (const [oldVal, newVal] of categoryRemaps) {
      await client.query(`UPDATE armies SET category = $1 WHERE category = $2`, [newVal, oldVal]);
    }
    // Any remaining unrecognised category → 'Recruit'
    const validCategories = [
      'Recruit','Soldier','Spearman','Pikeman','Two-Handed Swordsman','Greatsword Master',
      'Skirmisher','Ranger','Archer','Longbowman','Crossbowman','Arbalest','Mounted Archer','Horse Archer',
      'Squire','Man-at-Arms','Heavy Cavalry','Knight','Lancer','Royal Lancer',
      'Watchman','Guard','Shield Guard','Royal Guard','Axeman','Battle Axeman',
      'Siege Laborer','Siege Apprentice','Ballista Crew','Heavy Ballista',
      'Catapult Crew','Trebuchet Crew','Siege Tower Operator','Bombard Crew','Grand Bombard',
      'Street Informant','Infiltrator','Scout','Master Scout','Spy','Master Spy','Assassin','Shadow Assassin',
    ];
    await client.query(
      `UPDATE armies SET category = 'Recruit' WHERE category NOT IN (${validCategories.map((_, i) => `$${i + 1}`).join(',')})`,
      validCategories
    );

    await client.query(`
      ALTER TABLE armies ADD CONSTRAINT armies_category_check CHECK (
        category IN (
          'Recruit','Soldier','Spearman','Pikeman','Two-Handed Swordsman','Greatsword Master',
          'Skirmisher','Ranger','Archer','Longbowman','Crossbowman','Arbalest','Mounted Archer','Horse Archer',
          'Squire','Man-at-Arms','Heavy Cavalry','Knight','Lancer','Royal Lancer',
          'Watchman','Guard','Shield Guard','Royal Guard','Axeman','Battle Axeman',
          'Siege Laborer','Siege Apprentice','Ballista Crew','Heavy Ballista',
          'Catapult Crew','Trebuchet Crew','Siege Tower Operator','Bombard Crew','Grand Bombard',
          'Street Informant','Infiltrator','Scout','Master Scout','Spy','Master Spy','Assassin','Shadow Assassin'
        )
      )
    `);

    // 3. Add tier and linked_army_id to fief_training
    await client.query(`
      ALTER TABLE fief_training
        ADD COLUMN IF NOT EXISTS tier INTEGER DEFAULT 1,
        ADD COLUMN IF NOT EXISTS linked_army_id INTEGER REFERENCES armies(id) ON DELETE SET NULL
    `);

    await client.query('COMMIT');
    console.log('✅ Migration complete: add_player_army_training');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) run().then(() => process.exit(0)).catch(() => process.exit(1));

module.exports = run;
