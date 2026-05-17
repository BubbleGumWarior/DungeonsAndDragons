const { pool } = require('../models/database');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const exists = await client.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'fiefs' AND column_name = 'vegetable_harvest_state'`
    );
    if (exists.rows.length === 0) {
      await client.query(
        `ALTER TABLE fiefs ADD COLUMN vegetable_harvest_state JSONB NOT NULL DEFAULT '{"day_in_cycle":0,"accumulated_worker_days":0}'`
      );
      console.log('✅ add_vegetable_harvest_state: added vegetable_harvest_state column to fiefs');
    }

    await client.query('COMMIT');
    console.log('✅ add_vegetable_harvest_state migration complete');
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
