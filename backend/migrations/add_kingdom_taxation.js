const { pool } = require('../models/database');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Kingdom Taxation panel: tax_rate_pct diverts that % of the kingdom's daily gold
    // production straight to the owner + co-owners' characters (split equally) instead
    // of the treasury. tithe_rate_pct sacrifices another % of gold from the treasury in
    // exchange for boosting that day's faith production by the same %. Both are set from
    // the Kingdom Management > Kingdom Taxation panel and default to 0 (no change in
    // behavior) for every existing kingdom. See Campaign.advanceDays for the daily tick.
    // DOUBLE PRECISION (not NUMERIC) so node-postgres returns these as JS numbers
    // out of the box, same as fiefs.unrest.
    await client.query(`
      ALTER TABLE kingdoms
      ADD COLUMN IF NOT EXISTS tax_rate_pct DOUBLE PRECISION NOT NULL DEFAULT 0
        CHECK (tax_rate_pct >= 0 AND tax_rate_pct <= 100)
    `);
    await client.query(`
      ALTER TABLE kingdoms
      ADD COLUMN IF NOT EXISTS tithe_rate_pct DOUBLE PRECISION NOT NULL DEFAULT 0
        CHECK (tithe_rate_pct >= 0 AND tithe_rate_pct <= 100)
    `);

    await client.query('COMMIT');
    console.log('✅ add_kingdom_taxation complete');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ add_kingdom_taxation failed:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = migrate;
if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
