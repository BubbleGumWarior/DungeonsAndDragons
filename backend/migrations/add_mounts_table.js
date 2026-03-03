const { pool } = require('../models/database');

async function addMountsTable() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Creating campaign_mounts table...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS campaign_mounts (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        mount_type TEXT NOT NULL DEFAULT 'Custom',
        description TEXT,
        speed INTEGER DEFAULT 60,
        fly_speed INTEGER DEFAULT 0,
        hp INTEGER DEFAULT 30,
        ac INTEGER DEFAULT 10,
        carrying_capacity INTEGER DEFAULT 480,
        pull_strength INTEGER DEFAULT 1000,
        stamina TEXT DEFAULT 'Medium',
        max_rider_armor TEXT DEFAULT 'Any',
        purpose TEXT,
        image_url TEXT,
        image_data BYTEA,
        image_mime_type TEXT,
        assigned_to_character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
        is_equipped BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add new columns to existing tables (safe no-op if already present)
    const newCols = [
      `ALTER TABLE campaign_mounts ADD COLUMN IF NOT EXISTS pull_strength INTEGER DEFAULT 1000`,
      `ALTER TABLE campaign_mounts ADD COLUMN IF NOT EXISTS stamina TEXT DEFAULT 'Medium'`,
      `ALTER TABLE campaign_mounts ADD COLUMN IF NOT EXISTS max_rider_armor TEXT DEFAULT 'Any'`,
      `ALTER TABLE campaign_mounts ADD COLUMN IF NOT EXISTS purpose TEXT`
    ];
    for (const sql of newCols) {
      await client.query(sql);
    }

    // Index for fast lookup by campaign
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_campaign_mounts_campaign_id
      ON campaign_mounts(campaign_id)
    `);

    // Index for fast lookup by assigned character
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_campaign_mounts_character_id
      ON campaign_mounts(assigned_to_character_id)
    `);

    await client.query('COMMIT');
    console.log('✅ campaign_mounts table created successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error creating campaign_mounts table:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = addMountsTable;
