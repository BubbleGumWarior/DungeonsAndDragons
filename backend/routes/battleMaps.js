const express = require('express');
const router = express.Router();
const multer = require('multer');
const { pool } = require('../models/database');
const { authenticateToken: auth } = require('../middleware/auth');

// Store map images in memory (will be saved to DB as BYTEA)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    if (allowed.test(file.mimetype)) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  },
});

// ──────────────────────────────────────────────
// GET /api/battle-maps/campaign/:campaignId
// List maps for a campaign (metadata only, no binary)
// ──────────────────────────────────────────────
router.get('/campaign/:campaignId', auth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const result = await pool.query(
      `SELECT id, campaign_id, display_name, image_mime_type, uploaded_at
         FROM campaign_battle_maps
        WHERE campaign_id = $1
        ORDER BY uploaded_at DESC`,
      [campaignId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching battle maps:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ──────────────────────────────────────────────
// POST /api/battle-maps/campaign/:campaignId
// Upload a new map (DM only)
// ──────────────────────────────────────────────
router.post('/campaign/:campaignId', auth, upload.single('image'), async (req, res) => {
  try {
    if (req.user.role !== 'Dungeon Master') {
      return res.status(403).json({ message: 'Only Dungeon Masters can upload maps' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'No image file provided' });
    }

    const { campaignId } = req.params;
    const displayName = req.body.display_name || req.file.originalname || 'Battlefield Map';

    const result = await pool.query(
      `INSERT INTO campaign_battle_maps (campaign_id, display_name, image_data, image_mime_type)
       VALUES ($1, $2, $3, $4)
       RETURNING id, campaign_id, display_name, image_mime_type, uploaded_at`,
      [campaignId, displayName, req.file.buffer, req.file.mimetype]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error uploading battle map:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ──────────────────────────────────────────────
// GET /api/battle-maps/:id/image
// Stream the raw image data
// ──────────────────────────────────────────────
router.get('/:id/image', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT image_data, image_mime_type FROM campaign_battle_maps WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Map not found' });
    }
    const { image_data, image_mime_type } = result.rows[0];
    res.set('Content-Type', image_mime_type || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(image_data);
  } catch (error) {
    console.error('Error serving battle map image:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ──────────────────────────────────────────────
// DELETE /api/battle-maps/:id
// Delete a map (DM only)
// ──────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'Dungeon Master') {
      return res.status(403).json({ message: 'Only Dungeon Masters can delete maps' });
    }
    const { id } = req.params;
    const result = await pool.query(
      `DELETE FROM campaign_battle_maps WHERE id = $1 RETURNING id`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Map not found' });
    }
    res.json({ message: 'Map deleted' });
  } catch (error) {
    console.error('Error deleting battle map:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
