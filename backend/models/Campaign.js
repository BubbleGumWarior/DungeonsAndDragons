const { pool } = require('./database');
const Army = require('./Army');

class Campaign {
  // Create a new campaign
  static async create(campaignData) {
    const { name, description, dungeon_master_id } = campaignData;
    
    try {
      const result = await pool.query(
        `INSERT INTO campaigns (name, description, dungeon_master_id) 
         VALUES ($1, $2, $3) 
         RETURNING id, name, description, dungeon_master_id, created_at, updated_at`,
        [name, description, dungeon_master_id]
      );
      
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }
  
  // Find campaign by ID with DM info
  static async findById(id) {
    try {
      const result = await pool.query(
        `SELECT c.*, u.username as dm_username 
         FROM campaigns c 
         JOIN users u ON c.dungeon_master_id = u.id 
         WHERE c.id = $1`,
        [id]
      );
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }
  
  // Find campaign by name
  static async findByName(name) {
    try {
      const result = await pool.query(
        `SELECT c.*, u.username as dm_username 
         FROM campaigns c 
         JOIN users u ON c.dungeon_master_id = u.id 
         WHERE c.name = $1`,
        [name]
      );
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }
  
  // Get all campaigns with DM info
  static async getAll() {
    try {
      const result = await pool.query(
        `SELECT c.*, u.username as dm_username 
         FROM campaigns c 
         JOIN users u ON c.dungeon_master_id = u.id 
         ORDER BY c.created_at DESC`
      );
      return result.rows;
    } catch (error) {
      throw error;
    }
  }
  
  // Get campaigns created by a specific DM
  static async getByDungeonMaster(dungeonMasterId) {
    try {
      const result = await pool.query(
        `SELECT c.*, u.username as dm_username 
         FROM campaigns c 
         JOIN users u ON c.dungeon_master_id = u.id 
         WHERE c.dungeon_master_id = $1 
         ORDER BY c.created_at DESC`,
        [dungeonMasterId]
      );
      return result.rows;
    } catch (error) {
      throw error;
    }
  }
  
  // Get campaigns where a player has a character
  static async getByPlayer(playerId) {
    try {
      const result = await pool.query(
        `SELECT DISTINCT c.*, u.username as dm_username 
         FROM campaigns c 
         JOIN users u ON c.dungeon_master_id = u.id 
         JOIN characters ch ON ch.campaign_id = c.id 
         WHERE ch.player_id = $1 
         ORDER BY c.created_at DESC`,
        [playerId]
      );
      return result.rows;
    } catch (error) {
      throw error;
    }
  }
  
  // Get all players in a campaign
  static async getPlayersInCampaign(campaignId) {
    try {
      const result = await pool.query(
        `SELECT DISTINCT u.id, u.username, u.email 
         FROM users u 
         JOIN characters ch ON ch.player_id = u.id 
         WHERE ch.campaign_id = $1 
         ORDER BY u.username`,
        [campaignId]
      );
      return result.rows;
    } catch (error) {
      throw error;
    }
  }
  
  // Update campaign
  static async update(id, updateData) {
    const { name, description } = updateData;
    
    try {
      const result = await pool.query(
        `UPDATE campaigns 
         SET name = COALESCE($2, name), 
             description = COALESCE($3, description), 
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1 
         RETURNING id, name, description, dungeon_master_id, created_at, updated_at`,
        [id, name, description]
      );
      
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }
  
  // Delete campaign and all associated characters
  static async delete(id) {
    try {
      // Start a transaction to ensure all deletes happen together
      await pool.query('BEGIN');
      
      // First delete all characters in this campaign
      await pool.query(
        'DELETE FROM characters WHERE campaign_id = $1',
        [id]
      );
      
      // Then delete the campaign
      const result = await pool.query(
        'DELETE FROM campaigns WHERE id = $1 RETURNING id',
        [id]
      );
      
      // Commit the transaction
      await pool.query('COMMIT');
      
      return result.rows[0];
    } catch (error) {
      // Rollback on error
      await pool.query('ROLLBACK');
      throw error;
    }
  }
  
  // Check if user is DM of campaign
  static async isDungeonMaster(campaignId, userId) {
    try {
      const result = await pool.query(
        'SELECT id FROM campaigns WHERE id = $1 AND dungeon_master_id = $2',
        [campaignId, userId]
      );
      return result.rows.length > 0;
    } catch (error) {
      throw error;
    }
  }
  
  // Generate URL-safe campaign name (replace spaces with underscores)
  static generateUrlName(campaignName) {
    return campaignName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  }
  
  // Get campaign by URL name
  static async findByUrlName(urlName) {
    try {
      // Convert URL name back to possible campaign name patterns
      const possibleNames = [
        urlName.replace(/_/g, ' '), // underscores to spaces
        urlName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), // title case
        urlName // exact match
      ];
      
      const result = await pool.query(
        `SELECT c.*, u.username as dm_username 
         FROM campaigns c 
         JOIN users u ON c.dungeon_master_id = u.id 
         WHERE LOWER(REPLACE(c.name, ' ', '_')) = LOWER($1)`,
        [urlName]
      );
      
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  /**
   * Advance campaign time by N days.
   * For each fief in all kingdoms of this campaign:
   *   - advances building construction timers
   *   - accumulates resource output from complete buildings
   *   - auto-grows population
   *   - writes fief_event_log entries
   * Returns a summary of what changed.
   */
  static async advanceDays(campaignId, days) {
    const FiefBuilding = require('./FiefBuilding');
    const FiefEventLog = require('./FiefEventLog');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Bump current_day
      const campResult = await client.query(
        `UPDATE campaigns SET current_day = COALESCE(current_day, 1) + $1 WHERE id = $2 RETURNING current_day`,
        [days, campaignId]
      );
      const newDay = campResult.rows[0].current_day;

      // Collect all fiefs for this campaign's kingdoms
      const fiefResult = await client.query(
        `SELECT f.* FROM fiefs f
         JOIN kingdoms k ON f.kingdom_id = k.id
         WHERE k.campaign_id = $1`,
        [campaignId]
      );

      const completedBuildings = [];
      const resourcesGained = {};
      const populationGained = {};

      for (const fief of fiefResult.rows) {
        const fiefId = fief.id;

        // Advance building timers (using raw client for atomicity)
        const incompleteBuildings = await client.query(
          `SELECT * FROM fief_buildings WHERE fief_id = $1 AND is_complete = false FOR UPDATE`,
          [fiefId]
        );

        const newlyCompleted = [];
        for (const b of incompleteBuildings.rows) {
          const newRemaining = Math.max(0, b.days_remaining - days);
          if (newRemaining === 0) {
            if (b.is_upgrade && b.parent_building_id) {
              await client.query(
                `UPDATE fief_buildings SET level = $1, resource_output = $2 WHERE id = $3`,
                [b.level, b.resource_output, b.parent_building_id]
              );
              await client.query(`DELETE FROM fief_buildings WHERE id = $1`, [b.id]);
            } else {
              await client.query(
                `UPDATE fief_buildings SET days_remaining = 0, is_complete = true, built_at = NOW() WHERE id = $1`,
                [b.id]
              );
            }
            newlyCompleted.push(b);
            completedBuildings.push({ ...b, fiefId, fiefName: fief.name });
          } else {
            await client.query(
              `UPDATE fief_buildings SET days_remaining = $1 WHERE id = $2`,
              [newRemaining, b.id]
            );
          }
        }

        // Decrement temp modifiers on complete buildings
        await client.query(
          `UPDATE fief_buildings
           SET temp_modifier_days_remaining = GREATEST(0, temp_modifier_days_remaining - $1),
               temp_output_modifier = CASE WHEN temp_modifier_days_remaining <= $1 THEN '{}'::jsonb ELSE temp_output_modifier END
           WHERE fief_id = $2 AND is_complete = true AND temp_modifier_days_remaining > 0`,
          [days, fiefId]
        );

        // Worker-based resource production
        // resource_output on buildings = yield per assigned worker per day
        const completeBuildingsResult = await client.query(
          `SELECT resource_output, building_type, level FROM fief_buildings
           WHERE fief_id = $1 AND is_complete = true AND is_upgrade = false`,
          [fiefId]
        );
        const buildings = completeBuildingsResult.rows;
        const assignments = fief.worker_assignments || { gold: 0, food: 0, wood: 0, stone: 0 };

        const gained = { gold: 0, food: 0, wood: 0, stone: 0 };
        for (const res of ['gold', 'food', 'wood', 'stone']) {
          const workers = assignments[res] ?? 0;
          if (workers <= 0) continue;
          // Base yield = 1/worker/day; buildings add bonus yield per worker
          const yieldBonus = buildings.reduce((sum, b) => sum + ((b.resource_output || {})[res] ?? 0), 0);
          const yieldPerWorker = 1 + yieldBonus;
          gained[res] = Math.floor(workers * yieldPerWorker * days);
        }

        // Stats effects on production
        const stats = fief.stats || {};
        const economyStat   = Math.max(1, Math.min(10, stats.economy   || 1));
        const stabilityStat = Math.max(1, Math.min(10, stats.stability || 1));
        // Economy boosts gold: +5% per stat point above 1 (at 10 = +45%)
        const economyMult = 1 + (economyStat - 1) * 0.05;
        gained.gold = Math.floor(gained.gold * economyMult);

        // Storage cap: base 100 + 200 per level of basic_storage buildings
        const baseStorageCap = 100;
        const storageCap = baseStorageCap + buildings
          .filter(b => b.building_type === 'basic_storage')
          .reduce((sum, b) => sum + (b.level || 1) * 200, 0);

        // Food consumption: 4 per 10 population per day
        const pop = fief.population || 0;
        const foodConsumed = Math.ceil(pop / 10) * 4 * days;

        // Apply resources — food gets net (produced minus consumed), others just add production
        const currentResources = fief.resources || { gold: 0, food: 0, wood: 0, stone: 0 };
        const rawFood = (currentResources.food || 0) + gained.food - foodConsumed;
        const newResources = {
          gold:  Math.min(storageCap, (currentResources.gold  || 0) + gained.gold),
          food:  Math.min(storageCap, Math.max(0, rawFood)),
          wood:  Math.min(storageCap, (currentResources.wood  || 0) + gained.wood),
          stone: Math.min(storageCap, (currentResources.stone || 0) + gained.stone),
        };
        await client.query(`UPDATE fiefs SET resources = $1 WHERE id = $2`, [JSON.stringify(newResources), fiefId]);
        resourcesGained[fiefId] = gained;

        // Population: starvation if food ran out, otherwise probability-based growth
        let popChange = 0;
        let starvation = false;
        if (rawFood < 0 && pop > 0) {
          // Starvation: severity scales with how deep the shortage is relative to population
          const shortage = Math.abs(rawFood);
          const deathRate = Math.min(0.25, shortage / Math.max(pop * 5, 1));
          const deaths = Math.max(1, Math.floor(pop * deathRate));
          popChange = -deaths;
          starvation = true;
        } else {
          // Probability-based growth over `days` days:
          //   1) Births: each existing citizen has 5% chance of producing a child per day
          //   2) Migration: a single worker may join per day based on stability
          //      Chance = (stabilityStat / 10) * 0.25   => 2.5% at stab=1, 25% at stab=10
          //      Food bonus doubles the migration chance if food is comfortable
          const foodComfort = newResources.food > (fief.tier || 1) * 20;
          const migrationChancePerDay = (stabilityStat / 10) * 0.25 * (foodComfort ? 2 : 1);

          // Housing pop cap: base 1000 + sum of pop_cap from complete housing buildings
          const housingCap = 1000 + buildings
            .filter(b => b.building_type === 'housing')
            .reduce((sum, b) => sum + ((b.resource_output || {}).pop_cap ?? 0), 0);
          const atHousingCap = (pop + popChange) >= housingCap;

          for (let d = 0; d < days; d++) {
            const curPop = pop + popChange;
            const overCap = curPop >= housingCap;
            // Birth rate halved when at or over housing cap
            const birthRate = overCap ? 0.01 : 0.05;
            let births = 0;
            for (let i = 0; i < curPop; i++) {
              if (Math.random() < birthRate) births++;
            }
            // Migration stops entirely when at housing cap
            const migration = (!overCap && Math.random() < migrationChancePerDay) ? 1 : 0;
            popChange += births + migration;
          }
        }
        const newPop = Math.max(0, pop + popChange);
        await client.query(`UPDATE fiefs SET population = $1 WHERE id = $2`, [newPop, fiefId]);
        populationGained[fiefId] = popChange;

        // Faith: grows from religious buildings each day
        const FAITH_BUILDINGS = ['chapel','shrine','monastery','cathedral','grand_cathedral'];
        const faithGain = buildings
          .filter(b => FAITH_BUILDINGS.includes(b.building_type))
          .reduce((sum, b) => sum + (b.level || 1) * 0.5, 0) * days;
        if (faithGain > 0) {
          await client.query(
            `UPDATE fiefs SET faith = LEAST(100, COALESCE(faith, 0) + $1) WHERE id = $2`,
            [faithGain, fiefId]
          );
        }

        // Decrement fief construction timer
        const wasUnderConstruction = (fief.construction_days_remaining || 0) > 0;
        if (wasUnderConstruction) {
          const newRemaining = Math.max(0, (fief.construction_days_remaining || 0) - days);
          await client.query(
            `UPDATE fiefs SET construction_days_remaining = $1 WHERE id = $2`,
            [newRemaining, fiefId]
          );
          if (newRemaining === 0) {
            await client.query(
              `INSERT INTO fief_event_log (fief_id, campaign_day, event_type, title, details)
               VALUES ($1,$2,'building_complete',$3,$4)`,
              [fiefId, newDay, `${fief.name} established as a Camp!`, JSON.stringify({ tier: fief.tier || 1 })]
            );
          }
        }

        // Decrement tier upgrade timer
        const tierUpgradeRemaining = fief.tier_upgrade_days_remaining || 0;
        if (tierUpgradeRemaining > 0) {
          const newTierRemaining = Math.max(0, tierUpgradeRemaining - days);
          if (newTierRemaining === 0) {
            await client.query(
              `UPDATE fiefs SET tier_upgrade_days_remaining = 0, tier = LEAST(tier + 1, 10) WHERE id = $1`,
              [fiefId]
            );
            const TIER_NAMES = ['', 'Camp', 'Hamlet', 'Small Village', 'Village', 'Large Village', 'Small Town', 'Town', 'Large Town', 'City', 'Citadel'];
            const newTier = Math.min((fief.tier || 1) + 1, 10);
            await client.query(
              `INSERT INTO fief_event_log (fief_id, campaign_day, event_type, title, details)
               VALUES ($1,$2,'building_complete',$3,$4)`,
              [fiefId, newDay, `${fief.name} has grown into a ${TIER_NAMES[newTier]}!`, JSON.stringify({ fromTier: fief.tier, toTier: newTier })]
            );
          } else {
            await client.query(
              `UPDATE fiefs SET tier_upgrade_days_remaining = $1 WHERE id = $2`,
              [newTierRemaining, fiefId]
            );
          }
        }

        // Process training queue
        const trainingResult = await client.query(
          `SELECT * FROM fief_training WHERE fief_id = $1 FOR UPDATE`,
          [fiefId]
        );
        for (const t of trainingResult.rows) {
          const newRemaining = Math.max(0, t.days_remaining - days);
          if (newRemaining === 0) {
            if (t.linked_army_id) {
              // Add trained units to the linked player army
              await client.query(
                `UPDATE armies SET total_troops = total_troops + $1, updated_at = NOW() WHERE id = $2`,
                [t.count, t.linked_army_id]
              );
              // Recalculate numbers stat based on new total
              const armyRow = await client.query(`SELECT total_troops FROM armies WHERE id = $1`, [t.linked_army_id]);
              if (armyRow.rows.length > 0) {
                const newNumbers = Army.calculateNumbersStat(armyRow.rows[0].total_troops);
                await client.query(`UPDATE armies SET numbers = $1 WHERE id = $2`, [newNumbers, t.linked_army_id]);
              }
            } else {
              // Legacy path: add to garrison JSON
              await client.query(
                `UPDATE fiefs SET garrison = jsonb_set(
                  COALESCE(garrison, '{}'::jsonb),
                  $1::text[],
                  (COALESCE(garrison->>$2, '0')::int + $3)::text::jsonb
                ) WHERE id = $4`,
                [[t.unit_type], t.unit_type, t.count, fiefId]
              );
            }
            await client.query(`DELETE FROM fief_training WHERE id = $1`, [t.id]);
            await client.query(
              `INSERT INTO fief_event_log (fief_id, campaign_day, event_type, title, details)
               VALUES ($1,$2,'training_complete',$3,$4)`,
              [fiefId, newDay, `${t.count} ${t.unit_type} training complete`, JSON.stringify({ unitType: t.unit_type, count: t.count, linkedArmyId: t.linked_army_id || null })]
            );
          } else {
            await client.query(`UPDATE fief_training SET days_remaining = $1 WHERE id = $2`, [newRemaining, t.id]);
          }
        }

        // Write event log entries
        const anyResources = Object.values(gained).some(v => v > 0);
        if (anyResources) {
          await client.query(
            `INSERT INTO fief_event_log (fief_id, campaign_day, event_type, title, details)
             VALUES ($1,$2,'resource_production',$3,$4)`,
            [fiefId, newDay, `Day ${newDay}: Resources produced`, JSON.stringify(gained)]
          );
        }
        if (starvation) {
          await client.query(
            `INSERT INTO fief_event_log (fief_id, campaign_day, event_type, title, details)
             VALUES ($1,$2,'crisis',$3,$4)`,
            [fiefId, newDay, `Day ${newDay}: Famine! ${Math.abs(popChange)} citizens perished.`, JSON.stringify({ deaths: Math.abs(popChange), newTotal: newPop })]
          );
        } else if (popChange > 0) {
          await client.query(
            `INSERT INTO fief_event_log (fief_id, campaign_day, event_type, title, details)
             VALUES ($1,$2,'population_growth',$3,$4)`,
            [fiefId, newDay, `Day ${newDay}: Population grew by ${popChange}`, JSON.stringify({ growth: popChange, newTotal: newPop })]
          );
        }
        for (const b of newlyCompleted) {
          await client.query(
            `INSERT INTO fief_event_log (fief_id, campaign_day, event_type, title, details)
             VALUES ($1,$2,'building_complete',$3,$4)`,
            [fiefId, newDay, `${b.name} (Lv${b.level}) construction complete`, JSON.stringify({ buildingName: b.name, level: b.level, type: b.building_type })]
          );
        }
      }

      await client.query('COMMIT');
      return { newDay, completedBuildings, resourcesGained, populationGained };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = Campaign;