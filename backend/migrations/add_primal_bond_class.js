const { pool } = require('../models/database');

async function addPrimalBondClass() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('='.repeat(80));
    console.log('ADDING PRIMAL BOND CLASS');
    console.log('='.repeat(80));
    
    // Create character_beasts table for tracking beast companions
    console.log('\n📊 Creating character_beasts table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS character_beasts (
        id SERIAL PRIMARY KEY,
        character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
        beast_type VARCHAR(50) NOT NULL,
        beast_name VARCHAR(100),
        level_acquired INTEGER NOT NULL,
        hit_points_max INTEGER NOT NULL,
        hit_points_current INTEGER NOT NULL,
        armor_class INTEGER NOT NULL,
        abilities JSONB NOT NULL,
        speed INTEGER DEFAULT 40,
        attack_bonus INTEGER DEFAULT 0,
        damage_dice VARCHAR(20),
        damage_type VARCHAR(20),
        special_abilities TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(character_id)
      )
    `);
    console.log('✅ character_beasts table created');
    
    // Add Primal Bond subclasses
    console.log('\n📚 Adding Primal Bond subclasses...');
    
    const agileHunterResult = await client.query(`
      INSERT INTO subclasses (class, name, description)
      VALUES ('Primal Bond', 'Agile Hunter', 'You bond with a swift, precise predator—Cheetah or Leopard. Your beast arrives at level 3, emphasizing speed and agility in combat.')
      ON CONFLICT (class, name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
    `);
    
    const packboundResult = await client.query(`
      INSERT INTO subclasses (class, name, description)
      VALUES ('Primal Bond', 'Packbound', 'You bond with a pack leader—Alpha or Omega Wolf. Your beast arrives at level 6, bringing pack tactics and coordinated hunting.')
      ON CONFLICT (class, name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
    `);
    
    const colossalResult = await client.query(`
      INSERT INTO subclasses (class, name, description)
      VALUES ('Primal Bond', 'Colossal Bond', 'You bond with a massive beast—Elephant or Owlbear. Your beast arrives at level 10, providing overwhelming power and resilience.')
      ON CONFLICT (class, name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
    `);
    
    console.log('✅ Primal Bond subclasses added');
    
    const agileId = agileHunterResult.rows[0].id;
    const packId = packboundResult.rows[0].id;
    const colossalId = colossalResult.rows[0].id;
    
    // Delete ALL old Primal Bond features to prevent duplicates
    console.log('\n🗑️ Removing all old Primal Bond features...');
    await client.query(`
      DELETE FROM class_features 
      WHERE class = 'Primal Bond'
    `);
    
    // Add subclass choice feature at level 3
    console.log('\n📝 Adding class features...');
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES ('Primal Bond', NULL, 3, 'Primal Path', 'Choose your primal path: Agile Hunter (beast arrives now), Packbound (beast arrives level 6), or Colossal Bond (beast arrives level 10). This choice determines your animal aspect and when your beast companion joins you.', true, 1, 'subclass')
      ON CONFLICT DO NOTHING
    `);
    
    // ========== AGILE HUNTER FEATURES ==========
    console.log('Adding Agile Hunter features...');
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Primal Bond', $1, 3, 'Swift Bond', 'Your agile beast manifests and fights alongside you. Your beast uses your proficiency bonus, adds your Dexterity modifier to attack and damage rolls. Your movement speed increases by +10 ft.', false, 0, NULL),
        ('Primal Bond', $1, 3, 'Predator''s Rhythm', 'Once per turn, when either you or your beast hits a creature: The other may immediately move 10 ft without provoking opportunity attacks.', false, 0, NULL),
        ('Primal Bond', $1, 6, 'Relentless Pressure', 'If you and your beast both hit the same creature in one round: The target takes 1d8 extra damage. Damage type matches the triggering attack.', false, 0, NULL),
        ('Primal Bond', $1, 10, 'Flow of the Hunt', 'Opportunity attacks against you and your beast are made at disadvantage. Once per round, you may take the Disengage action as a bonus action.', false, 0, NULL),
        ('Primal Bond', $1, 14, 'Perfect Pounce', 'When you or your beast reduce a creature to 0 HP: You may immediately make one weapon attack (no action) or command your beast to attack (no action).', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `, [agileId]);
    
    // ========== PACKBOUND FEATURES ==========
    console.log('Adding Packbound features...');
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Primal Bond', $1, 3, 'Pack Doctrine', 'Even before your beast manifests: You gain a 5 ft aura. Allies in the aura gain +1 to attack rolls. Aura increases as you level.', false, 0, NULL),
        ('Primal Bond', $1, 6, 'Pack Manifest', 'Your wolf arrives. Your aura expands to 10 ft. Aura applies to you and your beast.', false, 0, NULL),
        ('Primal Bond', $1, 10, 'Coordinated Assault', 'When an ally hits a creature affected by your aura: You or your beast may make one reaction attack.', false, 0, NULL),
        ('Primal Bond', $1, 14, 'Unbroken Howl', 'Once per long rest: As a bonus action, emit a war howl. Allies in aura gain advantage on attacks and temporary HP equal to your level. Lasts 1 minute.', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `, [packId]);
    
    // ========== COLOSSAL BOND FEATURES ==========
    console.log('Adding Colossal Bond features...');
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Primal Bond', $1, 3, 'Colossal Vow', 'Before the beast manifests: Gain +2 max HP per level. You may use Constitution instead of Dexterity for initiative.', false, 0, NULL),
        ('Primal Bond', $1, 10, 'Colossal Manifest', 'Your massive beast arrives. You and your beast share a threat radius. Enemies have disadvantage on attacks against creatures other than you or your beast.', false, 0, NULL),
        ('Primal Bond', $1, 14, 'Immovable Bond', 'You and your beast cannot be knocked prone. You may reduce incoming damage by proficiency bonus as a reaction.', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `, [colossalId]);
    
    console.log('✅ Subclass features added');
    
    await client.query('COMMIT');
    console.log('\n' + '='.repeat(80));
    console.log('✅ PRIMAL BOND CLASS ADDED SUCCESSFULLY!');
    console.log('='.repeat(80));
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error adding Primal Bond class:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run migration if executed directly
if (require.main === module) {
  addPrimalBondClass()
    .then(() => {
      console.log('\n✅ Migration completed successfully');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n❌ Migration failed:', err);
      process.exit(1);
    });
}

module.exports = addPrimalBondClass;
