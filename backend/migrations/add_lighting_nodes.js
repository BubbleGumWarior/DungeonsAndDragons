const { pool } = require('../models/database');

async function addLightingNodes() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS campaign_lighting_nodes (
        id VARCHAR(100) PRIMARY KEY,
        campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        type VARCHAR(10) NOT NULL CHECK (type IN ('light', 'dark')),
        x REAL NOT NULL,
        y REAL NOT NULL,
        strength REAL NOT NULL,
        tab VARCHAR(20) NOT NULL CHECK (tab IN ('combat', 'battlefield')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cln_campaign_id ON campaign_lighting_nodes(campaign_id)
    `);
    await client.query('COMMIT');
    console.log('✅ campaign_lighting_nodes table created');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = addLightingNodes;
