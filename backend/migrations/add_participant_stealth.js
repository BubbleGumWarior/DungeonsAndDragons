// Migration: add_participant_stealth.js
// Covert armies that pass a stealth check are hidden from the enemy until hidden_until_round (inclusive).

const { pool } = require('../models/database');

async function run() {
  await pool.query(`ALTER TABLE battle_participants ADD COLUMN IF NOT EXISTS hidden_until_round INTEGER`);
  console.log('✅ Migration complete: add_participant_stealth');
}

if (require.main === module) run().then(() => process.exit(0)).catch(() => process.exit(1));

module.exports = run;
