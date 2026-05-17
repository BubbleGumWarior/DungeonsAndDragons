const { pool } = require('../models/database');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const exists = await client.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'fiefs' AND column_name = 'consecutive_starvation_days'`
    );

    if (exists.rows.length === 0) {
      await client.query(`ALTER TABLE fiefs ADD COLUMN consecutive_starvation_days INT NOT NULL DEFAULT 0`);
      console.log('✅ add_consecutive_starvation_days: added consecutive_starvation_days column to fiefs');
    } else {
      console.log('  add_consecutive_starvation_days: column already exists');
    }

    await client.query('COMMIT');
    console.log('✅ add_consecutive_starvation_days migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

if (require.main === module) {
  migrate().then(() => process.exit(0)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = migrate;
