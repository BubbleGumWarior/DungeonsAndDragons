const express = require('express');
const router = express.Router();
const Army = require('../models/Army');
const Battle = require('../models/Battle');
const Campaign = require('../models/Campaign');
const Character = require('../models/Character');
const { authenticateToken } = require('../middleware/auth');

// Get all armies for a player in a campaign
router.get('/campaign/:campaignId/player/:playerId', authenticateToken, async (req, res) => {
  try {
    const { campaignId, playerId } = req.params;
    
    // Verify user has access to this campaign
    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    // Only allow DM or the player themselves to view
    const isDM = req.user.role === 'Dungeon Master' && campaign.dungeon_master_id === req.user.id;
    const isOwnPlayer = req.user.id === parseInt(playerId);
    
    if (!isDM && !isOwnPlayer) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    const armies = await Army.findByPlayerAndCampaign(playerId, campaignId);
    
    // Get battle history for each army
    const armiesWithHistory = await Promise.all(armies.map(async (army) => {
      const history = await Army.getBattleHistory(army.id);
      return { ...army, battle_history: history };
    }));
    
    res.json(armiesWithHistory);
  } catch (error) {
    console.error('Error fetching armies:', error);
    res.status(500).json({ error: 'Failed to fetch armies' });
  }
});

// Get all armies in a campaign (DM only)
router.get('/campaign/:campaignId', authenticateToken, async (req, res) => {
  try {
    const { campaignId } = req.params;
    
    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    // Only DM can view all armies
    if (req.user.role !== 'Dungeon Master' || campaign.dungeon_master_id !== req.user.id) {
      return res.status(403).json({ error: 'Only Dungeon Master can view all armies' });
    }
    
    const armies = await Army.findByCampaign(campaignId);
    res.json(armies);
  } catch (error) {
    console.error('Error fetching campaign armies:', error);
    res.status(500).json({ error: 'Failed to fetch armies' });
  }
});

// Create a new army (DM only)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { player_id, campaign_id, name, numbers, equipment, discipline, morale, command, logistics } = req.body;
    
    if (!player_id || !campaign_id || !name) {
      return res.status(400).json({ error: 'player_id, campaign_id, and name are required' });
    }
    
    const campaign = await Campaign.findById(campaign_id);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    // Only DM can create armies
    if (req.user.role !== 'Dungeon Master' || campaign.dungeon_master_id !== req.user.id) {
      return res.status(403).json({ error: 'Only Dungeon Master can create armies' });
    }
    
    const army = await Army.create({
      player_id,
      campaign_id,
      name,
      numbers,
      equipment,
      discipline,
      morale,
      command,
      logistics
    });
    
    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${campaign_id}`).emit('armyCreated', {
        army,
        timestamp: new Date().toISOString()
      });
    }
    
    res.status(201).json(army);
  } catch (error) {
    console.error('Error creating army:', error);
    res.status(500).json({ error: 'Failed to create army' });
  }
});

// Update army stats (DM only)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const stats = req.body;
    
    const army = await Army.findById(id);
    if (!army) {
      return res.status(404).json({ error: 'Army not found' });
    }
    
    const campaign = await Campaign.findById(army.campaign_id);
    
    // Only DM can update army stats
    if (req.user.role !== 'Dungeon Master' || campaign.dungeon_master_id !== req.user.id) {
      return res.status(403).json({ error: 'Only Dungeon Master can update army stats' });
    }
    
    const updatedArmy = await Army.updateStats(id, stats);
    
    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${army.campaign_id}`).emit('armyUpdated', {
        army: updatedArmy,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json(updatedArmy);
  } catch (error) {
    console.error('Error updating army:', error);
    res.status(500).json({ error: 'Failed to update army' });
  }
});

// Delete army (DM only)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const army = await Army.findById(id);
    if (!army) {
      return res.status(404).json({ error: 'Army not found' });
    }
    
    const campaign = await Campaign.findById(army.campaign_id);
    
    // Only DM can delete armies
    if (req.user.role !== 'Dungeon Master' || campaign.dungeon_master_id !== req.user.id) {
      return res.status(403).json({ error: 'Only Dungeon Master can delete armies' });
    }
    
    await Army.delete(id);
    
    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${army.campaign_id}`).emit('armyDeleted', {
        armyId: id,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({ message: 'Army deleted successfully' });
  } catch (error) {
    console.error('Error deleting army:', error);
    res.status(500).json({ error: 'Failed to delete army' });
  }
});

// Get battle history for an army
router.get('/:id/history', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const army = await Army.findById(id);
    if (!army) {
      return res.status(404).json({ error: 'Army not found' });
    }
    
    const campaign = await Campaign.findById(army.campaign_id);
    
    // Allow DM or army owner to view history
    const isDM = req.user.role === 'Dungeon Master' && campaign.dungeon_master_id === req.user.id;
    const isOwner = army.player_id === req.user.id;
    
    if (!isDM && !isOwner) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    const history = await Army.getBattleHistory(id);
    res.json(history);
  } catch (error) {
    console.error('Error fetching battle history:', error);
    res.status(500).json({ error: 'Failed to fetch battle history' });
  }
});

// ===== BATTLE ROUTES =====

// Create a new battle (DM only)
router.post('/battles', authenticateToken, async (req, res) => {
  try {
    const { campaign_id, battle_name, terrain_description } = req.body;
    
    if (!campaign_id || !battle_name) {
      return res.status(400).json({ error: 'campaign_id and battle_name are required' });
    }
    
    const campaign = await Campaign.findById(campaign_id);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    // Only DM can create battles
    if (req.user.role !== 'Dungeon Master' || campaign.dungeon_master_id !== req.user.id) {
      return res.status(403).json({ error: 'Only Dungeon Master can create battles' });
    }
    
    const battle = await Battle.create({
      campaign_id,
      battle_name,
      terrain_description
    });
    
    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${campaign_id}`).emit('battleCreated', {
        battle,
        timestamp: new Date().toISOString()
      });
    }
    
    res.status(201).json(battle);
  } catch (error) {
    console.error('Error creating battle:', error);
    res.status(500).json({ error: 'Failed to create battle' });
  }
});

// Get active battle for a campaign
router.get('/battles/campaign/:campaignId/active', authenticateToken, async (req, res) => {
  try {
    const { campaignId } = req.params;
    
    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    const battle = await Battle.findActiveByCampaign(campaignId);
    res.json(battle);
  } catch (error) {
    console.error('Error fetching active battle:', error);
    res.status(500).json({ error: 'Failed to fetch active battle' });
  }
});

// Get battle by ID
router.get('/battles/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const battle = await Battle.findById(id);
    
    if (!battle) {
      return res.status(404).json({ error: 'Battle not found' });
    }
    
    res.json(battle);
  } catch (error) {
    console.error('Error fetching battle:', error);
    res.status(500).json({ error: 'Failed to fetch battle' });
  }
});

// Update battle status (DM only)
router.put('/battles/:id/status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const battle = await Battle.findById(id);
    if (!battle) {
      return res.status(404).json({ error: 'Battle not found' });
    }
    
    const campaign = await Campaign.findById(battle.campaign_id);
    
    // Only DM can update battle status
    if (req.user.role !== 'Dungeon Master' || campaign.dungeon_master_id !== req.user.id) {
      return res.status(403).json({ error: 'Only Dungeon Master can update battle status' });
    }
    
    const updatedBattle = await Battle.updateStatus(id, status);
    
    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      const roomName = `campaign_${battle.campaign_id}`;
      const battleId = parseInt(id);
      console.log(`📢 Emitting battleStatusUpdated to room: ${roomName}, battleId: ${battleId}, status: ${status}`);
      io.to(roomName).emit('battleStatusUpdated', {
        battleId,
        status,
        timestamp: new Date().toISOString()
      });
      console.log(`✅ battleStatusUpdated emitted successfully`);
    } else {
      console.warn('⚠️ Socket.io instance not found - event not emitted');
    }
    
    res.json(updatedBattle);
  } catch (error) {
    console.error('Error updating battle status:', error);
    res.status(500).json({ error: 'Failed to update battle status' });
  }
});

// Advance battle to next round (DM only)
router.post('/battles/:id/advance-round', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const battle = await Battle.findById(id);
    if (!battle) {
      return res.status(404).json({ error: 'Battle not found' });
    }
    
    const campaign = await Campaign.findById(battle.campaign_id);
    
    // Only DM can advance rounds
    if (req.user.role !== 'Dungeon Master' || campaign.dungeon_master_id !== req.user.id) {
      return res.status(403).json({ error: 'Only Dungeon Master can advance rounds' });
    }
    
    const updatedBattle = await Battle.advanceRound(id);
    
    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${battle.campaign_id}`).emit('battleRoundAdvanced', {
        battleId: id,
        round: updatedBattle.current_round,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json(updatedBattle);
  } catch (error) {
    console.error('Error advancing battle round:', error);
    res.status(500).json({ error: 'Failed to advance battle round' });
  }
});

// Add participant to battle
router.post('/battles/:id/participants', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const participantData = req.body;
    
    const battle = await Battle.findById(id);
    if (!battle) {
      return res.status(404).json({ error: 'Battle not found' });
    }
    
    participantData.battle_id = id;
    const participant = await Battle.addParticipant(participantData);
    
    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      const roomName = `campaign_${battle.campaign_id}`;
      console.log(`📢 Emitting battleParticipantAdded to room: ${roomName}`);
      io.to(roomName).emit('battleParticipantAdded', {
        battleId: id,
        participant,
        timestamp: new Date().toISOString()
      });
    }
    
    res.status(201).json(participant);
  } catch (error) {
    console.error('Error adding battle participant:', error);
    res.status(500).json({ error: 'Failed to add battle participant' });
  }
});

// Invite players to battle (DM only)
router.post('/battles/:id/invite', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { player_ids, team_name, faction_color } = req.body;
    
    const battle = await Battle.findById(id);
    if (!battle) {
      return res.status(404).json({ error: 'Battle not found' });
    }
    
    const campaign = await Campaign.findById(battle.campaign_id);
    if (req.user.role !== 'Dungeon Master' || campaign.dungeon_master_id !== req.user.id) {
      return res.status(403).json({ error: 'Only Dungeon Master can invite players' });
    }
    
    const invitations = [];
    for (const playerId of player_ids) {
      const invitation = await Battle.invitePlayer(id, playerId, team_name, faction_color);
      if (invitation) {
        invitations.push(invitation);
      }
    }
    
    // Emit socket event to specific invited players only
    const io = req.app.get('io');
    const userSocketMap = req.app.get('userSocketMap');
    if (io && userSocketMap) {
      for (const playerId of player_ids) {
        const socketId = userSocketMap.get(playerId);
        if (socketId) {
          io.to(socketId).emit('battleInvitationSent', {
            battleId: id,
            invitations: invitations.filter(inv => inv.player_id === playerId),
            timestamp: new Date().toISOString()
          });
          console.log(`📨 Sent invitation to player ${playerId} via socket ${socketId}`);
        }
      }
    }
    
    res.status(201).json(invitations);
  } catch (error) {
    console.error('Error inviting players to battle:', error);
    res.status(500).json({ error: 'Failed to invite players' });
  }
});

// Get player's pending invitations
router.get('/battles/invitations/player/:playerId/campaign/:campaignId', authenticateToken, async (req, res) => {
  try {
    const { playerId, campaignId } = req.params;
    
    // Only allow player themselves or DM to view
    if (req.user.id !== parseInt(playerId) && req.user.role !== 'Dungeon Master') {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    const invitations = await Battle.getPlayerInvitations(playerId, campaignId);
    res.json(invitations);
  } catch (error) {
    console.error('Error fetching invitations:', error);
    res.status(500).json({ error: 'Failed to fetch invitations' });
  }
});

// Get battle invitations (DM only)
router.get('/battles/:id/invitations', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const battle = await Battle.findById(id);
    if (!battle) {
      return res.status(404).json({ error: 'Battle not found' });
    }
    
    const invitations = await Battle.getBattleInvitations(id);
    res.json(invitations);
  } catch (error) {
    console.error('Error fetching battle invitations:', error);
    res.status(500).json({ error: 'Failed to fetch invitations' });
  }
});

// Accept battle invitation
router.post('/battles/invitations/:invitationId/accept', authenticateToken, async (req, res) => {
  try {
    const { invitationId } = req.params;
    const { army_ids } = req.body;
    
    if (!army_ids || army_ids.length === 0) {
      return res.status(400).json({ error: 'At least one army must be selected' });
    }
    
    const result = await Battle.acceptInvitation(invitationId, army_ids);
    
    // Emit socket event
    const battle = await Battle.findById(result.invitation.battle_id);
    const io = req.app.get('io');
    if (io && battle) {
      const roomName = `campaign_${battle.campaign_id}`;
      console.log(`📢 Emitting battleInvitationAccepted to room: ${roomName}`);
      io.to(roomName).emit('battleInvitationAccepted', {
        battleId: result.invitation.battle_id,
        playerId: result.invitation.player_id,
        participants: result.participants,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error accepting invitation:', error);
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
});

// Decline battle invitation
router.post('/battles/invitations/:invitationId/decline', authenticateToken, async (req, res) => {
  try {
    const { invitationId } = req.params;
    
    const invitation = await Battle.declineInvitation(invitationId);
    
    // Emit socket event
    const battle = await Battle.findById(invitation.battle_id);
    const io = req.app.get('io');
    if (io && battle) {
      io.to(`campaign_${battle.campaign_id}`).emit('battleInvitationDeclined', {
        battleId: invitation.battle_id,
        playerId: invitation.player_id,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json(invitation);
  } catch (error) {
    console.error('Error declining invitation:', error);
    res.status(500).json({ error: 'Failed to decline invitation' });
  }
});

// Update participant position (DM only during planning)
router.put('/battles/participants/:participantId/position', authenticateToken, async (req, res) => {
  try {
    const { participantId } = req.params;
    const { x, y } = req.body;
    
    await Battle.updateParticipantPosition(participantId, x, y);
    
    res.json({ message: 'Position updated successfully' });
  } catch (error) {
    console.error('Error updating participant position:', error);
    res.status(500).json({ error: 'Failed to update participant position' });
  }
});

// Calculate base scores (DM triggers this when moving from planning to goal_selection)
router.post('/battles/:id/calculate-base-scores', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const battle = await Battle.findById(id);
    if (!battle) {
      return res.status(404).json({ error: 'Battle not found' });
    }
    
    const campaign = await Campaign.findById(battle.campaign_id);
    
    // Only DM can calculate base scores
    if (req.user.role !== 'Dungeon Master' || campaign.dungeon_master_id !== req.user.id) {
      return res.status(403).json({ error: 'Only Dungeon Master can calculate base scores' });
    }
    
    await Battle.calculateBaseScores(id);
    
    // Get updated battle with scores
    const updatedBattle = await Battle.findById(id);
    
    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${battle.campaign_id}`).emit('battleScoresCalculated', {
        battleId: id,
        participants: updatedBattle.participants,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json(updatedBattle);
  } catch (error) {
    console.error('Error calculating base scores:', error);
    res.status(500).json({ error: 'Failed to calculate base scores' });
  }
});

// Set/update a battle goal
router.post('/battles/:id/goals', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const goalData = req.body;
    
    const battle = await Battle.findById(id);
    if (!battle) {
      return res.status(404).json({ error: 'Battle not found' });
    }
    
    goalData.battle_id = id;
    const goal = await Battle.setGoal(goalData);
    
    // Emit socket event to notify all users in the campaign
    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${battle.campaign_id}`).emit('battleGoalSelected', {
        battleId: parseInt(id),
        goal,
        timestamp: new Date().toISOString()
      });
    }
    
    res.status(201).json(goal);
  } catch (error) {
    console.error('Error setting battle goal:', error);
    res.status(500).json({ error: 'Failed to set battle goal' });
  }
});

// Lock in a goal
router.put('/battles/goals/:goalId/lock', authenticateToken, async (req, res) => {
  try {
    const { goalId } = req.params;
    const { locked } = req.body;
    
    const goal = await Battle.lockGoal(goalId, locked);
    
    // Get battle info for socket
    const battleGoal = await Battle.findById(goal.battle_id);
    
    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${battleGoal.campaign_id}`).emit('battleGoalLocked', {
        battleId: parseInt(goal.battle_id),
        goalId,
        goal,
        locked,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json(goal);
  } catch (error) {
    console.error('Error locking goal:', error);
    res.status(500).json({ error: 'Failed to lock goal' });
  }
});

// Update goal roll
router.put('/battles/goals/:goalId/roll', authenticateToken, async (req, res) => {
  try {
    const { goalId } = req.params;
    const { dice_roll } = req.body;
    
    const goal = await Battle.updateGoalRoll(goalId, dice_roll);
    
    // Get battle to find campaign_id for socket emission
    const battle = await Battle.findById(goal.battle_id);
    const io = req.app.get('io');
    if (io && battle) {
      io.to(`campaign_${battle.campaign_id}`).emit('battleGoalRolled', {
        battleId: goal.battle_id,
        goalId: goal.id,
        roll: dice_roll,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json(goal);
  } catch (error) {
    console.error('Error updating goal roll:', error);
    res.status(500).json({ error: 'Failed to update goal roll' });
  }
});

// Resolve goal (DM only)
router.put('/battles/goals/:goalId/resolve', authenticateToken, async (req, res) => {
  try {
    const { goalId } = req.params;
    const { dc_required, success, modifier_applied } = req.body;
    
    const goal = await Battle.resolveGoal(goalId, dc_required, success, modifier_applied);
    
    // Get battle to find campaign_id for socket emission
    const battle = await Battle.findById(goal.battle_id);
    const io = req.app.get('io');
    if (io && battle) {
      io.to(`campaign_${battle.campaign_id}`).emit('battleGoalResolved', {
        battleId: goal.battle_id,
        goalId: goal.id,
        success: success,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json(goal);
  } catch (error) {
    console.error('Error resolving goal:', error);
    res.status(500).json({ error: 'Failed to resolve goal' });
  }
});

// Apply modifiers and send results (DM only)
router.post('/battles/:id/apply-modifiers', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { round_number } = req.body;
    
    const battle = await Battle.findById(id);
    if (!battle) {
      return res.status(404).json({ error: 'Battle not found' });
    }
    
    const campaign = await Campaign.findById(battle.campaign_id);
    
    // Only DM can apply modifiers
    if (req.user.role !== 'Dungeon Master' || campaign.dungeon_master_id !== req.user.id) {
      return res.status(403).json({ error: 'Only Dungeon Master can apply modifiers' });
    }
    
    await Battle.applyModifiers(id, round_number);
    
    // Get updated battle with new scores
    const updatedBattle = await Battle.findById(id);
    
    // Emit socket event with all results
    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${battle.campaign_id}`).emit('battleModifiersApplied', {
        battleId: id,
        round: round_number,
        participants: updatedBattle.participants,
        goals: updatedBattle.current_goals,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json(updatedBattle);
  } catch (error) {
    console.error('Error applying modifiers:', error);
    res.status(500).json({ error: 'Failed to apply modifiers' });
  }
});

// Complete battle and save history (DM only)
router.post('/battles/:id/complete', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const battle = await Battle.findById(id);
    if (!battle) {
      return res.status(404).json({ error: 'Battle not found' });
    }
    
    const campaign = await Campaign.findById(battle.campaign_id);
    
    // Only DM can complete battles
    if (req.user.role !== 'Dungeon Master' || campaign.dungeon_master_id !== req.user.id) {
      return res.status(403).json({ error: 'Only Dungeon Master can complete battles' });
    }
    
    // Get final results
    const participants = await Battle.getBattleResults(id);
    
    // Save battle history for each army
    for (const participant of participants) {
      if (!participant.is_temporary && participant.army_id) {
        // Find all goals chosen by this participant
        const goalsResult = await Battle.findById(id);
        const participantGoals = goalsResult.current_goals.filter(g => g.participant_id === participant.id);
        
        // Determine opponents (simplified: compare against highest scoring opponent)
        const opponents = participants.filter(p => p.team_name !== participant.team_name);
        const topOpponent = opponents.sort((a, b) => b.current_score - a.current_score)[0];
        
        if (topOpponent) {
          const scoreDiff = participant.current_score - topOpponent.current_score;
          let result = 'stalemate';
          if (scoreDiff >= 10) result = 'victory';
          else if (scoreDiff >= 1) result = 'victory';
          else if (scoreDiff <= -10) result = 'defeat';
          else if (scoreDiff < 0) result = 'defeat';
          
          await Army.addBattleHistory({
            army_id: participant.army_id,
            battle_name: battle.battle_name,
            start_score: participant.base_score,
            end_score: participant.current_score,
            enemy_name: topOpponent.temp_army_name || topOpponent.army_name || 'Unknown',
            enemy_start_score: topOpponent.base_score,
            enemy_end_score: topOpponent.current_score,
            result,
            goals_chosen: participantGoals
          });
        }
      }
    }
    
    // Mark battle as completed
    await Battle.updateStatus(id, 'completed');
    
    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${battle.campaign_id}`).emit('battleCompleted', {
        battleId: id,
        battleName: battle.battle_name,
        results: participants,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({ message: 'Battle completed', results: participants });
  } catch (error) {
    console.error('Error completing battle:', error);
    res.status(500).json({ error: 'Failed to complete battle' });
  }
});

module.exports = router;
