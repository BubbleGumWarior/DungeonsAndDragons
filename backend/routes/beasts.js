const express = require('express');
const router = express.Router();
const { pool } = require('../models/database');
const { authenticateToken } = require('../middleware/auth');

// Get beast companion for a character
router.get('/:characterId', authenticateToken, async (req, res) => {
  try {
    const { characterId } = req.params;
    
    // Verify character ownership
    const charCheck = await pool.query(
      'SELECT player_id FROM characters WHERE id = $1',
      [characterId]
    );
    
    if (charCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Character not found' });
    }
    
    if (req.user.role !== 'Dungeon Master' && charCheck.rows[0].player_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only view your own character\'s beast' });
    }
    
    const result = await pool.query(
      'SELECT * FROM character_beasts WHERE character_id = $1',
      [characterId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No beast companion found' });
    }
    
    const beast = result.rows[0];
    beast.abilities = typeof beast.abilities === 'string' ? JSON.parse(beast.abilities) : beast.abilities;
    
    res.json({ beast });
  } catch (error) {
    console.error('Error fetching beast companion:', error);
    res.status(500).json({ error: 'Failed to fetch beast companion' });
  }
});

// Create or update beast companion
router.post('/:characterId', authenticateToken, async (req, res) => {
  try {
    const { characterId } = req.params;
    const {
      beast_type,
      beast_name,
      level_acquired,
      hit_points_max,
      armor_class,
      abilities,
      speed,
      attack_bonus,
      damage_dice,
      damage_type,
      special_abilities
    } = req.body;
    
    // Verify character ownership
    const charCheck = await pool.query(
      'SELECT player_id FROM characters WHERE id = $1',
      [characterId]
    );
    
    if (charCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Character not found' });
    }
    
    if (req.user.role !== 'Dungeon Master' && charCheck.rows[0].player_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only manage your own character\'s beast' });
    }
    
    // Insert or update beast
    const result = await pool.query(`
      INSERT INTO character_beasts (
        character_id, beast_type, beast_name, level_acquired,
        hit_points_max, hit_points_current, armor_class, abilities,
        speed, attack_bonus, damage_dice, damage_type, special_abilities
      ) VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (character_id) 
      DO UPDATE SET
        beast_type = EXCLUDED.beast_type,
        beast_name = EXCLUDED.beast_name,
        level_acquired = EXCLUDED.level_acquired,
        hit_points_max = EXCLUDED.hit_points_max,
        armor_class = EXCLUDED.armor_class,
        abilities = EXCLUDED.abilities,
        speed = EXCLUDED.speed,
        attack_bonus = EXCLUDED.attack_bonus,
        damage_dice = EXCLUDED.damage_dice,
        damage_type = EXCLUDED.damage_type,
        special_abilities = EXCLUDED.special_abilities,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [
      characterId, beast_type, beast_name, level_acquired,
      hit_points_max, armor_class, JSON.stringify(abilities),
      speed, attack_bonus, damage_dice, damage_type, special_abilities
    ]);
    
    const beast = result.rows[0];
    beast.abilities = typeof beast.abilities === 'string' ? JSON.parse(beast.abilities) : beast.abilities;
    
    res.json({
      message: 'Beast companion saved successfully',
      beast
    });
  } catch (error) {
    console.error('Error saving beast companion:', error);
    res.status(500).json({ error: 'Failed to save beast companion' });
  }
});

// Update beast HP
router.patch('/:characterId/hp', authenticateToken, async (req, res) => {
  try {
    const { characterId } = req.params;
    const { hit_points_current } = req.body;
    
    // Verify character ownership (DM or owner)
    const charCheck = await pool.query(
      'SELECT player_id FROM characters WHERE id = $1',
      [characterId]
    );
    
    if (charCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Character not found' });
    }
    
    if (req.user.role !== 'Dungeon Master' && charCheck.rows[0].player_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only update your own character\'s beast' });
    }
    
    const result = await pool.query(`
      UPDATE character_beasts
      SET hit_points_current = $1, updated_at = CURRENT_TIMESTAMP
      WHERE character_id = $2
      RETURNING *
    `, [hit_points_current, characterId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No beast companion found' });
    }
    
    const beast = result.rows[0];
    beast.abilities = typeof beast.abilities === 'string' ? JSON.parse(beast.abilities) : beast.abilities;
    
    res.json({
      message: 'Beast HP updated successfully',
      beast
    });
  } catch (error) {
    console.error('Error updating beast HP:', error);
    res.status(500).json({ error: 'Failed to update beast HP' });
  }
});

// Delete beast companion
router.delete('/:characterId', authenticateToken, async (req, res) => {
  try {
    const { characterId } = req.params;
    
    // Verify character ownership (DM or owner)
    const charCheck = await pool.query(
      'SELECT player_id FROM characters WHERE id = $1',
      [characterId]
    );
    
    if (charCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Character not found' });
    }
    
    if (req.user.role !== 'Dungeon Master' && charCheck.rows[0].player_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own character\'s beast' });
    }
    
    await pool.query('DELETE FROM character_beasts WHERE character_id = $1', [characterId]);
    
    res.json({ message: 'Beast companion deleted successfully' });
  } catch (error) {
    console.error('Error deleting beast companion:', error);
    res.status(500).json({ error: 'Failed to delete beast companion' });
  }
});

module.exports = router;
