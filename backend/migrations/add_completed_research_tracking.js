/**
 * Migration: add_completed_research_tracking
 * Adds a completed_research JSONB column to track which research has been completed for each fief.
 */
const { pool } = require('../models/database');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Add completed_research JSONB column to fiefs table
    await client.query(`
      ALTER TABLE fiefs
      ADD COLUMN IF NOT EXISTS completed_research JSONB DEFAULT '[]'::jsonb
    `);
    console.log('✅ completed_research column added to fiefs table');

    await client.query('COMMIT');
    console.log('✅ add_completed_research_tracking migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ add_completed_research_tracking migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
};

module.exports = migrate;
