const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { pool } = require('../models/database');
const { authenticateToken } = require('../middleware/auth');

// ── Image upload config ────────────────────────────────────────────────────
// Images are kept in memory just long enough to be written into the database
// (character_shadows.image_data). Railway's filesystem is ephemeral and wipes
// on every rebuild, so nothing is ever written to disk here.
const shadowUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /jpeg|jpg|png|gif|webp|avif/.test(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('Only image files are allowed'), ok);
  },
});

const parseShadow = (s) => {
  const parsed = {
    ...s,
    abilities: typeof s.abilities === 'string' ? JSON.parse(s.abilities) : s.abilities,
  };
  if (parsed.image_data) {
    const base64 = parsed.image_data.toString('base64');
    parsed.image_url = `data:${parsed.image_mime_type};base64,${base64}`;
  } else if (parsed.image_url && parsed.image_url.startsWith('/uploads/')) {
    // Stale filesystem path from before images were stored in the database -
    // the file is gone after a redeploy, so don't send a link that 404s.
    parsed.image_url = null;
  }
  delete parsed.image_data;
  delete parsed.image_mime_type;
  return parsed;
};

// Fetch all shadows for a character and emit to campaign room
const emitShadowsUpdated = async (req, characterId) => {
  const io = req.app.get('io');
  if (!io) return;
  const charRow = await pool.query('SELECT campaign_id FROM characters WHERE id = $1', [characterId]);
  if (charRow.rows.length === 0) return;
  const campaignId = charRow.rows[0].campaign_id;
  const shadows = await pool.query(
    'SELECT * FROM character_shadows WHERE character_id = $1 ORDER BY created_at ASC',
    [characterId]
  );
  io.to(`campaign_${campaignId}`).emit('shadowsUpdated', {
    characterId: Number(characterId),
    shadows: shadows.rows.map(parseShadow),
  });
};

const parseShadow2 = (s) => ({
  ...s,
  abilities: typeof s.abilities === 'string' ? JSON.parse(s.abilities) : s.abilities,
});

// GET all shadows for a character (DM or character owner)
router.get('/:characterId', authenticateToken, async (req, res) => {
  try {
    const { characterId } = req.params;
    const charCheck = await pool.query('SELECT player_id FROM characters WHERE id = $1', [characterId]);
    if (charCheck.rows.length === 0) return res.status(404).json({ error: 'Character not found' });
    if (req.user.role !== 'Dungeon Master' && charCheck.rows[0].player_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const result = await pool.query(
      'SELECT * FROM character_shadows WHERE character_id = $1 ORDER BY created_at ASC',
      [characterId]
    );
    res.json({ shadows: result.rows.map(parseShadow) });
  } catch (error) {
    console.error('Error fetching shadows:', error);
    res.status(500).json({ error: 'Failed to fetch shadows' });
  }
});

// POST create shadow (DM only)
router.post('/:characterId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'Dungeon Master') return res.status(403).json({ error: 'DM only' });
    const { characterId } = req.params;
    const charCheck = await pool.query('SELECT id, abilities FROM characters WHERE id = $1', [characterId]);
    if (charCheck.rows.length === 0) return res.status(404).json({ error: 'Character not found' });

    // Enforce total stored cap (conMod * 4)
    const charAbilities = typeof charCheck.rows[0].abilities === 'string'
      ? JSON.parse(charCheck.rows[0].abilities)
      : (charCheck.rows[0].abilities || {});
    const con = charAbilities.con ?? 10;
    const conMod = Math.max(0, Math.floor((con - 10) / 2));
    const maxStored = conMod * 4;
    const storedCount = await pool.query(
      'SELECT COUNT(*) FROM character_shadows WHERE character_id = $1 AND is_active = FALSE',
      [characterId]
    );
    if (parseInt(storedCount.rows[0].count) >= maxStored) {
      return res.status(400).json({ error: `Stored shadow cap reached (${maxStored}). You cannot store more shadows.` });
    }

    const {
      shadow_name = 'Shadow', origin_name = '', hit_points_max = 10,
      armor_class = 12, abilities = { str: 10, dex: 14, con: 10, int: 6, wis: 10, cha: 6 },
      speed = 30, attack_bonus = 3, damage_dice = '1d6', damage_type = 'necrotic',
      special_abilities = '', is_active = false,
    } = req.body;

    const result = await pool.query(
      `INSERT INTO character_shadows
         (character_id, shadow_name, origin_name, hit_points_max, hit_points_current,
          armor_class, abilities, speed, attack_bonus, damage_dice, damage_type,
          special_abilities, is_active)
       VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [characterId, shadow_name, origin_name, hit_points_max,
       armor_class, JSON.stringify(abilities), speed, attack_bonus,
       damage_dice, damage_type, special_abilities, is_active]
    );
    await emitShadowsUpdated(req, characterId);
    res.json({ message: 'Shadow created', shadow: parseShadow(result.rows[0]) });
  } catch (error) {
    console.error('Error creating shadow:', error);
    res.status(500).json({ error: 'Failed to create shadow' });
  }
});

// PATCH update all fields (DM only)
router.patch('/:characterId/:shadowId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'Dungeon Master') return res.status(403).json({ error: 'DM only' });
    const { shadowId } = req.params;
    const {
      shadow_name, origin_name, hit_points_max, hit_points_current,
      armor_class, abilities, speed, attack_bonus, damage_dice, damage_type,
      special_abilities, is_active,
    } = req.body;

    const result = await pool.query(
      `UPDATE character_shadows SET
         shadow_name        = COALESCE($1,  shadow_name),
         origin_name        = COALESCE($2,  origin_name),
         hit_points_max     = COALESCE($3,  hit_points_max),
         hit_points_current = COALESCE($4,  hit_points_current),
         armor_class        = COALESCE($5,  armor_class),
         abilities          = COALESCE($6,  abilities),
         speed              = COALESCE($7,  speed),
         attack_bonus       = COALESCE($8,  attack_bonus),
         damage_dice        = COALESCE($9,  damage_dice),
         damage_type        = COALESCE($10, damage_type),
         special_abilities  = COALESCE($11, special_abilities),
         is_active          = COALESCE($12, is_active),
         updated_at         = CURRENT_TIMESTAMP
       WHERE id = $13
       RETURNING *`,
      [shadow_name, origin_name, hit_points_max, hit_points_current,
       armor_class, abilities ? JSON.stringify(abilities) : null,
       speed, attack_bonus, damage_dice, damage_type, special_abilities,
       is_active, shadowId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Shadow not found' });
    await emitShadowsUpdated(req, req.params.characterId);
    res.json({ message: 'Shadow updated', shadow: parseShadow(result.rows[0]) });
  } catch (error) {
    console.error('Error updating shadow:', error);
    res.status(500).json({ error: 'Failed to update shadow' });
  }
});

// PATCH update HP only (DM only)
router.patch('/:characterId/:shadowId/hp', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'Dungeon Master') return res.status(403).json({ error: 'DM only' });
    const { shadowId } = req.params;
    const { hit_points_current } = req.body;
    const result = await pool.query(
      'UPDATE character_shadows SET hit_points_current = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [hit_points_current, shadowId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Shadow not found' });
    await emitShadowsUpdated(req, req.params.characterId);
    res.json({ message: 'Shadow HP updated', shadow: parseShadow(result.rows[0]) });
  } catch (error) {
    console.error('Error updating shadow HP:', error);
    res.status(500).json({ error: 'Failed to update shadow HP' });
  }
});

// PATCH toggle active/stored (DM only)
router.patch('/:characterId/:shadowId/active', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'Dungeon Master') return res.status(403).json({ error: 'DM only' });
    const { characterId, shadowId } = req.params;
    const { is_active } = req.body;

    // Enforce active cap when activating
    if (is_active) {
      const charResult = await pool.query('SELECT abilities FROM characters WHERE id = $1', [characterId]);
      if (charResult.rows.length === 0) return res.status(404).json({ error: 'Character not found' });
      const abilities = typeof charResult.rows[0].abilities === 'string'
        ? JSON.parse(charResult.rows[0].abilities)
        : (charResult.rows[0].abilities || {});
      const con = abilities.con ?? 10;
      const conMod = Math.max(0, Math.floor((con - 10) / 2));

      const activeCount = await pool.query(
        'SELECT COUNT(*) FROM character_shadows WHERE character_id = $1 AND is_active = TRUE AND id != $2',
        [characterId, shadowId]
      );
      if (parseInt(activeCount.rows[0].count) >= conMod) {
        return res.status(400).json({ error: `Active shadow cap reached (${conMod}). Store another shadow first.` });
      }
    }

    const result = await pool.query(
      'UPDATE character_shadows SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [is_active, shadowId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Shadow not found' });
    await emitShadowsUpdated(req, characterId);
    res.json({ message: 'Shadow active status updated', shadow: parseShadow(result.rows[0]) });
  } catch (error) {
    console.error('Error updating shadow active status:', error);
    res.status(500).json({ error: 'Failed to update shadow active status' });
  }
});

// DELETE shadow (DM only)
router.delete('/:characterId/:shadowId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'Dungeon Master') return res.status(403).json({ error: 'DM only' });
    const { shadowId } = req.params;
    await pool.query('DELETE FROM character_shadows WHERE id = $1', [shadowId]);
    await emitShadowsUpdated(req, req.params.characterId);
    res.json({ message: 'Shadow deleted' });
  } catch (error) {
    console.error('Error deleting shadow:', error);
    res.status(500).json({ error: 'Failed to delete shadow' });
  }
});

// POST /:shadowId/image — upload shadow image (DM only)
router.post('/:shadowId/image', authenticateToken, shadowUpload.single('image'), async (req, res) => {
  try {
    if (req.user.role !== 'Dungeon Master') return res.status(403).json({ error: 'DM only' });
    const { shadowId } = req.params;
    if (!req.file) return res.status(400).json({ error: 'No image file provided' });

    const existing = await pool.query('SELECT character_id FROM character_shadows WHERE id = $1', [shadowId]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Shadow not found' });

    // Store the image bytes in the database (survives Railway rebuilds, unlike disk storage)
    const updated = await pool.query(
      `UPDATE character_shadows
          SET image_data = $1, image_mime_type = $2, image_url = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING *`,
      [req.file.buffer, req.file.mimetype, shadowId]
    );
    await emitShadowsUpdated(req, existing.rows[0].character_id);
    res.json({ message: 'Shadow image uploaded', shadow: parseShadow(updated.rows[0]) });
  } catch (err) {
    console.error('Error uploading shadow image:', err);
    res.status(500).json({ error: 'Failed to upload shadow image' });
  }
});

module.exports = router;
