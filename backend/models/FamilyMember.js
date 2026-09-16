const { pool } = require('./database');

class FamilyMember {
  static parseJsonField(field) {
    if (typeof field === 'string') {
      try { return JSON.parse(field); } catch (e) { return field; }
    }
    return field;
  }

  // Age this race would have been "at day 1" — mirrors CampaignView's getCharacterAge base.
  static raceBaseAge(race) {
    return race && race.toLowerCase().includes('thri-kreen') ? 3 : 13;
  }

  static formatMember(row) {
    const linked = Boolean(row.character_id);
    const name = linked ? (row.char_name || row.name) : row.name;
    const race = linked ? (row.char_race || row.race) : row.race;
    const abilities = linked
      ? (this.parseJsonField(row.char_abilities) || this.parseJsonField(row.abilities))
      : this.parseJsonField(row.abilities);
    const skills = linked
      ? (this.parseJsonField(row.char_skills) || this.parseJsonField(row.skills))
      : this.parseJsonField(row.skills);

    let imageUrl = null;
    const imageData = linked ? row.char_image_data : row.image_data;
    const imageMime = linked ? row.char_image_mime_type : row.image_mime_type;
    if (imageData) {
      imageUrl = `data:${imageMime || 'image/jpeg'};base64,${Buffer.from(imageData).toString('base64')}`;
    }

    return {
      id: row.id,
      campaignId: row.campaign_id,
      characterId: row.character_id,
      name,
      race,
      abilities,
      skills: skills || [],
      baseAge: row.base_age,
      // Only meaningful when linked — a played character's true age-as-of-day-1, if it was
      // set when they were assigned from the family tree (see routes/familyTree.js).
      ageOverride: linked ? (row.char_age_override ?? null) : null,
      isDead: row.is_dead,
      imageUrl,
      createdAt: row.created_at,
    };
  }

  // Ensures every campaign character has a corresponding family_members node, then returns the full tree.
  static async getTreeForCampaign(campaignId) {
    const missing = await pool.query(
      `SELECT c.* FROM characters c
       LEFT JOIN family_members fm ON fm.character_id = c.id
       WHERE c.campaign_id = $1 AND fm.id IS NULL`,
      [campaignId]
    );

    for (const character of missing.rows) {
      const abilities = this.parseJsonField(character.abilities) || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
      const skills = this.parseJsonField(character.skills) || [];
      await pool.query(
        `INSERT INTO family_members (campaign_id, character_id, name, race, abilities, skills, base_age, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          campaignId, character.id, character.name, character.race,
          JSON.stringify(abilities), JSON.stringify(skills),
          this.raceBaseAge(character.race), character.player_id,
        ]
      );
    }

    const membersResult = await pool.query(
      `SELECT fm.*, c.name AS char_name, c.race AS char_race, c.abilities AS char_abilities,
              c.skills AS char_skills, c.image_data AS char_image_data, c.image_mime_type AS char_image_mime_type,
              c.age_override AS char_age_override
       FROM family_members fm
       LEFT JOIN characters c ON c.id = fm.character_id
       WHERE fm.campaign_id = $1
       ORDER BY fm.created_at ASC`,
      [campaignId]
    );

    const relationshipsResult = await pool.query(
      `SELECT id, relationship_type, member_a_id, member_b_id FROM family_relationships WHERE campaign_id = $1`,
      [campaignId]
    );

    return {
      members: membersResult.rows.map(row => this.formatMember(row)),
      relationships: relationshipsResult.rows.map(r => ({
        id: r.id,
        type: r.relationship_type,
        memberAId: r.member_a_id,
        memberBId: r.member_b_id,
      })),
    };
  }

  static async getById(id) {
    const result = await pool.query(
      `SELECT fm.*, c.name AS char_name, c.race AS char_race, c.abilities AS char_abilities,
              c.skills AS char_skills, c.image_data AS char_image_data, c.image_mime_type AS char_image_mime_type
       FROM family_members fm
       LEFT JOIN characters c ON c.id = fm.character_id
       WHERE fm.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  static async createMember({ campaignId, name, race, abilities, skills, baseAge, imageBuffer, imageMime, createdBy }) {
    const result = await pool.query(
      `INSERT INTO family_members (campaign_id, name, race, abilities, skills, base_age, image_data, image_mime_type, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        campaignId, name, race || 'Human', JSON.stringify(abilities), JSON.stringify(skills || []),
        baseAge, imageBuffer || null, imageMime || null, createdBy || null,
      ]
    );
    return result.rows[0].id;
  }

  static async addRelationship(campaignId, type, memberAId, memberBId) {
    await pool.query(
      `INSERT INTO family_relationships (campaign_id, relationship_type, member_a_id, member_b_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [campaignId, type, memberAId, memberBId]
    );
  }

  static async findSpouseIds(memberId) {
    const result = await pool.query(
      `SELECT member_a_id, member_b_id FROM family_relationships
       WHERE relationship_type = 'spouse' AND (member_a_id = $1 OR member_b_id = $1)`,
      [memberId]
    );
    return result.rows.map(r => (r.member_a_id === memberId ? r.member_b_id : r.member_a_id));
  }

  // Partial update. Only touches family_members columns — caller decides whether to also update a linked character.
  static async updateMember(id, fields) {
    const { name, race, abilities, skills, baseAge, isDead, imageBuffer, imageMime } = fields;
    const result = await pool.query(
      `UPDATE family_members SET
         name = COALESCE($2, name),
         race = COALESCE($3, race),
         abilities = COALESCE($4, abilities),
         skills = COALESCE($5, skills),
         base_age = COALESCE($6, base_age),
         is_dead = COALESCE($7, is_dead),
         image_data = COALESCE($8, image_data),
         image_mime_type = COALESCE($9, image_mime_type),
         updated_at = NOW()
       WHERE id = $1
       RETURNING id`,
      [
        id, name || null, race || null,
        abilities ? JSON.stringify(abilities) : null,
        skills ? JSON.stringify(skills) : null,
        baseAge !== undefined ? baseAge : null,
        isDead !== undefined ? isDead : null,
        imageBuffer || null, imageMime || null,
      ]
    );
    return result.rows[0] || null;
  }

  static async setCharacterLink(memberId, characterId) {
    await pool.query(`UPDATE family_members SET character_id = $2, updated_at = NOW() WHERE id = $1`, [memberId, characterId]);
  }

  static async delete(id) {
    await pool.query(`DELETE FROM family_members WHERE id = $1`, [id]);
  }
}

module.exports = FamilyMember;
