/**
 * One-off migration: animals used to be staffed from the Farming (vegetables) lane at
 * 1 worker per 10 animals; they now need the dedicated Herding lane at 1 worker per 20.
 *
 * For every fief that owns animals this moves enough workers from Farming to Herding to
 * cover the herd under the new rule (citizens first, then slaves), so existing herds do
 * not suddenly stop breeding. Also opens the herding lane (unlocked + worker cap) for fiefs
 * that have an Animal Stable / Animal Farm chain building, since the cap used to live on
 * the vegetables lane.
 *
 * Runs on every server start like the other migrations, so it records itself in
 * one_off_migrations and does nothing after the first successful run.
 */
const { pool } = require('../models/database');

const MIGRATION_NAME = 'move_animal_farmers_to_herding';
const ANIMALS_PER_HERDER = 20; // mirrors Campaign.ANIMALS_PER_HERDER
const HERDING_BUILDINGS = [
  'animal_stable', 'grand_stable', 'royal_stud_farm', 'imperial_stud_farm',
  'animal_farm', 'grand_pasture', 'livestock_ranch', 'grand_stockyards',
];

const toObject = (value) => (value && typeof value === 'object' ? { ...value } : {});
const toInt = (value) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
};

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS one_off_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const already = await client.query(`SELECT 1 FROM one_off_migrations WHERE name = $1`, [MIGRATION_NAME]);
    if (already.rows.length > 0) {
      await client.query('COMMIT');
      return;
    }

    const tables = await client.query(`SELECT to_regclass('public.fiefs') AS fiefs, to_regclass('public.fief_animals') AS animals`);
    if (!tables.rows[0]?.fiefs || !tables.rows[0]?.animals) {
      // Nothing to move yet; leave unmarked so it still runs if the tables show up later.
      await client.query('COMMIT');
      console.log('  fiefs/fief_animals not found, skipping herding migration');
      return;
    }

    const fiefsResult = await client.query(
      `SELECT f.id,
              COALESCE(f.worker_assignments, '{}'::jsonb) AS worker_assignments,
              COALESCE(f.slave_worker_assignments, '{}'::jsonb) AS slave_worker_assignments,
              COALESCE(f.unlocked_resources, '{}'::jsonb) AS unlocked_resources,
              COALESCE(f.max_workers_per_resource, '{}'::jsonb) AS max_workers_per_resource,
              (SELECT COUNT(*) FROM fief_animals a WHERE a.fief_id = f.id)::int AS animal_count,
              (SELECT COUNT(*) FROM fief_buildings b
                WHERE b.fief_id = f.id AND b.is_complete = true AND b.building_type = ANY($1::text[]))::int AS herding_buildings
       FROM fiefs f`,
      [HERDING_BUILDINGS]
    );

    let moved = 0;
    for (const row of fiefsResult.rows) {
      if (row.herding_buildings <= 0) continue; // no Stable/Farm chain: nothing opens the lane

      const assignments = toObject(row.worker_assignments);
      const slaveAssignments = toObject(row.slave_worker_assignments);
      const unlocked = toObject(row.unlocked_resources);
      const maxWorkers = toObject(row.max_workers_per_resource);

      unlocked.herding = true;
      maxWorkers.herding = Math.max(toInt(maxWorkers.herding), row.herding_buildings * 20);

      const needed = Math.min(Math.ceil(row.animal_count / ANIMALS_PER_HERDER), maxWorkers.herding);
      const alreadyHerding = toInt(assignments.herding) + toInt(slaveAssignments.herding);
      let remaining = Math.max(0, needed - alreadyHerding);

      const fromCitizens = Math.min(remaining, toInt(assignments.vegetables));
      remaining -= fromCitizens;
      const fromSlaves = Math.min(remaining, toInt(slaveAssignments.vegetables));

      // The lane cap applies per lane, so keep each lane within it.
      const citizenHerding = Math.min(maxWorkers.herding, toInt(assignments.herding) + fromCitizens);
      const slaveHerding = Math.min(maxWorkers.herding, toInt(slaveAssignments.herding) + fromSlaves);
      const citizenMoved = citizenHerding - toInt(assignments.herding);
      const slaveMoved = slaveHerding - toInt(slaveAssignments.herding);

      assignments.vegetables = toInt(assignments.vegetables) - citizenMoved;
      assignments.herding = citizenHerding;
      slaveAssignments.vegetables = toInt(slaveAssignments.vegetables) - slaveMoved;
      slaveAssignments.herding = slaveHerding;
      moved += citizenMoved + slaveMoved;

      await client.query(
        `UPDATE fiefs
         SET worker_assignments = $2::jsonb,
             slave_worker_assignments = $3::jsonb,
             unlocked_resources = $4::jsonb,
             max_workers_per_resource = $5::jsonb
         WHERE id = $1`,
        [row.id, JSON.stringify(assignments), JSON.stringify(slaveAssignments), JSON.stringify(unlocked), JSON.stringify(maxWorkers)]
      );
    }

    await client.query(`INSERT INTO one_off_migrations (name) VALUES ($1)`, [MIGRATION_NAME]);
    await client.query('COMMIT');
    console.log(`✅ moved ${moved} animal-tending worker(s) from Farming to Herding`);
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
