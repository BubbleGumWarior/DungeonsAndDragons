/**
 * Migration: drop_kingdom_tables
 * Removes all kingdom-related tables and columns.
 * Runs on every server startup (all DROPs are idempotent via IF EXISTS).
 */
const { pool } = require('../models/database');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Drop armies.unit_type (added by add_player_army_training for kingdom system) ──
    const hasUnitType = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'armies' AND column_name = 'unit_type'
    `);
    if (hasUnitType.rows.length > 0) {
      await client.query(`ALTER TABLE armies DROP COLUMN unit_type`);
      console.log('✅ armies.unit_type dropped');
    } else {
      console.log('  armies.unit_type does not exist, skipping');
    }

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

    // ── Drop fief_research_levels ─────────────────────────────────────────────
    await client.query(`DROP TABLE IF EXISTS fief_research_levels CASCADE`);
    console.log('✅ fief_research_levels dropped');

    // ── Drop fief_research_queue ──────────────────────────────────────────────
    await client.query(`DROP TABLE IF EXISTS fief_research_queue CASCADE`);
    console.log('✅ fief_research_queue dropped');

    // ── Drop fief_training ────────────────────────────────────────────────────
    await client.query(`DROP TABLE IF EXISTS fief_training CASCADE`);
    console.log('✅ fief_training dropped');

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

    // campaigns.current_day is kept — used by non-kingdom functionality (rest system)

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
