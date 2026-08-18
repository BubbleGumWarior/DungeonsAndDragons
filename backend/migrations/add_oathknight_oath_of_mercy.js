const { pool } = require('../models/database');

// Adds Oath of Mercy, a third Oathknight subclass: a healer-focused knight who sustains
// allies through Constitution-driven battle-medicine rather than spellcasting (Oathknight
// has no spell slots at all, unlike Paladin — every effect here scales off CON mod, same
// as the base class's Retributive Strike/Reflective Aegis/etc.).
//
// Mirrors populate_oathknight_data.js's structure exactly: one subclasses row, six
// class_features rows at the same levels Aegis/Vanguard use (3/6/10/14/17/20) so the
// level-up wizard presents it identically, plus six matching skills rows (named with the
// "(Mercy)" suffix — matches on the subclass's last word, same convention as
// "Crusader Might (Vanguard)") so each feature actually persists to the Skills tab.
const addOathknightOathOfMercy = async () => {
  try {
    console.log('Adding Oathknight Oath of Mercy subclass...');

    const subclassResult = await pool.query(`
      INSERT INTO subclasses (class, name, description)
      VALUES ($1, $2, $3)
      ON CONFLICT (class, name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
    `, [
      'Oathknight',
      'Oath of Mercy',
      'A knight who tanks by refusing to let anyone else fall. Mercy Oathknights sustain their allies through sheer battlefield vitality, redirecting killing blows and mending wounds mid-swing rather than relying on divine magic.'
    ]);
    const mercyId = subclassResult.rows[0].id;

    const features = [
      {
        level: 3,
        name: 'Battlefield Medic',
        description: 'As a bonus action or reaction, touch an ally within 5 feet and restore 2d8 + your Constitution modifier HP to them. Use proficiency bonus times per long rest. Passively, hostile creatures within 10 feet of you have disadvantage on attack rolls against targets other than you.'
      },
      {
        level: 6,
        name: 'Shared Vitality',
        description: 'While Guarding Stance is active, each ally within 60 feet also regains HP equal to four times your Constitution modifier at the start of each of your turns.'
      },
      {
        level: 10,
        name: 'Vow of Redemption',
        description: 'When an ally within 30 feet would be reduced to 0 hit points, you can use your reaction to take the damage instead. Use once per short rest.'
      },
      {
        level: 14,
        name: 'Blessed Recovery',
        description: 'Each time you deal damage with an attack, your ally with the lowest current hit points regains 2d12 HP.'
      },
      {
        level: 17,
        name: 'Miracle Worker',
        description: 'As an action, once per long rest, all allies within 50 feet regain 10d4 + (10 × your Constitution modifier) HP — each of the ten dice has your Constitution modifier added individually.'
      },
      {
        level: 20,
        name: 'Avatar - Mercy Enhancement',
        description: 'While Avatar of the Oath is active, your healing is maximized (treat all healing dice as their highest value), and each creature you heal this way also gains +2 AC and resistance to all damage until the start of your next turn.'
      }
    ];

    for (const feature of features) {
      await pool.query(`
        INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
        VALUES ('Oathknight', $1, $2, $3, $4, false, 0, NULL)
        ON CONFLICT DO NOTHING
      `, [mercyId, feature.level, feature.name, feature.description]);
    }

    // Matching skills-table rows so each feature actually persists to the character's
    // Skills tab (the level-up route's subclass-matching logic finds these via the "(Mercy)"
    // suffix — same convention as "Unyielding Guard (Aegis)" / "Crusader Might (Vanguard)").
    const skills = features.map(f => ({
      name: `${f.name} (Mercy)`,
      description: f.description,
      level: f.level
    }));

    for (const skill of skills) {
      await pool.query(`
        INSERT INTO skills (name, description, damage_dice, damage_type, range_size, usage_frequency, level_requirement, class_restriction)
        VALUES ($1, $2, NULL, 'Healing', 'Varies', 'Varies', $3, 'Oathknight')
        ON CONFLICT (name) DO UPDATE SET
          description = EXCLUDED.description,
          level_requirement = EXCLUDED.level_requirement
      `, [skill.name, skill.description, skill.level]);
    }

    console.log('✅ Oath of Mercy added');
  } catch (error) {
    console.error('Error adding Oath of Mercy:', error);
    throw error;
  }
};

module.exports = addOathknightOathOfMercy;
