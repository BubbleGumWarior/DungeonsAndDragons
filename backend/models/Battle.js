const { pool } = require('./database');
const Army = require('./Army');

class Battle {
  // Create a new battle
  static async create(battleData) {
    const {
      campaign_id,
      battle_name,
      terrain_description = '',
      total_rounds = 5
    } = battleData;
    
    try {
      const result = await pool.query(
        `INSERT INTO battles (campaign_id, battle_name, terrain_description, status, current_round, total_rounds)
         VALUES ($1, $2, $3, 'planning', 0, $4)
         RETURNING *`,
        [campaign_id, battle_name, terrain_description, total_rounds]
      );
      
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }
  
  // Find battle by ID with all participants
  static async findById(battleId) {
    try {
      const battleResult = await pool.query(
        `SELECT * FROM battles WHERE id = $1`,
        [battleId]
      );
      
      if (battleResult.rows.length === 0) return null;
      
      const battle = battleResult.rows[0];
      
      // Get participants with character abilities
      const participantsResult = await pool.query(
        `SELECT bp.id, bp.battle_id, bp.army_id, bp.team_name, bp.faction_color, 
                bp.is_temporary, bp.temp_army_name, bp.temp_army_category, bp.temp_army_stats,
                bp.current_score, bp.base_score, bp.position_x, bp.position_y, bp.created_at,
                bp.current_troops, bp.has_selected_goal, bp.is_summoned, bp.controller_user_id,
                bp.current_morale, bp.max_morale, bp.has_fled, bp.fled_troops, bp.last_morale_check, bp.hidden_until_round,
                a.name as army_name, a.category as army_category,
                a.numbers, a.equipment, a.discipline, 
                a.morale, a.command, a.logistics, a.player_id, 
                COALESCE(a.total_troops, bp.temp_army_troops) as army_total_troops,
                COALESCE(u.username, cu.username) as player_name, COALESCE(u.id, bp.controller_user_id) as user_id,
                ch.abilities as character_abilities
         FROM battle_participants bp
         LEFT JOIN armies a ON bp.army_id = a.id
         LEFT JOIN users u ON a.player_id = u.id
         LEFT JOIN users cu ON bp.controller_user_id = cu.id
         LEFT JOIN characters ch ON ch.player_id = a.player_id AND ch.campaign_id = $2
         WHERE bp.battle_id = $1
         ORDER BY bp.team_name, bp.id`,
        [battleId, battle.campaign_id]
      );
      
      battle.participants = participantsResult.rows.map(p => ({
        ...p,
        // A hidden army cannot be seen or targeted until the round after its stealth check passes
        is_hidden: p.hidden_until_round !== null && p.hidden_until_round !== undefined && p.hidden_until_round >= battle.current_round,
        // Ensure army_category is properly set (prefer armies table category over temp)
        army_category: p.army_category || p.temp_army_category || 'Swordsmen'
      }));
      
      // DEBUG: Log what we're returning for Assassins army
      const assassinsParticipant = battle.participants.find(p => p.army_name === 'Assassins');
      if (assassinsParticipant) {
        console.log(`✅ Battle.findById - Assassins participant:`, {
          id: assassinsParticipant.id,
          army_name: assassinsParticipant.army_name,
          army_category: assassinsParticipant.army_category,
          temp_army_category: assassinsParticipant.temp_army_category
        });
      }
      
      return battle;
    } catch (error) {
      throw error;
    }
  }
  
  // Find active battle for a campaign
  static async findActiveByCampaign(campaignId) {
    try {
      const result = await pool.query(
        `SELECT * FROM battles 
         WHERE campaign_id = $1 AND status NOT IN ('completed', 'cancelled')
         ORDER BY created_at DESC
         LIMIT 1`,
        [campaignId]
      );
      
      if (result.rows.length === 0) return null;
      
      return await this.findById(result.rows[0].id);
    } catch (error) {
      throw error;
    }
  }
  
  // Update battle status
  static async updateStatus(battleId, status) {
    try {
      const result = await pool.query(
        `UPDATE battles SET status = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [battleId, status]
      );
      
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }
  
  // Advance to next round
  static async advanceRound(battleId) {
    try {
      // Check if only one faction with troops remains
      const factionCheck = await pool.query(
        `SELECT DISTINCT team_name 
         FROM battle_participants 
         WHERE battle_id = $1 AND current_troops > 0
         GROUP BY team_name`,
        [battleId]
      );

      // If only one or zero factions have troops, end the battle
      if (factionCheck.rows.length <= 1) {
        const endResult = await pool.query(
          `UPDATE battles SET status = 'completed', updated_at = CURRENT_TIMESTAMP
           WHERE id = $1
           RETURNING *`,
          [battleId]
        );
        return endResult.rows[0];
      }

      // Otherwise, advance to next round normally
      const result = await pool.query(
        `UPDATE battles SET current_round = current_round + 1, status = 'goal_selection', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [battleId]
      );

      // Reset goal selection flags for the new round
      await pool.query(
        `UPDATE battle_participants SET has_selected_goal = false WHERE battle_id = $1`,
        [battleId]
      );

      // Clean any existing goals for the new round (safety)
      if (result.rows.length > 0) {
        await pool.query(
          `DELETE FROM battle_goals WHERE battle_id = $1 AND round_number = $2`,
          [battleId, result.rows[0].current_round]
        );
      }
      
      await Battle.ensureMorale(battleId);
      const advanced = result.rows[0];
      advanced.morale_checks = await Battle.runMoraleChecks(battleId, advanced.current_round);
      return advanced;
    } catch (error) {
      throw error;
    }
  }

  static async getGoals(battleId, roundNumber) {
    try {
      const result = await pool.query(
        `SELECT bg.*,
                bp_executor.team_name as executor_team_name,
                COALESCE(bp_executor.temp_army_name, a_executor.name, 'Army #' || bp_executor.id) as executor_army_name,
                COALESCE(bp_target.temp_army_name, a_target.name, 'Army #' || bp_target.id) as target_army_name,
                bp_executor.army_id as executor_army_id,
                bp_executor.is_temporary as executor_is_temporary,
                bp_executor.current_troops as executor_current_troops,
                bp_target.current_troops as target_current_troops
         FROM battle_goals bg
         LEFT JOIN battle_participants bp_executor ON bg.participant_id = bp_executor.id
         LEFT JOIN battle_participants bp_target ON bg.target_participant_id = bp_target.id
         LEFT JOIN armies a_executor ON bp_executor.army_id = a_executor.id
         LEFT JOIN armies a_target ON bp_target.army_id = a_target.id
         WHERE bg.battle_id = $1 AND bg.round_number = $2
         ORDER BY bg.team_name, bg.id`,
        [battleId, roundNumber]
      );

      return result.rows;
    } catch (error) {
      throw error;
    }
  }

  static async setGoal(goalData) {
    const {
      battle_id,
      round_number,
      participant_id,
      team_name,
      goal_key,
      goal_name,
      goal_type,
      target_participant_id
    } = goalData;

    try {
      const existing = await pool.query(
        `SELECT id FROM battle_goals WHERE battle_id = $1 AND round_number = $2 AND participant_id = $3`,
        [battle_id, round_number, participant_id]
      );

      let goalResult;

      if (existing.rows.length > 0) {
        goalResult = await pool.query(
          `UPDATE battle_goals
           SET goal_key = $2, goal_name = $3, goal_type = $4, target_participant_id = $5,
               status = 'selected', updated_at = CURRENT_TIMESTAMP
           WHERE id = $1
           RETURNING *`,
          [existing.rows[0].id, goal_key, goal_name, goal_type, target_participant_id]
        );
      } else {
        goalResult = await pool.query(
          `INSERT INTO battle_goals
           (battle_id, round_number, participant_id, team_name, goal_key, goal_name, goal_type, target_participant_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [battle_id, round_number, participant_id, team_name, goal_key, goal_name, goal_type, target_participant_id]
        );
      }

      await pool.query(
        `UPDATE battle_participants SET has_selected_goal = true WHERE id = $1`,
        [participant_id]
      );

      return goalResult.rows[0];
    } catch (error) {
      throw error;
    }
  }

  static async resolveGoal(goalId, resolutionData) {
    const {
      attacker_roll,
      defender_roll,
      logistics_roll,
      roll_details,
      advantage,
      casualties_target,
      casualties_self,
      score_change_target,
      score_change_self,
      notes
    } = resolutionData;

    try {
      const result = await pool.query(
        `UPDATE battle_goals
         SET attacker_roll = $2,
             defender_roll = $3,
             logistics_roll = $4,
             roll_details = $5,
             advantage = $6,
             casualties_target = $7,
             casualties_self = $8,
             score_change_target = $9,
             score_change_self = $10,
             notes = $11,
             status = 'resolved',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [goalId, attacker_roll, defender_roll, logistics_roll, roll_details, advantage, casualties_target, casualties_self, score_change_target, score_change_self, notes]
      );

      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  static async updateGoalResult(goalId, updates) {
    const {
      casualties_target,
      casualties_self,
      score_change_target,
      score_change_self,
      notes,
      morale_change_self,
      morale_change_target
    } = updates;

    // Manual (DM-ruled) goals can also shift morale; it rides along in roll_details and is applied with the goal
    const moralePatch = {};
    if (Number.isFinite(morale_change_self)) moralePatch.morale_change = morale_change_self;
    if (Number.isFinite(morale_change_target)) moralePatch.morale_change_target = morale_change_target;

    try {
      const result = await pool.query(
        `UPDATE battle_goals
         SET casualties_target = $2,
             casualties_self = $3,
             score_change_target = $4,
             score_change_self = $5,
             notes = COALESCE($6, notes),
             roll_details = COALESCE(roll_details, '{}'::jsonb) || $7::jsonb,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [goalId, casualties_target, casualties_self, score_change_target, score_change_self, notes, JSON.stringify(moralePatch)]
      );

      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  static async applyGoalResults(battleId, roundNumber) {
    try {
      const goalsResult = await pool.query(
        `SELECT * FROM battle_goals
         WHERE battle_id = $1 AND round_number = $2 AND status = 'resolved'`,
        [battleId, roundNumber]
      );

      const goals = goalsResult.rows;
      const participantChanges = new Map();
      const lossInfo = new Map();

      goals.forEach(goal => {
        const targetId = goal.target_participant_id;
        const executorId = goal.participant_id;

        if (targetId) {
          const targetChange = participantChanges.get(targetId) || { troopDelta: 0, scoreDelta: 0 };
          targetChange.troopDelta -= (goal.casualties_target || 0);
          targetChange.scoreDelta += (goal.score_change_target || 0);
          participantChanges.set(targetId, targetChange);
        }

        if (executorId) {
          const executorChange = participantChanges.get(executorId) || { troopDelta: 0, scoreDelta: 0 };
          executorChange.troopDelta -= (goal.casualties_self || 0);
          executorChange.scoreDelta += (goal.score_change_self || 0);
          participantChanges.set(executorId, executorChange);
        }
      });

      for (const [participantId, change] of participantChanges.entries()) {
        const participantResult = await pool.query(
          `SELECT current_troops, current_score FROM battle_participants WHERE id = $1`,
          [participantId]
        );

        if (participantResult.rows.length === 0) continue;

        const currentTroops = participantResult.rows[0].current_troops || 0;
        const currentScore = participantResult.rows[0].current_score || 0;

        const nextTroops = Math.max(0, currentTroops + change.troopDelta);
        const rawScore = nextTroops === 0 ? 0 : currentScore + change.scoreDelta;
        const nextScore = Math.max(0, rawScore);
        const finalTroops = nextScore === 0 ? 0 : nextTroops;

        await pool.query(
          `UPDATE battle_participants
           SET current_troops = $2, current_score = $3
           WHERE id = $1`,
          [participantId, finalTroops, nextScore]
        );
        lossInfo.set(participantId, { before: currentTroops, after: finalTroops });
      }

      await Battle.applyMoraleFromGoals(battleId, goals, lossInfo);

      // Stealth: a passed check hides the army for the next round; a strike gives the position away
      for (const goal of goals) {
        const details = goal.roll_details || {};
        if (details.hidden) {
          await pool.query(`UPDATE battle_participants SET hidden_until_round = $2 WHERE id = $1`, [goal.participant_id, roundNumber + 1]);
        }
        if (goal.goal_key === 'stealth_strike') {
          await pool.query(`UPDATE battle_participants SET hidden_until_round = NULL WHERE id = $1`, [goal.participant_id]);
        }
      }

      // Necromancers raise a share of what they killed as skeletons of the fallen unit line
      const raiseNotes = await Battle.raiseDeadForGoals(battleId, goals);
      for (const [goalId, note] of raiseNotes.entries()) {
        await pool.query(
          `UPDATE battle_goals SET notes = TRIM(CONCAT(COALESCE(notes, ''), ' ', $2::text)) WHERE id = $1`,
          [goalId, note]
        );
      }

      const appliedResult = await pool.query(
        `UPDATE battle_goals
         SET status = 'applied', updated_at = CURRENT_TIMESTAMP
         WHERE battle_id = $1 AND round_number = $2 AND status = 'resolved'
         RETURNING *`,
        [battleId, roundNumber]
      );

      return appliedResult.rows;
    } catch (error) {
      throw error;
    }
  }
  
  // Give every army without morale its starting value: a flat base plus a share per point of the morale stat.
  static async ensureMorale(battleId) {
    const { maxMoraleFor } = require('../utils/morale');
    const rows = await pool.query(
      `SELECT bp.id,
              COALESCE(CASE WHEN bp.is_temporary THEN (bp.temp_army_stats->>'morale')::int ELSE a.morale END, 5) AS morale_stat
       FROM battle_participants bp
       LEFT JOIN armies a ON bp.army_id = a.id
       WHERE bp.battle_id = $1 AND bp.current_morale IS NULL AND bp.is_summoned = FALSE`,
      [battleId]
    );
    for (const row of rows.rows) {
      const max = maxMoraleFor(row.morale_stat);
      await pool.query(`UPDATE battle_participants SET current_morale = $2, max_morale = $2 WHERE id = $1`, [row.id, max]);
    }
  }

  // Start-of-round saving throws. Only armies that have fallen below the break point roll; failing means they flee.
  static async runMoraleChecks(battleId, round) {
    const { BREAK_POINT, rollSave } = require('../utils/morale');
    const rows = await pool.query(
      `SELECT bp.id, bp.current_morale, bp.current_troops,
              COALESCE(bp.temp_army_name, a.name, 'Army #' || bp.id) AS name,
              COALESCE(CASE WHEN bp.is_temporary THEN (bp.temp_army_stats->>'morale')::int ELSE a.morale END, 5) AS morale_stat
       FROM battle_participants bp
       LEFT JOIN armies a ON bp.army_id = a.id
       WHERE bp.battle_id = $1 AND bp.current_troops > 0 AND bp.is_summoned = FALSE
         AND bp.has_fled = FALSE AND bp.current_morale IS NOT NULL AND bp.current_morale < $2`,
      [battleId, BREAK_POINT]
    );
    const checks = [];
    for (const row of rows.rows) {
      const save = rollSave(row.current_morale, row.morale_stat);
      const record = { round, roll: save.roll, needed: save.needed, passed: save.passed, morale: row.current_morale };
      if (save.passed) {
        await pool.query(`UPDATE battle_participants SET last_morale_check = $2 WHERE id = $1`, [row.id, JSON.stringify(record)]);
      } else {
        // The army leaves the field: no troops to command, no score to count
        await pool.query(
          `UPDATE battle_participants
           SET last_morale_check = $2, has_fled = TRUE, fled_troops = current_troops, current_troops = 0, current_score = 0
           WHERE id = $1`,
          [row.id, JSON.stringify(record)]
        );
      }
      checks.push({ participantId: row.id, name: row.name, ...record });
    }
    return checks;
  }

  // Morale after a round of resolved goals: losses and lost exchanges hurt, wins and quiet rounds help, rally goals restore.
  static async applyMoraleFromGoals(battleId, goals, lossInfo) {
    const { moraleLossForCasualties, moraleGainForKills } = require('../utils/morale');
    const delta = new Map();
    const add = (id, amount) => delta.set(id, (delta.get(id) || 0) + amount);

    for (const [id, info] of lossInfo.entries()) {
      const lost = info.before - info.after;
      if (lost > 0) add(id, -moraleLossForCasualties(lost / Math.max(1, info.before)));
    }

    for (const goal of goals) {
      const details = goal.roll_details || {};
      if (details.morale_change) add(goal.participant_id, details.morale_change);
      // Cutting down a large part of the enemy lifts the army that did it
      if (goal.target_participant_id && goal.casualties_target > 0) {
        const targetInfo = lossInfo.get(goal.target_participant_id);
        if (targetInfo) add(goal.participant_id, moraleGainForKills(goal.casualties_target / Math.max(1, targetInfo.before)));
      }
      if (details.morale_change_target && goal.target_participant_id) add(goal.target_participant_id, details.morale_change_target);
      if (goal.goal_type === 'attack' && goal.target_participant_id) {
        const exec = lossInfo.get(goal.participant_id);
        const target = lossInfo.get(goal.target_participant_id);
        const execLoss = (goal.casualties_self || 0) / Math.max(1, exec ? exec.before : 1);
        const targetLoss = (goal.casualties_target || 0) / Math.max(1, target ? target.before : 1);
        const diff = targetLoss - execLoss;
        if (Math.abs(diff) >= 0.03) {
          add(diff > 0 ? goal.participant_id : goal.target_participant_id, 4);
          add(diff > 0 ? goal.target_participant_id : goal.participant_id, -4);
        }
      }
    }

    // Armies that were not bloodied this round steady a little
    const alive = await pool.query(
      `SELECT id FROM battle_participants WHERE battle_id = $1 AND current_troops > 0 AND is_summoned = FALSE`,
      [battleId]
    );
    for (const row of alive.rows) {
      const info = lossInfo.get(row.id);
      if (!info || info.before - info.after <= 0) add(row.id, 2);
    }

    for (const [id, amount] of delta.entries()) {
      if (!amount) continue;
      await pool.query(
        `UPDATE battle_participants
         SET current_morale = GREATEST(0, current_morale + $2)
         WHERE id = $1 AND is_summoned = FALSE AND current_morale IS NOT NULL`,
        [id, amount]
      );
    }
  }

  // Raise skeletons from the kills of resolved attack goals made by necromancers.
  // Returns a Map of goalId -> note describing what was raised.
  static async raiseDeadForGoals(battleId, goals) {
    const { RAISE_DEAD } = require('../utils/battleGoals');
    const { UNIT_TEMPLATES } = require('../utils/unitTemplates');
    const notes = new Map();

    for (const goal of goals) {
      if (goal.goal_type !== 'attack' || !(goal.casualties_target > 0) || !goal.target_participant_id) continue;

      const infoResult = await pool.query(
        `SELECT ex.id, ex.team_name, ex.faction_color, ex.controller_user_id, ex.current_score,
                CASE WHEN ex.is_temporary THEN ex.temp_army_category ELSE ea.category END AS category,
                ea.player_id,
                CASE WHEN tg.is_temporary THEN tg.temp_army_category ELSE ta.category END AS target_category,
                tg.position_x AS target_x, tg.position_y AS target_y
         FROM battle_participants ex
         LEFT JOIN armies ea ON ex.army_id = ea.id
         JOIN battle_participants tg ON tg.id = $2
         LEFT JOIN armies ta ON tg.army_id = ta.id
         WHERE ex.id = $1`,
        [goal.participant_id, goal.target_participant_id]
      );
      const info = infoResult.rows[0];
      if (!info || !RAISE_DEAD.categories.includes(info.category)) continue;

      const raised = Math.floor(goal.casualties_target * RAISE_DEAD.percent);
      if (raised < 1) continue;

      const category = info.target_category || 'Recruit';
      const base = (UNIT_TEMPLATES[category] && UNIT_TEMPLATES[category].stats) || { equipment: 5, discipline: 5, morale: 5, command: 5, logistics: 5 };
      // Undead are poorly equipped and drilled compared with the living unit they were
      const stats = { ...base, equipment: Math.max(1, base.equipment - 1), discipline: Math.max(1, base.discipline - 1) };
      const statSum = stats.equipment + stats.discipline + stats.morale + stats.command + stats.logistics;
      const scoreFor = (troops) => (Army.calculateNumbersStat(troops) * 5) + statSum;
      const name = `Skeleton ${category}`;

      const existing = await pool.query(
        `SELECT id, current_troops FROM battle_participants
         WHERE battle_id = $1 AND is_summoned = TRUE AND summoned_by_participant_id = $2
           AND temp_army_category = $3 AND current_troops > 0
         ORDER BY id LIMIT 1`,
        [battleId, info.id, category]
      );

      if (existing.rows.length > 0) {
        const row = existing.rows[0];
        const nextTroops = row.current_troops + raised;
        const delta = scoreFor(nextTroops) - scoreFor(row.current_troops);
        await pool.query(
          `UPDATE battle_participants
           SET current_troops = $2, temp_army_troops = temp_army_troops + $3,
               base_score = base_score + $4, current_score = current_score + $4
           WHERE id = $1`,
          [row.id, nextTroops, raised, delta]
        );
        notes.set(goal.id, `Raised ${raised} ${name} (reinforcing the existing skeleton army).`);
      } else {
        const score = scoreFor(raised);
        await pool.query(
          `INSERT INTO battle_participants
             (battle_id, army_id, team_name, faction_color, is_temporary, temp_army_name, temp_army_category,
              temp_army_troops, temp_army_stats, position_x, position_y, base_score, current_score, current_troops,
              is_summoned, controller_user_id, summoned_by_participant_id, current_morale, max_morale)
           VALUES ($1, NULL, $2, $3, TRUE, $4, $5, $6, $7, $8, $9, $10, $10, $6, TRUE, $11, $12, 100, 100)`,
          [battleId, info.team_name, info.faction_color, name, category, raised, JSON.stringify(stats),
           Number.isFinite(Number(info.target_x)) ? Number(info.target_x) : 50, Number.isFinite(Number(info.target_y)) ? Number(info.target_y) : 50,
           score, info.player_id || info.controller_user_id || null, info.id]
        );
        notes.set(goal.id, `Raised ${raised} ${name}.`);
      }
    }
    return notes;
  }

  // Add participant to battle
  static async addParticipant(participantData) {
    const {
      battle_id,
      army_id,
      team_name,
      faction_color = '#808080',
      is_temporary = false,
      temp_army_name,
      temp_army_category = 'Swordsmen',
      temp_army_stats,
      temp_army_troops = 100,
      position_x = 50,
      position_y = 50
    } = participantData;
    
    // Get troop count from army if not temporary
    let current_troops = temp_army_troops;
    if (!is_temporary && army_id) {
      const armyResult = await pool.query('SELECT total_troops FROM armies WHERE id = $1', [army_id]);
      if (armyResult.rows.length > 0) {
        current_troops = armyResult.rows[0].total_troops;
      }
    }
    
    try {
      const result = await pool.query(
        `INSERT INTO battle_participants 
         (battle_id, army_id, team_name, faction_color, is_temporary, temp_army_name, temp_army_category, temp_army_troops, temp_army_stats, position_x, position_y, base_score, current_score, current_troops)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0, 0, $12)
         RETURNING *`,
        [battle_id, army_id, team_name, faction_color, is_temporary, temp_army_name, temp_army_category,
         temp_army_troops, temp_army_stats ? JSON.stringify(temp_army_stats) : null, position_x, position_y, current_troops]
      );
      
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }
  
  // Update participant position
  static async updateParticipantPosition(participantId, x, y) {
    try {
      await pool.query(
        `UPDATE battle_participants SET position_x = $2, position_y = $3 WHERE id = $1`,
        [participantId, x, y]
      );
    } catch (error) {
      throw error;
    }
  }
  
  // Calculate and update base scores for all participants
  static async calculateBaseScores(battleId) {
    try {
      await Battle.ensureMorale(battleId);
      // Get the current round to determine if this is the first scoring
      const battleResult = await pool.query(
        `SELECT current_round FROM battles WHERE id = $1`,
        [battleId]
      );
      
      const currentRound = battleResult.rows[0].current_round;
      const isFirstRound = currentRound <= 1;
      
      const participants = await pool.query(
        `SELECT bp.*, a.numbers, a.equipment, a.discipline, a.morale, a.command, a.logistics
         FROM battle_participants bp
         LEFT JOIN armies a ON bp.army_id = a.id
         WHERE bp.battle_id = $1`,
        [battleId]
      );
      
      for (const participant of participants.rows) {
        // Check if participant has 0 troops and zero out their score if so
        if (participant.current_troops === 0) {
          await pool.query(
            `UPDATE battle_participants SET current_score = 0 WHERE id = $1`,
            [participant.id]
          );
          continue; // Skip rolling for eliminated armies
        }
        
        let stats;
        
        if (participant.is_temporary) {
          stats = participant.temp_army_stats;
          // Calculate numbers stat from temp_army_troops
          const troopCount = participant.current_troops || 100;
          stats.numbers = Army.calculateNumbersStat(troopCount);
        } else {
          stats = {
            numbers: participant.numbers,
            equipment: participant.equipment,
            discipline: participant.discipline,
            morale: participant.morale,
            command: participant.command,
            logistics: participant.logistics
          };
        }
        
        if (isFirstRound) {
          // First round: Calculate base score from stats only (no RNG after battle start)
          // Numbers stat applies 5x the normal rate
          const statSum = ((stats.numbers || 0) * 5) + (stats.equipment || 0) + (stats.discipline || 0) + 
                         (stats.morale || 0) + (stats.command || 0) + (stats.logistics || 0);
          const baseScore = statSum;
          
          await pool.query(
            `UPDATE battle_participants SET base_score = $2, current_score = $2 WHERE id = $1`,
            [participant.id, baseScore]
          );
        } else {
          // Subsequent rounds: No random roll applied
          await pool.query(
            `UPDATE battle_participants SET current_score = current_score WHERE id = $1`,
            [participant.id]
          );
        }
      }
      if (isFirstRound) await Battle.applyStartingMorale(battleId);
    } catch (error) {
      throw error;
    }
  }

  // Compare the sides' strength once base scores exist: the stronger side starts bolder, the weaker side warier.
  static async applyStartingMorale(battleId) {
    const { startingMoraleShift, FLOOR_AT_START } = require('../utils/morale');
    const rows = await pool.query(
      `SELECT id, team_name, current_score, current_morale, max_morale, morale_shift
       FROM battle_participants
       WHERE battle_id = $1 AND current_troops > 0 AND is_summoned = FALSE AND current_morale IS NOT NULL`,
      [battleId]
    );
    const teamStrength = {};
    rows.rows.forEach(p => { teamStrength[p.team_name] = (teamStrength[p.team_name] || 0) + (Number(p.current_score) || 0); });
    const teams = Object.keys(teamStrength);
    if (teams.length < 2) return;
    const total = teams.reduce((sum, t) => sum + teamStrength[t], 0);

    for (const p of rows.rows) {
      // The shift is applied once per army, so recalculating scores cannot stack it
      if (p.morale_shift !== null && p.morale_shift !== undefined) continue;
      const own = teamStrength[p.team_name];
      const opposing = (total - own) / (teams.length - 1);
      const shifted = Math.max(FLOOR_AT_START, p.max_morale + startingMoraleShift(own, opposing));
      await pool.query(`UPDATE battle_participants SET current_morale = $2, max_morale = $2, morale_shift = $3 WHERE id = $1`, [p.id, shifted, shifted - p.max_morale]);
    }
  }

  // Get final battle results
  static async getBattleResults(battleId) {
    try {
      const participants = await pool.query(
        `SELECT bp.*, a.name as army_name, a.id as army_id, a.player_id, a.total_troops as army_total_troops,
                u.id as user_id, u.username as player_name
         FROM battle_participants bp
         LEFT JOIN armies a ON bp.army_id = a.id
         LEFT JOIN users u ON a.player_id = u.id
         WHERE bp.battle_id = $1
         ORDER BY bp.current_score DESC`,
        [battleId]
      );
      
      return participants.rows;
    } catch (error) {
      throw error;
    }
  }
  
  // Apply troop casualties to a participant
  static async applyTroopCasualties(participantId, casualties) {
    try {
      const result = await pool.query(
        `UPDATE battle_participants 
         SET current_troops = GREATEST(0, current_troops - $2)
         WHERE id = $1
         RETURNING *`,
        [participantId, casualties]
      );
      
      const participant = result.rows[0];
      
      // If troops dropped to 0, set current_score to 0 (remove from battle)
      if (participant.current_troops === 0) {
        await pool.query(
          `UPDATE battle_participants 
           SET current_score = 0
           WHERE id = $1`,
          [participantId]
        );
        participant.current_score = 0;
      }
      
      return participant;
    } catch (error) {
      throw error;
    }
  }
  
  // Get active participants (troops > 0)
  static async getActiveParticipants(battleId) {
    try {
      const result = await pool.query(
        `SELECT bp.*, a.name as army_name 
         FROM battle_participants bp
         LEFT JOIN armies a ON bp.army_id = a.id
         WHERE bp.battle_id = $1 AND bp.current_troops > 0`,
        [battleId]
      );
      
      return result.rows;
    } catch (error) {
      throw error;
    }
  }
  
  // Delete battle
  static async delete(battleId) {
    try {
      await pool.query('DELETE FROM battles WHERE id = $1', [battleId]);
      return true;
    } catch (error) {
      throw error;
    }
  }

  // Create battle invitation
  static async invitePlayer(battleId, playerId, teamName, factionColor = '#808080') {
    try {
      // First, update any existing pending invitations for this player/battle to 'superseded'
      await pool.query(
        `UPDATE battle_invitations 
         SET status = 'superseded' 
         WHERE battle_id = $1 AND player_id = $2 AND status = 'pending'`,
        [battleId, playerId]
      );
      
      // Then create the new invitation
      const result = await pool.query(
        `INSERT INTO battle_invitations (battle_id, player_id, team_name, faction_color, status)
         VALUES ($1, $2, $3, $4, 'pending')
         RETURNING *`,
        [battleId, playerId, teamName, factionColor]
      );
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // Get invitations for a player
  static async getPlayerInvitations(playerId, campaignId) {
    try {
      const result = await pool.query(
        `SELECT bi.*, b.battle_name, b.terrain_description, b.status as battle_status, b.current_round
         FROM battle_invitations bi
         JOIN battles b ON bi.battle_id = b.id
         WHERE bi.player_id = $1 AND b.campaign_id = $2 AND bi.status = 'pending'
         ORDER BY bi.invited_at DESC
         LIMIT 1`,
        [playerId, campaignId]
      );
      return result.rows;
    } catch (error) {
      throw error;
    }
  }

  // Get invitations for a battle
  static async getBattleInvitations(battleId) {
    try {
      const result = await pool.query(
        `SELECT bi.*, u.username, u.id as user_id
         FROM battle_invitations bi
         JOIN users u ON bi.player_id = u.id
         WHERE bi.battle_id = $1
         ORDER BY bi.invited_at DESC`,
        [battleId]
      );
      return result.rows;
    } catch (error) {
      throw error;
    }
  }

  // Accept invitation and add armies
  static async acceptInvitation(invitationId, armyIds) {
    try {
      // Get invitation details
      const inviteResult = await pool.query(
        `SELECT * FROM battle_invitations WHERE id = $1`,
        [invitationId]
      );
      
      if (inviteResult.rows.length === 0) {
        throw new Error('Invitation not found');
      }
      
      const invitation = inviteResult.rows[0];
      
      // Update invitation status
      await pool.query(
        `UPDATE battle_invitations 
         SET status = 'accepted', responded_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [invitationId]
      );
      
      // Add each army as a participant
      const participants = [];
      for (const armyId of armyIds) {
        // Get army's total_troops
        const armyResult = await pool.query('SELECT total_troops FROM armies WHERE id = $1', [armyId]);
        const current_troops = armyResult.rows.length > 0 ? armyResult.rows[0].total_troops : 100;
        
        const result = await pool.query(
          `INSERT INTO battle_participants (battle_id, army_id, team_name, faction_color, is_temporary, current_troops)
           VALUES ($1, $2, $3, $4, FALSE, $5)
           RETURNING *`,
          [invitation.battle_id, armyId, invitation.team_name, invitation.faction_color, current_troops]
        );
        participants.push(result.rows[0]);
      }
      
      return { invitation, participants };
    } catch (error) {
      throw error;
    }
  }

  // Decline invitation
  static async declineInvitation(invitationId) {
    try {
      const result = await pool.query(
        `UPDATE battle_invitations 
         SET status = 'declined', responded_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [invitationId]
      );
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }
}

module.exports = Battle;
