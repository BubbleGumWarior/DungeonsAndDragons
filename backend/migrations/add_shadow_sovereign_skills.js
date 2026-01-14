const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'dungeonlair',
  password: 'admin',
  port: 5432,
});

async function addShadowSovereignSkills() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('Adding Shadow Sovereign skills...');
    
    await client.query(`
      INSERT INTO skills (
        name, 
        description, 
        class_restriction, 
        level_requirement,
        damage_dice,
        damage_type,
        range_size,
        usage_frequency
      ) VALUES 
        ('Shadow Step', 'Become invisible until the start of your next turn. Your next weapon attack has advantage and deals +2d6 necrotic damage. If in dim light or darkness, teleport up to 30 ft (60 ft at level 7).', 'Shadow Sovereign', 1, '+2d6', 'Necrotic', 'Self/30-60ft', 'Dex modifier per short rest'),
        ('Assassin''s Mark', 'Mark a target for 1 minute. Deal +1d8 damage to marked target. Automatically critical hit if you attack while invisible or hidden.', 'Shadow Sovereign', 2, '+1d8', 'Bonus', '60 feet', 'Proficiency Bonus per long rest'),
        ('Cloak of Dusk', 'When you hide or become invisible, gain resistance to all damage until the start of your next turn. Opportunity attacks against you are made at disadvantage.', 'Shadow Sovereign', 3, NULL, 'Protection', 'Self', 'Dex modifier per long rest'),
        ('Death from Darkness', 'Once per turn, deal +3d6 necrotic damage to a target that cannot see you. The target must make a Constitution save or become frightened until the end of its next turn.', 'Shadow Sovereign', 4, '+3d6', 'Necrotic', 'Weapon range', 'Passive - once per turn'),
        ('Phantom Assault', 'Teleport directly to a target and immediately make an attack treated as if from stealth. After attacking, teleport to any space within 10 ft. This movement does not trigger reactions.', 'Shadow Sovereign', 5, 'Weapon', 'Weapon', 'Target + 10ft', 'Proficiency Bonus per short rest'),
        ('Shadow Reap', 'When you land a killing blow, roll 1d20 + Con mod vs DC based on enemy strength. On success, create a Shadow Echo: retains all abilities, HP equals original max, damage becomes necrotic and magical. Limited uses: 1/long rest (2 at level 12).', 'Shadow Sovereign', 6, 'Special', 'Summon', 'Target creature', '1 per long rest (2 at level 12)'),
        ('Shadow Realm', 'Command an army of shadows. Active shadows = Con modifier (min 1). Stored shadows = Con × 4. Summon/dismiss as bonus action. Destroyed shadows revive after long rest.', 'Shadow Sovereign', 6, NULL, 'Summon', 'Special', 'Passive - bonus action management'),
        ('Improved Shadow Step', 'Shadow Step range increases to 60 ft. Once per short rest, bring one ally or shadow with you. Make one free weapon attack after teleporting.', 'Shadow Sovereign', 7, 'Weapon', 'Enhancement', '60 feet', 'Enhancement to Shadow Step'),
        ('Sovereign of Shades', 'Your shadows use your proficiency bonus for attacks and damage. They have advantage vs frightened or restrained enemies. Aura of Dread: Each enemy makes Wis save (DC 8 + Prof + Dex) per active shadow at turn start or become frightened.', 'Shadow Sovereign', 8, 'Special', 'Fear', '60 feet', 'Passive aura'),
        ('Executioner''s Presence', 'Enemies within 10 ft: disadvantage vs fear/necrotic, cannot gain advantage on attacks. Targets below 25% HP take maximum weapon damage from your attacks.', 'Shadow Sovereign', 9, 'Max weapon', 'Debuff', '10 feet', 'Passive aura'),
        ('Life for a Life', 'When reduced to 0 HP, your weakest active shadow is destroyed. You heal for half its current HP, teleport 30 ft to dim light/darkness, and become invisible until end of next turn. Uses: 1/long rest (2 at level 15).', 'Shadow Sovereign', 10, 'Healing', 'Survival', '30 feet', '1 per long rest (2 at level 15)'),
        ('Shadow Mastery', 'Gain +2 Shadow Step uses. While invisible, ignore difficult terrain and move through enemy spaces.', 'Shadow Sovereign', 11, NULL, 'Enhancement', 'Self', 'Passive enhancement'),
        ('Twin Reap', 'Shadow Reap uses increase to 2 per long rest.', 'Shadow Sovereign', 12, NULL, 'Enhancement', 'Self', 'Passive enhancement'),
        ('Living Darkness', 'While at least one shadow is active, gain +1 AC per active shadow.', 'Shadow Sovereign', 13, '+1 AC', 'Defense', 'Self', 'Passive'),
        ('Shadow Legion', 'Command all shadows with one bonus action. At this level, shadows act without requiring any action or bonus action from you.', 'Shadow Sovereign', 14, NULL, 'Enhancement', 'All shadows', 'Passive - action economy'),
        ('Death Refuses You', 'Life for a Life gains a second use per long rest. If no active shadows when triggered, destroy two stored shadows instead.', 'Shadow Sovereign', 15, 'Healing', 'Survival', '30 feet', 'Enhancement - 2 per long rest'),
        ('Absolute Silence', 'Frightened enemies are silenced and cannot communicate or cast spells with verbal components.', 'Shadow Sovereign', 16, NULL, 'Silence', 'Varies', 'Passive debuff'),
        ('Shadow Cataclysm', 'All active shadows attack simultaneously. Any kill automatically triggers Shadow Reap (no roll required, still counts toward cap).', 'Shadow Sovereign', 17, 'Massive', 'AoE Attack', 'All shadows', '1 per long rest'),
        ('Sovereign''s Domain', 'You emanate a 30 ft aura that counts as dim light and suppresses magical light below 5th level spells.', 'Shadow Sovereign', 18, NULL, 'Environmental', '30 feet', 'Passive aura'),
        ('You Decide Who Dies', 'Declare an attack an execution. It automatically critically hits. If the target dies, Shadow Reap automatically succeeds (no roll).', 'Shadow Sovereign', 19, 'Auto-crit', 'Execution', 'Weapon range', '1 per long rest'),
        ('The Shadow Throne', 'All stored shadows may be active simultaneously. Shadow Step has unlimited uses. Life for a Life no longer consumes shadows; it consumes stored souls instead.', 'Shadow Sovereign', 20, 'Unlimited', 'Capstone', 'All ranges', 'Passive capstone')
      ON CONFLICT (name) DO UPDATE SET
        description = EXCLUDED.description,
        class_restriction = EXCLUDED.class_restriction,
        level_requirement = EXCLUDED.level_requirement,
        damage_dice = EXCLUDED.damage_dice,
        damage_type = EXCLUDED.damage_type,
        range_size = EXCLUDED.range_size,
        usage_frequency = EXCLUDED.usage_frequency
    `);
    
    await client.query('COMMIT');
    console.log('✅ Shadow Sovereign skills added successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error adding Shadow Sovereign skills:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = addShadowSovereignSkills;

// Run directly if called as script
if (require.main === module) {
  addShadowSovereignSkills()
    .then(() => {
      console.log('Shadow Sovereign skills migration completed');
      process.exit(0);
    })
    .catch(err => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
