const { pool } = require('../models/database');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const hasFiefs = await client.query(`SELECT to_regclass('public.fiefs') AS fiefs`);
    if (!hasFiefs.rows[0]?.fiefs) {
      console.log('  fiefs table not found; skipping add_location_modifiers');
      await client.query('COMMIT');
      return;
    }

    const hasKingdoms = await client.query(`SELECT to_regclass('public.kingdoms') AS kingdoms`);
    if (!hasKingdoms.rows[0]?.kingdoms) {
      console.log('  kingdoms table not found; skipping add_location_modifiers');
      await client.query('COMMIT');
      return;
    }

    const checks = [
      {
        table: 'fiefs',
        column: 'location_modifiers',
        sql: `ALTER TABLE fiefs ADD COLUMN location_modifiers JSONB NOT NULL DEFAULT '{}'::jsonb`,
      },
      {
        table: 'kingdoms',
        column: 'location_modifiers',
        sql: `ALTER TABLE kingdoms ADD COLUMN location_modifiers JSONB NOT NULL DEFAULT '{}'::jsonb`,
      },
    ];

    for (const { table, column, sql } of checks) {
      const exists = await client.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
        [table, column]
      );
      if (exists.rows.length === 0) {
        await client.query(sql);
        console.log(`✅ add_location_modifiers: added ${column} to ${table}`);
      } else {
        console.log(`  add_location_modifiers: ${column} already exists on ${table}`);
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ add_location_modifiers migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
};

module.exports = migrate;
if (require.main === module) migrate().then(() => process.exit(0)).catch(() => process.exit(1));
