// Migration: add_battle_morale.js
// Per-battle morale for each army, plus the record of armies that fled the field.
//   current_morale / max_morale  - 0..100, see utils/morale.js
//   has_fled / fled_troops       - an army that failed a morale save leaves the battle (current_troops goes to 0,
//                                  fled_troops remembers how many marched away)
//   last_morale_check            - the latest saving throw: { round, roll, needed, passed, morale }
//   morale_shift                 - how the balance of strength moved starting morale (NULL until applied, so it applies once)

const { pool } = require('../models/database');

async function run() {
  await pool.query(`
    ALTER TABLE battle_participants
      ADD COLUMN IF NOT EXISTS current_morale INTEGER,
      ADD COLUMN IF NOT EXISTS max_morale INTEGER,
      ADD COLUMN IF NOT EXISTS has_fled BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS fled_troops INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS last_morale_check JSONB,
      ADD COLUMN IF NOT EXISTS morale_shift INTEGER
  `);
  console.log('✅ Migration complete: add_battle_morale');
}

if (require.main === module) run().then(() => process.exit(0)).catch(() => process.exit(1));

module.exports = run;
