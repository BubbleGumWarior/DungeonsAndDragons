const { pool } = require('./database');

class Battle {
  // Create a new battle
  static async create(battleData) {
    const {
      campaign_id,
      battle_name,
      terrain_description = ''
    } = battleData;
    
    try {
      const result = await pool.query(
        `INSERT INTO battles (campaign_id, battle_name, terrain_description, status, current_round)
         VALUES ($1, $2, $3, 'planning', 0)
         RETURNING *`,
        [campaign_id, battle_name, terrain_description]
      );
      
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }
  
  // Find battle by ID with all participants and goals
  static async findById(battleId) {
    try {
      const battleResult = await pool.query(
        `SELECT * FROM battles WHERE id = $1`,
        [battleId]
      );
      
      if (battleResult.rows.length === 0) return null;
      
      const battle = battleResult.rows[0];
      
      // Get participants
      const participantsResult = await pool.query(
        `SELECT bp.*, a.name as army_name, a.numbers, a.equipment, a.discipline, 
                a.morale, a.command, a.logistics, u.username as player_name, u.id as user_id
         FROM battle_participants bp
         LEFT JOIN armies a ON bp.army_id = a.id
         LEFT JOIN users u ON a.player_id = u.id
         WHERE bp.battle_id = $1
         ORDER BY bp.team_name, bp.id`,
        [battleId]
      );
      
      battle.participants = participantsResult.rows;
      
      // Get goals for current round
      const goalsResult = await pool.query(
        `SELECT bg.*, bp.team_name, bp_target.team_name as target_team_name
         FROM battle_goals bg
         JOIN battle_participants bp ON bg.participant_id = bp.id
         LEFT JOIN battle_participants bp_target ON bg.target_participant_id = bp_target.id
         WHERE bg.battle_id = $1 AND bg.round_number = $2
         ORDER BY bp.team_name`,
        [battleId, battle.current_round]
      );
      
      battle.current_goals = goalsResult.rows;
      
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
      const result = await pool.query(
        `UPDATE battles SET current_round = current_round + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [battleId]
      );
      
      // Reset has_selected_goal for all participants in this battle
      await pool.query(
        `UPDATE battle_participants SET has_selected_goal = false
         WHERE battle_id = $1`,
        [battleId]
      );
      
      return result.rows[0];
    } catch (error) {
      throw error;
    }
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
      position_x = 50,
      position_y = 50
    } = participantData;
    
    try {
      const result = await pool.query(
        `INSERT INTO battle_participants 
         (battle_id, army_id, team_name, faction_color, is_temporary, temp_army_name, temp_army_category, temp_army_stats, position_x, position_y, base_score, current_score, has_selected_goal)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, 0, false)
         RETURNING *`,
        [battle_id, army_id, team_name, faction_color, is_temporary, temp_army_name, temp_army_category,
         temp_army_stats ? JSON.stringify(temp_army_stats) : null, position_x, position_y]
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
      const participants = await pool.query(
        `SELECT bp.*, a.numbers, a.equipment, a.discipline, a.morale, a.command, a.logistics
         FROM battle_participants bp
         LEFT JOIN armies a ON bp.army_id = a.id
         WHERE bp.battle_id = $1`,
        [battleId]
      );
      
      for (const participant of participants.rows) {
        let stats;
        
        if (participant.is_temporary) {
          stats = participant.temp_army_stats;
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
        
        // Calculate base score: sum of stats + 1d10
        const statSum = (stats.numbers || 0) + (stats.equipment || 0) + (stats.discipline || 0) + 
                       (stats.morale || 0) + (stats.command || 0) + (stats.logistics || 0);
        const diceRoll = Math.floor(Math.random() * 10) + 1; // 1d10
        const baseScore = statSum + diceRoll;
        
        await pool.query(
          `UPDATE battle_participants SET base_score = $2, current_score = $2 WHERE id = $1`,
          [participant.id, baseScore]
        );
      }
    } catch (error) {
      throw error;
    }
  }
  
  // Add or update a battle goal (team-based: each team gets 1 goal per round)
  static async setGoal(goalData) {
    const {
      battle_id,
      round_number,
      participant_id,
      goal_name,
      target_participant_id,
      test_type,
      character_modifier = 0,
      army_stat_modifier = 0
    } = goalData;
    
    try {
      // Get the team name from the participant
      const participantResult = await pool.query(
        `SELECT team_name FROM battle_participants WHERE id = $1`,
        [participant_id]
      );
      
      if (participantResult.rows.length === 0) {
        throw new Error('Participant not found');
      }
      
      const team_name = participantResult.rows[0].team_name;
      
      // Check if goal already exists for this TEAM and round (not participant)
      const existing = await pool.query(
        `SELECT id FROM battle_goals 
         WHERE battle_id = $1 AND round_number = $2 AND team_name = $3`,
        [battle_id, round_number, team_name]
      );
      
      if (existing.rows.length > 0) {
        // Update existing goal for this team
        const result = await pool.query(
          `UPDATE battle_goals 
           SET goal_name = $4, target_participant_id = $5, test_type = $6, 
               character_modifier = $7, army_stat_modifier = $8, participant_id = $9
           WHERE id = $1 AND battle_id = $2 AND round_number = $3
           RETURNING *`,
          [existing.rows[0].id, battle_id, round_number, goal_name, target_participant_id, 
           test_type, character_modifier, army_stat_modifier, participant_id]
        );
        return result.rows[0];
      } else {
        // Insert new goal for this team
        const result = await pool.query(
          `INSERT INTO battle_goals 
           (battle_id, round_number, participant_id, team_name, goal_name, target_participant_id, 
            test_type, character_modifier, army_stat_modifier, locked_in)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false)
           RETURNING *`,
          [battle_id, round_number, participant_id, team_name, goal_name, target_participant_id, 
           test_type, character_modifier, army_stat_modifier]
        );
        
        // Mark ALL participants in this team as having selected a goal
        await pool.query(
          `UPDATE battle_participants SET has_selected_goal = true 
           WHERE battle_id = $1 AND team_name = $2`,
          [battle_id, team_name]
        );
        
        return result.rows[0];
      }
    } catch (error) {
      throw error;
    }
  }
  
  // Lock in a goal
  static async lockGoal(goalId, locked = true) {
    try {
      const result = await pool.query(
        `UPDATE battle_goals SET locked_in = $2 WHERE id = $1 RETURNING *`,
        [goalId, locked]
      );
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }
  
  // Update goal roll
  static async updateGoalRoll(goalId, diceRoll) {
    try {
      const result = await pool.query(
        `UPDATE battle_goals SET dice_roll = $2 WHERE id = $1 RETURNING *`,
        [goalId, diceRoll]
      );
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }
  
  // Resolve goal (DM sets DC and success)
  // Resolve goal and immediately apply modifier to team
  static async resolveGoal(goalId, dcRequired, success, modifierApplied) {
    try {
      // Update goal with resolution
      const result = await pool.query(
        `UPDATE battle_goals 
         SET dc_required = $2, success = $3, modifier_applied = $4
         WHERE id = $1
         RETURNING *`,
        [goalId, dcRequired, success, modifierApplied]
      );
      
      const goal = result.rows[0];
      
      // Apply modifier to ALL participants in the team (team-based scoring)
      if (goal.team_name && modifierApplied !== 0) {
        await pool.query(
          `UPDATE battle_participants 
           SET current_score = current_score + $2
           WHERE battle_id = $1 AND team_name = $3`,
          [goal.battle_id, modifierApplied, goal.team_name]
        );
      }
      
      // Apply negative modifier to target team if applicable
      if (goal.target_participant_id && modifierApplied !== 0) {
        // Get the target's team name
        const targetResult = await pool.query(
          `SELECT team_name FROM battle_participants WHERE id = $1`,
          [goal.target_participant_id]
        );
        
        if (targetResult.rows.length > 0) {
          const targetTeamName = targetResult.rows[0].team_name;
          await pool.query(
            `UPDATE battle_participants 
             SET current_score = current_score - $2
             WHERE battle_id = $1 AND team_name = $3`,
            [goal.battle_id, modifierApplied, targetTeamName]
          );
        }
      }
      
      return goal;
    } catch (error) {
      throw error;
    }
  }
  
  // Apply goal modifiers to participant scores
  static async applyModifiers(battleId, roundNumber) {
    try {
      const goals = await pool.query(
        `SELECT * FROM battle_goals 
         WHERE battle_id = $1 AND round_number = $2 AND success IS NOT NULL`,
        [battleId, roundNumber]
      );
      
      for (const goal of goals.rows) {
        // Apply modifier to the participant who chose the goal
        await pool.query(
          `UPDATE battle_participants 
           SET current_score = current_score + $2
           WHERE id = $1`,
          [goal.participant_id, goal.modifier_applied]
        );
        
        // Apply negative modifier to target if applicable
        if (goal.target_participant_id && goal.modifier_applied !== 0) {
          await pool.query(
            `UPDATE battle_participants 
             SET current_score = current_score - $2
             WHERE id = $1`,
            [goal.target_participant_id, goal.modifier_applied]
          );
        }
      }
    } catch (error) {
      throw error;
    }
  }
  
  // Get final battle results
  static async getBattleResults(battleId) {
    try {
      const participants = await pool.query(
        `SELECT bp.*, a.name as army_name, a.id as army_id
         FROM battle_participants bp
         LEFT JOIN armies a ON bp.army_id = a.id
         WHERE bp.battle_id = $1
         ORDER BY bp.current_score DESC`,
        [battleId]
      );
      
      return participants.rows;
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
      const result = await pool.query(
        `INSERT INTO battle_invitations (battle_id, player_id, team_name, faction_color, status)
         VALUES ($1, $2, $3, $4, 'pending')
         ON CONFLICT DO NOTHING
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
         ORDER BY bi.invited_at DESC`,
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
        const result = await pool.query(
          `INSERT INTO battle_participants (battle_id, army_id, team_name, faction_color, is_temporary, has_selected_goal)
           VALUES ($1, $2, $3, $4, FALSE, FALSE)
           RETURNING *`,
          [invitation.battle_id, armyId, invitation.team_name, invitation.faction_color]
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
