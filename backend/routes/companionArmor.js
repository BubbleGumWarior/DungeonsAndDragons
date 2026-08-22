const express = require('express');
const router = express.Router();
const { pool } = require('../models/database');
const { authenticateToken: auth } = require('../middleware/auth');
const Pet = require('../models/Pet');

const isDM = (req) => req.user.role === 'Dungeon Master';

async function getCharacterOwnerId(characterId) {
  const r = await pool.query('SELECT player_id FROM characters WHERE id = $1', [characterId]);
  return r.rows[0]?.player_id ?? null;
}

// GET /api/companion-armor/campaign/:campaignId/character/:characterId
router.get('/campaign/:campaignId/character/:characterId', auth, async (req, res) => {
  try {
    const { campaignId, characterId } = req.params;
    const ownerId = await getCharacterOwnerId(characterId);
    if (!isDM(req) && ownerId !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    const items = (await pool.query(
      `SELECT * FROM companion_armor_items WHERE campaign_id = $1 AND character_id = $2 ORDER BY created_at ASC`,
      [campaignId, characterId]
    )).rows;

    // Figure out what's currently equipped where, so the panel can show status.
    const petsEquipped = (await pool.query(
      `SELECT id AS pet_id, name AS pet_name, armor_item_id FROM character_pets WHERE character_id = $1 AND armor_item_id IS NOT NULL`,
      [characterId]
    )).rows;
    const mountsEquipped = (await pool.query(
      `SELECT id AS mount_id, name AS mount_name, armor_head_id, armor_body_id, armor_front_legs_id, armor_rear_legs_id
         FROM campaign_mounts WHERE assigned_to_character_id = $1`,
      [characterId]
    )).rows;

    res.json({ items, petsEquipped, mountsEquipped });
  } catch (err) {
    console.error('Error fetching companion armor:', err);
    res.status(500).json({ error: 'Failed to fetch companion armor' });
  }
});

// POST /api/companion-armor/campaign/:campaignId — DM creates an armor item
router.post('/campaign/:campaignId', auth, async (req, res) => {
  try {
    if (!isDM(req)) return res.status(403).json({ error: 'Only the Dungeon Master can add companion armor' });
    const { campaignId } = req.params;
    const { characterId, kind, name, armor_class_bonus, description, slot } = req.body;
    if (!characterId || !name?.trim()) return res.status(400).json({ error: 'characterId and name are required' });
    if (!['mount', 'pet'].includes(kind)) return res.status(400).json({ error: 'kind must be "mount" or "pet"' });

    // Mount armor is built for one specific limb slot and can only ever be equipped there.
    const validSlots = ['head', 'body', 'front_legs', 'rear_legs'];
    let resolvedSlot = null;
    if (kind === 'mount') {
      if (!validSlots.includes(slot)) return res.status(400).json({ error: 'slot is required for mount armor (head, body, front_legs, or rear_legs)' });
      resolvedSlot = slot;
    }

    const result = await pool.query(
      `INSERT INTO companion_armor_items (campaign_id, character_id, kind, name, description, armor_class_bonus, slot)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [campaignId, characterId, kind, name.trim(), description || '', Math.max(0, parseInt(armor_class_bonus, 10) || 0), resolvedSlot]
    );

    const io = req.app.get('io');
    if (io) io.to(`campaign_${campaignId}`).emit('companionArmorUpdated', { campaignId: Number(campaignId), characterId: Number(characterId), timestamp: new Date().toISOString() });

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating companion armor item:', err);
    res.status(500).json({ error: 'Failed to create armor item' });
  }
});

// DELETE /api/companion-armor/:id — DM only, must be unequipped everywhere first
router.delete('/:id', auth, async (req, res) => {
  try {
    if (!isDM(req)) return res.status(403).json({ error: 'Only the Dungeon Master can delete companion armor' });
    const { id } = req.params;

    const item = (await pool.query('SELECT * FROM companion_armor_items WHERE id = $1', [id])).rows[0];
    if (!item) return res.status(404).json({ error: 'Armor item not found' });

    const stillEquipped = (await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM character_pets WHERE armor_item_id = $1) +
         (SELECT COUNT(*) FROM campaign_mounts WHERE armor_head_id = $1 OR armor_body_id = $1 OR armor_front_legs_id = $1 OR armor_rear_legs_id = $1)
         AS cnt`,
      [id]
    )).rows[0];
    if (Number(stillEquipped.cnt) > 0) {
      return res.status(400).json({ error: 'Unequip this armor from every pet/mount before deleting it' });
    }

    await pool.query('DELETE FROM companion_armor_items WHERE id = $1', [id]);

    const io = req.app.get('io');
    if (io) io.to(`campaign_${item.campaign_id}`).emit('companionArmorUpdated', { campaignId: item.campaign_id, characterId: item.character_id, timestamp: new Date().toISOString() });

    res.json({ message: 'Armor item deleted' });
  } catch (err) {
    console.error('Error deleting companion armor item:', err);
    res.status(500).json({ error: 'Failed to delete armor item' });
  }
});

// POST /api/companion-armor/pets/:petId/equip — body { armorItemId }
router.post('/pets/:petId/equip', auth, async (req, res) => {
  try {
    const { petId } = req.params;
    const { armorItemId } = req.body;
    const pet = await Pet.findById(petId);
    if (!pet) return res.status(404).json({ error: 'Pet not found' });
    if (!isDM(req) && pet.character_player_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    if (armorItemId) {
      const item = (await pool.query('SELECT * FROM companion_armor_items WHERE id = $1 AND kind = $2', [armorItemId, 'pet'])).rows[0];
      if (!item) return res.status(404).json({ error: 'Pet armor item not found' });
    }

    // Pet.update's COALESCE would ignore an explicit null, so unequip goes through a raw UPDATE instead.
    if (armorItemId) {
      await Pet.update(petId, { armor_item_id: armorItemId });
    } else {
      await pool.query('UPDATE character_pets SET armor_item_id = NULL, updated_at = NOW() WHERE id = $1', [petId]);
    }
    // Re-fetch through findById (not update's bare RETURNING *) so the companion_armor_items JOIN
    // actually runs and armor_class_bonus/effective_armor_class reflect the newly equipped item.
    const finalPet = await Pet.findById(petId);

    const io = req.app.get('io');
    if (io) io.to(`campaign_${pet.campaign_id}`).emit('petUpdated', { pet: (({ image_data, ...p }) => p)(finalPet), timestamp: new Date().toISOString() });

    res.json((({ image_data, ...p }) => p)(finalPet));
  } catch (err) {
    console.error('Error equipping pet armor:', err);
    res.status(500).json({ error: 'Failed to equip pet armor' });
  }
});

module.exports = router;
