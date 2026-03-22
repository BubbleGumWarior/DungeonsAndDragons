const express = require('express');
const router = express.Router();
const Kingdom = require('../models/Kingdom');
const { authenticateToken } = require('../middleware/auth');

// GET all active kingdoms for a campaign (summary with fiefs)
router.get('/campaign/:campaignId', authenticateToken, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const kingdoms = await Kingdom.findByCampaignWithDetails(campaignId);
    res.json(kingdoms);
  } catch (error) {
    console.error('Error fetching kingdoms:', error);
    res.status(500).json({ error: 'Failed to fetch kingdoms' });
  }
});

// GET full kingdom details (all fiefs, buildings, events, actions)
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const kingdom = await Kingdom.findByIdFull(req.params.id);
    if (!kingdom) return res.status(404).json({ error: 'Kingdom not found' });
    res.json(kingdom);
  } catch (error) {
    console.error('Error fetching kingdom:', error);
    res.status(500).json({ error: 'Failed to fetch kingdom' });
  }
});

// PATCH kingdom tier upgrade
router.post('/:id/upgrade-tier', authenticateToken, async (req, res) => {
  try {
    const kingdom = await Kingdom.upgradeTier(req.params.id);
    const io = req.app.get('io');
    if (io && kingdom?.campaign_id) io.to(`campaign_${kingdom.campaign_id}`).emit('kingdomDataChanged', { campaignId: kingdom.campaign_id, kingdomId: kingdom.id });
    res.json(kingdom);
  } catch (error) {
    console.error('Error upgrading kingdom tier:', error);
    res.status(500).json({ error: 'Failed to upgrade tier' });
  }
});

// PATCH kingdom resources
router.patch('/:id/resources', authenticateToken, async (req, res) => {
  try {
    const kingdom = await Kingdom.updateResources(req.params.id, req.body.resources);
    const io = req.app.get('io');
    if (io && kingdom?.campaign_id) io.to(`campaign_${kingdom.campaign_id}`).emit('kingdomDataChanged', { campaignId: kingdom.campaign_id, kingdomId: kingdom.id });
    res.json(kingdom);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update resources' });
  }
});

// PATCH kingdom stats
router.patch('/:id/stats', authenticateToken, async (req, res) => {
  try {
    const kingdom = await Kingdom.updateStats(req.params.id, req.body.stats);
    const io = req.app.get('io');
    if (io && kingdom?.campaign_id) io.to(`campaign_${kingdom.campaign_id}`).emit('kingdomDataChanged', { campaignId: kingdom.campaign_id, kingdomId: kingdom.id });
    res.json(kingdom);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update stats' });
  }
});

// PATCH kingdom population
router.patch('/:id/population', authenticateToken, async (req, res) => {
  try {
    const kingdom = await Kingdom.updatePopulation(req.params.id, req.body.population);
    const io = req.app.get('io');
    if (io && kingdom?.campaign_id) io.to(`campaign_${kingdom.campaign_id}`).emit('kingdomDataChanged', { campaignId: kingdom.campaign_id, kingdomId: kingdom.id });
    res.json(kingdom);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update population' });
  }
});

// DELETE kingdom (DM only)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'Dungeon Master') return res.status(403).json({ error: 'DM only' });
    const existing = await Kingdom.findById(req.params.id);
    await Kingdom.delete(req.params.id);
    const io = req.app.get('io');
    if (io && existing?.campaign_id) io.to(`campaign_${existing.campaign_id}`).emit('kingdomDeleted', { campaignId: existing.campaign_id, kingdomId: existing.id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete kingdom' });
  }
});

module.exports = router;
