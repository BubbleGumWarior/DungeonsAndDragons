/**
 * Migration: drop_kingdom_tables
 * Removes all kingdom-related tables and columns:
 *   kingdom_actions, kingdom_events, fief_event_log, fief_buildings, fiefs, kingdoms
 * Also removes:
 *   armies.source_fief_id  (FK that references fiefs)
 *   armies.is_garrisoned   (added alongside source_fief_id for garrison system)
 *   campaigns.current_day  (added by the kingdom system migration)
 */
const { pool } = require('../models/database');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Drop armies.source_fief_id before dropping fiefs ─────────────────────
    const hasFiefCol = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'armies' AND column_name = 'source_fief_id'
    `);
    if (hasFiefCol.rows.length > 0) {
      await client.query(`ALTER TABLE armies DROP COLUMN source_fief_id`);
      console.log('✅ armies.source_fief_id dropped');
    } else {
      console.log('  armies.source_fief_id does not exist, skipping');
    }

    // ── Drop armies.is_garrisoned ─────────────────────────────────────────────
    const hasGarrison = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'armies' AND column_name = 'is_garrisoned'
    `);
    if (hasGarrison.rows.length > 0) {
      await client.query(`ALTER TABLE armies DROP COLUMN is_garrisoned`);
      console.log('✅ armies.is_garrisoned dropped');
    } else {
      console.log('  armies.is_garrisoned does not exist, skipping');
    }

    // ── Drop kingdom_actions ──────────────────────────────────────────────────
    await client.query(`DROP TABLE IF EXISTS kingdom_actions CASCADE`);
    console.log('✅ kingdom_actions dropped');

    // ── Drop kingdom_events ───────────────────────────────────────────────────
    await client.query(`DROP TABLE IF EXISTS kingdom_events CASCADE`);
    console.log('✅ kingdom_events dropped');

    // ── Drop fief_event_log ───────────────────────────────────────────────────
    await client.query(`DROP TABLE IF EXISTS fief_event_log CASCADE`);
    console.log('✅ fief_event_log dropped');

    // ── Drop fief_buildings ───────────────────────────────────────────────────
    await client.query(`DROP TABLE IF EXISTS fief_buildings CASCADE`);
    console.log('✅ fief_buildings dropped');

    // ── Drop fiefs ────────────────────────────────────────────────────────────
    await client.query(`DROP TABLE IF EXISTS fiefs CASCADE`);
    console.log('✅ fiefs dropped');

    // ── Drop kingdoms ─────────────────────────────────────────────────────────
    await client.query(`DROP TABLE IF EXISTS kingdoms CASCADE`);
    console.log('✅ kingdoms dropped');

    // campaigns.current_day is kept — used by non-kingdom functionality

    await client.query('COMMIT');
    console.log('\n🎉 Kingdom tables dropped successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed, rolled back:', err);
    throw err;
  } finally {
    client.release();
  }
};

module.exports = migrate;
