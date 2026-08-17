const { pool } = require('../models/database');

// Eldritch Blast is a cantrip that gains additional beams as the Warlock levels up
// (2 beams at 5th, 3 beams at 11th, 4 beams at 17th — RAW 5e). Previously this was a
// single static skill row whose description mentioned the scaling but never actually
// changed on a character's sheet. This migration adds one skill row per beam tier so
// the level-up route (see routes/skills.js) can swap the character's Eldritch Blast
// skill for the upgraded tier when they hit the relevant level.
const addEldritchBlastScaling = async () => {
  try {
    console.log('Adding Eldritch Blast beam-tier skills...');

    // Clarify the base (1-beam) skill now that scaling is handled via separate tiers
    await pool.query(`
      UPDATE skills
      SET description = 'A beam of crackling energy streaks toward a creature within range. Make a ranged spell attack. On a hit, the target takes 1d10 force damage. This cantrip gains additional beams as you gain levels (see Eldritch Blast upgrades at 5th, 11th, and 17th level).',
          damage_dice = '1d10'
      WHERE name = 'Eldritch Blast'
    `);

    const tiers = [
      {
        name: 'Eldritch Blast (2 Beams)',
        level: 5,
        dice: '2d10',
        description: 'A beam of crackling energy streaks toward a creature within range. Make a ranged spell attack. On a hit, the target takes 1d10 force damage. At 5th level, Eldritch Blast fires two beams — you can direct them at the same target or different targets, each requiring a separate attack roll.'
      },
      {
        name: 'Eldritch Blast (3 Beams)',
        level: 11,
        dice: '3d10',
        description: 'A beam of crackling energy streaks toward a creature within range. Make a ranged spell attack. On a hit, the target takes 1d10 force damage. At 11th level, Eldritch Blast fires three beams — you can direct them at the same target or different targets, each requiring a separate attack roll.'
      },
      {
        name: 'Eldritch Blast (4 Beams)',
        level: 17,
        dice: '4d10',
        description: 'A beam of crackling energy streaks toward a creature within range. Make a ranged spell attack. On a hit, the target takes 1d10 force damage. At 17th level, Eldritch Blast fires four beams — you can direct them at the same target or different targets, each requiring a separate attack roll.'
      }
    ];

    for (const tier of tiers) {
      await pool.query(`
        INSERT INTO skills (name, description, damage_dice, damage_type, range_size, usage_frequency, level_requirement, class_restriction)
        VALUES ($1, $2, $3, 'Force', '120 feet', 'At will (cantrip)', $4, 'Warlock')
        ON CONFLICT (name) DO UPDATE SET
          description = EXCLUDED.description,
          damage_dice = EXCLUDED.damage_dice,
          level_requirement = EXCLUDED.level_requirement
      `, [tier.name, tier.description, tier.dice, tier.level]);
    }

    console.log('✅ Eldritch Blast beam-tier skills added');
  } catch (error) {
    console.error('Error adding Eldritch Blast scaling:', error);
    throw error;
  }
};

module.exports = addEldritchBlastScaling;
