const { pool } = require('./database');

class Pet {
  static async getByCampaignId(campaignId) {
    const result = await pool.query(
      `SELECT p.*, c.name AS character_name, c.player_id AS character_player_id
         FROM character_pets p
         JOIN characters c ON c.id = p.character_id
        WHERE p.campaign_id = $1
        ORDER BY p.character_id ASC, p.created_at ASC`,
      [campaignId]
    );
    return result.rows.map(Pet._parse);
  }

  static async getByCharacterId(characterId) {
    const result = await pool.query(
      `SELECT * FROM character_pets WHERE character_id = $1 ORDER BY created_at ASC`,
      [characterId]
    );
    return result.rows.map(Pet._parse);
  }

  static async findById(id) {
    const result = await pool.query(
      `SELECT p.*, c.name AS character_name, c.player_id AS character_player_id
         FROM character_pets p
         JOIN characters c ON c.id = p.character_id
        WHERE p.id = $1`,
      [id]
    );
    if (result.rows.length === 0) return null;
    return Pet._parse(result.rows[0]);
  }

  static async create(data) {
    const {
      character_id,
      campaign_id,
      name,
      species = 'Unknown',
      description = '',
      hit_points = 10,
      hit_points_current,
      armor_class = 10,
      speed = 30,
      abilities = { str: 10, dex: 10, con: 10, int: 2, wis: 10, cha: 6 },
      is_battle_pet = false,
      image_url = null,
    } = data;

    const currentHP = hit_points_current !== undefined ? hit_points_current : hit_points;

    const result = await pool.query(
      `INSERT INTO character_pets
         (character_id, campaign_id, name, species, description,
          hit_points, hit_points_current, armor_class, speed, abilities,
          is_battle_pet, image_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        character_id, campaign_id, name, species, description,
        hit_points, currentHP, armor_class, speed,
        JSON.stringify(abilities), is_battle_pet, image_url,
      ]
    );
    return Pet._parse(result.rows[0]);
  }

  static async update(id, data) {
    const {
      name, species, description,
      hit_points, hit_points_current, armor_class, speed,
      abilities, is_battle_pet, image_url,
    } = data;

    const result = await pool.query(
      `UPDATE character_pets
          SET name               = COALESCE($1,  name),
              species            = COALESCE($2,  species),
              description        = COALESCE($3,  description),
              hit_points         = COALESCE($4,  hit_points),
              hit_points_current = COALESCE($5,  hit_points_current),
              armor_class        = COALESCE($6,  armor_class),
              speed              = COALESCE($7,  speed),
              abilities          = COALESCE($8,  abilities),
              is_battle_pet      = COALESCE($9,  is_battle_pet),
              image_url          = COALESCE($10, image_url),
              updated_at         = NOW()
        WHERE id = $11
       RETURNING *`,
      [
        name, species, description,
        hit_points, hit_points_current, armor_class, speed,
        abilities !== undefined ? JSON.stringify(abilities) : undefined,
        is_battle_pet, image_url,
        id,
      ]
    );
    if (result.rows.length === 0) return null;
    return Pet._parse(result.rows[0]);
  }

  static async updateImage(id, imageBuffer, mimeType) {
    const result = await pool.query(
      `UPDATE character_pets
          SET image_data      = $1,
              image_mime_type = $2,
              image_url       = $3,
              updated_at      = NOW()
        WHERE id = $4
       RETURNING *`,
      [imageBuffer, mimeType, `/api/pets/${id}/image`, id]
    );
    if (result.rows.length === 0) return null;
    return Pet._parse(result.rows[0]);
  }

  static async updateHP(id, hit_points_current) {
    const result = await pool.query(
      `UPDATE character_pets SET hit_points_current = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [hit_points_current, id]
    );
    if (result.rows.length === 0) return null;
    return Pet._parse(result.rows[0]);
  }

  static async delete(id) {
    const result = await pool.query(
      `DELETE FROM character_pets WHERE id = $1 RETURNING image_url`,
      [id]
    );
    return result.rows[0] || null;
  }

  static _parse(row) {
    if (!row) return null;
    const parsed = {
      ...row,
      abilities: typeof row.abilities === 'string' ? JSON.parse(row.abilities) : (row.abilities || {}),
    };
    // If image is stored in the database, point image_url to the serve endpoint
    if (row.image_data) {
      parsed.image_url = `/api/pets/${row.id}/image`;
    }
    return parsed;
  }
}

module.exports = Pet;
