const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'dungeonlair',
  password: 'admin',
  port: 5432,
});

async function populateOathknightData() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('Adding Oathknight subclasses...');
    
    // Oath of the Aegis
    const aegisResult = await client.query(`
      INSERT INTO subclasses (class, name, description)
      VALUES ($1, $2, $3)
      ON CONFLICT (class, name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
    `, [
      'Oathknight',
      'Oath of the Aegis',
      'Shield-focused defenders who protect their allies with unyielding resolve. Aegis Oathknights are the ultimate defensive specialists, capable of withstanding any assault while shielding their companions from harm.'
    ]);
    const aegisId = aegisResult.rows[0].id;
    
    // Oath of the Vanguard
    const vanguardResult = await client.query(`
      INSERT INTO subclasses (class, name, description)
      VALUES ($1, $2, $3)
      ON CONFLICT (class, name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
    `, [
      'Oathknight',
      'Oath of the Vanguard',
      'Two-handed weapon masters who lead the charge into battle. Vanguard Oathknights are devastating offensive powerhouses, cleaving through enemy lines with overwhelming force while inspiring their allies.'
    ]);
    const vanguardId = vanguardResult.rows[0].id;
    
    console.log('Adding Oathknight class features...');
    
    // Level 1 features
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Oathknight', NULL, 1, 'Oathbound Vitality', 'While wearing armor, gain bonus to AC equal to half your CON modifier (rounded up). Your max HP increases by your CON modifier at each level. While below 25% of max HP, you have resistance to bludgeoning, piercing, and slashing damage.', false, 0, NULL),
        ('Oathknight', NULL, 1, 'Martial Training', 'You are proficient with heavy armor and shields. You have advantage on STR checks and saves to resist being shoved, grappled, or knocked prone.', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `);
    
    // Level 2
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Oathknight', NULL, 2, 'Guarding Stance', 'Bonus action for 1 minute. At start of each turn, gain temp HP equal to twice your CON modifier. Allies within 10 ft gain +1 AC. When creature attacks ally within 5 ft, use reaction to impose disadvantage. Use CON modifier times per long rest (minimum 1).', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `);
    
    // Level 3 - Subclass choice
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Oathknight', NULL, 3, 'Ascended Oath', 'Choose your path that defines your playstyle and grants unique abilities throughout your journey.', true, 1, 'subclass')
      ON CONFLICT DO NOTHING
    `);
    
    // Oath of the Aegis features
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Oathknight', $1, 3, 'Unyielding Guard', 'While wielding a shield, gain +1 AC. When you or ally within 5 ft takes damage, use reaction to reduce damage by 1d12 + CON modifier. Use proficiency bonus times per long rest.', false, 0, NULL),
        ('Oathknight', $1, 6, 'Shield Mastery', 'Bonus action to make shield slam attack. On hit, deal 1d8 + STR or CON bludgeoning damage and target must succeed on STR save (DC 8 + proficiency + CON) or be stunned until end of your next turn.', false, 0, NULL),
        ('Oathknight', $1, 10, 'Living Fortress', 'While Guarding Stance is active: You cannot be moved, knocked prone, or teleported against your will. Enemies within 10 ft treat terrain as difficult. You have resistance to force damage.', false, 0, NULL),
        ('Oathknight', $1, 14, 'Reflective Aegis', 'Whenever you take damage, the source of the damage takes radiant damage equal to your CON modifier.', false, 0, NULL),
        ('Oathknight', $1, 17, 'Indestructible', 'When you would be reduced to 0 HP, instead drop to 1 HP. Twice per long rest. If triggered third time, drop to 1 HP and emit radiant burst: each enemy within 15 ft takes 4d10 radiant damage. Burst once per long rest.', false, 0, NULL),
        ('Oathknight', $1, 20, 'Avatar - Aegis Enhancement', 'While Avatar of the Oath is active: You are immune to all damage except psychic. Allies within 30 ft have resistance to all damage.', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `, [aegisId]);
    
    // Oath of the Vanguard features (checking if there are Vanguard skills in the skills table)
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Oathknight', $1, 3, 'Crushing Assault', 'When wielding a two-handed weapon, your critical hit range increases to 19-20. On critical hit, deal additional damage equal to your level.', false, 0, NULL),
        ('Oathknight', $1, 6, 'Vanguard Charge', 'When you move at least 15 feet straight toward a target and hit with melee weapon attack on same turn, deal additional 2d8 damage and target must make STR save (DC 8 + proficiency + STR) or be knocked prone.', false, 0, NULL),
        ('Oathknight', $1, 10, 'Devastating Strike', 'Once per turn when you hit with two-handed weapon, deal additional damage equal to twice your STR modifier. If target is Large or smaller, it is pushed 10 feet away.', false, 0, NULL),
        ('Oathknight', $1, 14, 'Unstoppable Momentum', 'When you reduce a creature to 0 HP with melee attack, you can immediately move up to half your speed and make one additional melee attack.', false, 0, NULL),
        ('Oathknight', $1, 17, 'Titan Strike', 'Once per short rest, make single melee attack that deals triple damage dice. If attack hits, all enemies within 10 feet of target take damage equal to your STR modifier + proficiency bonus.', false, 0, NULL),
        ('Oathknight', $1, 20, 'Avatar - Vanguard Enhancement', 'While Avatar of the Oath is active: Your movement speed doubles. You can make one additional attack each turn. Critical hits deal maximum damage plus normal roll.', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `, [vanguardId]);
    
    // Level 4, 8, 12, 16, 19 - ASI
    const asiLevels = [4, 8, 12, 16, 19];
    for (const level of asiLevels) {
      await client.query(`
        INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
        VALUES 
          ('Oathknight', NULL, $1, 'Ability Score Improvement', 'You can increase one ability score by 2, or you can increase two ability scores by 1. You can''t increase an ability score above 20 using this feature. Alternatively, you can take a feat.', true, 1, 'asi_or_feat')
        ON CONFLICT DO NOTHING
      `, [level]);
    }
    
    // Level 5
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Oathknight', NULL, 5, 'Extra Attack', 'You can attack twice, instead of once, whenever you take the Attack action on your turn.', false, 0, NULL),
        ('Oathknight', NULL, 5, 'Retributive Strike', 'Reaction when creature hits you with melee attack. Make one melee weapon attack against it. On hit, deal additional radiant damage equal to half your level + CON modifier. Use proficiency bonus times per long rest.', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `);
    
    // Level 7
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Oathknight', NULL, 7, 'Iron Will', 'When you fail a saving throw, you may choose to succeed instead. Once per long rest. At 14th level, twice per long rest.', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `);
    
    // Level 9
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Oathknight', NULL, 9, 'Bulwark Aura', 'Allies within 10 ft gain +1 AC and have advantage on saves against being frightened, charmed, or paralyzed. If you drop to 0 HP, this aura persists until start of your next turn.', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `);
    
    // Level 11
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Oathknight', NULL, 11, 'Juggernaut Fortitude', 'While Guarding Stance is active, you have resistance to all damage except psychic. You are immune to critical hits from nonmagical weapons.', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `);
    
    // Level 13
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Oathknight', NULL, 13, 'Stoneheart', 'While you are at or below half your max HP, you have advantage on all attack rolls and saving throws.', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `);
    
    // Level 15
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Oathknight', NULL, 15, 'Adamant Resolve', 'When reduced to 0 HP, you remain conscious and can act normally until end of your next turn. You automatically succeed on the first death saving throw you would make.', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `);
    
    // Level 18
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Oathknight', NULL, 18, 'Immortal Guard', 'Your max HP increases by 30. You are immune to poison, disease, and exhaustion. When you finish short rest, you regain HP equal to half your max HP.', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `);
    
    // Level 20
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Oathknight', NULL, 20, 'Avatar of the Oath', 'Bonus action for 1 minute, once per long rest. Gain resistance to all damage. Enemies within 15 ft have disadvantage on attacks vs creatures other than you. When you drop below half max HP, immediately regain 30 HP. Additional effects depend on your oath (see subclass features).', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `);
    
    await client.query('COMMIT');
    console.log('✅ Oathknight data populated successfully!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error populating Oathknight data:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

populateOathknightData();
