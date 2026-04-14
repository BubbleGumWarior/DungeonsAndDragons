const { pool } = require('../models/database');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const checks = [
      { column: 'available_resources', sql: `ALTER TABLE fiefs ADD COLUMN available_resources JSONB NOT NULL DEFAULT '{"wood":50,"animals":50,"fertile_ground":50,"stone":50,"minerals":50}'` },
      { column: 'water_access',        sql: `ALTER TABLE fiefs ADD COLUMN water_access BOOLEAN NOT NULL DEFAULT false` },
      { column: 'buildable_land',      sql: `ALTER TABLE fiefs ADD COLUMN buildable_land INTEGER NOT NULL DEFAULT 100` },
      { column: 'storage_capacity',    sql: `ALTER TABLE fiefs ADD COLUMN storage_capacity INTEGER NOT NULL DEFAULT 100` },
      { column: 'stored_resources',    sql: `ALTER TABLE fiefs ADD COLUMN stored_resources JSONB NOT NULL DEFAULT '{"wood":0,"stone":0,"minerals":0,"meat":0,"vegetables":0}'` },
    ];

    for (const { column, sql } of checks) {
      const exists = await client.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = 'fiefs' AND column_name = $1`,
        [column]
      );
      if (exists.rows.length === 0) {
        await client.query(sql);
        console.log(`✅ add_kingdom_tier1_fields: added column "${column}" to fiefs`);
      }
    }

    await client.query('COMMIT');
    console.log('✅ add_kingdom_tier1_fields migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

if (require.main === module) {
  migrate().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
}

module.exports = migrate;
