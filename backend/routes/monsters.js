const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const Monster = require('../models/Monster');
const Campaign = require('../models/Campaign');
const { authenticateToken: auth } = require('../middleware/auth');

// Configure multer for monster image uploads (memory storage — no disk writes)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|webp|avif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  }
});

// Get all monsters for a campaign
router.get('/campaign/:campaignId', auth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    
    // Verify user has access to this campaign
    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }
    
    const monsters = await Monster.findByCampaignId(campaignId);
    
    // Filter visible data based on user role
    const filteredMonsters = monsters.map(monster => {
      const isDM = req.user.role === 'Dungeon Master';
      
      if (isDM || monster.visible_to_players) {
        return monster;
      } else {
        // Players only see name and image
        return {
          id: monster.id,
          name: monster.name,
          image_url: monster.image_url,
          visible_to_players: monster.visible_to_players
        };
      }
    });
    
    res.json(filteredMonsters);
  } catch (error) {
    console.error('Error fetching monsters:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create a new monster (DM only)
router.post('/', auth, async (req, res) => {
  try {
    if (req.user.role !== 'Dungeon Master') {
      return res.status(403).json({ message: 'Only Dungeon Masters can create monsters' });
    }
    
    const monster = await Monster.create(req.body);
    res.status(201).json(monster);
  } catch (error) {
    console.error('Error creating monster:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Upload monster image (DM only)
router.post('/:id/image', auth, upload.single('image'), async (req, res) => {
  try {
    if (req.user.role !== 'Dungeon Master') {
      return res.status(403).json({ message: 'Only Dungeon Masters can upload monster images' });
    }

    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({ message: 'No image file provided' });
    }

    const monster = await Monster.findById(id);
    if (!monster) {
      return res.status(404).json({ message: 'Monster not found' });
    }

    const updatedMonster = await Monster.storeImage(id, req.file.buffer, req.file.mimetype);

    res.json(updatedMonster);
  } catch (error) {
    console.error('Error uploading monster image:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update a monster (DM only)
router.put('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'Dungeon Master') {
      return res.status(403).json({ message: 'Only Dungeon Masters can update monsters' });
    }
    
    const { id } = req.params;
    const updatedMonster = await Monster.update(id, req.body);
    
    if (!updatedMonster) {
      return res.status(404).json({ message: 'Monster not found' });
    }
    
    res.json(updatedMonster);
  } catch (error) {
    console.error('Error updating monster:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Toggle visibility (DM only)
router.patch('/:id/toggle-visibility', auth, async (req, res) => {
  try {
    if (req.user.role !== 'Dungeon Master') {
      return res.status(403).json({ message: 'Only Dungeon Masters can toggle visibility' });
    }
    
    const { id } = req.params;
    const updatedMonster = await Monster.toggleVisibility(id);
    
    if (!updatedMonster) {
      return res.status(404).json({ message: 'Monster not found' });
    }
    
    res.json(updatedMonster);
  } catch (error) {
    console.error('Error toggling visibility:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete a monster (DM only)
router.delete('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'Dungeon Master') {
      return res.status(403).json({ message: 'Only Dungeon Masters can delete monsters' });
    }

    const { id } = req.params;
    const monster = await Monster.findById(id);

    if (!monster) {
      return res.status(404).json({ message: 'Monster not found' });
    }

    await Monster.delete(id);
    res.json({ message: 'Monster deleted successfully' });
  } catch (error) {
    console.error('Error deleting monster:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
