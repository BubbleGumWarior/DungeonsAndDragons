const express = require('express');
const router = express.Router();
const KingdomEvent = require('../models/KingdomEvent');
const { authenticateToken } = require('../middleware/auth');

// GET all events for a kingdom
router.get('/:kingdomId/events', authenticateToken, async (req, res) => {
  try {
    const events = await KingdomEvent.findByKingdom(req.params.kingdomId);
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch kingdom events' });
  }
});

// POST create event
router.post('/:kingdomId/events', authenticateToken, async (req, res) => {
  try {
    const { title, description, event_type, severity, fief_id } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });
    const event = await KingdomEvent.create({
      kingdom_id: req.params.kingdomId,
      fief_id: fief_id || null,
      title,
      description: description || '',
      event_type: event_type || 'announcement',
      severity: severity || 'low',
      created_by: req.user.id,
    });
    res.status(201).json(event);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// PATCH resolve event
router.patch('/:kingdomId/events/:eventId', authenticateToken, async (req, res) => {
  try {
    const event = await KingdomEvent.resolve(req.params.eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    res.json(event);
  } catch (error) {
    res.status(500).json({ error: 'Failed to resolve event' });
  }
});

module.exports = router;
