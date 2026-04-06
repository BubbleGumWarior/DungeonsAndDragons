const { pool } = require('../models/database');

async function addCampaignNpcs() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS campaign_npcs (
        id            SERIAL PRIMARY KEY,
        campaign_id   INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        name          VARCHAR(255) NOT NULL,
        age           VARCHAR(50),
        description   TEXT,
        image_data    BYTEA,
        image_mime_type VARCHAR(50),
        created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at    TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ campaign_npcs table ensured');

    await client.query(`
      CREATE TABLE IF NOT EXISTS character_saved_npcs (
        id           SERIAL PRIMARY KEY,
        character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
        npc_id       INTEGER NOT NULL REFERENCES campaign_npcs(id) ON DELETE CASCADE,
        saved_at     TIMESTAMP DEFAULT NOW(),
        UNIQUE (character_id, npc_id)
      )
    `);
    console.log('✅ character_saved_npcs table ensured');

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = addCampaignNpcs;
