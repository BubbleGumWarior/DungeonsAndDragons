const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'dungeonlair',
  password: 'admin',
  port: 5432,
});

async function addMissingSubclassFeatures() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('Adding missing subclass features at level 3...\n');
    
    // Get subclass IDs
    const totemWarriorResult = await client.query(`
      SELECT id FROM subclasses WHERE class = 'Barbarian' AND name = 'Path of the Totem Warrior'
    `);
    
    const battleMasterResult = await client.query(`
      SELECT id FROM subclasses WHERE class = 'Fighter' AND name = 'Battle Master'
    `);
    
    const fourElementsResult = await client.query(`
      SELECT id FROM subclasses WHERE class = 'Monk' AND name = 'Way of the Four Elements'
    `);
    
    const hunterResult = await client.query(`
      SELECT id FROM subclasses WHERE class = 'Ranger' AND name = 'Hunter'
    `);
    
    // Add Totem Warrior feature
    if (totemWarriorResult.rows.length > 0) {
      await client.query(`
        INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
        VALUES ('Barbarian', $1, 3, 'Totem Spirit', 'Choose a totem animal to gain its benefits while raging: Bear (resistance to all damage except psychic), Eagle (enemies have disadvantage on opportunity attacks, you can Dash as bonus action), or Wolf (allies have advantage on melee attacks against enemies within 5 feet of you).', false, 0, NULL)
        ON CONFLICT DO NOTHING
      `, [totemWarriorResult.rows[0].id]);
      console.log('✅ Added Totem Spirit to Path of the Totem Warrior');
    }
    
    // Add Battle Master features
    if (battleMasterResult.rows.length > 0) {
      await client.query(`
        INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
        VALUES 
          ('Fighter', $1, 3, 'Combat Superiority', 'You learn maneuvers that enhance your attacks. You have four superiority dice (d8). When you use a maneuver, you expend one superiority die. You regain all expended superiority dice after a short or long rest.', false, 0, NULL),
          ('Fighter', $1, 3, 'Student of War', 'You gain proficiency with one type of artisan''s tools of your choice.', false, 0, NULL)
        ON CONFLICT DO NOTHING
      `, [battleMasterResult.rows[0].id]);
      console.log('✅ Added Combat Superiority and Student of War to Battle Master');
    }
    
    // Add Four Elements feature (it already has is_choice=true in the data)
    if (fourElementsResult.rows.length > 0) {
      await client.query(`
        INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
        VALUES ('Monk', $1, 3, 'Disciple of the Elements', 'Learn elemental disciplines to channel the power of the elements through your ki: Fangs of the Fire Snake (extend unarmed strike reach by 10 feet, deal fire damage), Water Whip (spend 2 ki to pull and knock prone), or other elemental abilities.', false, 0, NULL)
        ON CONFLICT DO NOTHING
      `, [fourElementsResult.rows[0].id]);
      console.log('✅ Added Disciple of the Elements to Way of the Four Elements');
    }
    
    // Add Hunter feature (it already has is_choice=true in the data)
    if (hunterResult.rows.length > 0) {
      await client.query(`
        INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
        VALUES ('Ranger', $1, 3, 'Hunter''s Prey', 'Choose one ability to specialize in hunting: Colossus Slayer (1d8 extra damage to wounded targets once per turn), Giant Killer (reaction attack when Large+ creature attacks you), or Horde Breaker (extra attack against creature within 5 feet of original target).', false, 0, NULL)
        ON CONFLICT DO NOTHING
      `, [hunterResult.rows[0].id]);
      console.log('✅ Added Hunter\'s Prey to Hunter');
    }
    
    await client.query('COMMIT');
    console.log('\n✅ All missing subclass features added successfully!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error adding missing features:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

addMissingSubclassFeatures();
