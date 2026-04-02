const { pool } = require('../models/database');

async function addCampaignChat() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS campaign_chat_messages (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        sender_name TEXT NOT NULL,
        message_type TEXT NOT NULL DEFAULT 'player',
        content TEXT NOT NULL,
        roll_data JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ campaign_chat_messages table ready');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_campaign_chat_messages_cam_time
      ON campaign_chat_messages(campaign_id, created_at)
    `);
    console.log('✅ campaign_chat_messages index ready');

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = addCampaignChat;
