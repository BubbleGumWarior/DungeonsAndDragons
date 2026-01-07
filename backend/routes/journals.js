const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('../models/database');
const { authenticateToken } = require('../middleware/auth');

// Configure multer for journal image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads/journals');
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename: timestamp-originalname
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: function (req, file, cb) {
    // Accept images only
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif|webp|avif)$/i)) {
      return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
  }
});

// Get all journal entries for a campaign
router.get('/:campaignId/journals', authenticateToken, async (req, res) => {
  try {
    const { campaignId } = req.params;
    
    const result = await pool.query(
      `SELECT j.*, u.username as created_by_username 
       FROM journal_entries j
       LEFT JOIN users u ON j.created_by = u.id
       WHERE j.campaign_id = $1
       ORDER BY j.created_at DESC`,
      [campaignId]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching journal entries:', error);
    res.status(500).json({ error: 'Failed to fetch journal entries' });
  }
});

// Create a new journal entry (DM only)
router.post('/:campaignId/journals', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { title, description } = req.body;
    
    // Verify user is DM
    if (req.user.role !== 'Dungeon Master') {
      return res.status(403).json({ error: 'Only Dungeon Masters can create journal entries' });
    }
    
    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required' });
    }
    
    let imageUrl = null;
    if (req.file) {
      // Store relative path for the image
      imageUrl = `/uploads/journals/${req.file.filename}`;
    }
    
    const result = await pool.query(
      `INSERT INTO journal_entries (campaign_id, title, description, image_url, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [campaignId, title, description, imageUrl, req.user.id]
    );
    
    const createdEntry = result.rows[0];
    
    // Emit socket event to all clients in the campaign
    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${campaignId}`).emit('journalEntryCreated', {
        entry: createdEntry,
        timestamp: new Date().toISOString()
      });
    }
    
    res.status(201).json(createdEntry);
  } catch (error) {
    console.error('Error creating journal entry:', error);
    res.status(500).json({ error: 'Failed to create journal entry' });
  }
});

// Update a journal entry (DM only)
router.put('/:campaignId/journals/:entryId', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const { campaignId, entryId } = req.params;
    const { title, description } = req.body;
    
    // Verify user is DM
    if (req.user.role !== 'Dungeon Master') {
      return res.status(403).json({ error: 'Only Dungeon Masters can update journal entries' });
    }
    
    // Build update query dynamically based on provided fields
    const updates = [];
    const values = [];
    let paramCount = 1;
    
    if (title) {
      updates.push(`title = $${paramCount++}`);
      values.push(title);
    }
    
    if (description) {
      updates.push(`description = $${paramCount++}`);
      values.push(description);
    }
    
    if (req.file) {
      const imageUrl = `/uploads/journals/${req.file.filename}`;
      updates.push(`image_url = $${paramCount++}`);
      values.push(imageUrl);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push(`updated_at = NOW()`);
    values.push(entryId, campaignId);
    
    const result = await pool.query(
      `UPDATE journal_entries 
       SET ${updates.join(', ')}
       WHERE id = $${paramCount++} AND campaign_id = $${paramCount++}
       RETURNING *`,
      values
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Journal entry not found' });
    }
    
    const updatedEntry = result.rows[0];
    
    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${campaignId}`).emit('journalEntryUpdated', {
        entry: updatedEntry,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json(updatedEntry);
  } catch (error) {
    console.error('Error updating journal entry:', error);
    res.status(500).json({ error: 'Failed to update journal entry' });
  }
});

// Delete a journal entry (DM only)
router.delete('/:campaignId/journals/:entryId', authenticateToken, async (req, res) => {
  try {
    const { campaignId, entryId } = req.params;
    
    // Verify user is DM
    if (req.user.role !== 'Dungeon Master') {
      return res.status(403).json({ error: 'Only Dungeon Masters can delete journal entries' });
    }
    
    // Get the entry to delete its image file
    const entryResult = await pool.query(
      'SELECT image_url FROM journal_entries WHERE id = $1 AND campaign_id = $2',
      [entryId, campaignId]
    );
    
    if (entryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Journal entry not found' });
    }
    
    const entry = entryResult.rows[0];
    
    // Delete the entry from database
    await pool.query(
      'DELETE FROM journal_entries WHERE id = $1 AND campaign_id = $2',
      [entryId, campaignId]
    );
    
    // Delete the image file if it exists
    if (entry.image_url) {
      const imagePath = path.join(__dirname, '..', entry.image_url);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    
    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${campaignId}`).emit('journalEntryDeleted', {
        entryId: parseInt(entryId),
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({ message: 'Journal entry deleted successfully' });
  } catch (error) {
    console.error('Error deleting journal entry:', error);
    res.status(500).json({ error: 'Failed to delete journal entry' });
  }
});

module.exports = router;
