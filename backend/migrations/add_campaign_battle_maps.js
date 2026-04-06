const { pool } = require('../models/database');

async function addCampaignBattleMaps() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create campaign_battle_maps table
    await client.query(`
      CREATE TABLE IF NOT EXISTS campaign_battle_maps (
        id            SERIAL PRIMARY KEY,
        campaign_id   INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        display_name  TEXT NOT NULL,
        image_data    BYTEA NOT NULL,
        image_mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
        uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('Created campaign_battle_maps table');

    // Add active_map_id to combat_sessions
    await client.query(`
      ALTER TABLE combat_sessions
        ADD COLUMN IF NOT EXISTS active_map_id INTEGER REFERENCES campaign_battle_maps(id) ON DELETE SET NULL
    `);
    console.log('Added active_map_id to combat_sessions');

    await client.query('COMMIT');
    console.log('Migration add_campaign_battle_maps completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = addCampaignBattleMaps;
