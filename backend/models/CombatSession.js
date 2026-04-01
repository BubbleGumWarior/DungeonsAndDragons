const { pool } = require('./database');

class CombatSession {
  // ── Session management ────────────────────────────────────────────────────

  static async create(campaignId) {
    const result = await pool.query(
      `INSERT INTO combat_sessions (campaign_id, status, current_turn_index)
       VALUES ($1, 'active', -1)
       RETURNING *`,
      [campaignId]
    );
    return result.rows[0];
  }

  static async findActiveByCampaign(campaignId) {
    const result = await pool.query(
      `SELECT * FROM combat_sessions WHERE campaign_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
      [campaignId]
    );
    return result.rows[0] || null;
  }

  static async updateTurnIndex(sessionId, turnIndex) {
    const result = await pool.query(
      `UPDATE combat_sessions SET current_turn_index = $1 WHERE id = $2 RETURNING *`,
      [turnIndex, sessionId]
    );
    return result.rows[0];
  }

  static async endSession(sessionId) {
    await pool.query(
      `UPDATE combat_sessions SET status = 'ended' WHERE id = $1`,
      [sessionId]
    );
    // Cascade delete handles combat_combatants, combat_log, combat_death_saves, combat_dice_requests
    await pool.query(`DELETE FROM combat_sessions WHERE id = $1`, [sessionId]);
  }

  // ── Combatants ─────────────────────────────────────────────────────────────

  static async addCombatant(data) {
    const {
      session_id,
      character_id = null,
      monster_instance_id = null,
      combatant_key,
      name,
      player_id,
      initiative,
      movement_speed,
      is_monster = false,
      is_beast = false,
      owner_character_id = null,
      position_x = 50,
      position_y = 50,
    } = data;

    const result = await pool.query(
      `INSERT INTO combat_combatants
         (session_id, character_id, monster_instance_id, combatant_key, name, player_id,
          initiative, movement_speed, remaining_movement, is_monster, is_beast,
          owner_character_id, position_x, position_y)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        session_id, character_id, monster_instance_id, combatant_key, name, player_id,
        initiative, movement_speed, movement_speed, is_monster, is_beast,
        owner_character_id, position_x, position_y,
      ]
    );
    return result.rows[0];
  }

  static async getCombatants(sessionId) {
    const result = await pool.query(
      `SELECT * FROM combat_combatants
       WHERE session_id = $1 AND is_active = TRUE
       ORDER BY initiative DESC, id ASC`,
      [sessionId]
    );
    return result.rows;
  }

  static async updateCombatant(id, fields) {
    const allowedFields = [
      'position_x', 'position_y', 'remaining_movement', 'conditions',
      'action_used', 'bonus_action_used', 'reaction_used', 'concentration_spell',
      'is_active', 'initiative',
    ];
    const updates = [];
    const values = [];
    let paramIdx = 1;

    for (const [key, value] of Object.entries(fields)) {
      if (allowedFields.includes(key)) {
        updates.push(`${key} = $${paramIdx}`);
        values.push(key === 'conditions' ? JSON.stringify(value) : value);
        paramIdx++;
      }
    }

    if (updates.length === 0) return null;

    values.push(id);
    const result = await pool.query(
      `UPDATE combat_combatants SET ${updates.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      values
    );
    return result.rows[0];
  }

  static async getCombatantByKey(sessionId, combatantKey) {
    const result = await pool.query(
      `SELECT * FROM combat_combatants WHERE session_id = $1 AND combatant_key = $2 AND is_active = TRUE`,
      [sessionId, combatantKey]
    );
    return result.rows[0] || null;
  }

  static async removeCombatant(id) {
    const result = await pool.query(
      `UPDATE combat_combatants SET is_active = FALSE WHERE id = $1 RETURNING *`,
      [id]
    );
    return result.rows[0];
  }

  static async resetTurnEconomy(sessionId, combatantKey) {
    const result = await pool.query(
      `UPDATE combat_combatants
       SET action_used = FALSE, bonus_action_used = FALSE, reaction_used = FALSE,
           remaining_movement = movement_speed
       WHERE session_id = $1 AND combatant_key = $2
       RETURNING *`,
      [sessionId, combatantKey]
    );
    return result.rows[0];
  }

  // ── Combat log ────────────────────────────────────────────────────────────

  static async addLogEntry(data) {
    const {
      session_id,
      actor_name = null,
      action_type,
      target_name = null,
      limb_name = null,
      roll_result = null,
      damage = null,
      details = null,
    } = data;

    const result = await pool.query(
      `INSERT INTO combat_log
         (session_id, actor_name, action_type, target_name, limb_name, roll_result, damage, details)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [session_id, actor_name, action_type, target_name, limb_name, roll_result, damage, details]
    );
    return result.rows[0];
  }

  static async getLog(sessionId, limit = 100) {
    const result = await pool.query(
      `SELECT * FROM combat_log WHERE session_id = $1 ORDER BY created_at ASC LIMIT $2`,
      [sessionId, limit]
    );
    return result.rows;
  }

  // ── Death saves ───────────────────────────────────────────────────────────

  static async upsertDeathSaves(sessionId, characterId, fields) {
    // fields: { successes?, failures?, is_stable?, is_dead? }
    const result = await pool.query(
      `INSERT INTO combat_death_saves (session_id, character_id, successes, failures, is_stable, is_dead)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (session_id, character_id) DO UPDATE
         SET successes = EXCLUDED.successes,
             failures  = EXCLUDED.failures,
             is_stable = EXCLUDED.is_stable,
             is_dead   = EXCLUDED.is_dead
       RETURNING *`,
      [
        sessionId,
        characterId,
        fields.successes ?? 0,
        fields.failures ?? 0,
        fields.is_stable ?? false,
        fields.is_dead ?? false,
      ]
    );
    return result.rows[0];
  }

  static async getDeathSaves(sessionId) {
    const result = await pool.query(
      `SELECT * FROM combat_death_saves WHERE session_id = $1`,
      [sessionId]
    );
    return result.rows;
  }

  static async getDeathSavesForCharacter(sessionId, characterId) {
    const result = await pool.query(
      `SELECT * FROM combat_death_saves WHERE session_id = $1 AND character_id = $2`,
      [sessionId, characterId]
    );
    return result.rows[0] || null;
  }

  // ── Dice requests ─────────────────────────────────────────────────────────

  static async createDiceRequest(data) {
    const {
      session_id,
      requester_id,
      requester_name,
      target_player_id,
      target_character_name,
      dice_type,
      roll_purpose,
      purpose_detail = null,
    } = data;

    const result = await pool.query(
      `INSERT INTO combat_dice_requests
         (session_id, requester_id, requester_name, target_player_id, target_character_name,
          dice_type, roll_purpose, purpose_detail, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending')
       RETURNING *`,
      [
        session_id, requester_id, requester_name, target_player_id, target_character_name,
        dice_type, roll_purpose, purpose_detail,
      ]
    );
    return result.rows[0];
  }

  static async resolveDiceRequest(requestId, result) {
    const res = await pool.query(
      `UPDATE combat_dice_requests SET status = 'resolved', result = $1 WHERE id = $2 RETURNING *`,
      [result, requestId]
    );
    return res.rows[0];
  }
}

module.exports = CombatSession;
