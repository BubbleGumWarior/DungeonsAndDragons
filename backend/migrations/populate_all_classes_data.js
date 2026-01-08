const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'dungeonlair',
  password: 'admin',
  port: 5432,
});

async function populateAllClassesData() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('Adding Reaver subclasses...');
    
    // Reaver subclasses
    const whirlwindResult = await client.query(`
      INSERT INTO subclasses (class, name, description)
      VALUES ($1, $2, $3)
      ON CONFLICT (class, name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
    `, ['Reaver', 'Path of the Whirlwind', 'Masters of relentless offense and motion, Whirlwind Reavers are devastating attackers who never stop moving.']);
    const whirlwindId = whirlwindResult.rows[0].id;
    
    const phantomResult = await client.query(`
      INSERT INTO subclasses (class, name, description)
      VALUES ($1, $2, $3)
      ON CONFLICT (class, name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
    `, ['Reaver', 'Path of the Phantom', 'Shadow-dancers who combine teleportation with deadly strikes from the darkness.']);
    const phantomId = phantomResult.rows[0].id;
    
    const sentinelResult = await client.query(`
      INSERT INTO subclasses (class, name, description)
      VALUES ($1, $2, $3)
      ON CONFLICT (class, name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
    `, ['Reaver', 'Path of the Sentinel', 'Protective warriors who control the battlefield with precise throws and defensive positioning.']);
    const sentinelId = sentinelResult.rows[0].id;
    
    console.log('Adding Reaver class features...');
    
    // Reaver base features
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Reaver', NULL, 1, 'Blade Savant', 'You may draw any number of daggers or shuriken as part of an attack. Thrown daggers count as magical and have their normal range increased by +20 ft.', false, 0, NULL),
        ('Reaver', NULL, 1, 'Swift Draw', 'When you take the Attack action using a thrown dagger, you may make one additional thrown dagger attack as a bonus action.', false, 0, NULL),
        ('Reaver', NULL, 2, 'Recall Blades', 'You magically recall all daggers and shuriken you have thrown within 120 ft. They teleport instantly back into your hands or a container you choose. Use WIS modifier times per short rest.', false, 0, NULL),
        ('Reaver', NULL, 3, 'Reaver Path', 'Choose your path that shapes your fighting style.', true, 1, 'subclass'),
        ('Reaver', NULL, 5, 'Extra Attack', 'You can attack twice, instead of once, whenever you take the Attack action on your turn.', false, 0, NULL),
        ('Reaver', NULL, 5, 'Twin Throw', 'When you make a thrown weapon attack, you may throw two daggers instead of one. Make one attack roll. On a hit, both daggers hit.', false, 0, NULL),
        ('Reaver', NULL, 5, 'Quickstep', 'After making a thrown weapon attack, you may move 10 ft without provoking opportunity attacks.', false, 0, NULL),
        ('Reaver', NULL, 7, 'Ricochet Strike', 'Once per turn when you miss with a thrown dagger, you may redirect it to a creature within 10 ft of the original target.', false, 0, NULL),
        ('Reaver', NULL, 9, 'Blade Storm', 'You throw a storm of blades at every enemy of your choice within 30 ft. Once per long rest.', false, 0, NULL),
        ('Reaver', NULL, 11, 'Unerring Precision', 'Your thrown attacks ignore half and three-quarters cover. On a critical hit, add your Wisdom modifier to damage.', false, 0, NULL),
        ('Reaver', NULL, 13, 'Dancing Death', 'When a creature enters or leaves your melee range, you may make a thrown dagger attack against it as a reaction.', false, 0, NULL),
        ('Reaver', NULL, 15, 'Flow of Steel', 'When you reduce a creature to 0 HP with a thrown weapon, you may immediately use Recall Blades without expending a use and make one additional thrown attack.', false, 0, NULL),
        ('Reaver', NULL, 18, 'Shadow Recall', 'When you use Recall Blades, you may instead teleport to the location of one recalled dagger.', false, 0, NULL),
        ('Reaver', NULL, 20, 'Avatar of the Blade', 'All thrown weapons automatically return at end of your turn. You may throw three daggers per attack. Gain advantage on all thrown weapon attacks. Duration: 1 minute, once per long rest.', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `);
    
    // Whirlwind path
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Reaver', $1, 3, 'Relentless Motion', 'When you hit with a thrown weapon, you may move 5 ft without provoking opportunity attacks. This stacks with Quickstep.', false, 0, NULL),
        ('Reaver', $1, 6, 'Whirling Strikes', 'When you use Twin Throw, you may throw a third dagger. Gain +2 to attack rolls when throwing at advantage.', false, 0, NULL),
        ('Reaver', $1, 10, 'Storm of Blades Enhancement', 'You may use Blade Storm twice per long rest. Additionally, you move at double speed until the end of your next turn after using it.', false, 0, NULL),
        ('Reaver', $1, 14, 'Cyclone Strike', 'Once per turn when you move at least 20 ft, your next thrown attack deals an extra 2d6 damage.', false, 0, NULL),
        ('Reaver', $1, 17, 'Eye of the Storm', 'You have advantage on Dexterity saves. When you use Avatar of the Blade, you may move 10 ft after each attack.', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `, [whirlwindId]);
    
    // ASI levels for Reaver
    const reaverAsiLevels = [4, 8, 12, 16, 19];
    for (const level of reaverAsiLevels) {
      await client.query(`
        INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
        VALUES ('Reaver', NULL, $1, 'Ability Score Improvement', 'Increase one ability score by 2, or two ability scores by 1, or take a feat.', true, 1, 'asi_or_feat')
        ON CONFLICT DO NOTHING
      `, [level]);
    }
    
    console.log('Adding Fighter subclasses...');
    
    // Fighter subclasses
    const championResult = await client.query(`
      INSERT INTO subclasses (class, name, description)
      VALUES ($1, $2, $3)
      ON CONFLICT (class, name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
    `, ['Fighter', 'Champion', 'Masters of physical combat who improve their critical strikes and enhance their athletic prowess.']);
    const championId = championResult.rows[0].id;
    
    const battleMasterResult = await client.query(`
      INSERT INTO subclasses (class, name, description)
      VALUES ($1, $2, $3)
      ON CONFLICT (class, name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
    `, ['Fighter', 'Battle Master', 'Tactical fighters who use combat maneuvers to control the battlefield.']);
    const battleMasterId = battleMasterResult.rows[0].id;
    
    console.log('Adding Fighter class features...');
    
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Fighter', NULL, 1, 'Fighting Style', 'Choose a fighting style: Archery (+2 to ranged attacks), Defense (+1 AC in armor), Dueling (+2 damage with one-handed weapon), Great Weapon Fighting (reroll 1s and 2s on damage dice), or Two-Weapon Fighting (add ability modifier to off-hand attack).', true, 1, 'fighting_style'),
        ('Fighter', NULL, 1, 'Second Wind', 'Regain 1d10 + fighter level HP as a bonus action. Once per short rest.', false, 0, NULL),
        ('Fighter', NULL, 2, 'Action Surge', 'Take one additional action on your turn. Once per short rest. Twice at level 17.', false, 0, NULL),
        ('Fighter', NULL, 3, 'Martial Archetype', 'Choose your combat specialization.', true, 1, 'subclass'),
        ('Fighter', NULL, 5, 'Extra Attack', 'Attack twice when you take the Attack action. Three times at level 11, four times at level 20.', false, 0, NULL),
        ('Fighter', NULL, 9, 'Indomitable', 'Reroll a failed saving throw. Once per long rest. Twice at level 13, three times at level 17.', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `);
    
    // Champion features
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Fighter', $1, 3, 'Improved Critical', 'Your weapon attacks score a critical hit on a roll of 19 or 20.', false, 0, NULL),
        ('Fighter', $1, 7, 'Remarkable Athlete', 'Add half your proficiency bonus to STR, DEX, or CON checks you are not proficient in. Increase your running long jump distance by a number of feet equal to your Strength modifier.', false, 0, NULL),
        ('Fighter', $1, 10, 'Additional Fighting Style', 'Choose a second fighting style.', true, 1, 'fighting_style'),
        ('Fighter', $1, 15, 'Superior Critical', 'Your weapon attacks score a critical hit on a roll of 18-20.', false, 0, NULL),
        ('Fighter', $1, 18, 'Survivor', 'Regain 5 + CON modifier HP at the start of your turn if you have less than half your HP remaining and are not at 0 HP.', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `, [championId]);
    
    // Battle Master features
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Fighter', $1, 3, 'Combat Superiority', 'Learn 3 maneuvers and gain 4 superiority dice (d8). You regain all dice after a short rest.', true, 3, 'maneuvers'),
        ('Fighter', $1, 7, 'Know Your Enemy', 'Spend 1 minute observing a creature to learn if it is your equal, superior, or inferior in two characteristics: STR, DEX, CON, AC, current HP, total class levels, or fighter class levels.', false, 0, NULL),
        ('Fighter', $1, 10, 'Improved Combat Superiority', 'Your superiority dice become d10s. Learn 2 additional maneuvers.', true, 2, 'maneuvers'),
        ('Fighter', $1, 15, 'Relentless', 'When you roll initiative and have no superiority dice remaining, you regain 1 die.', false, 0, NULL),
        ('Fighter', $1, 18, 'Superior Combat Superiority', 'Your superiority dice become d12s. Gain 2 additional superiority dice.', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `, [battleMasterId]);
    
    // Fighter ASI
    const fighterAsiLevels = [4, 6, 8, 12, 14, 16, 19];
    for (const level of fighterAsiLevels) {
      await client.query(`
        INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
        VALUES ('Fighter', NULL, $1, 'Ability Score Improvement', 'Increase one ability score by 2, or two ability scores by 1, or take a feat.', true, 1, 'asi_or_feat')
        ON CONFLICT DO NOTHING
      `, [level]);
    }
    
    // Add remaining standard classes with simplified features
    console.log('Adding remaining standard classes...');
    
    // Rogue
    const assassinResult = await client.query(`
      INSERT INTO subclasses (class, name, description)
      VALUES ('Rogue', 'Assassin', 'Masters of stealth and instant death.')
      ON CONFLICT (class, name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
    `);
    
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Rogue', NULL, 1, 'Expertise', 'Choose two skills. Your proficiency bonus is doubled for any ability check using those skills.', true, 2, 'expertise'),
        ('Rogue', NULL, 1, 'Sneak Attack', 'Deal extra 1d6 damage when you have advantage or an ally is within 5 ft of target. Increases to 2d6 at 3rd, 3d6 at 5th, etc.', false, 0, NULL),
        ('Rogue', NULL, 2, 'Cunning Action', 'Use bonus action to Dash, Disengage, or Hide.', false, 0, NULL),
        ('Rogue', NULL, 3, 'Roguish Archetype', 'Choose your specialization.', true, 1, 'subclass'),
        ('Rogue', NULL, 5, 'Uncanny Dodge', 'Use reaction to halve damage from an attack you can see.', false, 0, NULL),
        ('Rogue', NULL, 7, 'Evasion', 'Take no damage on successful DEX save (instead of half), half damage on failed save.', false, 0, NULL),
        ('Rogue', NULL, 11, 'Reliable Talent', 'Treat any d20 roll of 9 or lower as a 10 for ability checks using skills you are proficient in.', false, 0, NULL),
        ('Rogue', NULL, 14, 'Blindsense', 'If you can hear, you know the location of hidden or invisible creatures within 10 ft.', false, 0, NULL),
        ('Rogue', NULL, 15, 'Slippery Mind', 'Gain proficiency in Wisdom saving throws.', false, 0, NULL),
        ('Rogue', NULL, 18, 'Elusive', 'No attack roll has advantage against you while you are not incapacitated.', false, 0, NULL),
        ('Rogue', NULL, 20, 'Stroke of Luck', 'Turn a miss into a hit or a failed ability check into a 20. Once per short rest.', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `);
    
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Rogue', $1, 3, 'Assassinate', 'Advantage on attacks against creatures that have not yet acted. Any hit against a surprised creature is a critical hit.', false, 0, NULL),
        ('Rogue', $1, 9, 'Infiltration Expertise', 'You can create false identities that are nearly impossible to detect.', false, 0, NULL),
        ('Rogue', $1, 13, 'Impostor', 'Mimic another persons speech, writing, and behavior. Creatures have disadvantage on checks to detect the ruse.', false, 0, NULL),
        ('Rogue', $1, 17, 'Death Strike', 'When you attack and hit a surprised creature, it must make a CON save (DC 8 + DEX + proficiency) or double the damage of your attack.', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `, [assassinResult.rows[0].id]);
    
    const rogueAsiLevels = [4, 8, 10, 12, 16, 19];
    for (const level of rogueAsiLevels) {
      await client.query(`
        INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
        VALUES ('Rogue', NULL, $1, 'Ability Score Improvement', 'Increase one ability score by 2, or two ability scores by 1, or take a feat.', true, 1, 'asi_or_feat')
        ON CONFLICT DO NOTHING
      `, [level]);
    }
    
    await client.query('COMMIT');
    console.log('✅ All class data populated successfully!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error populating class data:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = populateAllClassesData;

// Auto-execute only if run directly
if (require.main === module) {
  populateAllClassesData();
}
