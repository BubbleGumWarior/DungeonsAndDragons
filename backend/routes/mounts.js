const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('../models/database');
const { authenticateToken: auth } = require('../middleware/auth');
const FoodStockpile = require('../models/FoodStockpile');

// Mount images are stored in the database (bytea) so they survive a Railway rebuild,
// exactly like pet images already do.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // client-side compression handles most large photos; this is a safety net
  fileFilter: function (req, file, cb) {
    const ok = /jpeg|jpg|png|gif|webp|avif/.test(file.mimetype);
    cb(ok ? null : new Error('Only image files are allowed'), ok);
  }
});

// ──────────────────────────────────────────────
// Shared SELECT: mount + owning character + 4-slot companion armor join
// ──────────────────────────────────────────────
const MOUNT_SELECT = `
  SELECT m.*,
         c.name  AS character_name,
         c.player_id AS character_player_id,
         ah.name AS armor_head_name,        COALESCE(ah.armor_class_bonus,0)  AS armor_head_bonus,
         ab.name AS armor_body_name,        COALESCE(ab.armor_class_bonus,0)  AS armor_body_bonus,
         afl.name AS armor_front_legs_name, COALESCE(afl.armor_class_bonus,0) AS armor_front_legs_bonus,
         arl.name AS armor_rear_legs_name,  COALESCE(arl.armor_class_bonus,0) AS armor_rear_legs_bonus,
         COALESCE(ah.armor_class_bonus,0) + COALESCE(ab.armor_class_bonus,0) +
         COALESCE(afl.armor_class_bonus,0) + COALESCE(arl.armor_class_bonus,0) AS armor_ac_bonus
    FROM campaign_mounts m
    LEFT JOIN characters c ON c.id = m.assigned_to_character_id
    LEFT JOIN companion_armor_items ah  ON ah.id  = m.armor_head_id
    LEFT JOIN companion_armor_items ab  ON ab.id  = m.armor_body_id
    LEFT JOIN companion_armor_items afl ON afl.id = m.armor_front_legs_id
    LEFT JOIN companion_armor_items arl ON arl.id = m.armor_rear_legs_id
`;

function parseMount(row) {
  if (!row) return null;
  const asJson = (v) => (typeof v === 'string' ? JSON.parse(v) : v) || null;
  const { image_data, ...rest } = row;
  const armorBonus = Number(row.armor_ac_bonus || 0);
  const parsed = {
    ...rest,
    abilities: asJson(row.abilities) || {},
    limb_health: asJson(row.limb_health),
    temp_limb_health: asJson(row.temp_limb_health),
    armor_ac_bonus: armorBonus,
    effective_ac: Number(row.ac || 10) + armorBonus,
  };
  if (row.image_data) parsed.image_url = `/api/mounts/${row.id}/image`;
  return parsed;
}

// ──────────────────────────────────────────────
// GET /api/mounts/campaign/:campaignId
// ──────────────────────────────────────────────
router.get('/campaign/:campaignId', auth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const result = await pool.query(
      `${MOUNT_SELECT} WHERE m.campaign_id = $1 ORDER BY m.created_at ASC`,
      [campaignId]
    );
    res.json(result.rows.map(parseMount));
  } catch (error) {
    console.error('Error fetching mounts:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ──────────────────────────────────────────────
// POST /api/mounts/:id/equip-armor
// Equip a companion armor item to a specific mount slot
// Body: { slot: 'head'|'body'|'front_legs'|'rear_legs', armorItemId: number }
// ──────────────────────────────────────────────
router.post('/:id/equip-armor', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { slot, armorItemId } = req.body;

    const validSlots = ['head', 'body', 'front_legs', 'rear_legs'];
    if (!validSlots.includes(slot)) {
      return res.status(400).json({ message: 'Invalid slot. Use head, body, front_legs, or rear_legs' });
    }
    if (!armorItemId) return res.status(400).json({ message: 'armorItemId is required' });

    const item = (await pool.query(`SELECT * FROM companion_armor_items WHERE id = $1 AND kind = 'mount'`, [armorItemId])).rows[0];
    if (!item) return res.status(404).json({ message: 'Mount armor item not found' });
    if (item.slot !== slot) {
      return res.status(400).json({ message: `"${item.name}" was built for the ${item.slot?.replace(/_/g, ' ')} slot and can't be equipped to ${slot.replace(/_/g, ' ')}` });
    }

    // Check mount ownership
    const mountResult = await pool.query(
      `SELECT m.*, c.player_id AS owner_player_id
         FROM campaign_mounts m
         LEFT JOIN characters c ON c.id = m.assigned_to_character_id
        WHERE m.id = $1`, [id]
    );
    if (mountResult.rows.length === 0) {
      return res.status(404).json({ message: 'Mount not found' });
    }
    const mount = mountResult.rows[0];
    if (req.user.role !== 'Dungeon Master' && mount.owner_player_id !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const col = `armor_${slot}_id`;
    await pool.query(`UPDATE campaign_mounts SET ${col} = $1, updated_at = NOW() WHERE id = $2`, [armorItemId, id]);

    const updated = await pool.query(`${MOUNT_SELECT} WHERE m.id = $1`, [id]);
    const mountOut = parseMount(updated.rows[0]);

    const io = req.app.get('io');
    if (io) io.to(`campaign_${mount.campaign_id}`).emit('mountUpdated', { mount: mountOut, timestamp: new Date().toISOString() });

    res.json(mountOut);
  } catch (error) {
    console.error('Error equipping mount armor:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ──────────────────────────────────────────────
// DELETE /api/mounts/:id/equip-armor
// Remove armor from a specific mount slot
// Body: { slot: 'head'|'body'|'front_legs'|'rear_legs' }
// ──────────────────────────────────────────────
router.delete('/:id/equip-armor', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { slot } = req.body;

    const validSlots = ['head', 'body', 'front_legs', 'rear_legs'];
    if (!validSlots.includes(slot)) {
      return res.status(400).json({ message: 'Invalid slot' });
    }

    const mountResult = await pool.query(
      `SELECT m.*, c.player_id AS owner_player_id
         FROM campaign_mounts m
         LEFT JOIN characters c ON c.id = m.assigned_to_character_id
        WHERE m.id = $1`, [id]
    );
    if (mountResult.rows.length === 0) return res.status(404).json({ message: 'Mount not found' });
    const mount = mountResult.rows[0];
    if (req.user.role !== 'Dungeon Master' && mount.owner_player_id !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const col = `armor_${slot}_id`;
    await pool.query(`UPDATE campaign_mounts SET ${col} = NULL, updated_at = NOW() WHERE id = $1`, [id]);

    const updated = await pool.query(`${MOUNT_SELECT} WHERE m.id = $1`, [id]);
    const mountOut = parseMount(updated.rows[0]);

    const io = req.app.get('io');
    if (io) io.to(`campaign_${mount.campaign_id}`).emit('mountUpdated', { mount: mountOut, timestamp: new Date().toISOString() });

    res.json(mountOut);
  } catch (error) {
    console.error('Error removing mount armor:', error);
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
      assigned_to_character_id = null,
      diet = 'herbivore',
      food_consumption = 4,
      feeding_mode = 'self',
      abilities = { str: 16, dex: 13, con: 15, int: 2, wis: 12, cha: 7 }
    } = req.body;

    const result = await pool.query(
      `INSERT INTO campaign_mounts
         (campaign_id, name, mount_type, description, speed, fly_speed, hp, ac,
          carrying_capacity, pull_strength, stamina, max_rider_armor, purpose,
          image_url, assigned_to_character_id, is_equipped, diet, food_consumption, feeding_mode,
          abilities, hit_points_current)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,false,$16,$17,$18,$19,$7)
       RETURNING *`,
      [campaignId, name, mount_type, description, speed, fly_speed, hp, ac,
       carrying_capacity, pull_strength, stamina, max_rider_armor, purpose,
       image_url, assigned_to_character_id || null, diet, food_consumption, feeding_mode,
       JSON.stringify(abilities)]
    );

    const mount = result.rows[0];

    // Re-fetch with full joins so socket payload matches the GET route shape
    const joinResult = await pool.query(`${MOUNT_SELECT} WHERE m.id = $1`, [mount.id]);
    const mountWithChar = parseMount(joinResult.rows[0]);

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
      is_equipped,
      diet,
      food_consumption,
      feeding_mode,
      abilities,
      hit_points_current
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
              diet = COALESCE($16, diet),
              food_consumption = COALESCE($17, food_consumption),
              feeding_mode = COALESCE($18, feeding_mode),
              abilities = COALESCE($19, abilities),
              hit_points_current = COALESCE($20, hit_points_current),
              updated_at = NOW()
        WHERE id = $21
       RETURNING *`,
      [name, mount_type, description, speed, fly_speed, hp, ac,
       carrying_capacity, pull_strength, stamina, max_rider_armor, purpose, image_url,
       assigned_to_character_id !== undefined ? assigned_to_character_id : null,
       is_equipped, diet, food_consumption, feeding_mode,
       abilities !== undefined ? JSON.stringify(abilities) : undefined, hit_points_current, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Mount not found' });
    }

    const mount = result.rows[0];

    // Re-fetch with full joins
    const joinResult = await pool.query(`${MOUNT_SELECT} WHERE m.id = $1`, [mount.id]);
    const mountWithChar = parseMount(joinResult.rows[0]);

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

    // Re-fetch with full joins
    const joinResult = await pool.query(`${MOUNT_SELECT} WHERE m.id = $1`, [mount.id]);
    const mountWithChar = parseMount(joinResult.rows[0]);

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
    const allMountsResult = await pool.query(`${MOUNT_SELECT} WHERE m.campaign_id = $1`, [mount.campaign_id]);
    const allMounts = allMountsResult.rows.map(parseMount);

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

    const joinResult = await pool.query(`${MOUNT_SELECT} WHERE m.id = $1`, [id]);
    const mount = parseMount(joinResult.rows[0]);

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
// PATCH /api/mounts/:id/feed
// Owner or DM manually feeds the mount from the player's shared stockpile (full efficiency)
// ──────────────────────────────────────────────
router.patch('/:id/feed', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const mountResult = await pool.query(
      `SELECT m.*, c.player_id AS owner_player_id
         FROM campaign_mounts m LEFT JOIN characters c ON c.id = m.assigned_to_character_id
        WHERE m.id = $1`,
      [id]
    );
    if (mountResult.rows.length === 0) return res.status(404).json({ message: 'Mount not found' });
    const mount = mountResult.rows[0];
    if (req.user.role !== 'Dungeon Master' && mount.owner_player_id !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    if (!mount.assigned_to_character_id) {
      return res.status(400).json({ message: 'Mount must be assigned to a character before it can be fed' });
    }

    const result = await FoodStockpile.feedAnimal({
      kind: 'mount',
      id: mount.id,
      campaignId: mount.campaign_id,
      characterId: mount.assigned_to_character_id,
      diet: mount.diet,
      hunger: mount.hunger,
      foodConsumption: mount.food_consumption,
      rations: req.body.rations,
    });

    const { image_data, ...mountOut } = result.animal;
    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${mount.campaign_id}`).emit('mountUpdated', { mount: mountOut, timestamp: new Date().toISOString() });
      io.to(`campaign_${mount.campaign_id}`).emit('foodStockpileUpdated', {
        campaignId: mount.campaign_id,
        updates: [{ characterId: mount.assigned_to_character_id, meat_rations: result.stockpile.meat_rations, veg_rations: result.stockpile.veg_rations }],
        timestamp: new Date().toISOString(),
      });
    }
    res.json({ mount: mountOut, rationsConsumed: result.rationsConsumed });
  } catch (error) {
    console.error('Error feeding mount:', error);
    res.status(error.status || 500).json({ message: error.message || 'Server error' });
  }
});

// ──────────────────────────────────────────────
// PATCH /api/mounts/:id/feeding-mode
// Owner or DM toggles self-feed vs automatic
// ──────────────────────────────────────────────
router.patch('/:id/feeding-mode', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { feeding_mode } = req.body;
    if (!['self', 'automatic'].includes(feeding_mode)) {
      return res.status(400).json({ message: 'feeding_mode must be "self" or "automatic"' });
    }

    const mountResult = await pool.query(
      `SELECT m.*, c.player_id AS owner_player_id
         FROM campaign_mounts m LEFT JOIN characters c ON c.id = m.assigned_to_character_id
        WHERE m.id = $1`,
      [id]
    );
    if (mountResult.rows.length === 0) return res.status(404).json({ message: 'Mount not found' });
    const mount = mountResult.rows[0];
    if (req.user.role !== 'Dungeon Master' && mount.owner_player_id !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const updated = await pool.query(
      `UPDATE campaign_mounts SET feeding_mode = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [feeding_mode, id]
    );
    const { image_data, ...mountOut } = updated.rows[0];

    const io = req.app.get('io');
    if (io) io.to(`campaign_${mount.campaign_id}`).emit('mountUpdated', { mount: mountOut, timestamp: new Date().toISOString() });

    res.json(mountOut);
  } catch (error) {
    console.error('Error setting mount feeding mode:', error);
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
    // Stored as bytea in the DB (not disk) so it survives a Railway rebuild — same as pet images.
    const result = await pool.query(
      `UPDATE campaign_mounts
          SET image_data = $1, image_mime_type = $2, image_url = $3, updated_at = NOW()
        WHERE id = $4 RETURNING *`,
      [req.file.buffer, req.file.mimetype, `/api/mounts/${id}/image`, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Mount not found' });
    }

    const joinResult = await pool.query(`${MOUNT_SELECT} WHERE m.id = $1`, [id]);
    const mount = parseMount(joinResult.rows[0]);

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
// GET /api/mounts/:id/image — serve mount image from database (no auth required for img tags)
// ──────────────────────────────────────────────
router.get('/:id/image', async (req, res) => {
  try {
    const result = await pool.query('SELECT image_data, image_mime_type FROM campaign_mounts WHERE id = $1', [req.params.id]);
    const row = result.rows[0];
    if (!row || !row.image_data) return res.status(404).json({ message: 'Image not found' });
    res.set('Content-Type', row.image_mime_type || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=31536000');
    res.send(row.image_data);
  } catch (error) {
    console.error('Error serving mount image:', error);
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
