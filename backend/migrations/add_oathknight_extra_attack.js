const { pool } = require('../models/database');

// Oathknight gains Extra Attack at 5th level (see class_features: 'Oathknight', level 5,
// is_choice=false), so it correctly shows up once in the level-up wizard — but there was
// never a matching skills-table row for it, so it never actually persisted to the
// character's Skills tab (only "Retributive Strike", the other 5th-level feature, did).
//
// It can't be named literally "Extra Attack" — that name is already taken by the Fighter's
// row (skills.name is globally unique) — and it can't use a parenthesized suffix like
// "Extra Attack (Oathknight)" either, since the level-up route's general skill-granting
// fallback excludes any parenthesized name (that pattern is reserved for subclass-flavored
// skills, e.g. "Crusader Might (Vanguard)"). So this gets its own distinct, non-parenthesized
// name instead.
const addOathknightExtraAttack = async () => {
  try {
    console.log("Adding Oathknight's Extra Attack skill...");

    await pool.query(`
      INSERT INTO skills (name, description, damage_dice, damage_type, range_size, usage_frequency, level_requirement, class_restriction)
      VALUES ($1, $2, NULL, NULL, 'Varies', 'Passive', 5, 'Oathknight')
      ON CONFLICT (name) DO UPDATE SET
        description = EXCLUDED.description
    `, [
      "Knight's Extra Attack",
      'You can attack twice, instead of once, whenever you take the Attack action on your turn.'
    ]);

    console.log("✅ Knight's Extra Attack added");
  } catch (error) {
    console.error("Error adding Oathknight's Extra Attack:", error);
    throw error;
  }
};

module.exports = addOathknightExtraAttack;
