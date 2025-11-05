const express = require('express');
const router = express.Router();
const MonsterInstance = require('../models/MonsterInstance');
const Monster = require('../models/Monster');
const { authenticateToken: auth } = require('../middleware/auth');

// Get all monster instances for a campaign
router.get('/campaign/:campaignId', auth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const instances = await MonsterInstance.findByCampaignId(campaignId);
    res.json(instances);
  } catch (error) {
    console.error('Error fetching monster instances:', error);
    res.status(500).json({ error: 'Failed to fetch monster instances' });
  }
});

// Get active monster instances for a campaign
router.get('/campaign/:campaignId/active', auth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const instances = await MonsterInstance.findActiveByCampaignId(campaignId);
    res.json(instances);
  } catch (error) {
    console.error('Error fetching active monster instances:', error);
    res.status(500).json({ error: 'Failed to fetch active monster instances' });
  }
});

// Update monster instance health
router.patch('/:id/health', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { limbHealth } = req.body;
    const updated = await MonsterInstance.updateHealth(id, limbHealth);
    res.json(updated);
  } catch (error) {
    console.error('Error updating monster instance health:', error);
    res.status(500).json({ error: 'Failed to update monster instance health' });
  }
});

// Remove monster instance from combat
router.patch('/:id/remove-from-combat', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await MonsterInstance.removeFromCombat(id);
    res.json(updated);
  } catch (error) {
    console.error('Error removing monster instance from combat:', error);
    res.status(500).json({ error: 'Failed to remove monster instance from combat' });
  }
});

module.exports = router;
