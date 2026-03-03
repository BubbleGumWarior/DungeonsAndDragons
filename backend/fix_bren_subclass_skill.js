/**
 * One-time fix: Bren leveled up to Charlatan 3 but received "Illusion Double (Phantom Joker)"
 * instead of their chosen "Stacked Deck (High Roller)".
 * This script removes the wrong skill and adds the correct one.
 */
const { pool } = require('./models/database');

async function fixBrenSubclassSkill() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Find the character (Bren, Charlatan level 3)
    const charResult = await client.query(`
      SELECT c.id, c.name, c.class, c.level, cs.subclass_id, s.name AS subclass_name
      FROM characters c
      LEFT JOIN character_subclasses cs ON c.id = cs.character_id
      LEFT JOIN subclasses s ON cs.subclass_id = s.id
      WHERE c.name ILIKE 'Bren' AND c.class = 'Charlatan'
    `);

    if (charResult.rows.length === 0) {
      console.log('❌ Could not find Bren (Charlatan). Aborting.');
      await client.query('ROLLBACK');
      return;
    }

    const char = charResult.rows[0];
    console.log(`Found character: ${char.name} (id=${char.id}), subclass: ${char.subclass_name || 'none'}`);

    // Find the wrong skill on this character
    const wrongSkillResult = await client.query(`
      SELECT cs.skill_id, s.name
      FROM character_skills cs
      JOIN skills s ON cs.skill_id = s.id
      WHERE cs.character_id = $1
        AND s.name ILIKE '%Illusion Double%'
    `, [char.id]);

    if (wrongSkillResult.rows.length > 0) {
      const wrongSkill = wrongSkillResult.rows[0];
      console.log(`Removing wrong skill: "${wrongSkill.name}" (id=${wrongSkill.skill_id})`);
      await client.query(`
        DELETE FROM character_skills
        WHERE character_id = $1 AND skill_id = $2
      `, [char.id, wrongSkill.skill_id]);
    } else {
      console.log('No "Illusion Double (Phantom Joker)" skill found on this character — may already be cleaned up.');
    }

    // Find and add the correct High Roller skill at level 3
    const correctSkillResult = await client.query(`
      SELECT id, name FROM skills
      WHERE name ILIKE '%Stacked Deck%' AND name ILIKE '%(High Roller)%'
      LIMIT 1
    `);

    if (correctSkillResult.rows.length === 0) {
      console.log('❌ Could not find "Stacked Deck (High Roller)" in skills table. Make sure addCharlatanSkills migration ran.');
      await client.query('ROLLBACK');
      return;
    }

    const correctSkill = correctSkillResult.rows[0];
    console.log(`Adding correct skill: "${correctSkill.name}" (id=${correctSkill.id})`);
    await client.query(`
      INSERT INTO character_skills (character_id, skill_id)
      VALUES ($1, $2)
      ON CONFLICT (character_id, skill_id) DO NOTHING
    `, [char.id, correctSkill.id]);

    await client.query('COMMIT');
    console.log('✅ Fix applied successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error applying fix:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

fixBrenSubclassSkill();
