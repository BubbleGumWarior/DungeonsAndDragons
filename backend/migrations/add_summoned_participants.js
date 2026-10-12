// Migration: add_summoned_participants.js
// Armies raised mid-battle (e.g. a necromancer's skeletons) belong to a player but have no armies row.
// is_summoned marks them, controller_user_id says who commands them, summoned_by_participant_id
// links them to the army that raised them so later kills reinforce the same skeleton army.

const { pool } = require('../models/database');

async function run() {
  await pool.query(`
    ALTER TABLE battle_participants
      ADD COLUMN IF NOT EXISTS is_summoned BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS controller_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS summoned_by_participant_id INTEGER REFERENCES battle_participants(id) ON DELETE SET NULL
  `);
  console.log('✅ Migration complete: add_summoned_participants');
}

if (require.main === module) run().then(() => process.exit(0)).catch(() => process.exit(1));

module.exports = run;
