/**
 * Migration: consolidate stored meat/vegetables into unified food resource.
 */
const { pool } = require('../models/database');

const asObject = (value) => (value && typeof value === 'object' ? { ...value } : {});

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const table = await client.query(`SELECT to_regclass('public.fiefs') AS fiefs`);
    if (!table.rows[0]?.fiefs) {
      await client.query('COMMIT');
      console.log('  fiefs table not found, skipping food consolidation');
      return;
    }

    const result = await client.query(`
      SELECT id, COALESCE(stored_resources, '{}'::jsonb) AS stored_resources
      FROM fiefs
    `);

    for (const row of result.rows) {
      const fiefId = Number(row.id);
      const stored = asObject(row.stored_resources);
      const meat = Math.max(0, Number(stored.meat || 0));
      const vegetables = Math.max(0, Number(stored.vegetables || 0));
      const currentFood = Math.max(0, Number(stored.food || 0));

      if (meat <= 0 && vegetables <= 0) continue;

      stored.food = currentFood + meat + vegetables;
      delete stored.meat;
      delete stored.vegetables;

      await client.query(
        `UPDATE fiefs SET stored_resources = $2::jsonb WHERE id = $1`,
        [fiefId, JSON.stringify(stored)]
      );
    }

    await client.query('COMMIT');
    console.log('✅ consolidated meat/vegetables into food');
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
