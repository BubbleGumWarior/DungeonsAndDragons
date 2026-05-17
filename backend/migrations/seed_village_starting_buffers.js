/**
 * Migration: seed starting resource buffers for villages that appear uninitialized.
 * Applies only to fiefs with both food and wood at 0 (or missing).
 */
const { pool } = require('../models/database');

const toObject = (value) => (value && typeof value === 'object' ? { ...value } : {});
const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const table = await client.query(`SELECT to_regclass('public.fiefs') AS fiefs`);
    if (!table.rows[0]?.fiefs) {
      await client.query('COMMIT');
      console.log('  fiefs table not found, skipping starting buffer migration');
      return;
    }

    const result = await client.query(`
      SELECT id, COALESCE(stored_resources, '{}'::jsonb) AS stored_resources
      FROM fiefs
    `);

    for (const row of result.rows) {
      const fiefId = Number(row.id);
      const stored = toObject(row.stored_resources);
      const food = toNumber(stored.food);
      const wood = toNumber(stored.wood);

      if (food > 0 || wood > 0) continue;

      stored.food = 40;
      stored.wood = 25;
      if (stored.stone == null) stored.stone = 0;
      if (stored.minerals == null) stored.minerals = 0;
      if (stored.faith == null) stored.faith = 0;
      if (stored.research == null) stored.research = 0;

      await client.query(
        `UPDATE fiefs
         SET stored_resources = $2::jsonb
         WHERE id = $1`,
        [fiefId, JSON.stringify(stored)]
      );
    }

    await client.query('COMMIT');
    console.log('✅ seeded village starting buffers');
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
