const { pool } = require('../models/database');

async function addCharlatanSkills() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Adding Charlatan skills...');

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
        -- Base class features (plain names for level progression hover)
        ('Read the Room',
         'Use Charisma instead of Wisdom for Insight and Perception checks. Spend 1 Trick to gain advantage on Perception or Insight, or impose disadvantage on a creature attempting to Insight you.',
         'Charlatan', 1, NULL, 'Utility', 'Self', '1 Trick per use'),

        ('Card Throw',
         'Treat a deck of playing cards as a finesse ranged weapon. Range 30/90 ft. Damage: 1d6 at L1, 1d8 at L5, 1d10 at L11, 1d12 at L17. Use DEX or CHA for attack and damage. Cards count as magical for overcoming resistance.',
         'Charlatan', 1, '1d6–1d12', 'Slashing', '30/90 feet', 'At will — scales with level'),

        ('Misdirection',
         'As a reaction (costs 1 Trick), when you are targeted by an attack, force the attacker to reroll and take the lower result.',
         'Charlatan', 2, NULL, 'Defensive', 'Self', '1 Trick (reaction)'),

        ('Flash Flourish',
         'When you deal damage with Card Throw, spend 1 Trick to add 2d6 extra damage and force a Constitution save. On failure, the target is Blinded until the end of their next turn.',
         'Charlatan', 5, '+2d6', 'Bonus + Blind', 'Weapon range', '1 Trick per hit'),

        ('Evasion of Blame',
         'If you succeed on a Dexterity saving throw, you take no damage instead of half.',
         'Charlatan', 7, NULL, 'Passive', 'Self', 'Passive — on DEX save success'),

        ('Grand Display',
         'As an action (costs 2 Tricks), unleash overwhelming spectacle. Creatures within 20 ft make a Wisdom saving throw. On failure: Frightened or Charmed (your choice) for 1 minute.',
         'Charlatan', 9, NULL, 'Fear/Charm', '20 feet', '2 Tricks (action)'),

        ('Impossible Escape',
         'As a reaction (costs 2 Tricks), when you are restrained or grappled: automatically escape and move up to half your speed. This movement does not provoke opportunity attacks.',
         'Charlatan', 11, NULL, 'Escape', 'Self', '2 Tricks (reaction)'),

        ('Master of Falsehood',
         'You gain Expertise (double proficiency bonus) in both Deception and Sleight of Hand.',
         'Charlatan', 13, NULL, 'Passive', 'Self', 'Passive'),

        ('Dramatic Reversal',
         'Once per long rest: if reduced to 0 HP but not killed outright, drop to 1 HP instead and immediately take a bonus turn.',
         'Charlatan', 15, NULL, 'Survival', 'Self', '1 per long rest'),

        ('Supreme Misdirection',
         'When a creature critically hits you, spend 2 Tricks to turn the critical hit into a normal hit.',
         'Charlatan', 17, NULL, 'Defensive', 'Self', '2 Tricks (reaction)'),

        ('The Greatest Show',
         'At the start of combat, regain 2 Tricks. Once per turn, you may use a Trick ability without expending a Trick. Tricks per short rest cap increases to 8.',
         'Charlatan', 20, NULL, 'Capstone', 'Self', 'Passive capstone'),

        -- The High Roller subclass features (name format: "Feature (High Roller)")
        ('Stacked Deck (High Roller)',
         'When you fail a roll, spend 1 Trick to reroll and use the new result. Also, once per short rest, reduce an enemy''s critical hit range by 1 (e.g., 19–20 becomes only a 20) for 1 minute.',
         'Charlatan', 3, NULL, 'Luck', 'Self', '1 Trick per reroll'),

        ('Loaded Odds (High Roller)',
         'When you score a critical hit, double the dice rolled for the attack''s extra effects (such as Flash Flourish bonus damage). At 14th level, triple the dice instead.',
         'Charlatan', 6, '2x/3x extra dice', 'Enhancement', 'Weapon range', 'Passive — on critical hit'),

        ('Cheat Fate (High Roller)',
         'A number of times per long rest equal to your Charisma modifier (minimum 1), use Sleight of Hand instead of any STR, DEX, or CON ability check, or use Deception instead of any INT, WIS, or CHA ability check.',
         'Charlatan', 10, NULL, 'Skill Swap', 'Self', 'CHA mod per long rest'),

        ('House Always Wins (High Roller)',
         'Whenever you force a creature to reroll (via Misdirection, Stacked Deck, or similar), you may choose which result is taken rather than the creature.',
         'Charlatan', 14, NULL, 'Control', 'Target', 'Passive — applies to all forced rerolls'),

        ('Miracle Run (High Roller)',
         'Once per long rest, for 1 minute: you critically hit on a roll of 19 or 20, you have advantage on all attack rolls and ability checks, and your critical hits deal triple damage dice.',
         'Charlatan', 18, 'Triple crit dice', 'Enhancement', 'Self', '1 per long rest (1 minute)'),

        -- The Phantom Joker subclass features (name format: "Feature (Phantom Joker)")
        ('Illusion Double (Phantom Joker)',
         'As a bonus action (costs 1 Trick), create a decoy within 10 ft of you. Attacks targeting you have a 50% chance to hit the decoy instead. The decoy lasts 1 minute or until it is hit.',
         'Charlatan', 3, NULL, 'Decoy', '10 feet', '1 Trick (bonus action)'),

        ('Smoke Vanish (Phantom Joker)',
         'When you take the Hide action, spend 1 Trick to become invisible until the end of your next turn.',
         'Charlatan', 6, NULL, 'Invisibility', 'Self', '1 Trick — on Hide action'),

        ('Shadow Step (Phantom Joker)',
         'As a bonus action (costs 1 Trick), teleport up to 30 ft to an unoccupied space in dim light or darkness.',
         'Charlatan', 10, NULL, 'Teleport', '30 feet', '1 Trick (bonus action)'),

        ('Joker''s Last Laugh (Phantom Joker)',
         'Once per long rest: if reduced to 0 HP, instead teleport 30 ft, become invisible until end of your next turn, and leave a Joker card at your previous location. Enemies within 10 ft must make a Wisdom save or be Frightened for 1 round.',
         'Charlatan', 14, NULL, 'Survival + Fear', '30 ft + 10 ft aura', '1 per long rest'),

        ('Endless Doubles (Phantom Joker)',
         'You may maintain two Illusion Doubles simultaneously. Attacks against you must roll twice and take the lower result before determining whether the attack hits you or a double.',
         'Charlatan', 18, NULL, 'Defense', 'Self', 'Passive — two decoys at once'),

        -- The Pyrotechnician subclass features (name format: "Feature (Pyrotechnician)")
        ('Explosive Cards (Pyrotechnician)',
         'When you hit a creature with Card Throw, spend 1 Trick to trigger an explosion. The target and all creatures within 5 ft take 1d6 fire damage (scales to 3d6 at level 11).',
         'Charlatan', 3, '1d6–3d6', 'Fire (AoE)', '5 ft radius', '1 Trick per hit'),

        ('Smoke Bomb (Pyrotechnician)',
         'As a bonus action (costs 1 Trick), create a 15 ft radius heavily obscured cloud centered on a point within 30 ft. The smoke lasts for 1 minute.',
         'Charlatan', 6, NULL, 'Obscurement', '30 feet / 15 ft radius', '1 Trick (bonus action)'),

        ('Shrapnel Burst (Pyrotechnician)',
         'As an action (costs 2 Tricks), release a 15 ft cone of shrapnel. Creatures in the cone take 4d6 piercing damage (Dexterity save for half).',
         'Charlatan', 10, '4d6', 'Piercing (Cone)', '15 ft cone', '2 Tricks (action)'),

        ('Trick Presents (Pyrotechnician)',
         'During a short rest, place up to 3 hidden explosive traps. When triggered: 6d6 fire or piercing damage (your choice), and the creature must make a Strength save or be knocked prone.',
         'Charlatan', 14, '6d6', 'Fire/Piercing + Prone', 'Placed traps', 'Set during short rest'),

        ('Grand Finale (Pyrotechnician)',
         'Once per long rest, choose a point within 60 ft. A 20 ft radius explosion deals 10d6 fire damage + 10d6 piercing damage (Dexterity save for half). The area becomes heavily obscured for 1 minute.',
         'Charlatan', 18, '10d6+10d6', 'Fire + Piercing (AoE)', '60 ft range / 20 ft radius', '1 per long rest')

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
    console.log('✅ Charlatan skills added successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error adding Charlatan skills:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = addCharlatanSkills;

// Run directly if called as script
if (require.main === module) {
  addCharlatanSkills()
    .then(() => {
      console.log('Charlatan skills migration completed');
      process.exit(0);
    })
    .catch(err => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
