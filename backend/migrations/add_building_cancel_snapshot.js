/**
 * Migration: add_building_cancel_snapshot
 * Adds "previous state" snapshot columns to fief_buildings so that an
 * in-progress upgrade can be cancelled and reverted to the building's
 * pre-upgrade form (name/type/description/output/level).
 *
 * These columns are populated by the upgrade endpoint right before it
 * overwrites the row with the target upgrade's data, and are cleared again
 * once the row reaches a stable state (freshly queued, or reverted).
 */
const { pool } = require('../models/database');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const columns = [
      { name: 'previous_building_type', ddl: 'VARCHAR(100)' },
      { name: 'previous_name', ddl: 'VARCHAR(255)' },
      { name: 'previous_description', ddl: 'TEXT' },
      { name: 'previous_resource_output', ddl: "JSONB" },
      { name: 'previous_level', ddl: 'INT' },
    ];

    for (const col of columns) {
      const hasCol = await client.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name = 'fief_buildings' AND column_name = $1`,
        [col.name]
      );
      if (hasCol.rows.length === 0) {
        await client.query(`ALTER TABLE fief_buildings ADD COLUMN ${col.name} ${col.ddl}`);
        console.log(`✅ fief_buildings.${col.name} added`);
      } else {
        console.log(`  fief_buildings.${col.name} already exists`);
      }
    }

    await client.query('COMMIT');
    console.log('✅ add_building_cancel_snapshot migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ add_building_cancel_snapshot migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
};

module.exports = migrate;
if (require.main === module) migrate().then(() => process.exit(0)).catch(() => process.exit(1));
