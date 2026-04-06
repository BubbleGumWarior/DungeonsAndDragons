const { pool } = require('../models/database');

async function addCampaignActiveMap() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Add active_map_id to campaigns table for persistent map selection
    await client.query(`
      ALTER TABLE campaigns
        ADD COLUMN IF NOT EXISTS active_map_id INTEGER REFERENCES campaign_battle_maps(id) ON DELETE SET NULL
    `);
    console.log('Added active_map_id column to campaigns');

    // Add active_battlefield_map_id for the separate battlefield (army combat) view
    await client.query(`
      ALTER TABLE campaigns
        ADD COLUMN IF NOT EXISTS active_battlefield_map_id INTEGER REFERENCES campaign_battle_maps(id) ON DELETE SET NULL
    `);
    console.log('Added active_battlefield_map_id column to campaigns');

    // Also ensure combat_sessions has it (belt-and-suspenders)
    await client.query(`
      ALTER TABLE combat_sessions
        ADD COLUMN IF NOT EXISTS active_map_id INTEGER REFERENCES campaign_battle_maps(id) ON DELETE SET NULL
    `);
    console.log('Added active_map_id column to combat_sessions');

    await client.query('COMMIT');
    console.log('Migration add_campaign_active_map completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = addCampaignActiveMap;
