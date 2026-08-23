const { pool } = require('../models/database');

// Some skills exist only as targets for dedicated swap/grant logic — Pact Boon variants
// swapped in by computePactBoonUpdate once a boon is actually chosen, and the standalone
// utility invocation skills granted by grantChosenInvocationSkills the moment a player
// picks them. These must never be auto-granted by the general per-level skill-granting
// fallback in routes/skills.js, which (since it was fixed to grant every matching skill
// at a level instead of just one) would otherwise hand every Warlock reaching 3rd level
// all three Pact Boons at once, and every Warlock reaching 2nd level all nine utility
// invocations at once, regardless of what they actually chose.
const addSkillsAutoGrantColumn = async () => {
  try {
    console.log('Adding skills.auto_grant column...');

    await pool.query(`
      ALTER TABLE skills ADD COLUMN IF NOT EXISTS auto_grant BOOLEAN DEFAULT true
    `);

    const excludedNames = [
      // Pact Boon variants — granted only via computePactBoonUpdate once actually chosen
      'Pact of the Chain', 'Pact of the Blade', 'Pact of the Tome',
      // Standalone utility invocations — granted only via grantChosenInvocationSkills
      'Armor of Shadows', "Devil's Sight", 'Mask of Many Faces', 'Misty Visions',
      'Thirsting Blade', 'Eldritch Sight', 'Book of Ancient Secrets',
      'Voice of the Chain Master', 'Lifedrinker'
    ];

    await pool.query(`
      UPDATE skills SET auto_grant = false WHERE name = ANY($1)
    `, [excludedNames]);

    console.log('✅ skills.auto_grant column added and backfilled');
  } catch (error) {
    console.error('Error adding skills.auto_grant column:', error);
    throw error;
  }
};

module.exports = addSkillsAutoGrantColumn;
