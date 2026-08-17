const { pool } = require('../models/database');

// Eldritch Blast already has one skill row per beam-count tier (1/2/3/4 beams, from
// add_eldritch_blast_scaling.js). Two invocations specifically rewrite the cantrip itself
// rather than adding a passive feature: Agonizing Blast (adds CHA modifier to each beam's
// damage) and Repelling Blast (each hit can push the target 10 ft). Previously picking
// either just granted a separate "Eldritch Invocations" flavor skill describing them —
// the character's actual Eldritch Blast entry never changed. This migration adds one
// combined skill row for every {beam count} x {Agonizing?} x {Repelling?} combination so
// routes/skills.js can swap the character's Eldritch Blast for the exact variant that
// matches their level and invocations, instead of a static description.
const addEldritchBlastInvocationVariants = async () => {
  try {
    console.log('Adding Eldritch Blast + invocation combo skills...');

    const buildName = (beams, agonizing, repelling) => {
      const parts = [];
      if (beams > 1) parts.push(`${beams} Beams`);
      if (agonizing) parts.push('Agonizing');
      if (repelling) parts.push('Repelling');
      if (parts.length === 0) return 'Eldritch Blast';
      return `Eldritch Blast (${parts.join(', ')})`;
    };

    const buildDescription = (beams, agonizing, repelling) => {
      let desc = `A beam of crackling energy streaks toward a creature within range. Make a ranged spell attack. On a hit, the target takes 1d10 force damage${agonizing ? ', plus your Charisma modifier' : ''}.`;
      if (beams > 1) {
        desc += ` This cantrip fires ${beams} beams — you can direct them at the same target or different targets, each requiring a separate attack roll${agonizing ? ' (each beam adds your Charisma modifier)' : ''}.`;
      }
      if (repelling) {
        desc += ` Whenever you hit a creature with this spell, you can push it up to 10 feet away from you in a straight line (Repelling Blast).`;
      }
      return desc;
    };

    // skills.damage_dice is VARCHAR(20) — keep this compact (the full "+ your Charisma
    // modifier per beam" explanation lives in the description instead).
    const buildDamageDice = (beams, agonizing) => {
      const base = `${beams}d10`;
      return agonizing ? `${base}+CHA` : base;
    };

    let count = 0;
    for (const beams of [1, 2, 3, 4]) {
      for (const agonizing of [false, true]) {
        for (const repelling of [false, true]) {
          const name = buildName(beams, agonizing, repelling);
          await pool.query(`
            INSERT INTO skills (name, description, damage_dice, damage_type, range_size, usage_frequency, level_requirement, class_restriction)
            VALUES ($1, $2, $3, 'Force', '120 feet', 'At will (cantrip)', 1, 'Warlock')
            ON CONFLICT (name) DO UPDATE SET
              description = EXCLUDED.description,
              damage_dice = EXCLUDED.damage_dice
          `, [name, buildDescription(beams, agonizing, repelling), buildDamageDice(beams, agonizing)]);
          count++;
        }
      }
    }

    console.log(`✅ Eldritch Blast combo skills added (${count} variants)`);
  } catch (error) {
    console.error('Error adding Eldritch Blast invocation variants:', error);
    throw error;
  }
};

module.exports = addEldritchBlastInvocationVariants;
