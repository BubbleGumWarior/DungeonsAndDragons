const { pool } = require('../models/database');

async function addCampaignScores() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS campaign_scores (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        player_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        inspiration INTEGER NOT NULL DEFAULT 0,
        discouragement INTEGER NOT NULL DEFAULT 0,
        wishes INTEGER NOT NULL DEFAULT 0,
        anti_wishes INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(campaign_id, player_id)
      )
    `);

    console.log('✅ campaign_scores table created (or already exists)');

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = addCampaignScores;
