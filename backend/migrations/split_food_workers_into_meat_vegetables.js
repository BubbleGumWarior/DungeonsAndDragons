/**
 * Migration: split legacy food worker lane into meat + vegetables lanes.
 * - Moves legacy worker_assignments.food into worker_assignments.meat (if meat not already set)
 * - Ensures vegetables lane exists in worker_assignments/max_workers_per_resource
 * - Rewrites unlocked_resources food => meat
 * - Unlocks vegetables if any farming building is completed
 */
const { pool } = require('../models/database');

const toObject = (value) => (value && typeof value === 'object' ? { ...value } : {});
const toInt = (value, fallback = 0) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.max(0, n) : fallback;
};

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tableResult = await client.query(`SELECT to_regclass('public.fiefs') AS fiefs`);
    if (!tableResult.rows[0]?.fiefs) {
      await client.query('COMMIT');
      console.log('  fiefs table not found, skipping food split migration');
      return;
    }

    const fiefsResult = await client.query(`
      SELECT id,
             COALESCE(worker_assignments, '{}'::jsonb) AS worker_assignments,
             COALESCE(unlocked_resources, '{}'::jsonb) AS unlocked_resources,
             COALESCE(max_workers_per_resource, '{}'::jsonb) AS max_workers_per_resource
      FROM fiefs
    `);

    for (const row of fiefsResult.rows) {
      const fiefId = Number(row.id);
      const assignments = toObject(row.worker_assignments);
      const unlocked = toObject(row.unlocked_resources);
      const maxWorkers = toObject(row.max_workers_per_resource);

      const legacyFood = toInt(assignments.food, 0);
      const currentMeat = toInt(assignments.meat, 0);
      assignments.meat = currentMeat > 0 ? currentMeat : legacyFood;
      assignments.vegetables = toInt(assignments.vegetables, 0);
      delete assignments.food;

      const unlockedFood = Boolean(unlocked.food);
      if (unlocked.meat == null) unlocked.meat = unlockedFood || true;
      unlocked.meat = Boolean(unlocked.meat);
      if (unlocked.vegetables == null) unlocked.vegetables = false;
      delete unlocked.food;

      const maxFood = toInt(maxWorkers.food, 10);
      const maxMeat = toInt(maxWorkers.meat, 0);
      maxWorkers.meat = maxMeat > 0 ? maxMeat : maxFood;
      maxWorkers.vegetables = toInt(maxWorkers.vegetables, 10);
      delete maxWorkers.food;

      const farmingComplete = await client.query(
        `SELECT 1
         FROM fief_buildings
         WHERE fief_id = $1
           AND is_complete = true
           AND building_type IN ('farm', 'irrigated_farm', 'granary')
         LIMIT 1`,
        [fiefId]
      );
      if (farmingComplete.rows.length > 0) {
        unlocked.vegetables = true;
      }

      await client.query(
        `UPDATE fiefs
         SET worker_assignments = $2::jsonb,
             unlocked_resources = $3::jsonb,
             max_workers_per_resource = $4::jsonb
         WHERE id = $1`,
        [fiefId, JSON.stringify(assignments), JSON.stringify(unlocked), JSON.stringify(maxWorkers)]
      );
    }

    await client.query('COMMIT');
    console.log('✅ split food workers into meat/vegetables');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

if (require.main === module) {
  migrate().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = migrate;
