const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('../models/database');
const { authenticateToken: auth } = require('../middleware/auth');

// Configure multer for mount image uploads (disk storage like monsters)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads/mounts');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'mount-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const allowed = /jpeg|jpg|png|gif|webp|avif/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  }
});

// ──────────────────────────────────────────────
// GET /api/mounts/campaign/:campaignId
// ──────────────────────────────────────────────
router.get('/campaign/:campaignId', auth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const result = await pool.query(
      `SELECT m.*,
              c.name AS character_name,
              c.player_id AS character_player_id
         FROM campaign_mounts m
         LEFT JOIN characters c ON c.id = m.assigned_to_character_id
        WHERE m.campaign_id = $1
        ORDER BY m.created_at ASC`,
      [campaignId]
    );

    // Strip raw binary; clients work with image_url only
    const mounts = result.rows.map(row => {
      const { image_data, ...rest } = row;
      return rest;
    });

    res.json(mounts);
  } catch (error) {
    console.error('Error fetching mounts:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ──────────────────────────────────────────────
// POST /api/mounts/campaign/:campaignId
// Create a new mount (DM only)
// ──────────────────────────────────────────────
router.post('/campaign/:campaignId', auth, async (req, res) => {
  try {
    if (req.user.role !== 'Dungeon Master') {
      return res.status(403).json({ message: 'Only Dungeon Masters can add mounts' });
    }

    const { campaignId } = req.params;
    const {
      name,
      mount_type = 'Custom',
      description = '',
      speed = 60,
      fly_speed = 0,
      hp = 30,
      ac = 10,
      carrying_capacity = 480,
      pull_strength = 1000,
      stamina = 'Medium',
      max_rider_armor = 'Any',
      purpose = '',
      image_url = null,
      assigned_to_character_id = null
    } = req.body;

    const result = await pool.query(
      `INSERT INTO campaign_mounts
         (campaign_id, name, mount_type, description, speed, fly_speed, hp, ac,
          carrying_capacity, pull_strength, stamina, max_rider_armor, purpose,
          image_url, assigned_to_character_id, is_equipped)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,false)
       RETURNING *`,
      [campaignId, name, mount_type, description, speed, fly_speed, hp, ac,
       carrying_capacity, pull_strength, stamina, max_rider_armor, purpose,
       image_url, assigned_to_character_id || null]
    );

    const mount = result.rows[0];

    // Re-fetch with character JOIN so socket payload matches the GET route shape
    const joinResult = await pool.query(
      `SELECT m.*, c.name AS character_name, c.player_id AS character_player_id
         FROM campaign_mounts m
         LEFT JOIN characters c ON c.id = m.assigned_to_character_id
        WHERE m.id = $1`,
      [mount.id]
    );
    const mountWithChar = (() => { const { image_data, ...r } = joinResult.rows[0]; return r; })();

    // Broadcast via socket if io is available
    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${campaignId}`).emit('mountAdded', {
        mount: mountWithChar,
        timestamp: new Date().toISOString()
      });
    }

    res.status(201).json(mountWithChar);
  } catch (error) {
    console.error('Error creating mount:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ──────────────────────────────────────────────
// PUT /api/mounts/:id
// Update mount details (DM only)
// ──────────────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'Dungeon Master') {
      return res.status(403).json({ message: 'Only Dungeon Masters can update mounts' });
    }

    const { id } = req.params;
    const {
      name,
      mount_type,
      description,
      speed,
      fly_speed,
      hp,
      ac,
      carrying_capacity,
      pull_strength,
      stamina,
      max_rider_armor,
      purpose,
      image_url,
      assigned_to_character_id,
      is_equipped
    } = req.body;

    const result = await pool.query(
      `UPDATE campaign_mounts
          SET name = COALESCE($1, name),
              mount_type = COALESCE($2, mount_type),
              description = COALESCE($3, description),
              speed = COALESCE($4, speed),
              fly_speed = COALESCE($5, fly_speed),
              hp = COALESCE($6, hp),
              ac = COALESCE($7, ac),
              carrying_capacity = COALESCE($8, carrying_capacity),
              pull_strength = COALESCE($9, pull_strength),
              stamina = COALESCE($10, stamina),
              max_rider_armor = COALESCE($11, max_rider_armor),
              purpose = COALESCE($12, purpose),
              image_url = COALESCE($13, image_url),
              assigned_to_character_id = $14,
              is_equipped = COALESCE($15, is_equipped),
              updated_at = NOW()
        WHERE id = $16
       RETURNING *`,
      [name, mount_type, description, speed, fly_speed, hp, ac,
       carrying_capacity, pull_strength, stamina, max_rider_armor, purpose, image_url,
       assigned_to_character_id !== undefined ? assigned_to_character_id : null,
       is_equipped, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Mount not found' });
    }

    const mount = result.rows[0];

    // Re-fetch with character JOIN
    const joinResult = await pool.query(
      `SELECT m.*, c.name AS character_name, c.player_id AS character_player_id
         FROM campaign_mounts m
         LEFT JOIN characters c ON c.id = m.assigned_to_character_id
        WHERE m.id = $1`,
      [mount.id]
    );
    const mountWithChar = (() => { const { image_data, ...r } = joinResult.rows[0]; return r; })();

    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${mount.campaign_id}`).emit('mountUpdated', {
        mount: mountWithChar,
        timestamp: new Date().toISOString()
      });
    }

    res.json(mountWithChar);
  } catch (error) {
    console.error('Error updating mount:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ──────────────────────────────────────────────
// POST /api/mounts/:id/assign
// Assign (or unassign) a mount to a character (DM only)
// ──────────────────────────────────────────────
router.post('/:id/assign', auth, async (req, res) => {
  try {
    if (req.user.role !== 'Dungeon Master') {
      return res.status(403).json({ message: 'Only Dungeon Masters can assign mounts' });
    }

    const { id } = req.params;
    const { character_id } = req.body; // null = unassign

    const result = await pool.query(
      `UPDATE campaign_mounts
          SET assigned_to_character_id = $1::INTEGER,
              is_equipped = CASE WHEN $1::INTEGER IS NULL THEN false ELSE is_equipped END,
              updated_at = NOW()
        WHERE id = $2
       RETURNING *`,
      [character_id || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Mount not found' });
    }

    const mount = result.rows[0];

    // Re-fetch with character JOIN
    const joinResult = await pool.query(
      `SELECT m.*, c.name AS character_name, c.player_id AS character_player_id
         FROM campaign_mounts m
         LEFT JOIN characters c ON c.id = m.assigned_to_character_id
        WHERE m.id = $1`,
      [mount.id]
    );
    const mountWithChar = (() => { const { image_data, ...r } = joinResult.rows[0]; return r; })();

    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${mount.campaign_id}`).emit('mountUpdated', {
        mount: mountWithChar,
        timestamp: new Date().toISOString()
      });
    }

    res.json(mountWithChar);
  } catch (error) {
    console.error('Error assigning mount:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ──────────────────────────────────────────────
// POST /api/mounts/:id/equip
// Equip a mount. DM can equip any mount; a player can equip a mount
// assigned to one of their own characters.
// ──────────────────────────────────────────────
router.post('/:id/equip', auth, async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch the mount first
    const mountResult = await pool.query(
      `SELECT m.*, c.player_id AS owner_player_id
         FROM campaign_mounts m
         LEFT JOIN characters c ON c.id = m.assigned_to_character_id
        WHERE m.id = $1`,
      [id]
    );

    if (mountResult.rows.length === 0) {
      return res.status(404).json({ message: 'Mount not found' });
    }

    const mount = mountResult.rows[0];

    // Players may only equip mounts assigned to their own character
    if (req.user.role !== 'Dungeon Master') {
      if (mount.owner_player_id !== req.user.id) {
        return res.status(403).json({ message: 'You can only equip mounts assigned to your character' });
      }
    }

    // If assigned to a character, unequip all their other mounts first
    if (mount.assigned_to_character_id) {
      await pool.query(
        `UPDATE campaign_mounts SET is_equipped = false
          WHERE campaign_id = $1 AND assigned_to_character_id = $2 AND id != $3`,
        [mount.campaign_id, mount.assigned_to_character_id, id]
      );
    }

    // Equip this mount
    const result = await pool.query(
      `UPDATE campaign_mounts SET is_equipped = true, updated_at = NOW()
        WHERE id = $1 RETURNING *`,
      [id]
    );

    const updatedMount = result.rows[0];

    // Fetch all mounts for this campaign to broadcast full state
    const allMountsResult = await pool.query(
      `SELECT m.*, c.name AS character_name, c.player_id AS character_player_id
         FROM campaign_mounts m
         LEFT JOIN characters c ON c.id = m.assigned_to_character_id
        WHERE m.campaign_id = $1`,
      [mount.campaign_id]
    );
    const allMounts = allMountsResult.rows.map(({ image_data, ...r }) => r);

    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${mount.campaign_id}`).emit('mountsRefreshed', {
        mounts: allMounts,
        timestamp: new Date().toISOString()
      });
    }

    res.json(updatedMount);
  } catch (error) {
    console.error('Error equipping mount:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ──────────────────────────────────────────────
// POST /api/mounts/:id/unequip
// Unequip a mount. DM can unequip any; players can unequip their own.
// ──────────────────────────────────────────────
router.post('/:id/unequip', auth, async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch to check ownership
    const mountResult = await pool.query(
      `SELECT m.*, c.player_id AS owner_player_id
         FROM campaign_mounts m
         LEFT JOIN characters c ON c.id = m.assigned_to_character_id
        WHERE m.id = $1`,
      [id]
    );

    if (mountResult.rows.length === 0) {
      return res.status(404).json({ message: 'Mount not found' });
    }

    const mountCheck = mountResult.rows[0];

    if (req.user.role !== 'Dungeon Master') {
      if (mountCheck.owner_player_id !== req.user.id) {
        return res.status(403).json({ message: 'You can only unequip mounts assigned to your character' });
      }
    }

    const result = await pool.query(
      `UPDATE campaign_mounts SET is_equipped = false, updated_at = NOW()
        WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Mount not found' });
    }

    const mount = result.rows[0];

    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${mount.campaign_id}`).emit('mountUpdated', {
        mount,
        timestamp: new Date().toISOString()
      });
    }

    res.json(mount);
  } catch (error) {
    console.error('Error unequipping mount:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ──────────────────────────────────────────────
// POST /api/mounts/:id/image
// Upload custom mount image (DM only)
// ──────────────────────────────────────────────
router.post('/:id/image', auth, upload.single('image'), async (req, res) => {
  try {
    if (req.user.role !== 'Dungeon Master') {
      return res.status(403).json({ message: 'Only Dungeon Masters can upload mount images' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No image file provided' });
    }

    const { id } = req.params;
    const imageUrl = `/uploads/mounts/${req.file.filename}`;

    const result = await pool.query(
      `UPDATE campaign_mounts SET image_url = $1, updated_at = NOW()
        WHERE id = $2 RETURNING *`,
      [imageUrl, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Mount not found' });
    }

    const mount = result.rows[0];

    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${mount.campaign_id}`).emit('mountUpdated', {
        mount,
        timestamp: new Date().toISOString()
      });
    }

    res.json(mount);
  } catch (error) {
    console.error('Error uploading mount image:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ──────────────────────────────────────────────
// DELETE /api/mounts/:id
// Delete a mount (DM only)
// ──────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'Dungeon Master') {
      return res.status(403).json({ message: 'Only Dungeon Masters can delete mounts' });
    }

    const { id } = req.params;

    // Get mount first for campaign_id and to delete file if needed
    const mountResult = await pool.query(
      'SELECT * FROM campaign_mounts WHERE id = $1', [id]
    );

    if (mountResult.rows.length === 0) {
      return res.status(404).json({ message: 'Mount not found' });
    }

    const mount = mountResult.rows[0];

    // Delete uploaded image file if it's a custom upload
    if (mount.image_url && mount.image_url.startsWith('/uploads/mounts/')) {
      const filePath = path.join(__dirname, '..', mount.image_url);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await pool.query('DELETE FROM campaign_mounts WHERE id = $1', [id]);

    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${mount.campaign_id}`).emit('mountDeleted', {
        mountId: mount.id,
        campaignId: mount.campaign_id,
        timestamp: new Date().toISOString()
      });
    }

    res.json({ message: 'Mount deleted successfully' });
  } catch (error) {
    console.error('Error deleting mount:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
