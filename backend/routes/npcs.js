const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { pool } = require('../models/database');
const Campaign = require('../models/Campaign');
const Character = require('../models/Character');
const { authenticateToken } = require('../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|avif/;
    if (allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

function buildImageUrl(npc) {
  if (npc.image_data) {
    const b64 = Buffer.from(npc.image_data).toString('base64');
    return `data:${npc.image_mime_type || 'image/jpeg'};base64,${b64}`;
  }
  return null;
}

function formatNpc(npc) {
  return {
    id: npc.id,
    campaign_id: npc.campaign_id,
    name: npc.name,
    age: npc.age || '',
    description: npc.description || '',
    image_url: buildImageUrl(npc),
    created_by: npc.created_by,
    created_at: npc.created_at,
  };
}

// POST /api/campaigns/:campaignId/npcs — DM creates and reveals an NPC
router.post('/campaigns/:campaignId/npcs', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const campaignId = parseInt(req.params.campaignId, 10);
    if (isNaN(campaignId)) return res.status(400).json({ error: 'Invalid campaign ID' });

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (campaign.dungeon_master_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the Dungeon Master can reveal NPCs' });
    }

    const { name, age, description } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });

    let imageData = null;
    let imageMimeType = null;
    if (req.file) {
      imageData = req.file.buffer;
      imageMimeType = req.file.mimetype;
    }

    const result = await pool.query(
      `INSERT INTO campaign_npcs (campaign_id, name, age, description, image_data, image_mime_type, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, campaign_id, name, age, description, image_data, image_mime_type, created_by, created_at`,
      [campaignId, name.trim(), age || null, description || null, imageData, imageMimeType, req.user.id]
    );

    const npc = formatNpc(result.rows[0]);

    // Persist a chat message so the reveal appears in history after page refresh
    const chatResult = await pool.query(
      `INSERT INTO campaign_chat_messages (campaign_id, sender_id, sender_name, message_type, content)
       VALUES ($1, $2, $3, 'npc_reveal', $4)
       RETURNING id, campaign_id, sender_id, sender_name, message_type, content, roll_data, created_at`,
      [campaignId, req.user.id, req.user.username, JSON.stringify({ npcId: npc.id, name: npc.name })]
    );
    const chatMessage = chatResult.rows[0];

    // Broadcast both the NPC data and the chat message to all clients
    const io = req.app.get('io');
    if (io) {
      io.to(`campaign_${campaignId}`).emit('npcRevealed', npc);
      io.to(`campaign_${campaignId}`).emit('chatMessageReceived', chatMessage);
    }

    res.status(201).json({ npc });
  } catch (error) {
    console.error('Error creating NPC:', error);
    res.status(500).json({ error: 'Failed to create NPC' });
  }
});

// GET /api/campaigns/:campaignId/npcs — fetch all NPCs for a campaign
router.get('/campaigns/:campaignId/npcs', authenticateToken, async (req, res) => {
  try {
    const campaignId = parseInt(req.params.campaignId, 10);
    if (isNaN(campaignId)) return res.status(400).json({ error: 'Invalid campaign ID' });

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const isDM = campaign.dungeon_master_id === req.user.id;
    if (!isDM) {
      const character = await Character.findByPlayerAndCampaign(req.user.id, campaignId);
      if (!character) return res.status(403).json({ error: 'Not a member of this campaign' });
    }

    const result = await pool.query(
      `SELECT id, campaign_id, name, age, description, image_data, image_mime_type, created_by, created_at
       FROM campaign_npcs WHERE campaign_id = $1 ORDER BY created_at ASC`,
      [campaignId]
    );

    res.json({ npcs: result.rows.map(formatNpc) });
  } catch (error) {
    console.error('Error fetching NPCs:', error);
    res.status(500).json({ error: 'Failed to fetch NPCs' });
  }
});

// POST /api/characters/:characterId/saved-npcs — player saves an NPC to their character
router.post('/characters/:characterId/saved-npcs', authenticateToken, async (req, res) => {
  try {
    const characterId = parseInt(req.params.characterId, 10);
    if (isNaN(characterId)) return res.status(400).json({ error: 'Invalid character ID' });

    const character = await Character.findById(characterId);
    if (!character) return res.status(404).json({ error: 'Character not found' });
    if (character.player_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only save NPCs to your own character' });
    }

    const { npcId } = req.body;
    if (!npcId) return res.status(400).json({ error: 'npcId is required' });
    const npcIdInt = parseInt(npcId, 10);
    if (isNaN(npcIdInt)) return res.status(400).json({ error: 'Invalid npcId' });

    const npcCheck = await pool.query('SELECT id FROM campaign_npcs WHERE id = $1', [npcIdInt]);
    if (npcCheck.rows.length === 0) return res.status(404).json({ error: 'NPC not found' });

    try {
      await pool.query(
        `INSERT INTO character_saved_npcs (character_id, npc_id) VALUES ($1, $2)`,
        [characterId, npcIdInt]
      );
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'NPC already saved' });
      throw err;
    }

    res.status(201).json({ message: 'NPC saved successfully' });
  } catch (error) {
    console.error('Error saving NPC:', error);
    res.status(500).json({ error: 'Failed to save NPC' });
  }
});

// GET /api/characters/:characterId/saved-npcs — get all NPCs saved to a character
router.get('/characters/:characterId/saved-npcs', authenticateToken, async (req, res) => {
  try {
    const characterId = parseInt(req.params.characterId, 10);
    if (isNaN(characterId)) return res.status(400).json({ error: 'Invalid character ID' });

    const character = await Character.findById(characterId);
    if (!character) return res.status(404).json({ error: 'Character not found' });
    if (character.player_id !== req.user.id && req.user.role !== 'Dungeon Master') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await pool.query(
      `SELECT n.id, n.campaign_id, n.name, n.age, n.description, n.image_data, n.image_mime_type, n.created_by, n.created_at
       FROM character_saved_npcs csn
       JOIN campaign_npcs n ON n.id = csn.npc_id
       WHERE csn.character_id = $1
       ORDER BY csn.saved_at ASC`,
      [characterId]
    );

    res.json({ npcs: result.rows.map(formatNpc) });
  } catch (error) {
    console.error('Error fetching saved NPCs:', error);
    res.status(500).json({ error: 'Failed to fetch saved NPCs' });
  }
});

module.exports = router;
