// Migration: add_dm_hidden_participants.js
// DM-concealed armies are invisible to every faction except the DM (and the faction that commands them)
// and cannot be targeted. They are revealed once their owner has locked a goal and the battle moves on to resolution.

const { pool } = require('../models/database');

async function run() {
  await pool.query(`ALTER TABLE battle_participants ADD COLUMN IF NOT EXISTS dm_hidden BOOLEAN NOT NULL DEFAULT FALSE`);
  console.log('✅ Migration complete: add_dm_hidden_participants');
}

if (require.main === module) run().then(() => process.exit(0)).catch(() => process.exit(1));

module.exports = run;
