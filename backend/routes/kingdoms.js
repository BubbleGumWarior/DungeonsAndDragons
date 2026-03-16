const express = require('express');
const router = express.Router();
const Kingdom = require('../models/Kingdom');
const { authenticateToken } = require('../middleware/auth');

// GET all active kingdoms for a campaign
router.get('/campaign/:campaignId', authenticateToken, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const kingdoms = await Kingdom.findByCampaign(campaignId);
    res.json(kingdoms);
  } catch (error) {
    console.error('Error fetching kingdoms:', error);
    res.status(500).json({ error: 'Failed to fetch kingdoms' });
  }
});

module.exports = router;
