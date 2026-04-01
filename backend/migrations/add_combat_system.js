const { pool } = require('../models/database');

async function addCombatSystem() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── combat_sessions ──────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS combat_sessions (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        current_turn_index INTEGER NOT NULL DEFAULT -1,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ combat_sessions table ready');

    // ── combat_combatants ─────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS combat_combatants (
        id SERIAL PRIMARY KEY,
        session_id INTEGER NOT NULL REFERENCES combat_sessions(id) ON DELETE CASCADE,
        character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
        monster_instance_id INTEGER REFERENCES monster_instances(id) ON DELETE SET NULL,
        combatant_key VARCHAR(100) NOT NULL,
        name VARCHAR(255) NOT NULL,
        player_id INTEGER,
        initiative INTEGER NOT NULL DEFAULT 0,
        movement_speed INTEGER NOT NULL DEFAULT 30,
        remaining_movement DECIMAL(6,2) NOT NULL DEFAULT 30,
        is_monster BOOLEAN NOT NULL DEFAULT FALSE,
        is_beast BOOLEAN NOT NULL DEFAULT FALSE,
        owner_character_id INTEGER,
        position_x DECIMAL(5,2) NOT NULL DEFAULT 50,
        position_y DECIMAL(5,2) NOT NULL DEFAULT 50,
        conditions JSONB NOT NULL DEFAULT '[]',
        action_used BOOLEAN NOT NULL DEFAULT FALSE,
        bonus_action_used BOOLEAN NOT NULL DEFAULT FALSE,
        reaction_used BOOLEAN NOT NULL DEFAULT FALSE,
        concentration_spell VARCHAR(255),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ combat_combatants table ready');

    // ── combat_log ────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS combat_log (
        id SERIAL PRIMARY KEY,
        session_id INTEGER NOT NULL REFERENCES combat_sessions(id) ON DELETE CASCADE,
        actor_name VARCHAR(255),
        action_type VARCHAR(50) NOT NULL,
        target_name VARCHAR(255),
        limb_name VARCHAR(50),
        roll_result INTEGER,
        damage INTEGER,
        details TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ combat_log table ready');

    // ── combat_death_saves ────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS combat_death_saves (
        id SERIAL PRIMARY KEY,
        session_id INTEGER NOT NULL REFERENCES combat_sessions(id) ON DELETE CASCADE,
        character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
        successes INTEGER NOT NULL DEFAULT 0,
        failures INTEGER NOT NULL DEFAULT 0,
        is_stable BOOLEAN NOT NULL DEFAULT FALSE,
        is_dead BOOLEAN NOT NULL DEFAULT FALSE,
        UNIQUE(session_id, character_id)
      )
    `);
    console.log('✅ combat_death_saves table ready');

    // ── combat_dice_requests ──────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS combat_dice_requests (
        id SERIAL PRIMARY KEY,
        session_id INTEGER NOT NULL REFERENCES combat_sessions(id) ON DELETE CASCADE,
        requester_id INTEGER NOT NULL,
        requester_name VARCHAR(255),
        target_player_id INTEGER NOT NULL,
        target_character_name VARCHAR(255),
        dice_type VARCHAR(10) NOT NULL,
        roll_purpose VARCHAR(50) NOT NULL,
        purpose_detail VARCHAR(255),
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        result INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ combat_dice_requests table ready');

    await client.query('COMMIT');
    console.log('✅ Combat system migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Combat system migration failed:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = addCombatSystem;
