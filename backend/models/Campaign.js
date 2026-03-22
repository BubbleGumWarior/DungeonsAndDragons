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

        // ── Build queue: only tick queue_position = 1 (or tier upgrade has priority) ──
        // If a tier upgrade is in progress, no buildings advance.
        const tierUpgradeActive = (fief.tier_upgrade_days_remaining || 0) > 0;

        const incompleteBuildings = await client.query(
          `SELECT * FROM fief_buildings WHERE fief_id = $1 AND is_complete = false ORDER BY queue_position ASC NULLS LAST FOR UPDATE`,
          [fiefId]
        );

        const newlyCompleted = [];

        // Process build queue with leftover-days propagation:
        // When a building finishes with n days to spare, those n days carry over to the next in queue.
        let daysLeft = days;
        while (daysLeft > 0 && !tierUpgradeActive) {
          const front = await client.query(
            `SELECT * FROM fief_buildings WHERE fief_id = $1 AND is_complete = false AND queue_position = 1 LIMIT 1 FOR UPDATE`,
            [fiefId]
          );
          if (!front.rows[0]) break; // nothing in queue

          const b = front.rows[0];
          const surplus = daysLeft - b.days_remaining;

          if (surplus >= 0) {
            // This building completes; surplus carries forward
            if (b.is_upgrade && b.parent_building_id) {
              await client.query(
                `UPDATE fief_buildings SET level = $1, resource_output = $2 WHERE id = $3`,
                [b.level, b.resource_output, b.parent_building_id]
              );
              await client.query(`DELETE FROM fief_buildings WHERE id = $1`, [b.id]);
            } else {
              await client.query(
                `UPDATE fief_buildings SET days_remaining = 0, is_complete = true, built_at = NOW(), queue_position = NULL WHERE id = $1`,
                [b.id]
              );
            }
            newlyCompleted.push(b);
            completedBuildings.push({ ...b, fiefId, fiefName: fief.name });

            // Promote next building in queue
            await client.query(
              `UPDATE fief_buildings SET queue_position = queue_position - 1
               WHERE fief_id = $1 AND is_complete = false AND queue_position IS NOT NULL AND queue_position > 1`,
              [fiefId]
            );

            daysLeft = surplus; // continue with remaining days
          } else {
            // Building still in progress
            const newRemaining = b.days_remaining - daysLeft;
            await client.query(
              `UPDATE fief_buildings SET days_remaining = $1 WHERE id = $2`,
              [newRemaining, b.id]
            );
            break;
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
          // Base yield = 1.2/worker/day; each point of building output adds +0.10/worker
          const yieldBonus = buildings.reduce((sum, b) => sum + ((b.resource_output || {})[res] ?? 0), 0);
          const yieldPerWorker = 1.2 + yieldBonus * 0.10;
          gained[res] = Math.floor(workers * yieldPerWorker * days);
        }

        // ── Research costs (used for accumulation cap + completion check) ────
        const RESEARCH_COSTS = {
          campfire_lv2: 80,    campfire_lv3: 250,    campfire_lv4: 700,    campfire_lv5: 1800,
          hunting_ground_lv2: 100, hunting_ground_lv3: 320, hunting_ground_lv4: 900, hunting_ground_lv5: 2400,
          basic_storage_lv2: 60, basic_storage_lv3: 180,
          housing_lv2: 120,    housing_lv3: 400,     housing_lv4: 1100,    housing_lv5: 3000,
          watchtower_lv2: 90,  watchtower_lv3: 280,
          farm_lv2: 300,       farm_lv3: 900,     farm_lv4: 2500,   farm_lv5: 6000,
          lumber_camp_lv2: 280, lumber_camp_lv3: 850, lumber_camp_lv4: 2300, lumber_camp_lv5: 5500,
          basic_mine_lv2: 320, basic_mine_lv3: 950, basic_mine_lv4: 2600, basic_mine_lv5: 6200,
          tavern_lv2: 350,     tavern_lv3: 1000,  tavern_lv4: 2800,  tavern_lv5: 7000,
          chapel_lv2: 200,     chapel_lv3: 600,   chapel_lv4: 1600,  chapel_lv5: 4000,
          research_lab_lv2: 400, research_lab_lv3: 1200, research_lab_lv4: 3200, research_lab_lv5: 8000,
          mill_lv2: 600,       mill_lv3: 1800,    mill_lv4: 5000,    mill_lv5: 12000,
          market_stall_lv2: 500, market_stall_lv3: 1500, market_stall_lv4: 4000, market_stall_lv5: 10000,
          blacksmith_lv2: 700, blacksmith_lv3: 2000,
          barracks_lv2: 800,   barracks_lv3: 2400,
          ore_mine_lv2: 1000,  ore_mine_lv3: 3000,  ore_mine_lv4: 8000,  ore_mine_lv5: 20000,
          stable_lv2: 900,     stable_lv3: 2700,
          school_lv2: 1100,    school_lv3: 3300,    school_lv4: 9000,
          shrine_lv2: 800,     shrine_lv3: 2400,    shrine_lv4: 6500,
          workshop_lv2: 1500,  inn_lv2: 1400,  library_lv2: 1600,  guard_post_lv2: 1200,
          bank_lv2: 2000,      bank_lv3: 6000,
          grand_market_lv2: 3000, grand_market_lv3: 9000,
          imperial_mint_lv2: 4000, imperial_mint_lv3: 12000,
        };

        // Research worker production — accumulate points, capped at the item's cost
        const researchWorkers = assignments['research'] ?? 0;
        if (researchWorkers > 0) {
          const researchOutput = buildings.reduce((sum, b) => sum + ((b.resource_output || {}).research ?? 0), 0);
          const researchPerDay = researchWorkers * (1.2 + researchOutput * 0.10);
          const researchPoints = researchPerDay * days;
          if (researchPoints > 0) {
            const activeRes = await client.query(
              `SELECT id, research_id, points_accumulated FROM fief_research_queue WHERE fief_id = $1 AND status = 'in_progress' LIMIT 1`,
              [fiefId]
            );
            if (activeRes.rows[0]) {
              const item = activeRes.rows[0];
              const cost = RESEARCH_COSTS[item.research_id] ?? Infinity;
              const cappedAdd = Math.min(researchPoints, cost - item.points_accumulated);
              if (cappedAdd > 0) {
                await client.query(
                  `UPDATE fief_research_queue SET points_accumulated = points_accumulated + $1 WHERE id = $2`,
                  [cappedAdd, item.id]
                );
              }
            }
          }
        }

        // Stats effects on production
        const stats = fief.stats || {};
        const economyStat   = Math.max(1, Math.min(10, stats.economy   || 1));
        const stabilityStat = Math.max(1, Math.min(10, stats.stability || 1));
        // Economy boosts gold: +5% per stat point above 1 (at 10 = +45%)
        const economyMult = 1 + (economyStat - 1) * 0.05;
        gained.gold = Math.floor(gained.gold * economyMult);

        // Storage cap: base 100 + exponential per basic_storage level (Lv1:+100, Lv2:+200, Lv3:+400)
        const baseStorageCap = 100;
        const storageCap = baseStorageCap + buildings
          .filter(b => b.building_type === 'basic_storage')
          .reduce((sum, b) => sum + Math.round(100 * Math.pow(2, (b.level || 1) - 1)), 0);

        // Food consumption: 0.5 per person per day
        const pop = fief.population || 0;
        const foodConsumed = pop * 0.5 * days;

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
          const migrationChancePerDay = (stabilityStat / 10) * 0.125 * (foodComfort ? 2 : 1);

          // Housing pop cap: base 30 + sum of pop_cap from complete housing buildings
          const housingCap = 30 + buildings
            .filter(b => b.building_type === 'housing')
            .reduce((sum, b) => sum + ((b.resource_output || {}).pop_cap ?? 0), 0);
          const atHousingCap = (pop + popChange) >= housingCap;

          for (let d = 0; d < days; d++) {
            const curPop = pop + popChange;
            const overCap = curPop >= housingCap;
            // Birth rate halved (and halved again when at/over cap)
            const birthRate = overCap ? 0.005 : 0.025;
            let births = 0;
            for (let i = 0; i < curPop; i++) {
              if (Math.random() < birthRate) births++;
            }
            // Migration stops entirely when at housing cap
            const migration = (!overCap && Math.random() < migrationChancePerDay) ? 1 : 0;
            popChange += births + migration;
          }
        }
        // Active disaster daily damage
        const activeDisasters = fief.active_disasters || [];
        if (activeDisasters.length > 0) {
          const currentResAfter = (await client.query(`SELECT resources, population FROM fiefs WHERE id = $1`, [fiefId])).rows[0];
          let disRes = { ...(currentResAfter.resources || { gold: 0, food: 0, wood: 0, stone: 0 }) };
          let disDeaths = 0;
          for (const disaster of activeDisasters) {
            if (disaster.daily_damage) {
              for (const [res, amt] of Object.entries(disaster.daily_damage)) {
                disRes[res] = Math.max(0, (disRes[res] || 0) + amt * days);
              }
            }
            if (disaster.daily_deaths) {
              disDeaths += Math.floor(disaster.daily_deaths * days);
            }
          }
          await client.query(`UPDATE fiefs SET resources = $1 WHERE id = $2`, [JSON.stringify(disRes), fiefId]);
          if (disDeaths > 0) {
            const popNow = (await client.query(`SELECT population FROM fiefs WHERE id = $1`, [fiefId])).rows[0].population || 0;
            await client.query(`UPDATE fiefs SET population = $1 WHERE id = $2`, [Math.max(0, popNow - disDeaths), fiefId]);
            await client.query(
              `INSERT INTO fief_event_log (fief_id, campaign_day, event_type, title, details) VALUES ($1,$2,'disaster','Active disaster deaths',$3)`,
              [fiefId, newDay, JSON.stringify({ deaths: disDeaths, disasters: activeDisasters.map(d => d.name) })]
            );
          }
        }

        // Starvation logging
        if (starvation) {
          const deathCount = Math.abs(popChange);
          await client.query(
            `INSERT INTO fief_event_log (fief_id, campaign_day, event_type, title, details) VALUES ($1,$2,'starvation','Starvation deaths',$3)`,
            [fiefId, newDay, JSON.stringify({ deaths: deathCount, population_before: pop })]
          );
        }

        const newPop = Math.max(0, pop + popChange);
        await client.query(`UPDATE fiefs SET population = $1 WHERE id = $2`, [newPop, fiefId]);
        populationGained[fiefId] = popChange;

        // ── Research completion check ──────────────────────────────────────────
        // Check for research items that have accumulated enough points (RESEARCH_COSTS defined above)

        const BUILDING_BASE_DAYS = {
          campfire: 1, basic_storage: 2, housing: 3, watchtower: 3, hunting_ground: 2,
          chapel: 4, farm: 5, lumber_camp: 4, basic_mine: 6, tavern: 4, research_lab: 6,
          blacksmith: 7, market_stall: 5, barracks: 7, mill: 6,
          ore_mine: 10, stable: 6, school: 8, shrine: 5,
          workshop: 8, inn: 7, library: 9, guard_post: 6, thieves_guild: 10, siege_workshop: 14,
          bank: 10, alchemist: 8, armoury: 9, mason: 7, monastery: 10, foundry: 12,
          castle_walls: 20, cathedral: 15, academy: 12, docks: 14, shadow_order: 16,
          keep: 25, grand_market: 12, mage_tower: 15, hospital: 12,
          palace: 30, colosseum: 25, university: 20, grand_cathedral: 20,
          citadel_fortress: 40, royal_academy: 30, imperial_mint: 25, grand_armory: 30,
        };

        // Check for research items that have accumulated enough points
        const researchRows = await client.query(
          `SELECT * FROM fief_research_queue WHERE fief_id = $1 AND status = 'in_progress'`,
          [fiefId]
        );
        for (const rItem of researchRows.rows) {
          const costKey = rItem.research_id;
          const totalCost = RESEARCH_COSTS[costKey];
          if (!totalCost || rItem.points_accumulated < totalCost) continue;

          // Research complete — determine building_type and new_level
          const parts = costKey.split('_lv');
          const buildingType = parts[0];
          const newLevel = parseInt(parts[1], 10);

          // Mark complete
          await client.query(
            `UPDATE fief_research_queue SET status = 'completed', queue_position = NULL, campaign_day_completed = $1 WHERE id = $2`,
            [newDay, rItem.id]
          );

          // Update or insert fief_research_levels
          await client.query(
            `INSERT INTO fief_research_levels (fief_id, building_type, level)
             VALUES ($1, $2, $3)
             ON CONFLICT (fief_id, building_type) DO UPDATE SET level = EXCLUDED.level`,
            [fiefId, buildingType, newLevel]
          );

          // Calculate new resource_output from BUILDING_OUTPUT_TABLE
          const BUILDING_OUTPUTS = {
            campfire: { food: 3 }, hunting_ground: { food: 8 }, housing: { pop_cap: 15 },
            farm: { food: 15 }, lumber_camp: { wood: 15 }, basic_mine: { stone: 12 }, tavern: { gold: 10 },
            research_lab: { research: 5 }, market_stall: { gold: 25 }, mill: { food: 20 },
            ore_mine: { stone: 30 }, workshop: { gold: 40 }, inn: { gold: 35 },
            bank: { gold: 60 }, alchemist: { gold: 30 }, mason: { stone: 50 },
            docks: { gold: 80, food: 30 }, grand_market: { gold: 100 }, colosseum: { gold: 60 },
            imperial_mint: { gold: 150 },
          };
          const baseOutput = BUILDING_OUTPUTS[buildingType] || {};
          // Exponential output scaling per level (housing uses linear)
          const newOutput = {};
          for (const [k, v] of Object.entries(baseOutput)) {
            if (k === 'pop_cap') {
              newOutput[k] = v * newLevel; // linear for pop_cap
            } else {
              newOutput[k] = Math.ceil(v * Math.pow(2, newLevel - 1));
            }
          }
          const newDays = Math.ceil((BUILDING_BASE_DAYS[buildingType] || 5) * Math.pow(2, newLevel - 1));

          // Upgrade all complete buildings of this type
          await client.query(
            `UPDATE fief_buildings SET level = $1, resource_output = $2
             WHERE fief_id = $3 AND building_type = $4 AND is_complete = true`,
            [newLevel, JSON.stringify(newOutput), fiefId, buildingType]
          );

          // Reset construction timer for in-progress buildings of this type
          await client.query(
            `UPDATE fief_buildings SET level = $1, resource_output = $2,
             days_remaining = $3, construction_days_required = $3
             WHERE fief_id = $4 AND building_type = $5 AND is_complete = false`,
            [newLevel, JSON.stringify(newOutput), newDays, fiefId, buildingType]
          );

          // Log
          await client.query(
            `INSERT INTO fief_event_log (fief_id, campaign_day, event_type, title, details)
             VALUES ($1,$2,'research_complete',$3,$4)`,
            [fiefId, newDay,
              `Research complete: ${buildingType.replace(/_/g, ' ')} upgraded to Level ${newLevel}`,
              JSON.stringify({ research_id: costKey, building_type: buildingType, new_level: newLevel, new_output: newOutput })]
          );

          // Promote next queued research item
          const nextQueued = await client.query(
            `SELECT * FROM fief_research_queue WHERE fief_id = $1 AND status = 'queued' ORDER BY queue_position ASC LIMIT 1`,
            [fiefId]
          );
          if (nextQueued.rows[0]) {
            await client.query(
              `UPDATE fief_research_queue SET status = 'in_progress', queue_position = 1, campaign_day_started = $1 WHERE id = $2`,
              [newDay, nextQueued.rows[0].id]
            );
            // Shift remaining queue positions
            await client.query(
              `UPDATE fief_research_queue SET queue_position = queue_position - 1 WHERE fief_id = $1 AND status = 'queued'`,
              [fiefId]
            );
          }
        }

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