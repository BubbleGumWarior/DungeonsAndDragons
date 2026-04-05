const { pool } = require('../models/database');

async function addOrderClericDomain() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Remove Trickery Domain and its features if they still exist
    const trickeryCheck = await client.query(`
      SELECT id FROM subclasses WHERE class = 'Cleric' AND name = 'Trickery Domain'
    `);

    if (trickeryCheck.rows.length > 0) {
      const trickeryId = trickeryCheck.rows[0].id;
      await client.query(`DELETE FROM class_features WHERE class = 'Cleric' AND subclass_id = $1`, [trickeryId]);
      await client.query(`DELETE FROM subclasses WHERE id = $1`, [trickeryId]);
      console.log('Removed Trickery Domain and its features');
    }

    // Remove old Trickery Domain skills from the skills table
    await client.query(`
      DELETE FROM skills
      WHERE class_restriction = 'Cleric'
        AND name ILIKE '%(Trickery)%'
    `);
    console.log('Removed Trickery Domain skills from skills table');

    // Insert Order Domain subclass
    const orderResult = await client.query(`
      INSERT INTO subclasses (class, name, description)
      VALUES ('Cleric', 'Order Domain', 'Champion of law and civilization who compels obedience and protects the social order.')
      ON CONFLICT (class, name) DO UPDATE SET description = EXCLUDED.description
      RETURNING id
    `);
    const orderDomainId = orderResult.rows[0].id;

    // Insert Voice of Authority level 1 feature
    await client.query(`
      INSERT INTO class_features (class, subclass_id, level, name, description, is_choice, choice_count, choice_type)
      VALUES (
        'Cleric', $1, 1, 'Voice of Authority',
        'When you cast a spell of 1st level or higher targeting at least one creature, one of those creatures can use its reaction to make one weapon attack against a target of your choice that you can see.',
        false, 0, NULL
      )
      ON CONFLICT DO NOTHING
    `, [orderDomainId]);

    // Insert Order Domain skills (idempotent)
    const orderSkills = [
      { name: 'Voice of Authority (Order Domain)', description: 'When you cast a spell of 1st level or higher targeting at least one creature, one of those creatures can use its reaction to make one weapon attack against a target of your choice that you can see.', damage_dice: null, damage_type: null, range_size: 'Spell range', usage_frequency: 'Per spell cast', level_requirement: 1 },
      { name: "Channel Divinity: Order's Demand (Order Domain)", description: "As an action, each creature of your choice within 30 ft must make a WIS save. On failure it is charmed by you until the end of your next turn or until it takes damage. Also on failure, you can use a bonus action to force the creature to drop what it is holding.", damage_dice: null, damage_type: null, range_size: '30 feet', usage_frequency: 'Channel Divinity', level_requirement: 2 },
      { name: 'Embodiment of the Law (Order Domain)', description: 'If you cast an enchantment spell of 1st level or higher as an action, you can change its casting time to a bonus action.', damage_dice: null, damage_type: null, range_size: 'Self', usage_frequency: 'WIS mod per long rest', level_requirement: 6 },
      { name: 'Divine Strike (Order Domain)', description: 'Once on each of your turns, when you hit with a weapon attack, you can deal an extra 1d8 psychic damage (2d8 at 14th level).', damage_dice: '1d8/2d8', damage_type: 'Psychic', range_size: 'Weapon', usage_frequency: 'Once per turn', level_requirement: 8 },
      { name: "Order's Wrath (Order Domain)", description: "If you deal your Divine Strike damage to a creature, that creature is cursed until the start of your next turn. The next time one of your allies hits the cursed creature, it takes an extra 2d8 psychic damage.", damage_dice: '2d8', damage_type: 'Psychic', range_size: 'Weapon', usage_frequency: 'With Divine Strike', level_requirement: 17 },
    ];
    for (const skill of orderSkills) {
      await client.query(`
        INSERT INTO skills (name, description, damage_dice, damage_type, range_size, usage_frequency, level_requirement, class_restriction)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'Cleric')
        ON CONFLICT (name) DO NOTHING
      `, [skill.name, skill.description, skill.damage_dice, skill.damage_type, skill.range_size, skill.usage_frequency, skill.level_requirement]);
    }
    console.log('Inserted Order Domain skills into skills table');

    await client.query('COMMIT');
    console.log('✅ Order Domain added for Cleric');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error adding Order Cleric Domain:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = addOrderClericDomain;

if (require.main === module) {
  addOrderClericDomain()
    .then(() => { console.log('Migration completed'); process.exit(0); })
    .catch(err => { console.error('Migration failed:', err); process.exit(1); });
}
