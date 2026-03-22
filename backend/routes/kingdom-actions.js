const express = require('express');
const router = express.Router();
const KingdomAction = require('../models/KingdomAction');
const { authenticateToken } = require('../middleware/auth');

// GET all actions for a kingdom
router.get('/:kingdomId/actions', authenticateToken, async (req, res) => {
  try {
    const actions = await KingdomAction.findByKingdom(req.params.kingdomId);
    res.json(actions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch kingdom actions' });
  }
});

// POST create action
router.post('/:kingdomId/actions', authenticateToken, async (req, res) => {
  try {
    const { title, description, action_type, fief_id } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });
    const action = await KingdomAction.create({
      kingdom_id: req.params.kingdomId,
      fief_id: fief_id || null,
      title,
      description: description || '',
      action_type: action_type || '',
    });
    res.status(201).json(action);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create action' });
  }
});

// PATCH complete action
router.patch('/:kingdomId/actions/:actionId', authenticateToken, async (req, res) => {
  try {
    const action = await KingdomAction.complete(req.params.actionId);
    if (!action) return res.status(404).json({ error: 'Action not found' });
    res.json(action);
  } catch (error) {
    res.status(500).json({ error: 'Failed to complete action' });
  }
});

module.exports = router;
