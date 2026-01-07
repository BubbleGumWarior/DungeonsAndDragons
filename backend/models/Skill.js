const { pool } = require('./database');

const Skill = {
  getAll: async () => {
    return pool.query('SELECT * FROM skills ORDER BY name ASC');
  },

  getById: async (id) => {
    const result = await pool.query('SELECT * FROM skills WHERE id = $1', [id]);
    return result.rows[0];
  },

  getByName: async (name) => {
    const result = await pool.query('SELECT * FROM skills WHERE name = $1', [name]);
    return result.rows[0];
  },

  create: async (skillData) => {
    const { name, description, damage_dice, damage_type, range_size, usage_frequency, level_requirement, class_restriction } = skillData;
    const result = await pool.query(
      `INSERT INTO skills (name, description, damage_dice, damage_type, range_size, usage_frequency, level_requirement, class_restriction)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [name, description, damage_dice, damage_type, range_size, usage_frequency, level_requirement, class_restriction]
    );
    return result.rows[0];
  }
};

module.exports = Skill;
