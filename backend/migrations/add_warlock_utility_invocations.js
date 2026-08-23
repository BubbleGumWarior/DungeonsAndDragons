const { pool } = require('../models/database');

// Only 2 of the 11 eldritch invocations listed in the "Eldritch Invocations" flavor skill
// actually rewrite Eldritch Blast (Agonizing Blast, Repelling Blast — handled by
// add_eldritch_blast_invocation_variants.js). The other 9 had no mechanical representation
// at all: picking one just recorded a row in character_feature_choices, which nothing in
// the app ever displays. This adds a dedicated skill for each of them, granted the moment
// it's chosen (see routes/skills.js's grantChosenInvocationSkills), so every invocation
// pick shows up on the character's Skills tab, not just the two that touch Eldritch Blast.
const addWarlockUtilityInvocations = async () => {
  try {
    console.log('Adding standalone Warlock invocation skills...');

    const invocations = [
      { name: 'Armor of Shadows', description: 'You can cast mage armor on yourself at will, without expending a spell slot or material components.' },
      { name: "Devil's Sight", description: 'You can see normally in darkness, both magical and nonmagical, to a distance of 120 feet.' },
      { name: 'Mask of Many Faces', description: 'You can cast disguise self at will, without expending a spell slot.' },
      { name: 'Misty Visions', description: 'You can cast silent image at will, without expending a spell slot or material components.' },
      { name: 'Thirsting Blade', description: "You can attack twice, instead of once, whenever you take the Attack action on your turn with your pact weapon. (Requires Pact of the Blade.)" },
      { name: 'Eldritch Sight', description: 'You can cast detect magic at will, without expending a spell slot.' },
      { name: 'Book of Ancient Secrets', description: "You can inscribe magical rituals in your Book of Shadows. Choose two 1st-level spells that have the ritual tag from any class's spell list; you can cast them as rituals. You can also cast any ritual spell you find inscribed elsewhere. (Requires Pact of the Tome.)" },
      { name: 'Voice of the Chain Master', description: "You can communicate telepathically with your familiar and perceive through its senses while it's within 100 feet of you. You can also speak through your familiar in your own voice, even if it can't normally speak. (Requires Pact of the Chain.)" },
      { name: 'Lifedrinker', description: "Your pact weapon deals additional necrotic damage equal to your Charisma modifier on a hit. (Requires Pact of the Blade, 12th level.)" }
    ];

    for (const inv of invocations) {
      await pool.query(`
        INSERT INTO skills (name, description, damage_dice, damage_type, range_size, usage_frequency, level_requirement, class_restriction)
        VALUES ($1, $2, NULL, NULL, 'Varies', 'Passive', 2, 'Warlock')
        ON CONFLICT (name) DO UPDATE SET
          description = EXCLUDED.description
      `, [inv.name, inv.description]);
    }

    console.log('✅ Standalone Warlock invocation skills added');
  } catch (error) {
    console.error('Error adding Warlock utility invocations:', error);
    throw error;
  }
};

module.exports = addWarlockUtilityInvocations;
