const { pool } = require('../models/database');

async function addCharlatanClass() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Adding Charlatan class data...');

    // ── Subclasses ──────────────────────────────────────────────────────────
    const checkSubclasses = await client.query(`
      SELECT COUNT(*) as count FROM subclasses WHERE class = 'Charlatan'
    `);

    let highRollerId, phantomJokerId, pyrotechnicianId;

    if (parseInt(checkSubclasses.rows[0].count) > 0) {
      console.log('Charlatan subclasses already exist, fetching IDs...');
      const existing = await client.query(`SELECT id, name FROM subclasses WHERE class = 'Charlatan'`);
      existing.rows.forEach(row => {
        if (row.name === 'The High Roller')      highRollerId      = row.id;
        if (row.name === 'The Phantom Joker')    phantomJokerId    = row.id;
        if (row.name === 'The Pyrotechnician')   pyrotechnicianId  = row.id;
      });
    } else {
      console.log('Inserting Charlatan subclasses...');
      const hr = await client.query(`
        INSERT INTO subclasses (class, name, description)
        VALUES ('Charlatan', 'The High Roller', 'Masters of probability and impossible fortune. Bend luck itself — reduce enemy crit ranges, reroll failures, and eventually declare automatic executions.')
        RETURNING id
      `);
      highRollerId = hr.rows[0].id;

      const pj = await client.query(`
        INSERT INTO subclasses (class, name, description)
        VALUES ('Charlatan', 'The Phantom Joker', 'Illusion without magic — smoke, mirrors, and speed. Create decoys, vanish into shadows, and teleport across the battlefield.')
        RETURNING id
      `);
      phantomJokerId = pj.rows[0].id;

      const py = await client.query(`
        INSERT INTO subclasses (class, name, description)
        VALUES ('Charlatan', 'The Pyrotechnician', 'Carnival explosives and trick gadget specialist. Rig the battlefield with explosive cards, smoke bombs, and a grand finale that levels the arena.')
        RETURNING id
      `);
      pyrotechnicianId = py.rows[0].id;
    }

    // ── Base class features ─────────────────────────────────────────────────
    const checkFeatures = await client.query(`
      SELECT COUNT(*) as count FROM class_features WHERE class = 'Charlatan' AND subclass_id IS NULL
    `);

    if (parseInt(checkFeatures.rows[0].count) > 0) {
      console.log('Charlatan base features already exist, skipping...');
    } else {
      console.log('Inserting Charlatan base features...');
      await client.query(`
        INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
        VALUES
          ('Charlatan', NULL, 1, 'Read the Room',
           'You may use Charisma instead of Wisdom for Insight and Perception checks. Spend 1 Trick to gain advantage on Perception or Insight, or to impose disadvantage on a creature attempting to Insight you.',
           false, 0, NULL),
          ('Charlatan', NULL, 1, 'Card Throw',
           'You treat a deck of cards as a finesse ranged weapon (Range 30/90, Damage 1d6 slashing). Use DEX or CHA for attack and damage. Damage scales: 1d8 at level 5, 1d10 at level 11, 1d12 at level 17. Cards count as magical for overcoming resistance.',
           false, 0, NULL),
          ('Charlatan', NULL, 2, 'Misdirection',
           'As a reaction (costs 1 Trick), when you are targeted by an attack, force the attacker to reroll and take the lower result.',
           false, 0, NULL),
          ('Charlatan', NULL, 4, 'Ability Score Improvement',
           'Increase one ability score by 2, or two ability scores by 1, or take a feat.',
           true, 1, 'asi_or_feat'),
          ('Charlatan', NULL, 5, 'Flash Flourish',
           'When you deal damage with Card Throw, spend 1 Trick to add 2d6 extra damage and force a Constitution save. On failure, target is Blinded until end of their next turn.',
           false, 0, NULL),
          ('Charlatan', NULL, 7, 'Evasion of Blame',
           'If you succeed on a Dexterity saving throw, you take no damage instead of half.',
           false, 0, NULL),
          ('Charlatan', NULL, 8, 'Ability Score Improvement',
           'Increase one ability score by 2, or two ability scores by 1, or take a feat.',
           true, 1, 'asi_or_feat'),
          ('Charlatan', NULL, 9, 'Grand Display',
           'As an action (costs 2 Tricks), create an overwhelming spectacle. Creatures within 20 ft make a Wisdom save. On failure: Frightened or Charmed (your choice) for 1 minute.',
           false, 0, NULL),
          ('Charlatan', NULL, 11, 'Impossible Escape',
           'As a reaction (costs 2 Tricks), when you are restrained or grappled: automatically escape, then move up to half your speed. This movement does not provoke opportunity attacks.',
           false, 0, NULL),
          ('Charlatan', NULL, 12, 'Ability Score Improvement',
           'Increase one ability score by 2, or two ability scores by 1, or take a feat.',
           true, 1, 'asi_or_feat'),
          ('Charlatan', NULL, 13, 'Master of Falsehood',
           'You gain Expertise (double proficiency bonus) in Deception and Sleight of Hand.',
           false, 0, NULL),
          ('Charlatan', NULL, 15, 'Dramatic Reversal',
           'Once per long rest: if reduced to 0 HP but not killed outright, drop to 1 HP instead and immediately take a bonus turn.',
           false, 0, NULL),
          ('Charlatan', NULL, 16, 'Ability Score Improvement',
           'Increase one ability score by 2, or two ability scores by 1, or take a feat.',
           true, 1, 'asi_or_feat'),
          ('Charlatan', NULL, 17, 'Supreme Misdirection',
           'When a creature critically hits you, spend 2 Tricks to turn the critical hit into a normal hit.',
           false, 0, NULL),
          ('Charlatan', NULL, 19, 'Ability Score Improvement',
           'Increase one ability score by 2, or two ability scores by 1, or take a feat.',
           true, 1, 'asi_or_feat'),
          ('Charlatan', NULL, 20, 'The Greatest Show',
           'At the start of combat, regain 2 Tricks. Once per turn, you may use a Trick ability without expending a Trick. Your Tricks per short rest cap increases to 8.',
           false, 0, NULL)
      `);
    }

    // ── Subclass choice trigger (always check separately — required for level-up UI) ──
    const checkSubclassTrigger = await client.query(`
      SELECT COUNT(*) as count FROM class_features
      WHERE class = 'Charlatan' AND level = 3 AND choice_type = 'subclass'
    `);
    if (parseInt(checkSubclassTrigger.rows[0].count) === 0) {
      console.log('Inserting Charlatan subclass choice trigger...');
      await client.query(`
        INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
        VALUES ('Charlatan', NULL, 3, 'Charlatan Path', 'Choose your path as a Charlatan. Each path defines your signature style of deception and spectacle.', true, 1, 'subclass')
      `);
    } else {
      console.log('Charlatan subclass trigger already exists, skipping...');
    }

    // ── The High Roller subclass features ───────────────────────────────────
    const checkHR = await client.query(`
      SELECT COUNT(*) as count FROM class_features WHERE class = 'Charlatan' AND subclass_id = $1
    `, [highRollerId]);

    if (parseInt(checkHR.rows[0].count) > 0) {
      console.log('The High Roller features already exist, skipping...');
    } else {
      console.log('Inserting The High Roller features...');
      await client.query(`
        INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
        VALUES
          ('Charlatan', $1, 3, 'Stacked Deck',
           'When you fail a roll, spend 1 Trick to reroll and take the new result. Additionally, you may reduce an enemy''s critical hit range by 1 (e.g. 19–20 becomes only 20) for 1 minute once per short rest.',
           false, 0, NULL),
          ('Charlatan', $1, 6, 'Loaded Odds',
           'When you score a critical hit, double the dice rolled for the attack''s extra effects (such as Flash Flourish). At 14th level, triple the dice instead.',
           false, 0, NULL),
          ('Charlatan', $1, 10, 'Cheat Fate',
           'A number of times per long rest equal to your Charisma modifier (minimum 1), you may use Sleight of Hand instead of any STR, DEX, or CON ability check, or use Deception instead of any INT, WIS, or CHA ability check.',
           false, 0, NULL),
          ('Charlatan', $1, 14, 'House Always Wins',
           'Whenever you force a creature to reroll (via Misdirection, Stacked Deck, or similar), you may choose which result is taken rather than the creature.',
           false, 0, NULL),
          ('Charlatan', $1, 18, 'Miracle Run',
           'Once per long rest, for 1 minute: you critically hit on a roll of 19–20, you have advantage on all attack rolls and ability checks, and your critical hits deal triple damage dice.',
           false, 0, NULL)
      `, [highRollerId]);
    }

    // ── The Phantom Joker subclass features ─────────────────────────────────
    const checkPJ = await client.query(`
      SELECT COUNT(*) as count FROM class_features WHERE class = 'Charlatan' AND subclass_id = $1
    `, [phantomJokerId]);

    if (parseInt(checkPJ.rows[0].count) > 0) {
      console.log('The Phantom Joker features already exist, skipping...');
    } else {
      console.log('Inserting The Phantom Joker features...');
      await client.query(`
        INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
        VALUES
          ('Charlatan', $1, 3, 'Illusion Double',
           'As a bonus action (costs 1 Trick), create a decoy within 10 ft of you. Attacks targeting you have a 50% chance to hit the decoy instead. The decoy lasts 1 minute or until it is hit.',
           false, 0, NULL),
          ('Charlatan', $1, 6, 'Smoke Vanish',
           'When you take the Hide action, you may spend 1 Trick to become invisible until the end of your next turn.',
           false, 0, NULL),
          ('Charlatan', $1, 10, 'Shadow Step',
           'As a bonus action (costs 1 Trick), teleport up to 30 ft to an unoccupied space in dim light or darkness.',
           false, 0, NULL),
          ('Charlatan', $1, 14, 'Joker''s Last Laugh',
           'Once per long rest: if you would be reduced to 0 HP, instead teleport 30 ft, become invisible until end of your next turn, and leave a Joker card at your previous location. Enemies within 10 ft of that location must make a Wisdom save or be Frightened for 1 round.',
           false, 0, NULL),
          ('Charlatan', $1, 18, 'Endless Doubles',
           'You may maintain two Illusion Doubles simultaneously. Attacks against you must roll twice and take the lower result before determining whether the attack hits you or a double.',
           false, 0, NULL)
      `, [phantomJokerId]);
    }

    // ── The Pyrotechnician subclass features ─────────────────────────────────
    const checkPY = await client.query(`
      SELECT COUNT(*) as count FROM class_features WHERE class = 'Charlatan' AND subclass_id = $1
    `, [pyrotechnicianId]);

    if (parseInt(checkPY.rows[0].count) > 0) {
      console.log('The Pyrotechnician features already exist, skipping...');
    } else {
      console.log('Inserting The Pyrotechnician features...');
      await client.query(`
        INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
        VALUES
          ('Charlatan', $1, 3, 'Explosive Cards',
           'When you hit with Card Throw, spend 1 Trick to cause an explosion. The target and all creatures within 5 ft take 1d6 fire damage (scales to 3d6 at level 11).',
           false, 0, NULL),
          ('Charlatan', $1, 6, 'Smoke Bomb',
           'As a bonus action (costs 1 Trick), create a 15 ft radius heavily obscured area centered on a point within 30 ft. The smoke lasts for 1 minute.',
           false, 0, NULL),
          ('Charlatan', $1, 10, 'Shrapnel Burst',
           'As an action (costs 2 Tricks), release a 15 ft cone of shrapnel. Creatures in the cone take 4d6 piercing damage (Dexterity save for half).',
           false, 0, NULL),
          ('Charlatan', $1, 14, 'Trick Presents',
           'During a short rest, you may place up to 3 hidden explosive traps. When a creature triggers a trap: 6d6 fire or piercing damage (your choice), and the creature must make a Strength save or be knocked prone.',
           false, 0, NULL),
          ('Charlatan', $1, 18, 'Grand Finale',
           'Once per long rest, choose a point within 60 ft. A 20 ft radius explosion deals 10d6 fire damage + 10d6 piercing damage (Dexterity save for half). The area becomes heavily obscured for 1 minute.',
           false, 0, NULL)
      `, [pyrotechnicianId]);
    }

    await client.query('COMMIT');
    console.log('✅ Charlatan class added successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error adding Charlatan class:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = addCharlatanClass;

// Run directly if called as script
if (require.main === module) {
  addCharlatanClass()
    .then(() => {
      console.log('Charlatan migration completed');
      process.exit(0);
    })
    .catch(err => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
