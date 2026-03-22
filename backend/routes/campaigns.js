const express = require('express');
const router = express.Router();
const Campaign = require('../models/Campaign');
const Character = require('../models/Character');
const { authenticateToken } = require('../middleware/auth');

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
    if (req.io) req.io.to(`campaign_${req.params.id}`).emit('dayAdvanced', { campaignId: req.params.id, newDay: 1 });
    res.json({ current_day: 1 });
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
    res.json({ current_day: result.rows[0].current_day });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get current day' });
  }
});

// PATCH advance campaign days
router.patch('/:id/advance-days', authenticateToken, async (req, res) => {
  try {
    const { days, restType } = req.body;
    if (!days || days < 0) return res.status(400).json({ error: 'Invalid days value' });

    // Short rest does not advance days
    if (restType === 'short') {
      const { pool } = require('../models/database');
      const result = await pool.query(`SELECT COALESCE(current_day, 1) AS current_day FROM campaigns WHERE id = $1`, [req.params.id]);
      return res.json({ newDay: result.rows[0]?.current_day, completedBuildings: [], resourcesGained: {}, populationGained: {}, restType: 'short' });
    }

    const summary = await Campaign.advanceDays(req.params.id, days);
    // Notify all players in the campaign via socket
    if (req.io) {
      req.io.to(`campaign_${req.params.id}`).emit('dayAdvanced', { campaignId: req.params.id, ...summary, restType });
    }
    res.json({ ...summary, restType });
  } catch (error) {
    console.error('Error advancing days:', error);
    res.status(500).json({ error: 'Failed to advance days' });
  }
});

module.exports = router;