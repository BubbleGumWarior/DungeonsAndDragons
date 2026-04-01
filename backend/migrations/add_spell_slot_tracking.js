const { pool } = require('../models/database');

async function addSpellSlotTracking() {
  try {
    console.log('Adding spell_slots_used and ki_points_remaining to characters table...');

    // spell_slots_used: { "1": 2, "2": 1 } — levels as string keys, values = count used
    await pool.query(`
      ALTER TABLE characters
      ADD COLUMN IF NOT EXISTS spell_slots_used JSONB DEFAULT '{}'::jsonb
    `);

    // ki_points_remaining: NULL = not a monk (or hasn't been initialised)
    await pool.query(`
      ALTER TABLE characters
      ADD COLUMN IF NOT EXISTS ki_points_remaining INTEGER DEFAULT NULL
    `);

    console.log('✓ spell_slots_used and ki_points_remaining columns added');
  } catch (error) {
    console.error('Error adding spell slot tracking columns:', error);
    throw error;
  }
}

module.exports = addSpellSlotTracking;
