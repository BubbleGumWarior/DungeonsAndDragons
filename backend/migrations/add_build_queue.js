/**
 * Migration: add_build_queue
 * Adds queue_position column to fief_buildings.
 * queue_position = null → complete
 * queue_position = 1   → actively building
 * queue_position > 1   → waiting in queue
 */
const { pool } = require('../models/database');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const hasCol = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'fief_buildings' AND column_name = 'queue_position'
    `);
    if (hasCol.rows.length === 0) {
      await client.query(`
        ALTER TABLE fief_buildings ADD COLUMN queue_position INTEGER
      `);
      console.log('✅ fief_buildings.queue_position added');

      // Set queue_position for existing incomplete buildings:
      // Assign sequential positions per fief ordered by id
      await client.query(`
        UPDATE fief_buildings b
        SET queue_position = sub.rn
        FROM (
          SELECT id,
                 ROW_NUMBER() OVER (PARTITION BY fief_id ORDER BY id ASC) AS rn
          FROM fief_buildings
          WHERE is_complete = false
        ) sub
        WHERE b.id = sub.id
      `);
      console.log('✅ Existing incomplete buildings assigned queue positions');
    } else {
      console.log('  fief_buildings.queue_position already exists');
    }

    // Fix any is_complete=true upgrade rows that never applied their level to parent
    // (can happen if they completed via the old path that didn't handle upgrades)
    const orphanedUpgrades = await client.query(`
      SELECT id, parent_building_id, level, resource_output
      FROM fief_buildings
      WHERE is_upgrade = true AND is_complete = true AND parent_building_id IS NOT NULL
    `);
    for (const u of orphanedUpgrades.rows) {
      await client.query(
        `UPDATE fief_buildings SET level = $1, resource_output = $2 WHERE id = $3`,
        [u.level, u.resource_output, u.parent_building_id]
      );
      await client.query(`DELETE FROM fief_buildings WHERE id = $1`, [u.id]);
    }
    if (orphanedUpgrades.rows.length > 0) {
      console.log(`✅ Fixed ${orphanedUpgrades.rows.length} orphaned completed upgrade row(s)`);
    }

    await client.query('COMMIT');
    console.log('✅ add_build_queue migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ add_build_queue migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
};

module.exports = migrate;
if (require.main === module) migrate().then(() => process.exit(0)).catch(() => process.exit(1));
