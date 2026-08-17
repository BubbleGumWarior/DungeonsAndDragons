const { pool } = require('../models/database');

// Previously "Pact Boon" was granted as one generic skill explaining all three options
// (Chain/Blade/Tome), and it never changed even after the player picked one via the
// Pact Boon Choice dropdown (see add_warlock_full_progression.js). This adds a specific
// skill row per boon so routes/skills.js can swap the generic card for the one the
// character actually chose — mirroring how Eldritch Blast is handled.
const addPactBoonVariants = async () => {
  try {
    console.log('Adding Pact of the Chain/Blade/Tome skills...');

    const boons = [
      {
        name: 'Pact of the Chain',
        description: 'Your patron rewards your loyalty with a powerful familiar. You learn the find familiar spell and can cast it as a ritual. When you take this action, you can choose one of the normal forms or one of the following special forms: imp, pseudodragon, quasit, or sprite. Your familiar can attack using your reaction, and you can also communicate with it telepathically.'
      },
      {
        name: 'Pact of the Blade',
        description: 'You can use your action to create a pact weapon in your empty hand — a melee weapon of your choice, and you are proficient with it while you wield it. You can transform one magic weapon into your pact weapon, and can dismiss it back into its bound object as a bonus action, causing it to disappear until you create it again.'
      },
      {
        name: 'Pact of the Tome',
        description: "Your patron gives you a grimoire called a Book of Shadows. You learn three cantrips of your choice from any class's spell list. The book also serves as a spellcasting focus for your warlock spells, and you can use it to cast the ritual version of any ritual spell you have written in it."
      }
    ];

    for (const boon of boons) {
      await pool.query(`
        INSERT INTO skills (name, description, damage_dice, damage_type, range_size, usage_frequency, level_requirement, class_restriction)
        VALUES ($1, $2, NULL, NULL, 'Self', 'Passive', 3, 'Warlock')
        ON CONFLICT (name) DO UPDATE SET
          description = EXCLUDED.description
      `, [boon.name, boon.description]);
    }

    console.log('✅ Pact Boon variant skills added');
  } catch (error) {
    console.error('Error adding Pact Boon variants:', error);
    throw error;
  }
};

module.exports = addPactBoonVariants;
