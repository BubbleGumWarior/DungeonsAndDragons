const { pool } = require('../models/database');

// Fills in the gaps left in the Warlock's level-up progression:
//  - Ability Score Improvement at 4th/8th/12th/16th/19th (previously entirely absent —
//    Warlock was the only spellcaster with zero class_features rows for ASI)
//  - An actual recorded choice for Pact Boon at 3rd level (was flavor-text only before)
//  - An actual recorded choice each time known Eldritch Invocations grows
//    (2nd, 5th, 7th, 9th, 12th, 15th, 18th — count matches classInfo.ts)
//  - Mystic Arcanum tiers at 13th/15th/17th (previously only the 11th-level arcanum existed;
//    higher tiers were mentioned in flavor text but never actually granted)
const addWarlockFullProgression = async () => {
  try {
    console.log('Adding full Warlock level-up progression...');

    // --- Ability Score Improvement (reuses the same interactive UI as Fighter/Rogue) ---
    const asiLevels = [4, 8, 12, 16, 19];
    for (const level of asiLevels) {
      await pool.query(`
        INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
        VALUES ('Warlock', NULL, $1, 'Ability Score Improvement', 'Increase one ability score by 2, or two ability scores by 1, or take a feat.', true, 1, 'asi_or_feat')
        ON CONFLICT DO NOTHING
      `, [level]);
    }

    // --- Pact Boon: record which boon was actually chosen ---
    await pool.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES ('Warlock', NULL, 3, 'Pact Boon Choice', 'Choose one: Pact of the Chain (gain a powerful familiar), Pact of the Blade (summon a magical melee weapon), or Pact of the Tome (gain a grimoire with extra cantrips and rituals).', true, 1, 'pact_boon')
      ON CONFLICT DO NOTHING
    `);

    // --- Eldritch Invocations: record what was learned every time the known count grows ---
    const invocationLevels = [
      { level: 2, gained: 2 },
      { level: 5, gained: 1 },
      { level: 7, gained: 1 },
      { level: 9, gained: 1 },
      { level: 12, gained: 1 },
      { level: 15, gained: 1 },
      { level: 18, gained: 1 }
    ];
    for (const { level, gained } of invocationLevels) {
      await pool.query(`
        INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
        VALUES ('Warlock', NULL, $1, 'Eldritch Invocation Choice', $2, true, $3, 'invocation')
        ON CONFLICT DO NOTHING
      `, [
        level,
        `Learn ${gained} new eldritch invocation${gained > 1 ? 's' : ''}. Popular options: Agonizing Blast, Armor of Shadows, Devil's Sight, Mask of Many Faces, Misty Visions, Repelling Blast, Thirsting Blade, Eldritch Sight, Book of Ancient Secrets, Voice of the Chain Master, Lifedrinker. Some require prerequisites like pact boons or warlock level.`,
        gained
      ]);
    }

    // --- Mystic Arcanum higher tiers (7th/8th/9th-level spell secrets) ---
    // Named without parentheses so the general skill-granting fallback in routes/skills.js
    // picks them up automatically (parenthesized names are reserved for subclass-flavored skills).
    const arcanumTiers = [
      { name: '7th-Level Mystic Arcanum', level: 13, spellLevel: '7th' },
      { name: '8th-Level Mystic Arcanum', level: 15, spellLevel: '8th' },
      { name: '9th-Level Mystic Arcanum', level: 17, spellLevel: '9th' }
    ];
    for (const tier of arcanumTiers) {
      await pool.query(`
        INSERT INTO skills (name, description, damage_dice, damage_type, range_size, usage_frequency, level_requirement, class_restriction)
        VALUES ($1, $2, 'Varies', 'Varies', 'Varies', '1 per long rest', $3, 'Warlock')
        ON CONFLICT (name) DO UPDATE SET
          description = EXCLUDED.description,
          level_requirement = EXCLUDED.level_requirement
      `, [
        tier.name,
        `Your patron bestows another arcanum. Choose one ${tier.spellLevel}-level spell from the warlock spell list as this arcanum. You can cast it once without expending a spell slot, regaining the ability after a long rest.`,
        tier.level
      ]);
    }

    console.log('✅ Warlock full progression added');
  } catch (error) {
    console.error('Error adding Warlock full progression:', error);
    throw error;
  }
};

module.exports = addWarlockFullProgression;
