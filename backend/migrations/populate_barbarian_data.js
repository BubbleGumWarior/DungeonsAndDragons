const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'dungeonlair',
  password: 'admin',
  port: 5432,
});

async function populateBarbarianData() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('Adding Barbarian subclasses...');
    
    // Path of the Berserker
    const berserkerResult = await client.query(`
      INSERT INTO subclasses (class, name, description)
      VALUES ($1, $2, $3)
      ON CONFLICT (class, name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
    `, [
      'Barbarian',
      'Path of the Berserker',
      'For some barbarians, rage is a means to an end—that end being violence. The Path of the Berserker is a path of untrammeled fury, slick with blood. As you enter the berserker\'s rage, you thrill in the chaos of battle, heedless of your own health or well-being.'
    ]);
    const berserkerId = berserkerResult.rows[0].id;
    
    // Path of the Totem Warrior
    const totemResult = await client.query(`
      INSERT INTO subclasses (class, name, description)
      VALUES ($1, $2, $3)
      ON CONFLICT (class, name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
    `, [
      'Barbarian',
      'Path of the Totem Warrior',
      'The Path of the Totem Warrior is a spiritual journey, as the barbarian accepts a spirit animal as guide, protector, and inspiration. In battle, your totem spirit fills you with supernatural might, adding magical fuel to your barbarian rage.'
    ]);
    const totemId = totemResult.rows[0].id;
    
    console.log('Adding Barbarian class features...');
    
    // Level 1 features
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Barbarian', NULL, 1, 'Rage', 'In battle, you fight with primal ferocity. On your turn, you can enter a rage as a bonus action. While raging, you gain +2 to damage rolls with melee weapons and advantage on Strength checks and saves. You have resistance to bludgeoning, piercing, and slashing damage. You can rage 2 times per long rest.', false, 0, NULL),
        ('Barbarian', NULL, 1, 'Unarmored Defense', 'While you are not wearing any armor, your Armor Class equals 10 + your Dexterity modifier + your Constitution modifier. You can use a shield and still gain this benefit.', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `);
    
    // Level 2
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Barbarian', NULL, 2, 'Reckless Attack', 'You can throw aside all concern for defense to attack with fierce desperation. When you make your first attack on your turn, you can decide to attack recklessly. Doing so gives you advantage on melee weapon attack rolls during this turn, but attack rolls against you have advantage until your next turn.', false, 0, NULL),
        ('Barbarian', NULL, 2, 'Danger Sense', 'You gain an uncanny sense of when things nearby aren''t as they should be, giving you an edge when you dodge away from danger. You have advantage on Dexterity saving throws against effects that you can see, such as traps and spells.', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `);
    
    // Level 3 - Subclass choice
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Barbarian', NULL, 3, 'Primal Path', 'You choose a path that shapes the nature of your rage. Your choice grants you features at 3rd level and again at 6th, 10th, and 14th levels.', true, 1, 'subclass')
      ON CONFLICT DO NOTHING
    `);
    
    // Path of the Berserker features
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Barbarian', $1, 3, 'Frenzy', 'You can go into a frenzy when you rage. If you do so, for the duration of your rage you can make a single melee weapon attack as a bonus action on each of your turns after this one. When your rage ends, you suffer one level of exhaustion.', false, 0, NULL),
        ('Barbarian', $1, 6, 'Mindless Rage', 'You can''t be charmed or frightened while raging. If you are charmed or frightened when you enter your rage, the effect is suspended for the duration of the rage.', false, 0, NULL),
        ('Barbarian', $1, 10, 'Intimidating Presence', 'You can use your action to frighten someone with your menacing presence. Choose one creature that you can see within 30 feet. If the creature can see or hear you, it must succeed on a Wisdom saving throw (DC 8 + proficiency + Charisma modifier) or be frightened of you until the end of your next turn.', false, 0, NULL),
        ('Barbarian', $1, 14, 'Retaliation', 'When you take damage from a creature that is within 5 feet of you, you can use your reaction to make a melee weapon attack against that creature.', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `, [berserkerId]);
    
    // Path of the Totem Warrior features
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Barbarian', $1, 3, 'Totem Spirit', 'Choose a totem spirit: Bear (resistance to all damage except psychic while raging), Eagle (opportunity attacks against you have disadvantage, dash as bonus action while raging), or Wolf (allies have advantage on attacks against enemies within 5 feet of you while raging).', true, 1, 'totem_spirit'),
        ('Barbarian', $1, 6, 'Aspect of the Beast', 'Choose an aspect: Bear (double carrying capacity, advantage on Strength checks to push/pull/lift/break), Eagle (see up to 1 mile with no difficulty, dim light doesn''t impose disadvantage on Perception), or Wolf (track creatures while traveling at fast pace, move stealthily at normal pace).', true, 1, 'aspect_beast'),
        ('Barbarian', $1, 10, 'Spirit Walker', 'You can cast the commune with nature spell, but only as a ritual. When you do so, a spiritual version of one of the animals you chose for Totem Spirit or Aspect of the Beast appears to you to convey the information you seek.', false, 0, NULL),
        ('Barbarian', $1, 14, 'Totemic Attunement', 'Choose an attunement: Bear (enemies within 5 feet have disadvantage on attacks against targets other than you), Eagle (use bonus action to fly up to 80 feet without provoking opportunity attacks), or Wolf (use bonus action to knock Large or smaller prone on melee hit).', true, 1, 'totemic_attunement')
      ON CONFLICT DO NOTHING
    `, [totemId]);
    
    // Level 4, 8, 12, 16, 19 - ASI
    const asiLevels = [4, 8, 12, 16, 19];
    for (const level of asiLevels) {
      await client.query(`
        INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
        VALUES 
          ('Barbarian', NULL, $1, 'Ability Score Improvement', 'You can increase one ability score by 2, or you can increase two ability scores by 1. You can''t increase an ability score above 20 using this feature. Alternatively, you can take a feat.', true, 1, 'asi_or_feat')
        ON CONFLICT DO NOTHING
      `, [level]);
    }
    
    // Level 5
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Barbarian', NULL, 5, 'Extra Attack', 'You can attack twice, instead of once, whenever you take the Attack action on your turn.', false, 0, NULL),
        ('Barbarian', NULL, 5, 'Fast Movement', 'Your speed increases by 10 feet while you aren''t wearing heavy armor.', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `);
    
    // Level 7
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Barbarian', NULL, 7, 'Feral Instinct', 'Your instincts are so honed that you have advantage on initiative rolls. Additionally, if you are surprised at the beginning of combat and aren''t incapacitated, you can act normally on your first turn, but only if you enter your rage before doing anything else.', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `);
    
    // Level 9
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Barbarian', NULL, 9, 'Brutal Critical (1 die)', 'You can roll one additional weapon damage die when determining the extra damage for a critical hit with a melee attack.', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `);
    
    // Level 11
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Barbarian', NULL, 11, 'Relentless Rage', 'Your rage can keep you fighting despite grievous wounds. If you drop to 0 hit points while raging and don''t die outright, you can make a DC 10 Constitution saving throw. If you succeed, you drop to 1 hit point instead. Each time you use this feature after the first, the DC increases by 5. The DC resets to 10 when you finish a short or long rest.', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `);
    
    // Level 13
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Barbarian', NULL, 13, 'Brutal Critical (2 dice)', 'You can roll two additional weapon damage dice when determining the extra damage for a critical hit with a melee attack.', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `);
    
    // Level 15
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Barbarian', NULL, 15, 'Persistent Rage', 'Your rage is so fierce that it ends early only if you fall unconscious or if you choose to end it.', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `);
    
    // Level 17
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Barbarian', NULL, 17, 'Brutal Critical (3 dice)', 'You can roll three additional weapon damage dice when determining the extra damage for a critical hit with a melee attack.', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `);
    
    // Level 18
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Barbarian', NULL, 18, 'Indomitable Might', 'If your total for a Strength check is less than your Strength score, you can use that score in place of the total.', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `);
    
    // Level 20
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Barbarian', NULL, 20, 'Primal Champion', 'You embody the power of the wilds. Your Strength and Constitution scores increase by 4. Your maximum for those scores is now 24.', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `);
    
    await client.query('COMMIT');
    console.log('✅ Barbarian data populated successfully!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error populating Barbarian data:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

populateBarbarianData();
