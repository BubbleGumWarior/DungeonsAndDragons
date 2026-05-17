const { pool } = require('../models/database');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const hasFiefs = await client.query(`SELECT to_regclass('public.fiefs') AS fiefs`);
    if (!hasFiefs.rows[0]?.fiefs) {
      console.log('  fiefs table not found; skipping add_kingdom_worker_resources');
      await client.query('COMMIT');
      return;
    }

    const checks = [
      {
        column: 'unlocked_resources',
        sql: `ALTER TABLE fiefs ADD COLUMN unlocked_resources JSONB NOT NULL DEFAULT '{"food":true,"wood":true,"stone":false,"iron":false,"research":false,"faith":false,"building":true}'::jsonb`,
      },
      {
        column: 'max_workers_per_resource',
        sql: `ALTER TABLE fiefs ADD COLUMN max_workers_per_resource JSONB NOT NULL DEFAULT '{"food":10,"wood":10,"stone":10,"iron":10,"research":10,"faith":10,"building":10}'::jsonb`,
      },
    ];

    for (const { column, sql } of checks) {
      const exists = await client.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = 'fiefs' AND column_name = $1`,
        [column]
      );
      if (exists.rows.length === 0) {
        await client.query(sql);
        console.log(`✅ add_kingdom_worker_resources: added ${column}`);
      } else {
        console.log(`  add_kingdom_worker_resources: ${column} already exists`);
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ add_kingdom_worker_resources migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
};

if (require.main === module) {
  migrate().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = migrate;
