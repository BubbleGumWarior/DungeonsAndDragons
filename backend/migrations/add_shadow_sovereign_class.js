const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'dungeonlair',
  password: 'admin',
  port: 5432,
});

async function addShadowSovereignClass() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('Adding Shadow Sovereign class data...');
    
    // No subclasses for Shadow Sovereign - it's a single path class
    // All features are part of the main progression
    
    console.log('Adding Shadow Sovereign base features...');
    
    // Check if Shadow Sovereign features already exist
    const checkExisting = await client.query(`
      SELECT COUNT(*) as count 
      FROM class_features 
      WHERE class = 'Shadow Sovereign'
    `);
    
    if (parseInt(checkExisting.rows[0].count) > 0) {
      console.log('Shadow Sovereign features already exist, skipping insertion');
    } else {
      // Main class features - use ON CONFLICT to make idempotent
      await client.query(`
        INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
        VALUES 
          ('Shadow Sovereign', NULL, 1, 'Shadow Step', 'Dex modifier uses per short rest. As a bonus action, become Invisible until the start of your next turn. Your next weapon attack has advantage and deals +2d6 necrotic damage. If you are in dim light or darkness, you may also teleport up to 30 ft.', false, 0, NULL),
          ('Shadow Sovereign', NULL, 2, 'Assassin''s Mark', 'Proficiency Bonus uses per long rest. Bonus action to mark a target for 1 minute. Deal +1d8 damage to marked target. Automatically critical hit if you hit while invisible or hidden.', false, 0, NULL),
          ('Shadow Sovereign', NULL, 3, 'Cloak of Dusk', 'Dex modifier uses per long rest. When you hide or become invisible, you gain resistance to all damage until the start of your next turn. Opportunity attacks against you are made at disadvantage.', false, 0, NULL),
          ('Shadow Sovereign', NULL, 4, 'Ability Score Improvement', 'Increase one ability score by 2, or two ability scores by 1, or take a feat.', true, 1, 'asi_or_feat'),
          ('Shadow Sovereign', NULL, 4, 'Death from Darkness', 'Once per turn (passive): Deal +3d6 necrotic damage to a target that cannot see you. The target must make a Constitution save or become frightened until the end of its next turn.', false, 0, NULL),
          ('Shadow Sovereign', NULL, 5, 'Phantom Assault', 'Proficiency Bonus uses per short rest. As a bonus action, teleport directly to a target and immediately make an attack. The attack is treated as if from stealth, and all stealth benefits apply. After attacking, teleport to any space within 10 ft. This movement does not trigger reactions.', false, 0, NULL),
          ('Shadow Sovereign', NULL, 6, 'Shadow Reap', 'Once per long rest. When you land a killing blow, roll 1d20 + Con mod against a DC based on enemy strength. On success, create a Shadow Echo with all abilities, movement, and passives. HP equals original max HP. All damage becomes necrotic and magical.', false, 0, NULL),
          ('Shadow Sovereign', NULL, 6, 'Shadow Realm', 'You can have a number of active shadows equal to your Con modifier (minimum 1). You can store up to Con mod × 4 shadows. Use a bonus action to summon or dismiss shadows. Destroyed shadows (reduced to 0 HP) are destroyed but revive automatically after a long rest.', false, 0, NULL),
          ('Shadow Sovereign', NULL, 7, 'Improved Shadow Step', 'Shadow Step range increases to 60 ft. Once per short rest, you may bring one ally or shadow with you when you Shadow Step, and you may make one free weapon attack.', false, 0, NULL),
          ('Shadow Sovereign', NULL, 8, 'Ability Score Improvement', 'Increase one ability score by 2, or two ability scores by 1, or take a feat.', true, 1, 'asi_or_feat'),
          ('Shadow Sovereign', NULL, 8, 'Sovereign of Shades', 'Your shadows use your proficiency bonus for attack and damage rolls. They have advantage vs frightened or restrained enemies. Aura of Dread: At the start of each enemy turn, they must make a Wisdom save (DC 8 + Prof + Dex mod) for each active shadow. On failure, they are frightened until the start of their next turn.', false, 0, NULL),
          ('Shadow Sovereign', NULL, 9, 'Executioner''s Presence', 'Enemies within 10 ft have disadvantage vs fear and necrotic effects. They cannot gain advantage on attacks. Targets below 25% HP take maximum weapon damage from your attacks.', false, 0, NULL),
          ('Shadow Sovereign', NULL, 10, 'Life for a Life', 'Once per long rest. When reduced to 0 HP, your weakest active shadow is destroyed. You heal for half its current HP, teleport 30 ft to dim light or darkness, and become invisible until the end of your next turn.', false, 0, NULL),
          ('Shadow Sovereign', NULL, 11, 'Shadow Mastery', '+2 Shadow Step uses. While invisible, you ignore difficult terrain and can move through enemy spaces.', false, 0, NULL),
          ('Shadow Sovereign', NULL, 12, 'Ability Score Improvement', 'Increase one ability score by 2, or two ability scores by 1, or take a feat.', true, 1, 'asi_or_feat'),
          ('Shadow Sovereign', NULL, 12, 'Twin Reap', 'Shadow Reap uses increase to 2 per long rest.', false, 0, NULL),
          ('Shadow Sovereign', NULL, 13, 'Living Darkness', 'While at least one shadow is active, gain +1 AC per active shadow.', false, 0, NULL),
          ('Shadow Sovereign', NULL, 14, 'Shadow Legion', 'You can command all shadows with one bonus action. At this level, your shadows act without requiring any action or bonus action from you.', false, 0, NULL),
          ('Shadow Sovereign', NULL, 15, 'Death Refuses You', 'Life for a Life gains a second use per long rest. If you have no active shadows when using this feature, destroy two stored shadows instead.', false, 0, NULL),
          ('Shadow Sovereign', NULL, 16, 'Ability Score Improvement', 'Increase one ability score by 2, or two ability scores by 1, or take a feat.', true, 1, 'asi_or_feat'),
          ('Shadow Sovereign', NULL, 16, 'Absolute Silence', 'Frightened enemies are silenced and cannot communicate or cast spells with verbal components.', false, 0, NULL),
          ('Shadow Sovereign', NULL, 17, 'Shadow Cataclysm', 'Once per long rest. All active shadows attack. Any kill automatically triggers Shadow Reap (no roll required, still counts toward cap).', false, 0, NULL),
          ('Shadow Sovereign', NULL, 18, 'Sovereign''s Domain', 'You emanate a 30 ft aura that counts as dim light and suppresses magical light below 5th level spells.', false, 0, NULL),
          ('Shadow Sovereign', NULL, 19, 'Ability Score Improvement', 'Increase one ability score by 2, or two ability scores by 1, or take a feat.', true, 1, 'asi_or_feat'),
          ('Shadow Sovereign', NULL, 19, 'You Decide Who Dies', 'Once per long rest. Declare an attack an execution. It automatically critically hits. If the target dies, Shadow Reap automatically succeeds.', false, 0, NULL),
          ('Shadow Sovereign', NULL, 20, 'The Shadow Throne', 'All stored shadows may be active simultaneously. Shadow Step has unlimited uses. Life for a Life no longer consumes shadows; it consumes stored souls instead.', false, 0, NULL)
      `);
    }
    
    await client.query('COMMIT');
    console.log('✅ Shadow Sovereign class added successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error adding Shadow Sovereign class:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = addShadowSovereignClass;

// Run directly if called as script
if (require.main === module) {
  addShadowSovereignClass()
    .then(() => {
      console.log('Shadow Sovereign migration completed');
      process.exit(0);
    })
    .catch(err => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
