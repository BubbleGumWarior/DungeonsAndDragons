const { pool } = require('../models/database');

async function createBattleGoalsTable() {
  try {
    console.log('🔄 Ensuring battle goals structures exist...');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS battle_goals (
        id SERIAL PRIMARY KEY,
        battle_id INTEGER NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
        round_number INTEGER NOT NULL,
        participant_id INTEGER NOT NULL REFERENCES battle_participants(id) ON DELETE CASCADE,
        team_name VARCHAR(255) NOT NULL,
        goal_key VARCHAR(100) NOT NULL,
        goal_name VARCHAR(255) NOT NULL,
        goal_type VARCHAR(50) NOT NULL,
        target_participant_id INTEGER REFERENCES battle_participants(id) ON DELETE SET NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'selected',
        attacker_roll INTEGER,
        defender_roll INTEGER,
        logistics_roll INTEGER,
        roll_details JSONB DEFAULT '{}'::jsonb,
        advantage VARCHAR(20) DEFAULT 'none',
        casualties_target INTEGER DEFAULT 0,
        casualties_self INTEGER DEFAULT 0,
        score_change_target INTEGER DEFAULT 0,
        score_change_self INTEGER DEFAULT 0,
        notes TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_battle_goals_participant_round
      ON battle_goals (battle_id, round_number, participant_id)
    `);

    const hasSelectedGoalColumn = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'battle_participants'
      AND column_name = 'has_selected_goal'
    `);

    if (hasSelectedGoalColumn.rows.length === 0) {
      await pool.query(`
        ALTER TABLE battle_participants
        ADD COLUMN has_selected_goal BOOLEAN DEFAULT FALSE
      `);
      console.log('✅ has_selected_goal column added to battle_participants');
    }

    await pool.query(`
      ALTER TABLE battles DROP CONSTRAINT IF EXISTS battles_status_check
    `);

    await pool.query(`
      ALTER TABLE battles
      ADD CONSTRAINT battles_status_check
      CHECK (status IN ('planning', 'goal_selection', 'resolution', 'completed', 'cancelled'))
    `);

    console.log('✅ Battle goals structures ready');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

module.exports = createBattleGoalsTable;

if (require.main === module) {
  createBattleGoalsTable()
    .then(() => {
      console.log('🎉 Migration completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}
