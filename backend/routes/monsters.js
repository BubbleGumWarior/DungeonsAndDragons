const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Monster = require('../models/Monster');
const Campaign = require('../models/Campaign');
const { authenticateToken: auth } = require('../middleware/auth');

// Configure multer for monster image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads/monsters');
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'monster-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
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
    
    // Get the monster to check if it exists and get old image
    const monster = await Monster.findById(id);
    if (!monster) {
      // Delete uploaded file if monster doesn't exist
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ message: 'Monster not found' });
    }
    
    // Delete old image if it exists
    if (monster.image_url) {
      const oldImagePath = path.join(__dirname, '..', monster.image_url);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
    }
    
    const imageUrl = `/uploads/monsters/${req.file.filename}`;
    const updatedMonster = await Monster.update(id, { image_url: imageUrl });
    
    res.json(updatedMonster);
  } catch (error) {
    console.error('Error uploading monster image:', error);
    // Clean up uploaded file on error
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
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
    
    // Delete image file if it exists
    if (monster.image_url) {
      const imagePath = path.join(__dirname, '..', monster.image_url);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    
    await Monster.delete(id);
    res.json({ message: 'Monster deleted successfully' });
  } catch (error) {
    console.error('Error deleting monster:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
