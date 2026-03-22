const { pool } = require('./database');

class FiefBuilding {
  static async findByFief(fiefId) {
    const result = await pool.query(
      `SELECT * FROM fief_buildings WHERE fief_id = $1 ORDER BY is_complete DESC, id ASC`,
      [fiefId]
    );
    return result.rows;
  }

  /**
   * Start construction of a new building.
   * Deducts resource_cost from fief resources atomically.
   * Returns { building, updatedFief } or throws on insufficient resources.
   */
  static async create({ fief_id, name, building_type, level = 1, description = '', construction_days, resource_output = {}, resource_cost = {}, queue_position = null }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Lock and fetch fief resources
      const fiefResult = await client.query(
        `SELECT id, resources FROM fiefs WHERE id = $1 FOR UPDATE`, [fief_id]
      );
      const fief = fiefResult.rows[0];
      if (!fief) throw new Error('Fief not found');

      const current = fief.resources || { gold: 0, food: 0, wood: 0, stone: 0 };
      const cost = resource_cost || {};

      // Validate sufficient resources
      for (const [res, amount] of Object.entries(cost)) {
        if ((current[res] || 0) < amount) {
          throw new Error(`Insufficient ${res}: need ${amount}, have ${current[res] || 0}`);
        }
      }

      // Deduct costs
      const newResources = { ...current };
      for (const [res, amount] of Object.entries(cost)) {
        newResources[res] = (newResources[res] || 0) - amount;
      }

      await client.query(
        `UPDATE fiefs SET resources = $1 WHERE id = $2`, [JSON.stringify(newResources), fief_id]
      );

      const buildingResult = await client.query(
        `INSERT INTO fief_buildings
           (fief_id, name, building_type, level, description,
            construction_days_required, days_remaining,
            resource_output, resource_cost, queue_position)
         VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9)
         RETURNING *`,
        [
          fief_id, name, building_type, level, description,
          construction_days,
          JSON.stringify(resource_output),
          JSON.stringify(resource_cost),
          queue_position ?? null,
        ]
      );

      await client.query('COMMIT');
      return { building: buildingResult.rows[0], updatedResources: newResources };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Start a level-up upgrade job for an existing building.
   * Deducts upgrade cost from fief resources.
   */
  static async startUpgrade({ fief_id, parent_building_id, upgrade_cost = {}, construction_days, new_resource_output }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const fiefResult = await client.query(
        `SELECT id, resources FROM fiefs WHERE id = $1 FOR UPDATE`, [fief_id]
      );
      const fief = fiefResult.rows[0];
      if (!fief) throw new Error('Fief not found');

      const parentResult = await client.query(
        `SELECT * FROM fief_buildings WHERE id = $1`, [parent_building_id]
      );
      const parent = parentResult.rows[0];
      if (!parent) throw new Error('Building not found');
      if (!parent.is_complete) throw new Error('Building must be complete before upgrading');

      // Check no upgrade already in progress
      const inProgress = await client.query(
        `SELECT id FROM fief_buildings WHERE parent_building_id = $1 AND is_complete = false`,
        [parent_building_id]
      );
      if (inProgress.rows.length > 0) throw new Error('Upgrade already in progress for this building');

      // Check research has been completed for this upgrade level
      const targetLevel = parent.level + 1;
      const researchCheck = await client.query(
        `SELECT 1 FROM fief_research_levels WHERE fief_id = $1 AND building_type = $2 AND level >= $3`,
        [fief_id, parent.building_type, targetLevel]
      );
      if (researchCheck.rows.length === 0) {
        throw new Error(`Research required: complete ${parent.building_type}_lv${targetLevel} research before upgrading`);
      }

      const current = fief.resources || { gold: 0, food: 0, wood: 0, stone: 0 };
      for (const [res, amount] of Object.entries(upgrade_cost)) {
        if ((current[res] || 0) < amount) {
          throw new Error(`Insufficient ${res}: need ${amount}, have ${current[res] || 0}`);
        }
      }

      const newResources = { ...current };
      for (const [res, amount] of Object.entries(upgrade_cost)) {
        newResources[res] = (newResources[res] || 0) - amount;
      }

      await client.query(`UPDATE fiefs SET resources = $1 WHERE id = $2`, [JSON.stringify(newResources), fief_id]);

      // Assign queue position for this upgrade
      const queueResult = await client.query(
        `SELECT COALESCE(MAX(queue_position), 0) AS max_pos FROM fief_buildings WHERE fief_id = $1 AND is_complete = false`,
        [fief_id]
      );
      const upgradeQueuePos = (queueResult.rows[0]?.max_pos || 0) + 1;

      const newLevel = parent.level + 1;
      const upgradeResult = await client.query(
        `INSERT INTO fief_buildings
           (fief_id, name, building_type, level, description,
            construction_days_required, days_remaining,
            is_upgrade, parent_building_id,
            resource_output, resource_cost, queue_position)
         VALUES ($1,$2,$3,$4,$5,$6,$6,true,$7,$8,$9,$10)
         RETURNING *`,
        [
          fief_id,
          parent.name,
          parent.building_type,
          newLevel,
          parent.description,
          construction_days,
          parent_building_id,
          // Store the new output so it gets applied to the parent on completion
          new_resource_output != null ? JSON.stringify(new_resource_output) : parent.resource_output,
          JSON.stringify(upgrade_cost),
          upgradeQueuePos,
        ]
      );

      await client.query('COMMIT');
      return { upgradeBuilding: upgradeResult.rows[0], updatedResources: newResources };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Advance days for all buildings in a fief.
   * Returns list of newly completed buildings.
   */
  static async advanceDays(fiefId, days) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const buildingsResult = await client.query(
        `SELECT * FROM fief_buildings WHERE fief_id = $1 AND is_complete = false FOR UPDATE`,
        [fiefId]
      );

      const completed = [];

      for (const building of buildingsResult.rows) {
        const newRemaining = Math.max(0, building.days_remaining - days);
        const nowComplete = newRemaining === 0;

        if (nowComplete) {
          if (building.is_upgrade && building.parent_building_id) {
            // Apply level-up to parent
            await client.query(
              `UPDATE fief_buildings SET level = $1, resource_output = $2 WHERE id = $3`,
              [building.level, building.resource_output, building.parent_building_id]
            );
            // Remove upgrade row
            await client.query(`DELETE FROM fief_buildings WHERE id = $1`, [building.id]);
          } else {
            await client.query(
              `UPDATE fief_buildings
               SET days_remaining = 0, is_complete = true, built_at = NOW()
               WHERE id = $1`,
              [building.id]
            );
          }
          completed.push({ ...building, is_complete: true, days_remaining: 0 });
        } else {
          await client.query(
            `UPDATE fief_buildings SET days_remaining = $1 WHERE id = $2`,
            [newRemaining, building.id]
          );
        }
      }

      // Decrement temp modifiers on complete buildings
      await client.query(
        `UPDATE fief_buildings
         SET temp_modifier_days_remaining = GREATEST(0, temp_modifier_days_remaining - $1),
             temp_output_modifier = CASE
               WHEN temp_modifier_days_remaining <= $1 THEN '{}'::jsonb
               ELSE temp_output_modifier
             END
         WHERE fief_id = $2 AND is_complete = true AND temp_modifier_days_remaining > 0`,
        [days, fiefId]
      );

      await client.query('COMMIT');
      return completed;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  static async delete(buildingId) {
    await pool.query(`DELETE FROM fief_buildings WHERE id = $1`, [buildingId]);
  }

  /**
   * Apply a temporary output modifier to buildings of a specific type in a fief.
   */
  static async applyTempModifier(fiefId, buildingType, modifier, daysRemaining) {
    const result = await pool.query(
      `UPDATE fief_buildings
       SET temp_output_modifier = $1, temp_modifier_days_remaining = $2
       WHERE fief_id = $3 AND building_type = $4 AND is_complete = true
       RETURNING id`,
      [JSON.stringify(modifier), daysRemaining, fiefId, buildingType]
    );
    return result.rowCount;
  }
}

module.exports = FiefBuilding;
