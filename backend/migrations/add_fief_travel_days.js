const { pool } = require('../models/database');

async function migrate() {
  await pool.query(`
    ALTER TABLE fiefs
    ADD COLUMN IF NOT EXISTS travel_days_remaining INTEGER DEFAULT 0
  `);
  console.log('✅ Added travel_days_remaining column to fiefs');
}

module.exports = migrate;
if (require.main === module) migrate().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
