const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'dungeonlair',
  password: 'admin',
  port: 5432,
});

async function populateAllRemainingSubclasses() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('Adding all remaining subclasses and features...\n');
    
    // ========== CLERIC (LEVEL 1) ==========
    console.log('=== CLERIC ===');
    
    const lifeResult = await client.query(`
      INSERT INTO subclasses (class, name, description)
      VALUES ('Cleric', 'Life Domain', 'Master healer who protects and preserves life above all else.')
      ON CONFLICT (class, name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
    `);
    const warResult = await client.query(`
      INSERT INTO subclasses (class, name, description)
      VALUES ('Cleric', 'War Domain', 'Divine warrior who blesses those who fight for just causes.')
      ON CONFLICT (class, name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
    `);
    const trickeryResult = await client.query(`
      INSERT INTO subclasses (class, name, description)
      VALUES ('Cleric', 'Trickery Domain', 'Agent of deception and misdirection who values cunning over might.')
      ON CONFLICT (class, name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
    `);
    
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Cleric', $1, 1, 'Disciple of Life', 'Whenever you use a spell of 1st level or higher to restore hit points to a creature, the creature regains additional hit points equal to 2 + the spell level.', false, 0, NULL),
        ('Cleric', $2, 1, 'War Priest', 'When you use the Attack action, you can make one weapon attack as a bonus action. Use this feature WIS modifier times per long rest (minimum 1).', false, 0, NULL),
        ('Cleric', $3, 1, 'Blessing of the Trickster', 'Use your action to touch a willing creature and give it advantage on Stealth checks. Lasts 1 hour or until you use this feature again.', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `, [lifeResult.rows[0].id, warResult.rows[0].id, trickeryResult.rows[0].id]);
    console.log('✅ Cleric subclasses added\n');
    
    // ========== SORCERER (LEVEL 1) ==========
    console.log('=== SORCERER ===');
    
    const draconicResult = await client.query(`
      INSERT INTO subclasses (class, name, description)
      VALUES ('Sorcerer', 'Draconic Bloodline', 'Your innate magic comes from draconic ancestors, granting you dragon-like resilience and power.')
      ON CONFLICT (class, name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
    `);
    const wildResult = await client.query(`
      INSERT INTO subclasses (class, name, description)
      VALUES ('Sorcerer', 'Wild Magic', 'Your magic is chaotic and unpredictable, drawn from the raw forces of creation.')
      ON CONFLICT (class, name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
    `);
    const divineResult = await client.query(`
      INSERT INTO subclasses (class, name, description)
      VALUES ('Sorcerer', 'Divine Soul', 'Your magic is blessed by divine power, allowing you to heal and harm with equal ease.')
      ON CONFLICT (class, name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
    `);
    
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Sorcerer', $1, 1, 'Draconic Resilience', 'Your hit point maximum increases by 1 per sorcerer level. When not wearing armor, your AC equals 13 + DEX modifier.', false, 0, NULL),
        ('Sorcerer', $2, 1, 'Wild Magic Surge', 'When you cast a spell of 1st level or higher, roll d20. On a 1, roll on the Wild Magic Surge table for a random magical effect.', false, 0, NULL),
        ('Sorcerer', $3, 1, 'Divine Magic', 'You learn one additional cleric spell of your choice. This counts as a sorcerer spell for you. You also gain access to cleric spell list.', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `, [draconicResult.rows[0].id, wildResult.rows[0].id, divineResult.rows[0].id]);
    console.log('✅ Sorcerer subclasses added\n');
    
    // ========== WARLOCK (LEVEL 1) ==========
    console.log('=== WARLOCK ===');
    
    const fiendResult = await client.query(`
      INSERT INTO subclasses (class, name, description)
      VALUES ('Warlock', 'The Fiend', 'You have made a pact with a fiend from the lower planes, gaining dark powers in exchange for service.')
      ON CONFLICT (class, name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
    `);
    const archfeyResult = await client.query(`
      INSERT INTO subclasses (class, name, description)
      VALUES ('Warlock', 'The Archfey', 'Your patron is a lord or lady of the fey, granting you beguiling and mysterious powers.')
      ON CONFLICT (class, name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
    `);
    const oldOneResult = await client.query(`
      INSERT INTO subclasses (class, name, description)
      VALUES ('Warlock', 'The Great Old One', 'Your patron is a mysterious entity whose nature is unknowable, granting you power over minds.')
      ON CONFLICT (class, name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
    `);
    
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Warlock', $1, 1, 'Dark One''s Blessing', 'When you reduce a hostile creature to 0 hit points, you gain temporary hit points equal to CHA modifier + warlock level (minimum 1).', false, 0, NULL),
        ('Warlock', $2, 1, 'Fey Presence', 'As an action, cause each creature in a 10-foot cube centered on you to make a WIS save or become charmed/frightened until the end of your next turn. Once per short rest.', false, 0, NULL),
        ('Warlock', $3, 1, 'Awakened Mind', 'You can telepathically speak to any creature you can see within 30 feet. The creature understands you regardless of language.', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `, [fiendResult.rows[0].id, archfeyResult.rows[0].id, oldOneResult.rows[0].id]);
    console.log('✅ Warlock subclasses added\n');
    
    // ========== DRUID (LEVEL 2) ==========
    console.log('=== DRUID ===');
    
    const landResult = await client.query(`
      INSERT INTO subclasses (class, name, description)
      VALUES ('Druid', 'Circle of the Land', 'You draw power from the land itself, channeling the magic of forests, mountains, or other terrain.')
      ON CONFLICT (class, name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
    `);
    const moonResult = await client.query(`
      INSERT INTO subclasses (class, name, description)
      VALUES ('Druid', 'Circle of the Moon', 'You are a master of wild shape, able to transform into more powerful beasts.')
      ON CONFLICT (class, name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
    `);
    const dreamsResult = await client.query(`
      INSERT INTO subclasses (class, name, description)
      VALUES ('Druid', 'Circle of Dreams', 'You channel the magic of the Feywild, bringing healing and respite to your allies.')
      ON CONFLICT (class, name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
    `);
    
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Druid', $1, 2, 'Natural Recovery', 'During a short rest, recover some expended spell slots. The slots can have a combined level equal to or less than half your druid level (rounded up). Once per long rest.', false, 0, NULL),
        ('Druid', $2, 2, 'Combat Wild Shape', 'You can use Wild Shape as a bonus action. While in beast form, you can expend spell slots to heal yourself for 1d8 per spell slot level.', false, 0, NULL),
        ('Druid', $3, 2, 'Balm of the Summer Court', 'As a bonus action, spend uses of Wild Shape to restore hit points. Each use heals 1d6 per druid level, and the target gains temporary hit points equal to your druid level.', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `, [landResult.rows[0].id, moonResult.rows[0].id, dreamsResult.rows[0].id]);
    console.log('✅ Druid subclasses added\n');
    
    // ========== WIZARD (LEVEL 2) ==========
    console.log('=== WIZARD ===');
    
    const evocationResult = await client.query(`
      INSERT INTO subclasses (class, name, description)
      VALUES ('Wizard', 'School of Evocation', 'You focus on magic that creates powerful elemental effects and devastating blasts.')
      ON CONFLICT (class, name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
    `);
    const abjurationResult = await client.query(`
      INSERT INTO subclasses (class, name, description)
      VALUES ('Wizard', 'School of Abjuration', 'You specialize in protective magic, creating wards and barriers.')
      ON CONFLICT (class, name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
    `);
    const divinationResult = await client.query(`
      INSERT INTO subclasses (class, name, description)
      VALUES ('Wizard', 'School of Divination', 'You peer into the future and manipulate fate to aid your allies.')
      ON CONFLICT (class, name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
    `);
    
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Wizard', $1, 2, 'Sculpt Spells', 'When you cast an evocation spell, choose a number of creatures equal to 1 + spell level. They automatically succeed on their saves and take no damage if they would normally take half.', false, 0, NULL),
        ('Wizard', $2, 2, 'Arcane Ward', 'When you cast an abjuration spell, create a magical ward that has hit points equal to twice your wizard level + INT modifier. When you take damage, the ward takes the damage instead.', false, 0, NULL),
        ('Wizard', $3, 2, 'Portent', 'When you finish a long rest, roll two d20s. You can replace any attack roll, saving throw, or ability check made by you or a creature you can see with one of these rolls. Must decide before the roll.', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `, [evocationResult.rows[0].id, abjurationResult.rows[0].id, divinationResult.rows[0].id]);
    console.log('✅ Wizard subclasses added\n');
    
    // ========== BARD (LEVEL 3) ==========
    console.log('=== BARD ===');
    
    const loreResult = await client.query(`
      INSERT INTO subclasses (class, name, description)
      VALUES ('Bard', 'College of Lore', 'You have studied the songs and stories of ages past, gaining vast knowledge.')
      ON CONFLICT (class, name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
    `);
    const valorResult = await client.query(`
      INSERT INTO subclasses (class, name, description)
      VALUES ('Bard', 'College of Valor', 'You inspire others through deeds of daring and songs of valor.')
      ON CONFLICT (class, name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
    `);
    const glamourResult = await client.query(`
      INSERT INTO subclasses (class, name, description)
      VALUES ('Bard', 'College of Glamour', 'You have studied the magic of the Feywild, learning to entrance and inspire.')
      ON CONFLICT (class, name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
    `);
    
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Bard', $1, 3, 'Cutting Words', 'When a creature you can see makes an attack roll, ability check, or damage roll, use your reaction to subtract a Bardic Inspiration die from the roll. Must be within 60 feet and able to hear you.', false, 0, NULL),
        ('Bard', $2, 3, 'Combat Inspiration', 'A creature with your Bardic Inspiration can use the die to increase weapon damage or add to AC against one attack as a reaction.', false, 0, NULL),
        ('Bard', $3, 3, 'Mantle of Inspiration', 'As a bonus action, expend a Bardic Inspiration die. Choose CHA modifier creatures within 60 feet. Each gains temporary HP equal to the die roll and can move up to their speed as a reaction.', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `, [loreResult.rows[0].id, valorResult.rows[0].id, glamourResult.rows[0].id]);
    console.log('✅ Bard subclasses added\n');
    
    // ========== MONK (LEVEL 3) ==========
    console.log('=== MONK ===');
    
    const openHandResult = await client.query(`
      INSERT INTO subclasses (class, name, description)
      VALUES ('Monk', 'Way of the Open Hand', 'You are a master of unarmed combat techniques and martial arts.')
      ON CONFLICT (class, name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
    `);
    const shadowResult = await client.query(`
      INSERT INTO subclasses (class, name, description)
      VALUES ('Monk', 'Way of Shadow', 'You follow a tradition that values stealth and subterfuge, walking the path of the ninja.')
      ON CONFLICT (class, name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
    `);
    const elementsResult = await client.query(`
      INSERT INTO subclasses (class, name, description)
      VALUES ('Monk', 'Way of the Four Elements', 'You harness the elements through your ki, bending earth, air, fire, and water to your will.')
      ON CONFLICT (class, name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
    `);
    
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Monk', $1, 3, 'Open Hand Technique', 'When you hit with Flurry of Blows, impose one effect: knocked prone (DEX save), pushed 15 feet (STR save), or can''t take reactions until end of your next turn.', false, 0, NULL),
        ('Monk', $2, 3, 'Shadow Arts', 'You can spend 2 ki points to cast Darkness, Darkvision, Pass Without Trace, or Silence without material components. You can also cast Minor Illusion as a cantrip.', false, 0, NULL),
        ('Monk', $3, 3, 'Disciple of the Elements', 'Learn one elemental discipline of your choice. You learn additional disciplines as you level up. You can spend ki points to cast elemental spells.', true, 1, 'elemental_discipline')
      ON CONFLICT DO NOTHING
    `, [openHandResult.rows[0].id, shadowResult.rows[0].id, elementsResult.rows[0].id]);
    console.log('✅ Monk subclasses added\n');
    
    // ========== PALADIN (LEVEL 3) ==========
    console.log('=== PALADIN ===');
    
    const devotionResult = await client.query(`
      INSERT INTO subclasses (class, name, description)
      VALUES ('Paladin', 'Oath of Devotion', 'You are a beacon of justice and honor, upholding the ideals of righteousness.')
      ON CONFLICT (class, name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
    `);
    const ancientsResult = await client.query(`
      INSERT INTO subclasses (class, name, description)
      VALUES ('Paladin', 'Oath of the Ancients', 'You preserve the light and beauty of the world, standing against darkness.')
      ON CONFLICT (class, name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
    `);
    const vengeanceResult = await client.query(`
      INSERT INTO subclasses (class, name, description)
      VALUES ('Paladin', 'Oath of Vengeance', 'You are dedicated to punishing wrongdoers and delivering divine retribution.')
      ON CONFLICT (class, name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
    `);
    
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Paladin', $1, 3, 'Sacred Weapon', 'As an action, imbue your weapon with divine power for 1 minute. Add CHA modifier to attack rolls and the weapon emits bright light in 20-foot radius. Once per long rest.', false, 0, NULL),
        ('Paladin', $2, 3, 'Nature''s Wrath', 'Use Channel Divinity to cause spectral vines to ensnare a creature within 10 feet. Target makes STR or DEX save or is restrained. Uses your Channel Divinity.', false, 0, NULL),
        ('Paladin', $3, 3, 'Abjure Enemy', 'Use Channel Divinity to target one creature within 60 feet. Target makes WIS save or is frightened for 1 minute or until it takes damage. Fiends and undead have disadvantage on save.', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `, [devotionResult.rows[0].id, ancientsResult.rows[0].id, vengeanceResult.rows[0].id]);
    console.log('✅ Paladin subclasses added\n');
    
    // ========== RANGER (LEVEL 3) ==========
    console.log('=== RANGER ===');
    
    const hunterResult = await client.query(`
      INSERT INTO subclasses (class, name, description)
      VALUES ('Ranger', 'Hunter', 'You specialize in hunting down dangerous creatures, learning techniques to take down any prey.')
      ON CONFLICT (class, name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
    `);
    const beastMasterResult = await client.query(`
      INSERT INTO subclasses (class, name, description)
      VALUES ('Ranger', 'Beast Master', 'You form a deep bond with an animal companion that fights alongside you.')
      ON CONFLICT (class, name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
    `);
    const gloomResult = await client.query(`
      INSERT INTO subclasses (class, name, description)
      VALUES ('Ranger', 'Gloom Stalker', 'You are at home in the darkest places, striking from the shadows with deadly precision.')
      ON CONFLICT (class, name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
    `);
    
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES 
        ('Ranger', $1, 3, 'Hunter''s Prey', 'Choose one ability: Colossus Slayer (extra 1d8 damage to wounded targets), Giant Killer (reaction attack vs Large+), or Horde Breaker (extra attack against nearby enemy).', true, 1, 'hunters_prey'),
        ('Ranger', $2, 3, 'Ranger''s Companion', 'You gain a beast companion with CR 1/4 or lower. It obeys your commands and takes its turn on your initiative. You can use a bonus action to command it.', false, 0, NULL),
        ('Ranger', $3, 3, 'Dread Ambusher', 'On your first turn of combat, your speed increases by 10 feet and you can make one additional weapon attack. If you hit, add 1d8 damage.', false, 0, NULL)
      ON CONFLICT DO NOTHING
    `, [hunterResult.rows[0].id, beastMasterResult.rows[0].id, gloomResult.rows[0].id]);
    console.log('✅ Ranger subclasses added\n');
    
    await client.query('COMMIT');
    console.log('\n' + '='.repeat(80));
    console.log('✅ ALL REMAINING SUBCLASSES AND FEATURES ADDED SUCCESSFULLY!');
    console.log('='.repeat(80));
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error adding subclasses:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

populateAllRemainingSubclasses();
