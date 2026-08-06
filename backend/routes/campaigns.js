const express = require('express');
const router = express.Router();
const Campaign = require('../models/Campaign');
const Character = require('../models/Character');
const { authenticateToken } = require('../middleware/auth');
const { pool } = require('../models/database');

// Get all campaigns
router.get('/', authenticateToken, async (req, res) => {
  try {
    const campaigns = await Campaign.getAll();
    res.json({ campaigns });
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

// Get campaigns for current user
router.get('/my-campaigns', authenticateToken, async (req, res) => {
  try {
    let campaigns;
    
    if (req.user.role === 'Dungeon Master') {
      // DM sees campaigns they created
      campaigns = await Campaign.getByDungeonMaster(req.user.id);
    } else {
      // Players see campaigns they have characters in
      campaigns = await Campaign.getByPlayer(req.user.id);
    }
    
    res.json({ campaigns });
  } catch (error) {
    console.error('Error fetching user campaigns:', error);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

// Get campaign by ID or URL name
router.get('/:identifier', authenticateToken, async (req, res) => {
  try {
    const { identifier } = req.params;
    let campaign;
    
    // Try to find by ID first (if numeric), then by URL name
    if (/^\d+$/.test(identifier)) {
      campaign = await Campaign.findById(parseInt(identifier));
    } else {
      campaign = await Campaign.findByUrlName(identifier);
    }
    
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    // Get players in campaign
    const players = await Campaign.getPlayersInCampaign(campaign.id);
    
    // Get characters in campaign
    const characters = await Character.getByCampaign(campaign.id);
    
    // Check if current user has a character in this campaign
    let userCharacter = null;
    if (req.user.role === 'Player') {
      userCharacter = await Character.findByPlayerAndCampaign(req.user.id, campaign.id);
    }
    
    res.json({
      campaign,
      players,
      characters,
      userCharacter
    });
  } catch (error) {
    console.error('Error fetching campaign:', error);
    res.status(500).json({ error: 'Failed to fetch campaign' });
  }
});

// Create new campaign (DM only)
router.post('/', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'Dungeon Master') {
      return res.status(403).json({ error: 'Only Dungeon Masters can create campaigns' });
    }
    
    const { name, description } = req.body;
    
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Campaign name is required' });
    }
    
    // Check if campaign name already exists
    const existingCampaign = await Campaign.findByName(name.trim());
    if (existingCampaign) {
      return res.status(400).json({ error: 'A campaign with this name already exists' });
    }
    
    const campaignData = {
      name: name.trim(),
      description: description?.trim() || '',
      dungeon_master_id: req.user.id
    };
    
    const campaign = await Campaign.create(campaignData);
    res.status(201).json({
      message: 'Campaign created successfully',
      campaign
    });
  } catch (error) {
    console.error('Error creating campaign:', error);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

// Update campaign (DM only, own campaigns)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    
    // Check if campaign exists and user is the DM
    const campaign = await Campaign.findById(id);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    if (campaign.dungeon_master_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only edit your own campaigns' });
    }
    
    // Check if new name conflicts with existing campaigns (if name is being changed)
    if (name && name.trim() !== campaign.name) {
      const existingCampaign = await Campaign.findByName(name.trim());
      if (existingCampaign) {
        return res.status(400).json({ error: 'A campaign with this name already exists' });
      }
    }
    
    const updateData = {};
    if (name) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description.trim();
    
    const updatedCampaign = await Campaign.update(id, updateData);
    res.json({
      message: 'Campaign updated successfully',
      campaign: updatedCampaign
    });
  } catch (error) {
    console.error('Error updating campaign:', error);
    res.status(500).json({ error: 'Failed to update campaign' });
  }
});

// Delete campaign (DM only, own campaigns)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if campaign exists and user is the DM
    const campaign = await Campaign.findById(id);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    if (campaign.dungeon_master_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own campaigns' });
    }
    
    await Campaign.delete(id);
    res.json({ message: 'Campaign deleted successfully' });
  } catch (error) {
    console.error('Error deleting campaign:', error);
    res.status(500).json({ error: 'Failed to delete campaign' });
  }
});

// Check if user has character in campaign
router.get('/:id/check-character', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (req.user.role !== 'Player') {
      return res.json({ hasCharacter: false });
    }
    
    const character = await Character.findByPlayerAndCampaign(req.user.id, id);
    res.json({
      hasCharacter: !!character,
      character: character || null
    });
  } catch (error) {
    console.error('Error checking character:', error);
    res.status(500).json({ error: 'Failed to check character status' });
  }
});

// Get URL-safe campaign name
router.get('/:id/url-name', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const campaign = await Campaign.findById(id);
    
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    const urlName = Campaign.generateUrlName(campaign.name);
    res.json({ urlName });
  } catch (error) {
    console.error('Error generating URL name:', error);
    res.status(500).json({ error: 'Failed to generate URL name' });
  }
});

// POST reset campaign day back to 1 (DM only)
router.post('/:id/reset-day', authenticateToken, async (req, res) => {
  try {
    if (req.user?.role !== 'Dungeon Master') return res.status(403).json({ error: 'DM only' });
    const { pool } = require('../models/database');
    await pool.query(`UPDATE campaigns SET current_day = 1 WHERE id = $1`, [req.params.id]);
    const seasonMetadata = Campaign.getSeasonMetadata(1);
    if (req.io) {
      req.io.to(`campaign_${req.params.id}`).emit('dayAdvanced', {
        campaignId: req.params.id,
        newDay: 1,
        ...seasonMetadata,
      });
    }
    res.json({
      current_day: 1,
      day_of_year: seasonMetadata.dayOfYear,
      season: seasonMetadata.season,
      season_effects: seasonMetadata.seasonEffects,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reset day' });
  }
});

// GET campaign current day
router.get('/:id/day', authenticateToken, async (req, res) => {
  try {
    const { pool } = require('../models/database');
    const result = await pool.query(`SELECT COALESCE(current_day, 1) AS current_day FROM campaigns WHERE id = $1`, [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Campaign not found' });
    const currentDay = Number(result.rows[0].current_day);
    const seasonMetadata = Campaign.getSeasonMetadata(currentDay);
    res.json({
      current_day: currentDay,
      day_of_year: seasonMetadata.dayOfYear,
      season: seasonMetadata.season,
      season_effects: seasonMetadata.seasonEffects,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get current day' });
  }
});

// GET campaign season details
router.get('/:id/season', authenticateToken, async (req, res) => {
  try {
    const { pool } = require('../models/database');
    const result = await pool.query(`SELECT COALESCE(current_day, 1) AS current_day FROM campaigns WHERE id = $1`, [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Campaign not found' });

    const currentDay = Number(result.rows[0].current_day);
    const seasonMetadata = Campaign.getSeasonMetadata(currentDay);
    res.json({
      current_day: currentDay,
      day_of_year: seasonMetadata.dayOfYear,
      season: seasonMetadata.season,
      season_effects: seasonMetadata.seasonEffects,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get season data' });
  }
});

// PATCH advance campaign days
router.patch('/:id/advance-days', authenticateToken, async (req, res) => {
  try {
    const { days, restType } = req.body;
    // Short rest does not advance days
    if (restType === 'short') {
      const { pool } = require('../models/database');
      const result = await pool.query(`SELECT COALESCE(current_day, 1) AS current_day FROM campaigns WHERE id = $1`, [req.params.id]);
      const currentDay = Number(result.rows[0]?.current_day || 1);
      const seasonMetadata = Campaign.getSeasonMetadata(currentDay);
      return res.json({
        newDay: currentDay,
        dayOfYear: seasonMetadata.dayOfYear,
        season: seasonMetadata.season,
        seasonEffects: seasonMetadata.seasonEffects,
        completedBuildings: [],
        resourcesGained: {},
        populationGained: {},
        restType: 'short',
      });
    }

    // Long/custom rests require a positive day amount
    const numericDays = Number(days);
    if (!Number.isFinite(numericDays) || numericDays <= 0) {
      return res.status(400).json({ error: 'Invalid days value' });
    }

    const summary = await Campaign.advanceDays(req.params.id, numericDays);
    // Notify all players in the campaign via socket
    if (req.io) {
      req.io.to(`campaign_${req.params.id}`).emit('dayAdvanced', { campaignId: req.params.id, ...summary, restType });
      req.io.to(`campaign_${req.params.id}`).emit('kingdomDataChanged', { campaignId: Number(req.params.id) });

      const userSocketMap = req.app.get('userSocketMap');
      const io = req.app.get('io') || req.io;
      if (io && userSocketMap) {
        const completedByFief = [];

        for (const item of (summary.completedResearch || [])) {
          completedByFief.push({
            type: 'research',
            fiefId: Number(item.fiefId),
            payload: {
              campaignId: Number(req.params.id),
              type: 'research',
              fiefId: Number(item.fiefId),
              fiefName: item.fiefName,
              researchId: item.researchId,
            },
          });
        }

        for (const item of (summary.completedTierUpgrades || [])) {
          completedByFief.push({
            type: 'tier',
            fiefId: Number(item.fiefId),
            payload: {
              campaignId: Number(req.params.id),
              type: 'tier',
              fiefId: Number(item.fiefId),
              fiefName: item.fiefName,
              newTier: Number(item.newTier),
            },
          });
        }

        for (const item of (summary.revolts || [])) {
          completedByFief.push({
            type: 'revolt',
            fiefId: Number(item.fiefId),
            payload: {
              campaignId: Number(req.params.id),
              type: 'revolt',
              fiefId: Number(item.fiefId),
              fiefName: item.fiefName,
              soldiersLost: Number(item.soldiersLost || 0),
              populationLost: Number(item.populationLost || 0),
              hadDefenders: Boolean(item.hadDefenders),
            },
          });
        }

        if (completedByFief.length > 0) {
          const fiefIds = completedByFief.map((x) => x.fiefId).filter(Number.isFinite);
          if (fiefIds.length > 0) {
            const ownersResult = await pool.query(
              `SELECT f.id AS fief_id, k.player_id
               FROM fiefs f
               JOIN kingdoms k ON k.id = f.kingdom_id
               WHERE f.id = ANY($1::int[])`,
              [fiefIds]
            );

            const ownerByFief = new Map();
            for (const row of ownersResult.rows) {
              ownerByFief.set(Number(row.fief_id), Number(row.player_id));
            }

            for (const entry of completedByFief) {
              const ownerId = ownerByFief.get(entry.fiefId);
              if (!ownerId) continue;
              const ownerSocketId = userSocketMap.get(ownerId);
              if (!ownerSocketId) continue;
              io.to(ownerSocketId).emit('kingdomProgressToast', entry.payload);
            }
          }
        }
      }
    }
    res.json({ ...summary, restType });
  } catch (error) {
    console.error('Error advancing days:', error);
    res.status(500).json({ error: 'Failed to advance days' });
  }
});

// Get campaign chat history
router.get('/:id/chat', authenticateToken, async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id, 10);
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);

    // Verify membership: DM or has a character in this campaign
    const campaign = await Campaign.findById(campaignId);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const isDM = campaign.dungeon_master_id === req.user.id;
    if (!isDM) {
      const character = await Character.findByPlayerAndCampaign(req.user.id, campaignId);
      if (!character) return res.status(403).json({ error: 'Not a member of this campaign' });
    }

    const result = await pool.query(
      `SELECT id, campaign_id, sender_id, sender_name, message_type, content, roll_data, created_at
       FROM campaign_chat_messages
       WHERE campaign_id = $1
       ORDER BY created_at ASC
       LIMIT $2`,
      [campaignId, limit]
    );

    res.json({ messages: result.rows });
  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

// Get scores for all players in a campaign
router.get('/:id/scores', authenticateToken, async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id);
    if (isNaN(campaignId)) return res.status(400).json({ error: 'Invalid campaign ID' });

    const result = await pool.query(
      `SELECT cs.player_id, cs.inspiration, cs.discouragement, cs.wishes, cs.anti_wishes
       FROM campaign_scores cs
       WHERE cs.campaign_id = $1`,
      [campaignId]
    );

    res.json({ scores: result.rows });
  } catch (error) {
    console.error('Error fetching campaign scores:', error);
    res.status(500).json({ error: 'Failed to fetch campaign scores' });
  }
});

// Update a player's score in a campaign (DM only)
router.put('/:id/scores/:playerId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'Dungeon Master') {
      return res.status(403).json({ error: 'Dungeon Master access required' });
    }

    const campaignId = parseInt(req.params.id);
    const playerId = parseInt(req.params.playerId);
    if (isNaN(campaignId) || isNaN(playerId)) {
      return res.status(400).json({ error: 'Invalid campaign or player ID' });
    }

    const { field, delta } = req.body;
    const allowedFields = ['inspiration', 'discouragement', 'wishes', 'anti_wishes'];
    if (!allowedFields.includes(field)) {
      return res.status(400).json({ error: 'Invalid field name' });
    }
    if (delta !== 1 && delta !== -1) {
      return res.status(400).json({ error: 'Delta must be 1 or -1' });
    }

    const result = await pool.query(
      `INSERT INTO campaign_scores (campaign_id, player_id, ${field}, updated_at)
       VALUES ($1, $2, GREATEST(0, $3), NOW())
       ON CONFLICT (campaign_id, player_id) DO UPDATE
         SET ${field} = GREATEST(0, campaign_scores.${field} + $3),
             updated_at = NOW()
       RETURNING inspiration, discouragement, wishes, anti_wishes`,
      [campaignId, playerId, delta]
    );

    res.json({ score: result.rows[0] });
  } catch (error) {
    console.error('Error updating campaign score:', error);
    res.status(500).json({ error: 'Failed to update campaign score' });
  }
});

module.exports = router;