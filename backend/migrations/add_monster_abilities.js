const { pool } = require('../models/database');

const addMonsterAbilities = async () => {
  try {
    // Allow campaign_id to be nullable so global (template) monsters can exist
    await pool.query(`
      ALTER TABLE monsters ALTER COLUMN campaign_id DROP NOT NULL
    `);
    console.log('✓ monsters.campaign_id made nullable');
  } catch (error) {
    if (error.message.includes('does not exist') || error.message.includes('already')) {
      // column constraint may already be dropped
    } else {
      console.warn('add_monster_abilities (campaign_id nullable):', error.message);
    }
  }

  try {
    await pool.query(`
      ALTER TABLE monsters
      ADD COLUMN IF NOT EXISTS abilities JSONB
        DEFAULT '{"str": 10, "dex": 10, "con": 10, "int": 10, "wis": 10, "cha": 10}'::jsonb
    `);
    console.log('✓ monsters.abilities column added');
  } catch (error) {
    console.warn('add_monster_abilities (abilities col):', error.message);
  }
};

module.exports = addMonsterAbilities;
