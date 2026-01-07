const { pool } = require('../models/database');

async function createJournalEntriesTable() {
  const client = await pool.connect();
  try {
    console.log('Creating journal_entries table...');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS journal_entries (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        image_url VARCHAR(500),
        created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Create index for faster campaign queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_journal_entries_campaign_id 
      ON journal_entries(campaign_id);
    `);
    
    // Create index for created_at for sorting
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_journal_entries_created_at 
      ON journal_entries(created_at DESC);
    `);
    
    console.log('✓ journal_entries table created successfully');
  } catch (error) {
    console.error('Error creating journal_entries table:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  createJournalEntriesTable()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = createJournalEntriesTable;
