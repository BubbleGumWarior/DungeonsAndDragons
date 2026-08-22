const express = require('express');
const router = express.Router();
const FoodStockpile = require('../models/FoodStockpile');
const { pool } = require('../models/database');
const { authenticateToken: auth } = require('../middleware/auth');

const isDM = (req) => req.user.role === 'Dungeon Master';

async function getCharacterOwnerId(characterId) {
  const r = await pool.query('SELECT player_id FROM characters WHERE id = $1', [characterId]);
  return r.rows[0]?.player_id ?? null;
}

// GET /api/pet-food/campaign/:campaignId/stockpiles
// DM: every character's stockpile. Player: just their own character's.
router.get('/campaign/:campaignId/stockpiles', auth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    if (isDM(req)) {
      const { stockpiles, prices } = await FoodStockpile.getForCampaign(campaignId);
      res.json({ stockpiles, prices });
    } else {
      const { characterId } = req.query;
      if (!characterId) return res.status(400).json({ error: 'characterId is required' });
      const ownerId = await getCharacterOwnerId(characterId);
      if (ownerId !== req.user.id) return res.status(403).json({ error: 'Access denied' });
      const { stockpile, prices } = await FoodStockpile.getForCharacter(campaignId, characterId);
      res.json({ stockpiles: [stockpile], prices });
    }
  } catch (err) {
    console.error('Error fetching food stockpiles:', err);
    res.status(500).json({ error: 'Failed to fetch food stockpiles' });
  }
});

// POST /api/pet-food/campaign/:campaignId/buy — body { characterId, rationType, quantity }
router.post('/campaign/:campaignId/buy', auth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { characterId, rationType, quantity } = req.body;
    if (!characterId) return res.status(400).json({ error: 'characterId is required' });

    const ownerId = await getCharacterOwnerId(characterId);
    if (ownerId === null) return res.status(404).json({ error: 'Character not found' });
    if (!isDM(req) && ownerId !== req.user.id) {
      return res.status(403).json({ error: 'You can only spend your own character\'s gold' });
    }

    const result = await FoodStockpile.buyRations(campaignId, { characterId, rationType, quantity });

    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${campaignId}`).emit('foodStockpileUpdated', {
        campaignId: Number(campaignId),
        updates: [{ characterId: Number(characterId), meat_rations: result.stockpile.meat_rations, veg_rations: result.stockpile.veg_rations }],
        timestamp: new Date().toISOString(),
      });
      io.to(`campaign_${campaignId}`).emit('characterGoldUpdated', { characterId: Number(characterId), gold: result.remainingGold });
    }
    res.json(result);
  } catch (err) {
    console.error('Error buying rations:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to buy rations' });
  }
});

// PATCH /api/pet-food/campaign/:campaignId/grant — DM only, body { characterId, rationType, quantity }
// Directly grants (or removes, with a negative quantity) rations, bypassing gold entirely.
router.patch('/campaign/:campaignId/grant', auth, async (req, res) => {
  try {
    if (!isDM(req)) return res.status(403).json({ error: 'Only the Dungeon Master can grant food directly' });
    const { campaignId } = req.params;
    const { characterId, rationType, quantity } = req.body;
    if (!characterId) return res.status(400).json({ error: 'characterId is required' });

    const updated = await FoodStockpile.grantRations(campaignId, { characterId, rationType, quantity });

    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${campaignId}`).emit('foodStockpileUpdated', {
        campaignId: Number(campaignId),
        updates: [{ characterId: Number(characterId), meat_rations: updated.meat_rations, veg_rations: updated.veg_rations, max_slots: updated.max_slots }],
        timestamp: new Date().toISOString(),
      });
    }
    res.json(updated);
  } catch (err) {
    console.error('Error granting rations:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to grant rations' });
  }
});

// PATCH /api/pet-food/campaign/:campaignId/max-slots — DM only, body { characterId, maxSlots }
router.patch('/campaign/:campaignId/max-slots', auth, async (req, res) => {
  try {
    if (!isDM(req)) return res.status(403).json({ error: 'Only the Dungeon Master can set stockpile capacity' });
    const { campaignId } = req.params;
    const { characterId, maxSlots } = req.body;
    if (!characterId) return res.status(400).json({ error: 'characterId is required' });

    const updated = await FoodStockpile.setMaxSlots(campaignId, characterId, maxSlots);

    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${campaignId}`).emit('foodStockpileUpdated', {
        campaignId: Number(campaignId),
        updates: [{ characterId: Number(characterId), meat_rations: updated.meat_rations, veg_rations: updated.veg_rations, max_slots: updated.max_slots }],
        timestamp: new Date().toISOString(),
      });
    }
    res.json(updated);
  } catch (err) {
    console.error('Error setting stockpile max slots:', err);
    res.status(500).json({ error: 'Failed to set stockpile capacity' });
  }
});

// PATCH /api/pet-food/campaign/:campaignId/prices — DM only, body { meatPrice, vegPrice }
router.patch('/campaign/:campaignId/prices', auth, async (req, res) => {
  try {
    if (!isDM(req)) return res.status(403).json({ error: 'Only the Dungeon Master can change market prices' });
    const { campaignId } = req.params;
    const { meatPrice, vegPrice } = req.body;

    const prices = await FoodStockpile.setCampaignPrices(campaignId, { meatPrice, vegPrice });

    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${campaignId}`).emit('foodMarketSettingsUpdated', { campaignId: Number(campaignId), prices, timestamp: new Date().toISOString() });
    }
    res.json(prices);
  } catch (err) {
    console.error('Error setting market prices:', err);
    res.status(500).json({ error: 'Failed to update market prices' });
  }
});

module.exports = router;
