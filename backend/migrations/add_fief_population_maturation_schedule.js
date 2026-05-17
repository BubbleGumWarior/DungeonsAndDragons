/**
 * Migration: add population maturation schedule to fiefs.
 * Stores underage cohorts as { [campaignDayMatures]: count }.
 */
const { pool } = require('../models/database');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const hasCol = await client.query(`
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'fiefs' AND column_name = 'population_maturation_schedule'
    `);

    if (hasCol.rows.length === 0) {
      await client.query(`
        ALTER TABLE fiefs
          ADD COLUMN population_maturation_schedule JSONB NOT NULL DEFAULT '{}'::jsonb
      `);
      console.log('✅ fiefs.population_maturation_schedule added');
    } else {
      console.log('  fiefs.population_maturation_schedule already exists');
    }

    await client.query('COMMIT');
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
