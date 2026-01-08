const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'dungeonlair',
  password: 'admin',
  port: 5432,
});

async function addMissingReaverFeatures() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('Adding missing Reaver subclass features...');
    
    // Get subclass IDs
    const phantomResult = await client.query(`
      SELECT id FROM subclasses WHERE class = 'Reaver' AND name = 'Path of the Phantom'
    `);
    const sentinelResult = await client.query(`
      SELECT id FROM subclasses WHERE class = 'Reaver' AND name = 'Path of the Sentinel'
    `);
    
    if (phantomResult.rows.length === 0 || sentinelResult.rows.length === 0) {
      throw new Error('Reaver subclasses not found in database');
    }
    
    const phantomId = phantomResult.rows[0].id;
    const sentinelId = sentinelResult.rows[0].id;
    
    console.log(`Phantom ID: ${phantomId}, Sentinel ID: ${sentinelId}`);
    
    // Phantom path features
    console.log('Adding Phantom path features...');
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Reaver', $1, 3, 'Dagger Step', 'When you hit a creature with a thrown dagger, you may teleport to an unoccupied space within 5 feet of that creature. Use WIS modifier times per short rest.', false, 0, NULL),
        ('Reaver', $1, 6, 'Ethereal Blades', 'Your thrown daggers can pass through solid objects and creatures. Ignore cover and make attacks through walls within 30 ft.', false, 0, NULL),
        ('Reaver', $1, 10, 'Shadow Walk', 'As a bonus action, become invisible until the end of your turn. Use proficiency bonus times per long rest.', false, 0, NULL),
        ('Reaver', $1, 14, 'Phantom Strike', 'When you throw a dagger, you may throw it from your current location or from the location of any dagger you threw this turn.', false, 0, NULL),
        ('Reaver', $1, 17, 'Ghost in Steel', 'When you use Dagger Step, you may bring one willing creature with you. You have resistance to all damage until the start of your next turn after teleporting.', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `, [phantomId]);
    
    // Sentinel path features
    console.log('Adding Sentinel path features...');
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Reaver', $1, 3, 'Guardian\'\'s Mark', 'As a bonus action, mark an ally within 30 ft. When a marked ally is attacked, you may throw a dagger at the attacker as a reaction. Mark lasts 1 minute.', false, 0, NULL),
        ('Reaver', $1, 6, 'Intercepting Throw', 'When an ally within 30 ft is hit by an attack, use your reaction to throw a dagger. On a hit, reduce the damage to your ally by 1d8 + DEX modifier.', false, 0, NULL),
        ('Reaver', $1, 10, 'Pinning Strike', 'When you hit with a thrown dagger, the target must succeed on a STR save (DC 8 + proficiency + DEX) or be restrained until the start of your next turn.', false, 0, NULL),
        ('Reaver', $1, 14, 'Blade Barrier', 'Create a 15 ft radius zone around yourself. Enemies entering or starting their turn in the zone take 2d6 piercing damage. Lasts 1 minute. Once per long rest.', false, 0, NULL),
        ('Reaver', $1, 17, 'Steel Sentinel', 'Allies within 10 ft of you have +2 AC and advantage on saving throws. When an ally within 10 ft is reduced to 0 HP, you may immediately make a thrown dagger attack against the attacker.', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `, [sentinelId]);
    
    await client.query('COMMIT');
    console.log('✅ Missing Reaver subclass features added successfully!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error adding Reaver features:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

addMissingReaverFeatures();
