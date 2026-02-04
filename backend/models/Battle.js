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
        `SELECT bp.*, a.name as army_name,
                COALESCE(a.category, bp.temp_army_category, 'Swordsmen') as army_category,
                a.numbers, a.equipment, a.discipline, 
                a.morale, a.command, a.logistics, a.player_id, 
                COALESCE(a.total_troops, bp.temp_army_troops) as army_total_troops,
                u.username as player_name, u.id as user_id,
                ch.abilities as character_abilities
         FROM battle_participants bp
         LEFT JOIN armies a ON bp.army_id = a.id
         LEFT JOIN users u ON a.player_id = u.id
         LEFT JOIN characters ch ON ch.player_id = a.player_id AND ch.campaign_id = $2
         WHERE bp.battle_id = $1
         ORDER BY bp.team_name, bp.id`,
        [battleId, battle.campaign_id]
      );
      
      battle.participants = participantsResult.rows;
      
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
        
        const diceRoll = Math.floor(Math.random() * 10) + 1; // 1d10
        
        if (isFirstRound) {
          // First round: Calculate base score from stats + dice roll
          // Numbers stat applies 10x the normal rate
          const statSum = ((stats.numbers || 0) * 10) + (stats.equipment || 0) + (stats.discipline || 0) + 
                         (stats.morale || 0) + (stats.command || 0) + (stats.logistics || 0);
          const baseScore = statSum + diceRoll;
          
          await pool.query(
            `UPDATE battle_participants SET base_score = $2, current_score = $2 WHERE id = $1`,
            [participant.id, baseScore]
          );
        } else {
          // Subsequent rounds: Add new dice roll to current score (preserving modifiers)
          await pool.query(
            `UPDATE battle_participants SET current_score = current_score + $2 WHERE id = $1`,
            [participant.id, diceRoll]
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
