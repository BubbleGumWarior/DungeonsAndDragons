const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { pool } = require('../models/database');
const Campaign = require('../models/Campaign');
const Character = require('../models/Character');
const FamilyMember = require('../models/FamilyMember');
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

const DEFAULT_ABILITIES = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };

function parseAbilities(raw) {
  if (!raw) return { ...DEFAULT_ABILITIES };
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const result = { ...DEFAULT_ABILITIES };
    for (const key of Object.keys(DEFAULT_ABILITIES)) {
      const value = parseInt(parsed[key], 10);
      if (!isNaN(value)) result[key] = Math.max(1, Math.min(30, value));
    }
    return result;
  } catch (e) {
    return { ...DEFAULT_ABILITIES };
  }
}

function parseSkills(raw) {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed.filter(s => typeof s === 'string') : [];
  } catch (e) {
    return [];
  }
}

async function requireDM(req, res, campaignId) {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return null;
  }
  if (campaign.dungeon_master_id !== req.user.id) {
    res.status(403).json({ error: 'Only the Dungeon Master can do that' });
    return null;
  }
  return campaign;
}

async function requireCampaignMember(req, res, campaignId) {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return null;
  }
  if (campaign.dungeon_master_id !== req.user.id) {
    const character = await Character.findByPlayerAndCampaign(req.user.id, campaignId);
    if (!character) {
      res.status(403).json({ error: 'Not a member of this campaign' });
      return null;
    }
  }
  return campaign;
}

// GET /api/campaigns/:campaignId/family-tree
router.get('/campaigns/:campaignId/family-tree', authenticateToken, async (req, res) => {
  try {
    const campaignId = parseInt(req.params.campaignId, 10);
    if (isNaN(campaignId)) return res.status(400).json({ error: 'Invalid campaign ID' });

    const campaign = await requireCampaignMember(req, res, campaignId);
    if (!campaign) return;

    const tree = await FamilyMember.getTreeForCampaign(campaignId);
    res.json(tree);
  } catch (error) {
    console.error('Error fetching family tree:', error);
    res.status(500).json({ error: 'Failed to fetch family tree' });
  }
});

// POST /api/family-tree/members/:memberId/spouse — DM creates a new spouse for this member
router.post('/family-tree/members/:memberId/spouse', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const memberId = parseInt(req.params.memberId, 10);
    if (isNaN(memberId)) return res.status(400).json({ error: 'Invalid member ID' });

    const member = await FamilyMember.getById(memberId);
    if (!member) return res.status(404).json({ error: 'Family member not found' });

    const campaign = await requireDM(req, res, member.campaign_id);
    if (!campaign) return;

    const { name, race } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    const baseAge = parseInt(req.body.baseAge, 10);

    const newMemberId = await FamilyMember.createMember({
      campaignId: member.campaign_id,
      name: name.trim(),
      race: race || 'Human',
      abilities: parseAbilities(req.body.abilities),
      skills: parseSkills(req.body.skills),
      baseAge: isNaN(baseAge) ? 13 : baseAge,
      imageBuffer: req.file ? req.file.buffer : null,
      imageMime: req.file ? req.file.mimetype : null,
      createdBy: req.user.id,
    });

    await FamilyMember.addRelationship(member.campaign_id, 'spouse', memberId, newMemberId);

    const io = req.app.get('io');
    const tree = await FamilyMember.getTreeForCampaign(member.campaign_id);
    if (io) io.to(`campaign_${member.campaign_id}`).emit('familyTreeUpdated', tree);

    res.status(201).json(tree);
  } catch (error) {
    console.error('Error adding spouse:', error);
    res.status(500).json({ error: 'Failed to add spouse' });
  }
});

// POST /api/family-tree/members/:memberId/child — DM adds a child to this member (and optionally a second parent)
router.post('/family-tree/members/:memberId/child', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const memberId = parseInt(req.params.memberId, 10);
    if (isNaN(memberId)) return res.status(400).json({ error: 'Invalid member ID' });

    const member = await FamilyMember.getById(memberId);
    if (!member) return res.status(404).json({ error: 'Family member not found' });

    const campaign = await requireDM(req, res, member.campaign_id);
    if (!campaign) return;

    const { name, race } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    const baseAge = parseInt(req.body.baseAge, 10);

    let secondParentId = null;
    if (req.body.secondParentMemberId) {
      const candidate = parseInt(req.body.secondParentMemberId, 10);
      if (!isNaN(candidate)) {
        const secondParent = await FamilyMember.getById(candidate);
        if (secondParent && secondParent.campaign_id === member.campaign_id) secondParentId = candidate;
      }
    }

    const newMemberId = await FamilyMember.createMember({
      campaignId: member.campaign_id,
      name: name.trim(),
      race: race || 'Human',
      abilities: parseAbilities(req.body.abilities),
      skills: parseSkills(req.body.skills),
      baseAge: isNaN(baseAge) ? 0 : baseAge,
      imageBuffer: req.file ? req.file.buffer : null,
      imageMime: req.file ? req.file.mimetype : null,
      createdBy: req.user.id,
    });

    await FamilyMember.addRelationship(member.campaign_id, 'parent_child', memberId, newMemberId);
    if (secondParentId) {
      await FamilyMember.addRelationship(member.campaign_id, 'parent_child', secondParentId, newMemberId);
    }

    const io = req.app.get('io');
    const tree = await FamilyMember.getTreeForCampaign(member.campaign_id);
    if (io) io.to(`campaign_${member.campaign_id}`).emit('familyTreeUpdated', tree);

    res.status(201).json(tree);
  } catch (error) {
    console.error('Error adding child:', error);
    res.status(500).json({ error: 'Failed to add child' });
  }
});

// PATCH /api/family-tree/members/:memberId — DM edits stats/name/image/isDead
router.patch('/family-tree/members/:memberId', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const memberId = parseInt(req.params.memberId, 10);
    if (isNaN(memberId)) return res.status(400).json({ error: 'Invalid member ID' });

    const member = await FamilyMember.getById(memberId);
    if (!member) return res.status(404).json({ error: 'Family member not found' });

    const campaign = await requireDM(req, res, member.campaign_id);
    if (!campaign) return;

    const { name, race } = req.body;
    const abilities = req.body.abilities ? parseAbilities(req.body.abilities) : null;
    const skills = req.body.skills ? parseSkills(req.body.skills) : null;
    const isDead = req.body.isDead !== undefined ? (req.body.isDead === 'true' || req.body.isDead === true) : undefined;
    const imageBuffer = req.file ? req.file.buffer : null;
    const imageMime = req.file ? req.file.mimetype : null;

    if (member.character_id) {
      // Linked to a real played character — edit the real sheet so it stays the source of truth.
      if (name || race || abilities || skills || imageBuffer) {
        await Character.update(member.character_id, {
          name: name || undefined,
          race: race || undefined,
          abilities: abilities || undefined,
          skills: skills || undefined,
        });
        if (imageBuffer) await Character.storeImage(member.character_id, imageBuffer, imageMime);
      }
      if (isDead !== undefined) {
        await FamilyMember.updateMember(memberId, { isDead });
      }
    } else {
      const baseAge = req.body.baseAge !== undefined ? parseInt(req.body.baseAge, 10) : undefined;
      await FamilyMember.updateMember(memberId, {
        name: name || undefined,
        race: race || undefined,
        abilities: abilities || undefined,
        skills: skills || undefined,
        baseAge: baseAge !== undefined && !isNaN(baseAge) ? baseAge : undefined,
        isDead,
        imageBuffer,
        imageMime,
      });
    }

    const io = req.app.get('io');
    const tree = await FamilyMember.getTreeForCampaign(member.campaign_id);
    if (io) io.to(`campaign_${member.campaign_id}`).emit('familyTreeUpdated', tree);

    res.json(tree);
  } catch (error) {
    console.error('Error updating family member:', error);
    res.status(500).json({ error: 'Failed to update family member' });
  }
});

// DELETE /api/family-tree/members/:memberId — DM removes a mistakenly-added node
router.delete('/family-tree/members/:memberId', authenticateToken, async (req, res) => {
  try {
    const memberId = parseInt(req.params.memberId, 10);
    if (isNaN(memberId)) return res.status(400).json({ error: 'Invalid member ID' });

    const member = await FamilyMember.getById(memberId);
    if (!member) return res.status(404).json({ error: 'Family member not found' });

    const campaign = await requireDM(req, res, member.campaign_id);
    if (!campaign) return;

    if (member.character_id) {
      return res.status(400).json({ error: 'Cannot remove a family member linked to a played character' });
    }

    await FamilyMember.delete(memberId);

    const io = req.app.get('io');
    const tree = await FamilyMember.getTreeForCampaign(member.campaign_id);
    if (io) io.to(`campaign_${member.campaign_id}`).emit('familyTreeUpdated', tree);

    res.json(tree);
  } catch (error) {
    console.error('Error deleting family member:', error);
    res.status(500).json({ error: 'Failed to delete family member' });
  }
});

// POST /api/family-tree/members/:memberId/assign-player — DM hands this family member to a player,
// permanently resetting and overwriting that player's existing character.
router.post('/family-tree/members/:memberId/assign-player', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const memberId = parseInt(req.params.memberId, 10);
    if (isNaN(memberId)) return res.status(400).json({ error: 'Invalid member ID' });

    const member = await FamilyMember.getById(memberId);
    if (!member) return res.status(404).json({ error: 'Family member not found' });

    const campaign = await requireDM(req, res, member.campaign_id);
    if (!campaign) return;

    if (member.character_id) {
      return res.status(400).json({ error: 'This family member is already played by someone' });
    }
    if (member.is_dead) {
      return res.status(400).json({ error: 'Cannot assign a deceased family member to a player' });
    }

    const { targetPlayerId, className, background, hitPoints, armorClass } = req.body;
    const targetPlayerIdInt = parseInt(targetPlayerId, 10);
    if (isNaN(targetPlayerIdInt)) return res.status(400).json({ error: 'targetPlayerId is required' });
    if (!className || !String(className).trim()) return res.status(400).json({ error: 'Class is required' });
    const hp = parseInt(hitPoints, 10);
    const ac = parseInt(armorClass, 10);
    if (isNaN(hp) || hp < 1) return res.status(400).json({ error: 'A valid hit point value is required' });
    if (isNaN(ac) || ac < 1) return res.status(400).json({ error: 'A valid armor class value is required' });

    const targetCharacter = await Character.findByPlayerAndCampaign(targetPlayerIdInt, member.campaign_id);
    if (!targetCharacter) return res.status(404).json({ error: 'That player does not have a character in this campaign' });

    const abilities = FamilyMember.parseJsonField(member.abilities) || DEFAULT_ABILITIES;
    const skills = FamilyMember.parseJsonField(member.skills) || [];
    const outgoingImage = await Character.getImage(targetCharacter.id);

    await client.query('BEGIN');

    // If some other family-tree node currently represents the player's outgoing character
    // (e.g. they were "Test Hero A" and are being reassigned to play their own child), that
    // node would otherwise silently start mirroring the new arrival's live data once its
    // character link is overwritten below. Snapshot who they were and unlink them instead,
    // so they remain a distinct, static figure in the tree.
    const staleLinks = await client.query(
      `SELECT id FROM family_members WHERE character_id = $1 AND id != $2`,
      [targetCharacter.id, memberId]
    );
    for (const stale of staleLinks.rows) {
      await client.query(
        `UPDATE family_members SET character_id = NULL, name = $2, race = $3, abilities = $4, skills = $5,
           base_age = $6, image_data = $7, image_mime_type = $8, updated_at = NOW()
         WHERE id = $1`,
        [
          stale.id, targetCharacter.name, targetCharacter.race,
          JSON.stringify(targetCharacter.abilities), JSON.stringify(targetCharacter.skills),
          FamilyMember.raceBaseAge(targetCharacter.race),
          outgoingImage?.image_data || null, outgoingImage?.image_mime_type || null,
        ]
      );
    }

    await client.query(
      `UPDATE characters SET
         name = $2, race = $3, class = $4, background = $5,
         level = 1, experience_points = 0,
         hit_points = $6, hit_points_max = $6, armor_class = $7,
         abilities = $8, skills = $9, expertise = '[]',
         equipment = '[]', equipped_items = '{}', spells = '[]',
         backstory = '', personality_traits = '', ideals = '', bonds = '', flaws = '',
         image_data = $10, image_mime_type = $11,
         gold = 0, hit_dice_remaining = 1, limb_health = NULL,
         spell_slots_used = '{}', ki_points_remaining = NULL, concealed_class = NULL,
         resistances = '{"resistances":[],"immunities":[],"vulnerabilities":[]}',
         proficiencies = '{"weapons":[],"armor":[],"tools":[],"languages":[]}',
         map_position_x = NULL, map_position_y = NULL,
         battle_position_x = NULL, battle_position_y = NULL,
         updated_at = NOW()
       WHERE id = $1`,
      [
        targetCharacter.id, member.name, member.race, String(className).trim(), background || null,
        hp, ac, JSON.stringify(abilities), JSON.stringify(skills),
        member.image_data || null, member.image_mime_type || null,
      ]
    );

    const childTables = [
      'character_pets', 'character_shadows', 'character_beasts', 'character_food_stockpiles',
      'companion_armor_items', 'character_subclasses', 'character_feature_choices',
      'character_skills', 'character_feats', 'campaign_feat_grants', 'character_notes',
      'character_saved_npcs', 'combat_death_saves',
    ];
    for (const table of childTables) {
      await client.query(`DELETE FROM ${table} WHERE character_id = $1`, [targetCharacter.id]);
    }
    await client.query(`UPDATE campaign_mounts SET assigned_to_character_id = NULL WHERE assigned_to_character_id = $1`, [targetCharacter.id]);
    await client.query(`UPDATE combat_combatants SET character_id = NULL WHERE character_id = $1`, [targetCharacter.id]);

    await client.query('COMMIT');

    await FamilyMember.setCharacterLink(memberId, targetCharacter.id);

    const io = req.app.get('io');
    const tree = await FamilyMember.getTreeForCampaign(member.campaign_id);
    if (io) io.to(`campaign_${member.campaign_id}`).emit('familyTreeUpdated', tree);

    res.json(tree);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error assigning player:', error);
    res.status(500).json({ error: 'Failed to assign player' });
  } finally {
    client.release();
  }
});

module.exports = router;
