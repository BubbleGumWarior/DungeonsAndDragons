const { pool } = require('../models/database');

async function addShadowSovereignShadows() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS character_shadows (
        id SERIAL PRIMARY KEY,
        character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
        shadow_name VARCHAR(100),
        origin_name VARCHAR(100),
        hit_points_max INTEGER NOT NULL DEFAULT 10,
        hit_points_current INTEGER NOT NULL DEFAULT 10,
        armor_class INTEGER NOT NULL DEFAULT 12,
        abilities JSONB NOT NULL DEFAULT '{"str":10,"dex":14,"con":10,"int":6,"wis":10,"cha":6}'::jsonb,
        speed INTEGER DEFAULT 30,
        attack_bonus INTEGER DEFAULT 3,
        damage_dice VARCHAR(20) DEFAULT '1d6',
        damage_type VARCHAR(30) DEFAULT 'necrotic',
        special_abilities TEXT,
        is_active BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ character_shadows table created');
  } catch (error) {
    console.error('Error creating character_shadows table:', error);
    throw error;
  }
}

module.exports = addShadowSovereignShadows;
