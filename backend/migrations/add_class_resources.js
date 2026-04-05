const { pool } = require('../models/database');

async function addClassResources() {
  try {
    await pool.query(`
      ALTER TABLE characters
        ADD COLUMN IF NOT EXISTS tricks_used INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS shadow_reap_used INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS shadow_step_used INTEGER DEFAULT 0
    `);
    console.log('✅ Class resource columns added (tricks_used, shadow_reap_used, shadow_step_used)');
  } catch (error) {
    console.error('Error adding class resource columns:', error);
    throw error;
  }
}

module.exports = addClassResources;
