const { pool } = require('../models/database');

// Canonical D&D 5e resistances for default global monster templates.
// Shape: { resistances: [], immunities: [], vulnerabilities: [] }
const MONSTER_RESISTANCES = {
  // Undead
  'Skeleton': {
    resistances: ['Piercing', 'Slashing'],
    immunities: ['Poison', 'Necrotic'],
    vulnerabilities: ['Bludgeoning'],
  },
  'Zombie': {
    resistances: [],
    immunities: ['Poison'],
    vulnerabilities: [],
  },
  'Wraith': {
    resistances: ['Acid', 'Fire', 'Lightning', 'Thunder', 'Nonmagical Bludgeoning', 'Nonmagical Piercing', 'Nonmagical Slashing'],
    immunities: ['Cold', 'Necrotic', 'Poison'],
    vulnerabilities: [],
  },
  'Vampire': {
    resistances: ['Necrotic', 'Nonmagical Bludgeoning', 'Nonmagical Piercing', 'Nonmagical Slashing'],
    immunities: ['Poison'],
    vulnerabilities: [],
  },
  'Lich': {
    resistances: ['Cold', 'Lightning', 'Necrotic', 'Nonmagical Bludgeoning', 'Nonmagical Piercing', 'Nonmagical Slashing'],
    immunities: ['Poison'],
    vulnerabilities: [],
  },
  // Demons / Devils
  'Balor': {
    resistances: ['Cold', 'Lightning'],
    immunities: ['Fire', 'Poison'],
    vulnerabilities: [],
  },
  'Dretch': {
    resistances: ['Cold', 'Fire', 'Lightning'],
    immunities: ['Poison'],
    vulnerabilities: [],
  },
  'Pit Fiend': {
    resistances: ['Cold', 'Nonmagical Bludgeoning', 'Nonmagical Piercing', 'Nonmagical Slashing'],
    immunities: ['Fire', 'Poison'],
    vulnerabilities: [],
  },
  'Imp': {
    resistances: ['Cold', 'Nonmagical Bludgeoning', 'Nonmagical Piercing', 'Nonmagical Slashing'],
    immunities: ['Fire', 'Poison'],
    vulnerabilities: [],
  },
  // Elementals
  'Air Elemental': {
    resistances: ['Lightning', 'Thunder', 'Nonmagical Bludgeoning', 'Nonmagical Piercing', 'Nonmagical Slashing'],
    immunities: ['Poison'],
    vulnerabilities: [],
  },
  'Earth Elemental': {
    resistances: ['Nonmagical Bludgeoning', 'Nonmagical Piercing', 'Nonmagical Slashing'],
    immunities: ['Poison'],
    vulnerabilities: ['Thunder'],
  },
  'Fire Elemental': {
    resistances: ['Nonmagical Bludgeoning', 'Nonmagical Piercing', 'Nonmagical Slashing'],
    immunities: ['Fire', 'Poison'],
    vulnerabilities: ['Cold'],
  },
  'Water Elemental': {
    resistances: ['Acid', 'Nonmagical Bludgeoning', 'Nonmagical Piercing', 'Nonmagical Slashing'],
    immunities: ['Poison'],
    vulnerabilities: ['Lightning'],
  },
  // Golems
  'Flesh Golem': {
    resistances: [],
    immunities: ['Lightning', 'Poison'],
    vulnerabilities: [],
  },
  'Stone Golem': {
    resistances: [],
    immunities: ['Poison', 'Psychic'],
    vulnerabilities: [],
  },
  'Iron Golem': {
    resistances: ['Cold', 'Nonmagical Bludgeoning', 'Nonmagical Piercing', 'Nonmagical Slashing'],
    immunities: ['Fire', 'Poison', 'Psychic'],
    vulnerabilities: [],
  },
  // Gargoyle
  'Gargoyle': {
    resistances: ['Nonmagical Bludgeoning', 'Nonmagical Piercing', 'Nonmagical Slashing'],
    immunities: ['Poison'],
    vulnerabilities: [],
  },
  // Dragon (generic — fire breath default)
  'Dragon': {
    resistances: ['Fire'],
    immunities: ['Fire'],
    vulnerabilities: [],
  },
  // Troll
  'Troll': {
    resistances: [],
    immunities: [],
    vulnerabilities: ['Fire', 'Acid'],
  },
  // Aboleth
  'Aboleth': {
    resistances: [],
    immunities: [],
    vulnerabilities: [],
  },
  // Mind Flayer
  'Mind Flayer': {
    resistances: [],
    immunities: [],
    vulnerabilities: [],
  },
  // Gelatinous Cube
  'Gelatinous Cube': {
    resistances: [],
    immunities: ['Acid', 'Blinded', 'Charmed', 'Deafened', 'Exhaustion', 'Frightened', 'Prone'],
    vulnerabilities: [],
  },
  // Hydra
  'Hydra': {
    resistances: [],
    immunities: [],
    vulnerabilities: ['Fire'],
  },
  // Beholder
  'Beholder': {
    resistances: [],
    immunities: ['Prone'],
    vulnerabilities: [],
  },
};

const seedMonsterResistances = async () => {
  try {
    const names = Object.keys(MONSTER_RESISTANCES);
    let updated = 0;
    for (const name of names) {
      const resistances = MONSTER_RESISTANCES[name];
      const result = await pool.query(
        `UPDATE monsters
         SET resistances = $1
         WHERE campaign_id IS NULL AND name = $2 AND (resistances IS NULL OR resistances = '{"resistances":[],"immunities":[],"vulnerabilities":[]}'::jsonb)`,
        [JSON.stringify(resistances), name]
      );
      if (result.rowCount > 0) updated++;
    }
    console.log(`✅ seed_monster_resistances: updated resistances for ${updated} default monsters`);
  } catch (error) {
    console.warn('⚠️  seed_monster_resistances failed:', error.message);
    throw error;
  }
};

module.exports = seedMonsterResistances;
