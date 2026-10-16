const express = require('express');
const router = express.Router();
const Army = require('../models/Army');
const Battle = require('../models/Battle');
const Campaign = require('../models/Campaign');
const Character = require('../models/Character');
const { authenticateToken } = require('../middleware/auth');
const { pool } = require('../models/database');
const { BATTLE_GOALS, findGoalByKey, isGoalEligible, GOAL_TYPES } = require('../utils/battleGoals');
const { UNIT_TEMPLATES } = require('../utils/unitTemplates');
const { simulateEngagement, simulateLogistics, simulateVanish, rollArmy, expectedRoll, baseTypeOf } = require('../utils/battleSimulation');

const getArmyMovementSpeed = (category) => {
  const template = UNIT_TEMPLATES[category];
  if (!template) return 100;
  if (template.baseType === 'artillery') return 50;
  if (template.baseType === 'cavalry') return 300;
  if (template.baseType === 'covert') return 150;
  if (template.baseType === 'dragon') return 500;
  return 100;
};

const getParticipantCategory = (participant) => {
  if (participant.is_temporary) {
    return participant.temp_army_category || 'Recruit';
  }
  return participant.army_category || participant.temp_army_category || 'Recruit';
};

const isCampaignDM = (user, campaign) =>
  !!campaign && user.role === 'Dungeon Master' && campaign.dungeon_master_id === user.id;

// A battle as the requesting user may see it: players never receive DM-concealed armies of other factions
const battleForViewer = async (battle, user) => {
  if (!battle) return battle;
  const campaign = await Campaign.findById(battle.campaign_id);
  return isCampaignDM(user, campaign) ? battle : Battle.concealFrom(battle, user.id);
};

// Participants safe to broadcast to the whole campaign room (clients refetch their own view for the rest)
const publicParticipants = (participants) => (participants || []).filter(p => !p.dm_hidden);

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

// Create a new army — DM path (any category, explicit stats) OR player unit-type path
// Player path: provides unit_type + source_fief_id + player_id === own id; starts with 0 troops
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { player_id, campaign_id, name, category, total_troops, equipment, discipline, morale, command, logistics, unit_type, source_fief_id } = req.body;
    
    if (!player_id || !campaign_id || !name) {
      return res.status(400).json({ error: 'player_id, campaign_id, and name are required' });
    }
    
    const campaign = await Campaign.findById(campaign_id);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    const isDM = req.user.role === 'Dungeon Master' && campaign.dungeon_master_id === req.user.id;
    const isOwnPlayerUnitType = req.user.id === parseInt(player_id) && unit_type && source_fief_id;
    
    if (!isDM && !isOwnPlayerUnitType) {
      return res.status(403).json({ error: 'Unauthorized to create this army' });
    }
    
    let armyData;
    if (isOwnPlayerUnitType && !isDM) {
      // Player creating unit-type army — stats auto-set from template, starts empty
      const template = UNIT_TEMPLATES[unit_type];
      if (!template) return res.status(400).json({ error: `Unknown unit type: ${unit_type}` });
      armyData = {
        player_id,
        campaign_id,
        name,
        category: unit_type,
        total_troops: 0,
        unit_type,
        source_fief_id,
        is_garrisoned: true,
        ...template.stats,
      };
    } else {
      // DM creating army — explicit stats, must have troops
      if (!total_troops || total_troops < 1) {
        return res.status(400).json({ error: 'total_troops is required and must be at least 1' });
      }
      armyData = { player_id, campaign_id, name, category, total_troops, equipment, discipline, morale, command, logistics, is_garrisoned: false };
    }
    
    const army = await Army.create(armyData);
    
    const io = req.app.get('io');
    if (io) io.to(`campaign_${campaign_id}`).emit('armyCreated', { army, timestamp: new Date().toISOString() });
    
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
    const { campaign_id, battle_name, terrain_description, total_rounds } = req.body;
    
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
      terrain_description,
      total_rounds: total_rounds || 5
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
    res.json(await battleForViewer(battle, req.user));
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

    res.json(await battleForViewer(battle, req.user));
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
    
    // Clear battlefield lighting nodes when battle is cancelled
    if (status === 'cancelled') {
      try {
        await pool.query('DELETE FROM campaign_lighting_nodes WHERE campaign_id = $1 AND tab = $2', [battle.campaign_id, 'battlefield']);
      } catch (e) { console.warn('Could not clear battlefield lighting nodes on cancel:', e.message); }
    }

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
      if (status === 'cancelled') {
        const remainingNodes = await pool.query('SELECT id, type, x, y, strength, tab FROM campaign_lighting_nodes WHERE campaign_id = $1', [battle.campaign_id]);
        io.to(roomName).emit('lightingNodesUpdated', { nodes: remainingNodes.rows, campaignId: battle.campaign_id });
      }
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
    
    // Emit socket event to ALL users (using campaign room)
    const io = req.app.get('io');
    if (io) {
      const roomName = `campaign_${battle.campaign_id}`;
      const battleId = parseInt(id, 10);

      io.to(roomName).emit('battleRoundAdvanced', {
        battleId,
        round: updatedBattle.current_round,
        status: updatedBattle.status,
        timestamp: new Date().toISOString()
      });

      if (updatedBattle.morale_checks && updatedBattle.morale_checks.length > 0) {
        io.to(roomName).emit('battleMoraleChecks', {
          battleId,
          round: updatedBattle.current_round,
          checks: updatedBattle.morale_checks,
          timestamp: new Date().toISOString()
        });
      }
      
      // Also emit that we've moved to goal selection phase
      io.to(roomName).emit('battleStatusUpdated', {
        battleId,
        status: 'goal_selection',
        round: updatedBattle.current_round,
        timestamp: new Date().toISOString()
      });

      if (updatedBattle.status === 'goal_selection') {
        const battleWithParticipants = await Battle.findById(battleId);
        if (battleWithParticipants && battleWithParticipants.participants) {
          const movementState = {};
          battleWithParticipants.participants.forEach((participant) => {
            const category = getParticipantCategory(participant);
            movementState[participant.id] = getArmyMovementSpeed(category);
          });
          io.to(roomName).emit('battlefieldMovementReset', {
            battleId,
            movementState,
            timestamp: new Date().toISOString()
          });
        }
      }
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
    
    const campaign = await Campaign.findById(battle.campaign_id);
    if (!isCampaignDM(req.user, campaign)) {
      return res.status(403).json({ error: 'Only Dungeon Master can add armies to a battle' });
    }

    participantData.battle_id = id;
    participantData.dm_hidden = !!participantData.dm_hidden && !!participantData.is_temporary;

    // A temporary army can be handed to a player: it then fights for that player's faction
    const controllerId = participantData.is_temporary ? parseInt(participantData.controller_user_id, 10) : NaN;
    if (Number.isInteger(controllerId)) {
      const faction = await Battle.findPlayerFaction(id, controllerId);
      if (!faction) {
        return res.status(400).json({ error: 'That player has not joined this battle yet' });
      }
      participantData.controller_user_id = controllerId;
      participantData.team_name = faction.team_name;
      participantData.faction_color = faction.faction_color;
    } else {
      participantData.controller_user_id = null;
    }

    // Resolve faction color automatically if not explicitly provided
    if (!participantData.faction_color) {
      participantData.faction_color = await resolveFactionColor(id, participantData.team_name);
    }

    const participant = await Battle.addParticipant(participantData);

    // Emit socket event; a concealed army is not described to the room, clients just refetch what they may see
    const io = req.app.get('io');
    if (io) {
      const roomName = `campaign_${battle.campaign_id}`;
      console.log(`📢 Emitting battleParticipantAdded to room: ${roomName}`);
      io.to(roomName).emit('battleParticipantAdded', {
        battleId: id,
        participant: participant.dm_hidden ? null : participant,
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
    const { player_ids, team_name } = req.body;
    
    const battle = await Battle.findById(id);
    if (!battle) {
      return res.status(404).json({ error: 'Battle not found' });
    }
    
    const campaign = await Campaign.findById(battle.campaign_id);
    if (req.user.role !== 'Dungeon Master' || campaign.dungeon_master_id !== req.user.id) {
      return res.status(403).json({ error: 'Only Dungeon Master can invite players' });
    }
    
    const factionColor = await resolveFactionColor(id, team_name);
    const invitations = [];
    for (const playerId of player_ids) {
      const invitation = await Battle.invitePlayer(id, playerId, team_name, factionColor);
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
        } else {
          console.log(`⚠️ Player ${playerId} not found in socket map - will receive on next page load`);
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
    
    // Verify campaign exists
    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    // Only allow player themselves or the campaign's DM
    const isOwnPlayer = req.user.id === parseInt(playerId);
    const isDM = req.user.role === 'Dungeon Master' && campaign.dungeon_master_id === req.user.id;
    
    if (!isOwnPlayer && !isDM) {
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

// Hand a temporary army to a player (or back to the DM) and/or conceal or reveal it (DM only)
router.put('/battles/participants/:participantId/assignment', authenticateToken, async (req, res) => {
  try {
    const participantId = parseInt(req.params.participantId, 10);
    const { controller_user_id, dm_hidden } = req.body;

    const found = await pool.query('SELECT * FROM battle_participants WHERE id = $1', [participantId]);
    if (found.rows.length === 0) {
      return res.status(404).json({ error: 'Participant not found' });
    }
    const participant = found.rows[0];

    const battle = await Battle.findById(participant.battle_id);
    const campaign = await Campaign.findById(battle.campaign_id);
    if (!isCampaignDM(req.user, campaign)) {
      return res.status(403).json({ error: 'Only Dungeon Master can assign armies' });
    }
    if (!participant.is_temporary || participant.is_summoned) {
      return res.status(400).json({ error: 'Only the DM’s temporary armies can be assigned or concealed' });
    }

    const patch = {};
    if (dm_hidden !== undefined) patch.dm_hidden = !!dm_hidden;

    let teamChange = null;
    if (controller_user_id !== undefined) {
      if (controller_user_id === null) {
        patch.controller_user_id = null;
      } else {
        const playerId = parseInt(controller_user_id, 10);
        const faction = Number.isInteger(playerId) ? await Battle.findPlayerFaction(battle.id, playerId) : null;
        if (!faction) {
          return res.status(400).json({ error: 'That player has not joined this battle yet' });
        }
        patch.controller_user_id = playerId;
        teamChange = faction;
      }
    }

    await Battle.updateAssignment(participantId, patch);
    if (teamChange) {
      await pool.query(
        'UPDATE battle_participants SET team_name = $2, faction_color = $3 WHERE id = $1',
        [participantId, teamChange.team_name, teamChange.faction_color]
      );
    }

    const updated = (await Battle.findById(battle.id)).participants.find(p => p.id === participantId);

    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${battle.campaign_id}`).emit('battleParticipantUpdated', {
        battleId: battle.id,
        timestamp: new Date().toISOString()
      });
    }

    res.json(updated);
  } catch (error) {
    console.error('Error assigning battle participant:', error);
    res.status(500).json({ error: 'Failed to assign army' });
  }
});

// Update participant troops (casualties/reinforcements)
router.put('/battles/participants/:participantId/troops', authenticateToken, async (req, res) => {
  try {
    const { participantId } = req.params;
    const { troop_change } = req.body;
    
    if (troop_change === undefined) {
      return res.status(400).json({ error: 'troop_change is required' });
    }
    
    // Get the participant first
    const db = require('../models/database');
    const result = await db.pool.query(
      'SELECT * FROM battle_participants WHERE id = $1',
      [participantId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Participant not found' });
    }
    
    const participant = result.rows[0];
    const newTroopCount = Math.max(0, participant.current_troops + troop_change);
    
    // Update the troops
    await db.pool.query(
      'UPDATE battle_participants SET current_troops = $1 WHERE id = $2',
      [newTroopCount, participantId]
    );
    
    // Get updated participant
    const updatedResult = await db.pool.query(
      'SELECT * FROM battle_participants WHERE id = $1',
      [participantId]
    );
    
    // Emit socket event to notify all clients
    const battle = await Battle.findById(participant.battle_id);
    const io = req.app.get('io');
    if (io && battle) {
      io.to(`campaign_${battle.campaign_id}`).emit('participantTroopsUpdated', {
        battleId: participant.battle_id,
        participantId,
        newTroopCount,
        troopChange: troop_change,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json(updatedResult.rows[0]);
  } catch (error) {
    console.error('Error updating participant troops:', error);
    res.status(500).json({ error: 'Failed to update participant troops' });
  }
});

// Update participant battle score
router.put('/battles/participants/:participantId/score', authenticateToken, async (req, res) => {
  try {
    const { participantId } = req.params;
    const { score_change } = req.body;
    
    if (score_change === undefined) {
      return res.status(400).json({ error: 'score_change is required' });
    }
    
    // Get the participant first
    const db = require('../models/database');
    const result = await db.pool.query(
      'SELECT * FROM battle_participants WHERE id = $1',
      [participantId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Participant not found' });
    }
    
    const participant = result.rows[0];
    const newScore = participant.current_score + score_change;
    
    // Update the score
    await db.pool.query(
      'UPDATE battle_participants SET current_score = $1 WHERE id = $2',
      [newScore, participantId]
    );
    
    // Get updated participant
    const updatedResult = await db.pool.query(
      'SELECT * FROM battle_participants WHERE id = $1',
      [participantId]
    );
    
    // Emit socket event to notify all clients
    const battle = await Battle.findById(participant.battle_id);
    const io = req.app.get('io');
    if (io && battle) {
      io.to(`campaign_${battle.campaign_id}`).emit('participantScoreUpdated', {
        battleId: participant.battle_id,
        participantId,
        newScore,
        scoreChange: score_change,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json(updatedResult.rows[0]);
  } catch (error) {
    console.error('Error updating participant score:', error);
    res.status(500).json({ error: 'Failed to update participant score' });
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
        participants: publicParticipants(updatedBattle.participants),
        timestamp: new Date().toISOString()
      });
    }

    res.json(updatedBattle);
  } catch (error) {
    console.error('Error calculating base scores:', error);
    res.status(500).json({ error: 'Failed to calculate base scores' });
  }
});

// Kept in sync with BATTLEFIELD_FEET_PER_PERCENT in frontend battlefieldHelpers.ts.
const BATTLEFIELD_FEET_PER_PERCENT = 80 / 3;

const getBattlefieldDistanceFeet = (attackerX, attackerY, targetX, targetY) => {
  // Postgres returns numeric columns as strings, so coerce before checking
  const coord = (value) => (Number.isFinite(Number(value)) && value !== null && value !== undefined ? Number(value) : 50);
  const ax = coord(attackerX);
  const ay = coord(attackerY);
  const tx = coord(targetX);
  const ty = coord(targetY);
  const deltaX = ax - tx;
  const deltaY = ay - ty;
  const distancePercent = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  return distancePercent * BATTLEFIELD_FEET_PER_PERCENT;
};

const getRandomColor = () => {
  const rand = () => Math.floor(Math.random() * 256);
  const toHex = value => value.toString(16).padStart(2, '0');
  return `#${toHex(rand())}${toHex(rand())}${toHex(rand())}`;
};

const resolveFactionColor = async (battleId, teamName) => {
  const existing = await pool.query(
    `SELECT faction_color FROM battle_participants
     WHERE battle_id = $1 AND team_name = $2 AND faction_color IS NOT NULL
     ORDER BY id DESC LIMIT 1`,
    [battleId, teamName]
  );
  if (existing.rows.length > 0 && existing.rows[0].faction_color) {
    return existing.rows[0].faction_color;
  }

  const inviteColor = await pool.query(
    `SELECT faction_color FROM battle_invitations
     WHERE battle_id = $1 AND team_name = $2 AND faction_color IS NOT NULL
     ORDER BY invited_at DESC LIMIT 1`,
    [battleId, teamName]
  );
  if (inviteColor.rows.length > 0 && inviteColor.rows[0].faction_color) {
    return inviteColor.rows[0].faction_color;
  }

  let color = getRandomColor();
  const usedColorsResult = await pool.query(
    `SELECT DISTINCT faction_color FROM battle_participants WHERE battle_id = $1 AND faction_color IS NOT NULL`,
    [battleId]
  );
  const usedColors = new Set(usedColorsResult.rows.map(row => row.faction_color));
  let guard = 0;
  while (usedColors.has(color) && guard < 6) {
    color = getRandomColor();
    guard += 1;
  }
  return color;
};

// Get battle goals for a round (filters by player unless DM or resolution phase)
router.get('/battles/:id/goals', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const roundNumber = parseInt(req.query.round, 10);

    const battle = await Battle.findById(id);
    if (!battle) {
      return res.status(404).json({ error: 'Battle not found' });
    }

    const currentRound = Number.isFinite(roundNumber) ? roundNumber : battle.current_round;
    const goals = await Battle.getGoals(id, currentRound);

    const campaign = await Campaign.findById(battle.campaign_id);
    const isDM = req.user.role === 'Dungeon Master' && campaign.dungeon_master_id === req.user.id;

    if (isDM) return res.json(goals);

    if (battle.status === 'resolution' || battle.status === 'completed') {
      // Everyone sees the round's goals, except covert operations that the enemy should not learn about
      const myTeams = new Set(battle.participants.filter(p => p.user_id === req.user.id).map(p => p.team_name));
      const teamOf = (participantId) => (battle.participants.find(p => p.id === participantId) || {}).team_name;
      const visible = goals.filter(goal => {
        if (goal.goal_key === 'vanish') return myTeams.has(goal.team_name);
        if (goal.goal_key === 'stealth_strike') return myTeams.has(goal.team_name) || myTeams.has(teamOf(goal.target_participant_id));
        return true;
      });
      return res.json(visible);
    }

    const allowedParticipantIds = battle.participants
      .filter(p => !p.is_dm_run && p.user_id === req.user.id)
      .map(p => p.id);

    const filtered = goals.filter(goal => allowedParticipantIds.includes(goal.participant_id));
    return res.json(filtered);
  } catch (error) {
    console.error('Error fetching battle goals:', error);
    res.status(500).json({ error: 'Failed to fetch battle goals' });
  }
});

// Set or update a goal for a participant
router.post('/battles/:id/goals', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { participant_id, goal_key, target_participant_id } = req.body;

    console.log(`📨 Goal selection request:`, { id, participant_id, goal_key, target_participant_id });

    const battle = await Battle.findById(id);
    if (!battle) {
      console.log(`❌ Battle not found: ${id}`);
      return res.status(404).json({ error: 'Battle not found' });
    }

    if (battle.status !== 'goal_selection') {
      console.log(`❌ Battle not in goal_selection phase: ${battle.status}`);
      return res.status(400).json({ error: 'Goals can only be selected during goal selection phase' });
    }

    const campaign = await Campaign.findById(battle.campaign_id);
    const isDM = req.user.role === 'Dungeon Master' && campaign.dungeon_master_id === req.user.id;

    const participant = battle.participants.find(p => p.id === participant_id);
    if (!participant) {
      console.log(`❌ Participant not found: ${participant_id}`);
      return res.status(404).json({ error: 'Participant not found' });
    }

    if (participant.current_troops <= 0) {
      console.log(`❌ Participant has 0 troops: ${participant_id}`);
      return res.status(400).json({ error: 'Armies with 0 troops cannot select goals' });
    }

    if (!isDM && participant.user_id !== req.user.id) {
      console.log(`❌ Unauthorized: user ${req.user.id} != participant user ${participant.user_id}`);
      return res.status(403).json({ error: 'Unauthorized to select goal for this army' });
    }

    if (participant.is_dm_run && !isDM) {
      console.log(`❌ Temporary army, not DM`);
      return res.status(403).json({ error: 'Only the Dungeon Master can select goals for temporary armies' });
    }

    const goalTemplate = findGoalByKey(goal_key);
    if (goalTemplate && goalTemplate.requires_hidden && !participant.is_hidden) {
      return res.status(400).json({ error: 'This army must be hidden first. Use Melt into the Shadows.' });
    }
    if (!goalTemplate) {
      console.log(`❌ Invalid goal: ${goal_key}`);
      return res.status(400).json({ error: 'Invalid goal selection' });
    }

    // For non-temporary armies, use the actual army category from armies table
    // For temporary armies, use the temp_army_category
    const category = participant.is_temporary
      ? (participant.temp_army_category || 'Recruit')
      : (participant.army_category || participant.temp_army_category || 'Recruit');
    
    console.log(`🔍 Goal eligibility check for participant ${participant.id}:`, {
      is_temporary: participant.is_temporary,
      army_category: participant.army_category,
      temp_army_category: participant.temp_army_category,
      finalCategory: category,
      goalKey: goal_key,
      goalEligibleCategories: goalTemplate.eligible_categories
    });
    
    if (!isGoalEligible(goalTemplate, category)) {
      return res.status(400).json({ error: 'This army is not eligible for that goal' });
    }

    let target = null;
    if (goalTemplate.target_type === 'enemy') {
      if (!target_participant_id) {
        return res.status(400).json({ error: 'Target required for this goal' });
      }
      target = battle.participants.find(p => p.id === target_participant_id);
      if (!target) {
        return res.status(404).json({ error: 'Target participant not found' });
      }
      if (target.team_name === participant.team_name) {
        return res.status(400).json({ error: 'Target must be an enemy army' });
      }
      if ((target.is_hidden || target.dm_hidden) && target.team_name !== participant.team_name) {
        return res.status(400).json({ error: 'That army is hidden and cannot be targeted' });
      }
      if (goalTemplate.target_base_types && goalTemplate.target_base_types.length > 0) {
        const targetCategory = target.is_temporary
          ? (target.temp_army_category || 'Recruit')
          : (target.army_category || target.temp_army_category || 'Recruit');
        if (!goalTemplate.target_base_types.includes(baseTypeOf(targetCategory))) {
          return res.status(400).json({ error: `This goal can only target: ${goalTemplate.target_base_types.join(', ')}` });
        }
      }
    }

    if (goalTemplate.score_requirement && goalTemplate.target_type === 'enemy') {
      if (!target) {
        return res.status(400).json({ error: 'Target required for this goal' });
      }
      const getParticipantScore = (p) => {
        if (!p) return 0;
        if (typeof p.current_score === 'number') return p.current_score;
        if (typeof p.base_score === 'number') return p.base_score;
        return 0;
      };
      const attackerScore = getParticipantScore(participant);
      const targetScore = getParticipantScore(target);
      const delta = attackerScore - targetScore;
      const requirement = goalTemplate.score_requirement;
      const meets = requirement.method === 'ahead'
        ? delta >= requirement.delta
        : delta <= -requirement.delta;
      if (!meets) {
        const needed = requirement.method === 'ahead'
          ? `+${requirement.delta}`
          : `-${requirement.delta}`;
        return res.status(400).json({ error: `Score requirement not met (needs ${needed} vs target).` });
      }
    }

    const created = await Battle.setGoal({
      battle_id: battle.id,
      round_number: battle.current_round,
      participant_id: participant.id,
      team_name: participant.team_name,
      goal_key: goalTemplate.key,
      goal_name: goalTemplate.name,
      goal_type: goalTemplate.goal_type,
      target_participant_id: target_participant_id || null
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${battle.campaign_id}`).emit('battleGoalSelected', {
        battleId: battle.id,
        goal: created,
        participantId: participant.id,
        timestamp: new Date().toISOString()
      });

      // Check if all eligible participants have now selected goals
      const eligibleParticipants = (battle.participants || []).filter(p => (p.current_troops || 0) > 0);
      const allGoalsResult = await pool.query(
        `SELECT DISTINCT participant_id FROM battle_goals 
         WHERE battle_id = $1 AND round_number = $2`,
        [battle.id, battle.current_round]
      );
      const goalParticipantIds = new Set(allGoalsResult.rows.map(row => row.participant_id));
      
      // Check if all eligible participants have selected goals
      const allSelected = eligibleParticipants.every(p => 
        p.has_selected_goal || goalParticipantIds.has(p.id)
      );
      
      if (allSelected) {
        io.to(`campaign_${battle.campaign_id}`).emit('allGoalsSelected', {
          battleId: battle.id,
          round: battle.current_round,
          timestamp: new Date().toISOString()
        });
      }
    }

    res.json(created);
  } catch (error) {
    console.error('Error setting battle goal:', error);
    res.status(500).json({ error: 'Failed to set battle goal' });
  }
});

// Resolve an individual goal
router.post('/battles/:id/goals/:goalId/resolve', authenticateToken, async (req, res) => {
  try {
    const { id, goalId } = req.params;

    const battle = await Battle.findById(id);
    if (!battle) {
      return res.status(404).json({ error: 'Battle not found' });
    }

    if (battle.status !== 'resolution') {
      return res.status(400).json({ error: 'Goals can only be resolved during resolution phase' });
    }

    const goalResult = await pool.query(
      `SELECT bg.*, bp.team_name as executor_team_name, bp.is_temporary, bp.army_id, bp.current_troops, bp.current_score as executor_score,
              bp.position_x as executor_position_x, bp.position_y as executor_position_y,
              COALESCE(CASE WHEN bp.is_temporary THEN bp.temp_army_category ELSE a.category END, 'Recruit') as executor_category,
              COALESCE(bp.temp_army_name, a.name, 'Attacker') as executor_name,
              COALESCE(a.total_troops, bp.temp_army_troops, bp.current_troops) as executor_total_troops,
              CASE WHEN bp.is_temporary THEN bp.temp_army_stats
                   ELSE jsonb_build_object('equipment', a.equipment, 'discipline', a.discipline, 'morale', a.morale, 'command', a.command, 'logistics', a.logistics) END as executor_stats,
              COALESCE(a.player_id, bp.controller_user_id) as executor_player_id,
              target_bp.current_troops as target_troops,
              target_bp.current_score as target_score,
              target_bp.position_x as target_position_x, target_bp.position_y as target_position_y,
              COALESCE(CASE WHEN target_bp.is_temporary THEN target_bp.temp_army_category ELSE a_target.category END, 'Recruit') as target_category,
              COALESCE(target_bp.temp_army_name, a_target.name, 'Defender') as target_name,
              COALESCE(a_target.total_troops, target_bp.temp_army_troops, target_bp.current_troops) as target_total_troops,
              CASE WHEN target_bp.is_temporary THEN target_bp.temp_army_stats
                   ELSE jsonb_build_object('equipment', a_target.equipment, 'discipline', a_target.discipline, 'morale', a_target.morale, 'command', a_target.command, 'logistics', a_target.logistics) END as target_stats
       FROM battle_goals bg
       LEFT JOIN battle_participants bp ON bg.participant_id = bp.id
       LEFT JOIN armies a ON bp.army_id = a.id
       LEFT JOIN battle_participants target_bp ON bg.target_participant_id = target_bp.id
       LEFT JOIN armies a_target ON target_bp.army_id = a_target.id
       WHERE bg.id = $1 AND bg.battle_id = $2`,
      [goalId, id]
    );

    if (goalResult.rows.length === 0) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    const goal = goalResult.rows[0];
    const campaign = await Campaign.findById(battle.campaign_id);
    const isDM = req.user.role === 'Dungeon Master' && campaign.dungeon_master_id === req.user.id;

    const ruledByDM = !!(findGoalByKey(goal.goal_key) || {}).manual;
    if (ruledByDM && !isDM) {
      return res.status(403).json({ error: 'Only the Dungeon Master can rule on this goal' });
    }
    if (!isDM && goal.executor_player_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to resolve this goal' });
    }

    if (goal.status === 'resolved' || goal.status === 'applied') {
      return res.json(goal);
    }

    let resolution = {
      attacker_roll: null,
      defender_roll: null,
      logistics_roll: null,
      roll_details: {},
      advantage: 'none',
      casualties_target: 0,
      casualties_self: 0,
      score_change_target: 0,
      score_change_self: 0,
      notes: ''
    };

    // Both sides as the simulation sees them
    const executorSide = {
      name: goal.executor_name,
      category: goal.executor_category,
      troops: Number(goal.current_troops) || 0,
      totalTroops: Number(goal.executor_total_troops) || Number(goal.current_troops) || 0,
      score: Number(goal.executor_score) || 0,
      stats: { ...(goal.executor_stats || {}), numbers: Army.calculateNumbersStat(Number(goal.current_troops) || 0) }
    };
    const targetSide = goal.target_participant_id ? {
      name: goal.target_name,
      category: goal.target_category,
      troops: Number(goal.target_troops) || 0,
      totalTroops: Number(goal.target_total_troops) || Number(goal.target_troops) || 0,
      score: Number(goal.target_score) || 0,
      stats: { ...(goal.target_stats || {}), numbers: Army.calculateNumbersStat(Number(goal.target_troops) || 0) }
    } : null;

    if (goal.goal_type === GOAL_TYPES.ATTACK && targetSide) {
      const targetDefend = await pool.query(
        `SELECT goal_key FROM battle_goals
         WHERE battle_id = $1 AND round_number = $2 AND participant_id = $3 AND goal_type = $4
         ORDER BY id DESC
         LIMIT 1`,
        [battle.id, battle.current_round, goal.target_participant_id, GOAL_TYPES.DEFEND]
      );

      const attackTemplate = findGoalByKey(goal.goal_key);
      const defenseTemplate = targetDefend.rows.length > 0
        ? findGoalByKey(targetDefend.rows[0].goal_key)
        : null;

      // Each side rolls a d100 shaped by its own stats (training, equipment, morale, leadership, supply, size),
      // so a well-drilled army usually rolls high and a green one swings. A target that did not brace is caught
      // off guard, so the attacker keeps the better of two rolls; a braced target does the same to the attacker.
      const attackerAdvantage = targetDefend.rows.length === 0;
      const attackerRolls = attackerAdvantage ? [rollArmy(executorSide), rollArmy(executorSide)] : [rollArmy(executorSide)];
      const defenderRolls = attackerAdvantage ? [rollArmy(targetSide)] : [rollArmy(targetSide), rollArmy(targetSide)];

      const clampRoll = (roll) => Math.max(1, Math.min(100, roll));
      const attackerRoll = clampRoll(Math.max(...attackerRolls) + (attackTemplate?.attack_bonus || 0));
      const defenderRoll = clampRoll(Math.max(...defenderRolls) + (defenseTemplate?.defense_bonus || 0));

      const distanceFeet = getBattlefieldDistanceFeet(
        goal.executor_position_x,
        goal.executor_position_y,
        goal.target_position_x,
        goal.target_position_y
      );

      const outcome = simulateEngagement({
        attacker: executorSide,
        defender: targetSide,
        attackGoal: attackTemplate,
        defendGoal: defenseTemplate,
        distanceFeet,
        attackerRoll,
        defenderRoll
      });

      resolution = {
        attacker_roll: attackerRoll,
        defender_roll: defenderRoll,
        logistics_roll: null,
        roll_details: {
          attacker: attackerRolls,
          defender: defenderRolls,
          expected: { attacker: expectedRoll(executorSide), defender: expectedRoll(targetSide) },
          distance_feet: Math.round(distanceFeet),
          first_contact_exchange: outcome.firstContact,
          routed: outcome.routed,
          log: outcome.log
        },
        advantage: attackerAdvantage ? 'attacker' : 'defender',
        casualties_target: outcome.casualties_target,
        casualties_self: outcome.casualties_self,
        score_change_target: outcome.score_change_target,
        score_change_self: outcome.score_change_self,
        notes: outcome.summary
      };
    } else if (goal.goal_type === GOAL_TYPES.CUSTOM && (findGoalByKey(goal.goal_key) || {}).effect === 'stealth') {
      const enemyRows = await pool.query(
        `SELECT COALESCE(CASE WHEN bp.is_temporary THEN (bp.temp_army_stats->>'discipline')::int ELSE a.discipline END, 5) AS discipline
         FROM battle_participants bp LEFT JOIN armies a ON bp.army_id = a.id
         WHERE bp.battle_id = $1 AND bp.team_name <> $2 AND bp.current_troops > 0`,
        [battle.id, goal.executor_team_name]
      );
      const enemies = enemyRows.rows.map(row => ({ stats: { discipline: row.discipline } }));
      const rawRoll = rollArmy(executorSide);
      const check = simulateVanish({ executor: executorSide, enemies, roll: rawRoll });
      resolution.attacker_roll = check.total;
      resolution.defender_roll = check.dc;
      resolution.roll_details = { stealth: true, hidden: check.success, raw: rawRoll, dc: check.dc };
      resolution.notes = check.success
        ? 'The army vanishes from sight. It is hidden for the next round and can use Shadow Strike.'
        : 'The enemy spots the movement. The army stays exposed.';
    } else if (goal.goal_type === GOAL_TYPES.DEFEND) {
      const attackers = await pool.query(
        `SELECT id FROM battle_goals
         WHERE battle_id = $1 AND round_number = $2 AND target_participant_id = $3 AND goal_type = $4`,
        [battle.id, battle.current_round, goal.participant_id, GOAL_TYPES.ATTACK]
      );

      resolution.notes = attackers.rows.length === 0
        ? 'No attackers targeted this army. Defensive stance unused.'
        : 'Defensive stance applied during attacks.';
    } else if (goal.goal_type === GOAL_TYPES.LOGISTICS) {
      const logRoll = rollArmy(executorSide);
      const outcome = simulateLogistics({
        executor: executorSide,
        target: targetSide,
        goal: findGoalByKey(goal.goal_key),
        roll: logRoll
      });
      resolution.score_change_self = outcome.score_change_self;
      resolution.score_change_target = outcome.score_change_target;
      resolution.notes = outcome.notes;
      const moraleChange = outcome.moraleChange || 0;
      resolution.logistics_roll = logRoll;
      resolution.roll_details = { logistics: [logRoll], ...(moraleChange ? { morale_change: moraleChange } : {}) };
    }

    // Command goals use no dice: they open for the DM, who sets casualties, score and morale by hand
    if (ruledByDM) {
      resolution.notes = 'The DM decides the outcome of this goal.';
      resolution.roll_details = { manual: true };
    }

    const updatedGoal = await Battle.resolveGoal(goal.id, resolution);

    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${battle.campaign_id}`).emit('battleGoalResolved', {
        battleId: battle.id,
        goal: updatedGoal,
        timestamp: new Date().toISOString()
      });
    }

    res.json(updatedGoal);
  } catch (error) {
    console.error('Error resolving battle goal:', error);
    res.status(500).json({ error: 'Failed to resolve battle goal' });
  }
});

// DM can edit resolved goal outcomes
router.patch('/battles/:id/goals/:goalId', authenticateToken, async (req, res) => {
  try {
    const { id, goalId } = req.params;
    const { casualties_target, casualties_self, score_change_target, score_change_self, notes, morale_change_self, morale_change_target } = req.body;

    const battle = await Battle.findById(id);
    if (!battle) {
      return res.status(404).json({ error: 'Battle not found' });
    }

    const campaign = await Campaign.findById(battle.campaign_id);
    if (req.user.role !== 'Dungeon Master' || campaign.dungeon_master_id !== req.user.id) {
      return res.status(403).json({ error: 'Only Dungeon Master can edit goal results' });
    }

    const updatedGoal = await Battle.updateGoalResult(goalId, {
      casualties_target: casualties_target || 0,
      casualties_self: casualties_self || 0,
      score_change_target: score_change_target || 0,
      score_change_self: score_change_self || 0,
      notes: notes || '',
      morale_change_self,
      morale_change_target
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${battle.campaign_id}`).emit('battleGoalResolved', {
        battleId: battle.id,
        goal: updatedGoal,
        timestamp: new Date().toISOString()
      });
    }

    res.json(updatedGoal);
  } catch (error) {
    console.error('Error updating goal result:', error);
    res.status(500).json({ error: 'Failed to update goal result' });
  }
});

// Apply all resolved goal results (DM only)
router.post('/battles/:id/goals/apply', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const battle = await Battle.findById(id);
    if (!battle) {
      return res.status(404).json({ error: 'Battle not found' });
    }

    const campaign = await Campaign.findById(battle.campaign_id);
    if (req.user.role !== 'Dungeon Master' || campaign.dungeon_master_id !== req.user.id) {
      return res.status(403).json({ error: 'Only Dungeon Master can apply goal results' });
    }

    const appliedGoals = await Battle.applyGoalResults(battle.id, battle.current_round);

    const updatedBattle = await Battle.findById(battle.id);
    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${battle.campaign_id}`).emit('battleGoalsApplied', {
        battleId: battle.id,
        goals: appliedGoals,
        participants: publicParticipants(updatedBattle.participants),
        timestamp: new Date().toISOString()
      });
      io.to(`campaign_${battle.campaign_id}`).emit('goalsPhaseCompleted', {
        battleId: battle.id,
        round: battle.current_round,
        timestamp: new Date().toISOString()
      });
    }

    res.json({ goals: appliedGoals, battle: updatedBattle });
  } catch (error) {
    console.error('Error applying battle goal results:', error);
    res.status(500).json({ error: 'Failed to apply goal results' });
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
    
    // Nothing stays concealed once the fight is over
    await Battle.revealDmHidden(id);

    // Get final results
    const participants = await Battle.getBattleResults(id);
    
    // Calculate team scores (exclude armies with 0 troops)
    const teamScores = {};
    participants.forEach(p => {
      if (!teamScores[p.team_name]) {
        teamScores[p.team_name] = 0;
      }
      // Only add score if army still has troops
      if (p.current_troops > 0) {
        teamScores[p.team_name] += p.current_score;
      }
    });
    
    // Determine winning team
    const sortedTeams = Object.entries(teamScores).sort((a, b) => b[1] - a[1]);
    const winningTeam = sortedTeams[0][0];
    const winningScore = sortedTeams[0][1];

    const killsResult = await pool.query(
      `SELECT participant_id, COALESCE(SUM(casualties_target), 0) as kills
       FROM battle_goals
       WHERE battle_id = $1 AND status IN ('resolved', 'applied')
       GROUP BY participant_id`,
      [id]
    );
    const killsByParticipant = killsResult.rows.reduce((acc, row) => {
      acc[row.participant_id] = Number(row.kills) || 0;
      return acc;
    }, {});

    const strongestParticipant = participants.reduce((best, current) => {
      if (!best) return current;
      const bestScore = Number.isFinite(best.current_score) ? best.current_score : 0;
      const currentScore = Number.isFinite(current.current_score) ? current.current_score : 0;
      return currentScore > bestScore ? current : best;
    }, null);
    
    // Save battle history for each army
    for (const participant of participants) {
      if (!participant.is_temporary && participant.army_id) {
        // Find all goals chosen by this participant
        const goalsResult = await pool.query(
          `SELECT * FROM battle_goals WHERE battle_id = $1 AND participant_id = $2 ORDER BY round_number`,
          [id, participant.id]
        );
        const participantGoals = goalsResult.rows || [];
        
        // Determine result based on team victory
        const participantTeamScore = teamScores[participant.team_name];
        let result = 'stalemate';
        
        if (participant.team_name === winningTeam) {
          result = 'victory';
        } else {
          result = 'defeat';
        }
        
        // Find opponent team with highest score
        const opponentTeams = Object.entries(teamScores)
          .filter(([teamName]) => teamName !== participant.team_name)
          .sort((a, b) => b[1] - a[1]);
        
        const topOpponentTeam = opponentTeams.length > 0 ? opponentTeams[0][0] : null;
        const topOpponentScore = opponentTeams.length > 0 ? opponentTeams[0][1] : 0;
        
        // Calculate troop casualties based on score difference
        const winningScore = sortedTeams[0][1];
        const losingScore = sortedTeams[sortedTeams.length - 1][1];
        const absoluteScoreDiff = Math.abs(winningScore - losingScore);
        let troopsLostPercent = 0;
        
        if (result === 'victory') {
          // Winners: brutal casualties even for victors
          // Decisive victory (40+ gap): 15-28%
          // Moderate victory (25-39): 28-45%
          // Close victory (15-24): 45-58%
          // Narrow victory (0-14): 58-70%
          if (absoluteScoreDiff >= 40) {
            troopsLostPercent = Math.floor(Math.random() * 14) + 15; // 15-28%
          } else if (absoluteScoreDiff >= 25) {
            troopsLostPercent = Math.floor(Math.random() * 18) + 28; // 28-45%
          } else if (absoluteScoreDiff >= 15) {
            troopsLostPercent = Math.floor(Math.random() * 14) + 45; // 45-58%
          } else {
            troopsLostPercent = Math.floor(Math.random() * 13) + 58; // 58-70%
          }
        } else {
          // Losers: catastrophic casualties
          // Crushing defeat (40+ gap): 70-90%
          // Heavy defeat (25-39): 60-75%
          // Moderate defeat (15-24): 50-65%
          // Close defeat (0-14): 45-60%
          if (absoluteScoreDiff >= 40) {
            troopsLostPercent = Math.floor(Math.random() * 21) + 70; // 70-90%
          } else if (absoluteScoreDiff >= 25) {
            troopsLostPercent = Math.floor(Math.random() * 16) + 60; // 60-75%
          } else if (absoluteScoreDiff >= 15) {
            troopsLostPercent = Math.floor(Math.random() * 16) + 50; // 50-65%
          } else {
            troopsLostPercent = Math.floor(Math.random() * 16) + 45; // 45-60%
          }
        }
        
        // Calculate actual troops lost from the army's total troops (not current_troops which may be 0)
        // Use army_total_troops to ensure casualties are calculated even if troops hit 0 during battle
        const originalTroops = participant.army_total_troops || participant.current_troops;
        const troopsLost = Math.max(1, Math.floor(originalTroops * (troopsLostPercent / 100)));
        
        // Get a representative opponent name
        const topOpponent = topOpponentTeam 
          ? participants.find(p => p.team_name === topOpponentTeam)
          : null;
        
        if (topOpponent) {
          await Army.addBattleHistory({
            army_id: participant.army_id,
            battle_name: battle.battle_name,
            start_score: participant.base_score,
            end_score: participant.current_score,
            enemy_name: topOpponent.temp_army_name || topOpponent.army_name || 'Unknown',
            enemy_start_score: topOpponent.base_score,
            enemy_end_score: topOpponent.current_score,
            result,
            goals_chosen: participantGoals,
            troops_lost: troopsLost
          });
        }
      }
    }
    
    // Mark battle as completed
    await Battle.updateStatus(id, 'completed');

    // Clear battlefield lighting nodes
    try {
      await pool.query('DELETE FROM campaign_lighting_nodes WHERE campaign_id = $1 AND tab = $2', [battle.campaign_id, 'battlefield']);
    } catch (e) { console.warn('Could not clear battlefield lighting nodes:', e.message); }
    
    // Emit socket event
    const io = req.app.get('io');
    const summary = {
      teamScores,
      winningTeam,
      winningScore,
      strongestArmy: strongestParticipant
        ? {
            participantId: strongestParticipant.id,
            name: strongestParticipant.temp_army_name || strongestParticipant.army_name || `Army #${strongestParticipant.id}`,
            score: strongestParticipant.current_score
          }
        : null,
      killsByParticipant
    };

    if (io) {
      const battleId = parseInt(id, 10);
      io.to(`campaign_${battle.campaign_id}`).emit('battleCompleted', {
        battleId,
        battleName: battle.battle_name,
        results: participants,
        summary,
        timestamp: new Date().toISOString()
      });
      // Emit cleared battlefield lighting nodes
      const remainingNodes = await pool.query('SELECT id, type, x, y, strength, tab FROM campaign_lighting_nodes WHERE campaign_id = $1', [battle.campaign_id]);
      io.to(`campaign_${battle.campaign_id}`).emit('lightingNodesUpdated', { nodes: remainingNodes.rows, campaignId: battle.campaign_id });
    }
    
    res.json({ message: 'Battle completed', results: participants, summary });
  } catch (error) {
    console.error('Error completing battle:', error);
    res.status(500).json({ error: 'Failed to complete battle' });
  }
});

// Update army troops (for manual adjustments)
router.patch('/:id/troops', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { troop_change } = req.body;
    
    const army = await Army.findById(id);
    if (!army) {
      return res.status(404).json({ error: 'Army not found' });
    }
    
    // Check if user owns this army or is DM
    if (req.user.role !== 'Dungeon Master' && army.player_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    const updatedArmy = await Army.updateTroops(id, troop_change);
    
    res.json(updatedArmy);
  } catch (error) {
    console.error('Error updating troops:', error);
    res.status(500).json({ error: 'Failed to update troops' });
  }
});

// Update army garrison status (owner or DM)
router.patch('/:id/garrison-status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_garrisoned } = req.body;

    if (typeof is_garrisoned !== 'boolean') {
      return res.status(400).json({ error: 'is_garrisoned must be a boolean' });
    }

    const army = await Army.findById(id);
    if (!army) {
      return res.status(404).json({ error: 'Army not found' });
    }

    const campaign = await Campaign.findById(army.campaign_id);
    const isDM = req.user.role === 'Dungeon Master' && campaign && campaign.dungeon_master_id === req.user.id;
    const isOwner = army.player_id === req.user.id;

    if (!isDM && !isOwner) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const result = await pool.query(
      'UPDATE armies SET is_garrisoned = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [is_garrisoned, id]
    );

    const updatedArmy = result.rows[0];

    const io = req.app.get('io');
    if (io) io.to(`campaign_${army.campaign_id}`).emit('armyUpdated', { army: updatedArmy, timestamp: new Date().toISOString() });

    res.json(updatedArmy);
  } catch (error) {
    console.error('Error updating garrison status:', error);
    res.status(500).json({ error: 'Failed to update garrison status' });
  }
});

module.exports = router;
