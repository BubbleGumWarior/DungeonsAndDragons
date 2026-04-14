const express = require('express');
const router = express.Router();
const { pool } = require('../models/database');
const { authenticateToken } = require('../middleware/auth');

// GET /:campaignId/goals — fetch all goals for a campaign, sorted by title
router.get('/:campaignId/goals', authenticateToken, async (req, res) => {
  try {
    const { campaignId } = req.params;

    const result = await pool.query(
      `SELECT * FROM campaign_goals
       WHERE campaign_id = $1
       ORDER BY title ASC`,
      [campaignId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching campaign goals:', error);
    res.status(500).json({ error: 'Failed to fetch campaign goals' });
  }
});

// POST /:campaignId/goals — create a new goal (DM only)
router.post('/:campaignId/goals', authenticateToken, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { title, description, reward } = req.body;

    if (req.user.role !== 'Dungeon Master') {
      return res.status(403).json({ error: 'Only Dungeon Masters can create goals' });
    }

    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required' });
    }

    const result = await pool.query(
      `INSERT INTO campaign_goals (campaign_id, title, description, reward)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [campaignId, title, description, reward || null]
    );

    const created = result.rows[0];

    // Emit socket event so all clients update
    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${campaignId}`).emit('campaignGoalCreated', { goal: created });
    }

    res.status(201).json(created);
  } catch (error) {
    console.error('Error creating campaign goal:', error);
    res.status(500).json({ error: 'Failed to create campaign goal' });
  }
});

// DELETE /:campaignId/goals/:goalId — delete a goal (DM only)
router.delete('/:campaignId/goals/:goalId', authenticateToken, async (req, res) => {
  try {
    const { campaignId, goalId } = req.params;

    if (req.user.role !== 'Dungeon Master') {
      return res.status(403).json({ error: 'Only Dungeon Masters can delete goals' });
    }

    const result = await pool.query(
      `DELETE FROM campaign_goals
       WHERE id = $1 AND campaign_id = $2
       RETURNING id`,
      [goalId, campaignId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${campaignId}`).emit('campaignGoalDeleted', { goalId: Number(goalId) });
    }

    res.json({ message: 'Goal deleted successfully' });
  } catch (error) {
    console.error('Error deleting campaign goal:', error);
    res.status(500).json({ error: 'Failed to delete campaign goal' });
  }
});

// PATCH /:campaignId/goals/:goalId/complete — mark goal complete (DM only)
router.patch('/:campaignId/goals/:goalId/complete', authenticateToken, async (req, res) => {
  try {
    const { campaignId, goalId } = req.params;
    const { completed_by_name } = req.body;

    if (req.user.role !== 'Dungeon Master') {
      return res.status(403).json({ error: 'Only Dungeon Masters can complete goals' });
    }

    if (!completed_by_name || !completed_by_name.trim()) {
      return res.status(400).json({ error: 'completed_by_name is required' });
    }

    const result = await pool.query(
      `UPDATE campaign_goals
       SET completed_by_name = $1, updated_at = NOW()
       WHERE id = $2 AND campaign_id = $3
       RETURNING *`,
      [completed_by_name.trim(), goalId, campaignId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    const updated = result.rows[0];

    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${campaignId}`).emit('campaignGoalUpdated', { goal: updated });
    }

    res.json(updated);
  } catch (error) {
    console.error('Error completing campaign goal:', error);
    res.status(500).json({ error: 'Failed to complete campaign goal' });
  }
});

// PATCH /:campaignId/goals/:goalId/uncomplete — mark goal outstanding again (DM only)
router.patch('/:campaignId/goals/:goalId/uncomplete', authenticateToken, async (req, res) => {
  try {
    const { campaignId, goalId } = req.params;

    if (req.user.role !== 'Dungeon Master') {
      return res.status(403).json({ error: 'Only Dungeon Masters can update goals' });
    }

    const result = await pool.query(
      `UPDATE campaign_goals
       SET completed_by_name = NULL, updated_at = NOW()
       WHERE id = $1 AND campaign_id = $2
       RETURNING *`,
      [goalId, campaignId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    const updated = result.rows[0];

    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${campaignId}`).emit('campaignGoalUpdated', { goal: updated });
    }

    res.json(updated);
  } catch (error) {
    console.error('Error uncompleting campaign goal:', error);
    res.status(500).json({ error: 'Failed to uncomplete campaign goal' });
  }
});

module.exports = router;
