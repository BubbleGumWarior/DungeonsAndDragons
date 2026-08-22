const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const Pet = require('../models/Pet');
const FoodStockpile = require('../models/FoodStockpile');
const { pool } = require('../models/database');
const { authenticateToken: auth } = require('../middleware/auth');

// ── Image upload config — store in memory, persisted to database ───────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // client-side compression handles most large photos; this is a safety net
  fileFilter: (req, file, cb) => {
    const ok = /jpeg|jpg|png|gif|webp|avif/.test(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('Only image files are allowed'), ok);
  },
});

// ── Auth helpers ──────────────────────────────────────────────────────────
const isDM = (req) => req.user.role === 'Dungeon Master';

async function verifyPetAccess(req, res, petId, requireDM = false) {
  const pet = await Pet.findById(petId);
  if (!pet) { res.status(404).json({ error: 'Pet not found' }); return null; }
  if (requireDM && !isDM(req)) { res.status(403).json({ error: 'Only the Dungeon Master can perform this action' }); return null; }
  if (!isDM(req) && pet.character_player_id !== req.user.id) { res.status(403).json({ error: 'Access denied' }); return null; }
  return pet;
}

async function getCharacterOwnerId(characterId) {
  const r = await pool.query('SELECT player_id FROM characters WHERE id = $1', [characterId]);
  return r.rows[0]?.player_id ?? null;
}

// ── Routes ────────────────────────────────────────────────────────────────

// GET /api/pets/campaign/:campaignId — all pets for the campaign (DM sees all, players see their own)
router.get('/campaign/:campaignId', auth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const pets = await Pet.getByCampaignId(campaignId);
    const visible = isDM(req)
      ? pets
      : pets.filter(p => p.character_player_id === req.user.id);
    // Strip binary image data
    res.json(visible.map(({ image_data, ...p }) => p));
  } catch (err) {
    console.error('Error fetching pets:', err);
    res.status(500).json({ error: 'Failed to fetch pets' });
  }
});

// GET /api/pets/character/:characterId
router.get('/character/:characterId', auth, async (req, res) => {
  try {
    const { characterId } = req.params;
    const ownerId = await getCharacterOwnerId(characterId);
    if (!isDM(req) && ownerId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const pets = await Pet.getByCharacterId(characterId);
    res.json(pets.map(({ image_data, ...p }) => p));
  } catch (err) {
    console.error('Error fetching pets for character:', err);
    res.status(500).json({ error: 'Failed to fetch pets' });
  }
});

// POST /api/pets/campaign/:campaignId — DM creates a pet for a character
router.post('/campaign/:campaignId', auth, async (req, res) => {
  try {
    if (!isDM(req)) return res.status(403).json({ error: 'Only the Dungeon Master can add pets' });

    const { campaignId } = req.params;
    const pet = await Pet.create({ ...req.body, campaign_id: parseInt(campaignId) });

    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${campaignId}`).emit('petAdded', {
        pet: (({ image_data, ...p }) => p)(pet),
        timestamp: new Date().toISOString(),
      });
    }
    res.status(201).json((({ image_data, ...p }) => p)(pet));
  } catch (err) {
    console.error('Error creating pet:', err);
    res.status(500).json({ error: 'Failed to create pet' });
  }
});

// PUT /api/pets/:id — DM updates pet details
router.put('/:id', auth, async (req, res) => {
  try {
    const pet = await verifyPetAccess(req, res, req.params.id, true);
    if (!pet) return;

    await Pet.update(req.params.id, req.body);
    // Re-fetch through findById (not update's bare RETURNING *) so the companion_armor_items JOIN
    // runs and armor_class_bonus/effective_armor_class stay accurate in the response.
    const updated = await Pet.findById(req.params.id);

    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${pet.campaign_id}`).emit('petUpdated', {
        pet: (({ image_data, ...p }) => p)(updated),
        timestamp: new Date().toISOString(),
      });
    }
    res.json((({ image_data, ...p }) => p)(updated));
  } catch (err) {
    console.error('Error updating pet:', err);
    res.status(500).json({ error: 'Failed to update pet' });
  }
});

// PATCH /api/pets/:id/hp — DM or owner updates current HP
router.patch('/:id/hp', auth, async (req, res) => {
  try {
    const pet = await verifyPetAccess(req, res, req.params.id, false);
    if (!pet) return;

    const { hit_points_current } = req.body;
    if (hit_points_current === undefined || isNaN(Number(hit_points_current))) {
      return res.status(400).json({ error: 'hit_points_current is required' });
    }

    await Pet.updateHP(req.params.id, Math.max(0, parseInt(hit_points_current)));
    const updated = await Pet.findById(req.params.id);

    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${pet.campaign_id}`).emit('petUpdated', {
        pet: (({ image_data, ...p }) => p)(updated),
        timestamp: new Date().toISOString(),
      });
    }
    res.json((({ image_data, ...p }) => p)(updated));
  } catch (err) {
    console.error('Error updating pet HP:', err);
    res.status(500).json({ error: 'Failed to update pet HP' });
  }
});

// PATCH /api/pets/:id/feed — owner or DM manually feeds the pet from the player's shared stockpile (full efficiency)
router.patch('/:id/feed', auth, async (req, res) => {
  try {
    const pet = await verifyPetAccess(req, res, req.params.id, false);
    if (!pet) return;

    const { rations } = req.body;
    const result = await FoodStockpile.feedAnimal({
      kind: 'pet',
      id: pet.id,
      campaignId: pet.campaign_id,
      characterId: pet.character_id,
      diet: pet.diet,
      hunger: pet.hunger,
      foodConsumption: pet.food_consumption,
      rations,
    });

    // result.animal comes from a bare UPDATE...RETURNING * (no companion_armor_items JOIN) — re-fetch for an accurate AC.
    const updatedPet = await Pet.findById(pet.id);
    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${pet.campaign_id}`).emit('petUpdated', {
        pet: (({ image_data, ...p }) => p)(updatedPet),
        timestamp: new Date().toISOString(),
      });
      io.to(`campaign_${pet.campaign_id}`).emit('foodStockpileUpdated', {
        campaignId: pet.campaign_id,
        updates: [{ characterId: pet.character_id, meat_rations: result.stockpile.meat_rations, veg_rations: result.stockpile.veg_rations }],
        timestamp: new Date().toISOString(),
      });
    }
    res.json({ pet: (({ image_data, ...p }) => p)(updatedPet), rationsConsumed: result.rationsConsumed });
  } catch (err) {
    console.error('Error feeding pet:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to feed pet' });
  }
});

// PATCH /api/pets/:id/feeding-mode — owner or DM toggles self-feed vs automatic
router.patch('/:id/feeding-mode', auth, async (req, res) => {
  try {
    const pet = await verifyPetAccess(req, res, req.params.id, false);
    if (!pet) return;

    const { feeding_mode } = req.body;
    if (!['self', 'automatic'].includes(feeding_mode)) {
      return res.status(400).json({ error: 'feeding_mode must be "self" or "automatic"' });
    }
    await Pet.update(req.params.id, { feeding_mode });
    const updated = await Pet.findById(req.params.id);

    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${pet.campaign_id}`).emit('petUpdated', {
        pet: (({ image_data, ...p }) => p)(updated),
        timestamp: new Date().toISOString(),
      });
    }
    res.json((({ image_data, ...p }) => p)(updated));
  } catch (err) {
    console.error('Error setting pet feeding mode:', err);
    res.status(500).json({ error: 'Failed to set feeding mode' });
  }
});

// GET /api/pets/:id/image — serve pet image from database (no auth required for img tags)
router.get('/:id/image', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT image_data, image_mime_type FROM character_pets WHERE id = $1',
      [req.params.id]
    );
    const row = result.rows[0];
    if (!row || !row.image_data) return res.status(404).json({ error: 'Image not found' });
    res.set('Content-Type', row.image_mime_type || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=31536000');
    res.send(row.image_data);
  } catch (err) {
    console.error('Error serving pet image:', err);
    res.status(500).json({ error: 'Failed to serve image' });
  }
});

// POST /api/pets/:id/image — DM uploads image
router.post('/:id/image', auth, upload.single('image'), async (req, res) => {
  try {
    const pet = await verifyPetAccess(req, res, req.params.id, true);
    if (!pet) return;
    if (!req.file) return res.status(400).json({ error: 'No image file provided' });

    await Pet.updateImage(req.params.id, req.file.buffer, req.file.mimetype);
    const updated = await Pet.findById(req.params.id);

    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${pet.campaign_id}`).emit('petUpdated', {
        pet: (({ image_data, ...p }) => p)(updated),
        timestamp: new Date().toISOString(),
      });
    }
    res.json((({ image_data, ...p }) => p)(updated));
  } catch (err) {
    console.error('Error uploading pet image:', err);
    res.status(500).json({ error: 'Failed to upload pet image' });
  }
});

// DELETE /api/pets/:id — DM deletes a pet
router.delete('/:id', auth, async (req, res) => {
  try {
    const pet = await verifyPetAccess(req, res, req.params.id, true);
    if (!pet) return;

    const deleted = await Pet.delete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Pet not found' });

    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${pet.campaign_id}`).emit('petDeleted', {
        petId: parseInt(req.params.id),
        characterId: pet.character_id,
        timestamp: new Date().toISOString(),
      });
    }
    res.json({ message: 'Pet deleted successfully' });
  } catch (err) {
    console.error('Error deleting pet:', err);
    res.status(500).json({ error: 'Failed to delete pet' });
  }
});

module.exports = router;
