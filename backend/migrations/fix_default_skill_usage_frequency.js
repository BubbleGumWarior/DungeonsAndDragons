const { pool } = require('../models/database');

// Valid usage_frequency values (the 6 dropdown options in the frontend)
// 'At Will' | 'Spell Slots' | 'Once per short rest' | 'Once per long rest' | 'Once per day' | 'Passive'

async function fixDefaultSkillUsageFrequency() {
  try {
    console.log('Fixing usage_frequency for default skills...');

    const fixes = [
      // Barbarain
      { name: 'Rage',                       usage_frequency: 'Once per long rest' },
      { name: 'Reckless Attack',            usage_frequency: 'At Will' },
      { name: 'Relentless Rage',            usage_frequency: 'Passive' },
      { name: 'Brutal Critical',            usage_frequency: 'Passive' },
      // Bard
      { name: 'Bardic Inspiration',         usage_frequency: 'Once per long rest' },
      { name: 'Superior Inspiration',       usage_frequency: 'At Will' },
      { name: 'Song of Rest',               usage_frequency: 'Once per short rest' },
      // Cleric
      { name: 'Channel Divinity',           usage_frequency: 'Once per short rest' },
      { name: 'Destroy Undead',             usage_frequency: 'Once per short rest' },
      { name: 'Divine Intervention',        usage_frequency: 'Once per long rest' },
      // Druid
      { name: 'Wild Shape',                 usage_frequency: 'Once per short rest' },
      { name: 'Timeless Body',              usage_frequency: 'Passive' },
      { name: 'Beast Spells',               usage_frequency: 'Passive' },
      // Fighter
      { name: 'Action Surge',               usage_frequency: 'Once per short rest' },
      { name: 'Second Wind',                usage_frequency: 'Once per short rest' },
      { name: 'Indomitable',                usage_frequency: 'Once per long rest' },
      // Monk
      { name: 'Flurry of Blows',            usage_frequency: 'Once per short rest' },
      { name: 'Patient Defense',            usage_frequency: 'Once per short rest' },
      { name: 'Step of the Wind',           usage_frequency: 'Once per short rest' },
      { name: 'Stunning Strike',            usage_frequency: 'Once per short rest' },
      { name: 'Empty Body',                 usage_frequency: 'Once per long rest' },
      // Paladin
      { name: 'Divine Smite',               usage_frequency: 'Spell Slots' },
      { name: 'Lay on Hands',               usage_frequency: 'Once per long rest' },
      { name: 'Aura of Courage',            usage_frequency: 'Passive' },
      { name: 'Aura of Protection',         usage_frequency: 'Passive' },
      { name: 'Divine Health',              usage_frequency: 'Passive' },
      { name: 'Cleansing Touch',            usage_frequency: 'Once per long rest' },
      { name: 'Sacred Weapon',              usage_frequency: 'Once per long rest' },
      // Ranger
      { name: 'Hunter\'s Mark',             usage_frequency: 'Spell Slots' },
      { name: 'Natural Explorer',           usage_frequency: 'Passive' },
      { name: 'Favored Enemy',              usage_frequency: 'Passive' },
      { name: 'Vanish',                     usage_frequency: 'Passive' },
      { name: 'Feral Senses',              usage_frequency: 'Passive' },
      // Rogue
      { name: 'Uncanny Dodge',              usage_frequency: 'Passive' },
      { name: 'Evasion',                    usage_frequency: 'Passive' },
      { name: 'Reliable Talent',            usage_frequency: 'Passive' },
      { name: 'Slippery Mind',              usage_frequency: 'Passive' },
      { name: 'Elusive',                    usage_frequency: 'Passive' },
      { name: 'Stroke of Luck',             usage_frequency: 'Once per long rest' },
      // Sorcerer
      { name: 'Sorcerous Restoration',      usage_frequency: 'Once per short rest' },
      { name: 'Metamagic',                  usage_frequency: 'Spell Slots' },
      // Warlock
      { name: 'Pact Magic',                 usage_frequency: 'Once per short rest' },
      { name: 'Eldritch Invocations',       usage_frequency: 'Passive' },
      { name: 'Dark One\'s Own Luck',       usage_frequency: 'Once per long rest' },
      { name: 'Eldritch Master',            usage_frequency: 'Once per long rest' },
      // Wizard
      { name: 'Arcane Recovery',            usage_frequency: 'Once per long rest' },
      { name: 'Spell Mastery',              usage_frequency: 'At Will' },
      { name: 'Signature Spell',            usage_frequency: 'At Will' },
    ];

    let updated = 0;
    for (const fix of fixes) {
      const result = await pool.query(
        `UPDATE skills SET usage_frequency = $1 WHERE name = $2 AND usage_frequency NOT IN ('At Will', 'Spell Slots', 'Once per short rest', 'Once per long rest', 'Once per day', 'Passive')`,
        [fix.usage_frequency, fix.name]
      );
      if (result.rowCount > 0) {
        console.log(`  ✓ Fixed "${fix.name}" → ${fix.usage_frequency}`);
        updated += result.rowCount;
      }
    }

    console.log(`✓ Fixed ${updated} skill(s) with invalid usage_frequency`);
  } catch (error) {
    console.error('Error fixing default skill usage frequencies:', error);
    throw error;
  }
}

module.exports = fixDefaultSkillUsageFrequency;
