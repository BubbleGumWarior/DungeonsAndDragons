const { pool } = require('../models/database');

async function addCampaignGoals() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create campaign_goals table
    await client.query(`
      CREATE TABLE IF NOT EXISTS campaign_goals (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        reward TEXT,
        completed_by_name VARCHAR(255) DEFAULT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('Created campaign_goals table');

    // Index for fast lookups by campaign
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_campaign_goals_campaign_id
        ON campaign_goals (campaign_id)
    `);
    console.log('Created index on campaign_goals.campaign_id');

    await client.query('COMMIT');
    console.log('✅ add_campaign_goals: campaign_goals table created');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ add_campaign_goals migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = addCampaignGoals;

if (require.main === module) {
  addCampaignGoals()
    .then(() => { console.log('Migration completed'); process.exit(0); })
    .catch(err => { console.error('Migration failed:', err); process.exit(1); });
}
