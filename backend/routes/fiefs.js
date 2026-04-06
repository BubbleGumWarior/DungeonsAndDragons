const express = require('express');
const router = express.Router({ mergeParams: true });
const Fief = require('../models/Fief');
const FiefBuilding = require('../models/FiefBuilding');
const FiefEventLog = require('../models/FiefEventLog');
const KingdomEvent = require('../models/KingdomEvent');
const { authenticateToken } = require('../middleware/auth');
const { pool } = require('../models/database');
const { getWorkablePopulation } = require('../utils/population');

async function getKingdomForFief(fiefId) {
  const r = await pool.query(
    'SELECT k.id AS kingdom_id, k.campaign_id FROM fiefs f JOIN kingdoms k ON f.kingdom_id = k.id WHERE f.id = $1',
    [fiefId]
  );
  return r.rows[0] ?? null;
}

// ── Fief CRUD ─────────────────────────────────────────────────────────────────

// GET all fiefs for a kingdom
router.get('/kingdoms/:kingdomId/fiefs', authenticateToken, async (req, res) => {
  try {
    const fiefs = await Fief.findByKingdom(req.params.kingdomId);
    res.json(fiefs);
  } catch (error) {
    console.error('Error fetching fiefs:', error);
    res.status(500).json({ error: 'Failed to fetch fiefs' });
  }
});

// Resource cost to create a new fief (deducted from kingdom resources)
const FIEF_CREATION_COST = { gold: 50, wood: 30, stone: 20 };

// POST create new fief
router.post('/kingdoms/:kingdomId/fiefs', authenticateToken, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Fief name is required' });

    // Fetch kingdom resources and deduct cost
    const kRes = await pool.query('SELECT id, campaign_id, resources FROM kingdoms WHERE id = $1', [req.params.kingdomId]);
    if (!kRes.rows[0]) return res.status(404).json({ error: 'Kingdom not found' });
    const kingdom = kRes.rows[0];
    const resources = kingdom.resources || { gold: 0, food: 0, wood: 0, stone: 0 };

    const insufficient = Object.entries(FIEF_CREATION_COST).filter(([res, cost]) => (resources[res] ?? 0) < cost);
    if (insufficient.length > 0) {
      const lacking = insufficient.map(([res, cost]) => `${cost} ${res} (have ${resources[res] ?? 0})`).join(', ');
      return res.status(400).json({ error: `Insufficient resources to found a fief. Need: ${lacking}` });
    }

    const newResources = { ...resources };
    for (const [res, cost] of Object.entries(FIEF_CREATION_COST)) {
      newResources[res] = (newResources[res] ?? 0) - cost;
    }
    await pool.query('UPDATE kingdoms SET resources = $1 WHERE id = $2', [JSON.stringify(newResources), kingdom.id]);

    const fief = await Fief.create({ kingdom_id: req.params.kingdomId, name, construction_days_remaining: 3 });
    const io = req.app.get('io');
    if (io && kingdom.campaign_id) {
      io.to(`campaign_${kingdom.campaign_id}`).emit('kingdomDataChanged', { campaignId: kingdom.campaign_id, kingdomId: Number(req.params.kingdomId) });
    }
    res.status(201).json(fief);
  } catch (error) {
    console.error('Error creating fief:', error);
    res.status(500).json({ error: 'Failed to create fief' });
  }
});

// GET single fief with buildings
router.get('/fiefs/:id', authenticateToken, async (req, res) => {
  try {
    const fief = await Fief.findByIdFull(req.params.id);
    if (!fief) return res.status(404).json({ error: 'Fief not found' });
    res.json(fief);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch fief' });
  }
});

// PATCH fief resources (manual DM/owner adjustment)
router.patch('/fiefs/:id/resources', authenticateToken, async (req, res) => {
  try {
    const fief = await Fief.updateResources(req.params.id, req.body.resources);
    const io = req.app.get('io');
    if (io) {
      const kInfo = await getKingdomForFief(req.params.id);
      if (kInfo) io.to(`campaign_${kInfo.campaign_id}`).emit('kingdomDataChanged', { campaignId: kInfo.campaign_id, kingdomId: kInfo.kingdom_id });
    }
    res.json(fief);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update resources' });
  }
});

// PATCH fief stats
router.patch('/fiefs/:id/stats', authenticateToken, async (req, res) => {
  try {
    const fief = await Fief.updateStats(req.params.id, req.body.stats);
    const io = req.app.get('io');
    if (io) {
      const kInfo = await getKingdomForFief(req.params.id);
      if (kInfo) io.to(`campaign_${kInfo.campaign_id}`).emit('kingdomDataChanged', { campaignId: kInfo.campaign_id, kingdomId: kInfo.kingdom_id });
    }
    res.json(fief);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update stats' });
  }
});

// PATCH fief population
router.patch('/fiefs/:id/population', authenticateToken, async (req, res) => {
  try {
    const fief = await Fief.updatePopulation(req.params.id, req.body.population);
    const io = req.app.get('io');
    if (io) {
      const kInfo = await getKingdomForFief(req.params.id);
      if (kInfo) io.to(`campaign_${kInfo.campaign_id}`).emit('kingdomDataChanged', { campaignId: kInfo.campaign_id, kingdomId: kInfo.kingdom_id });
    }
    res.json(fief);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update population' });
  }
});

// PATCH fief faith
router.patch('/fiefs/:id/faith', authenticateToken, async (req, res) => {
  try {
    const faith = Math.max(0, Math.min(100, Number(req.body.faith) || 0));
    await pool.query(`UPDATE fiefs SET faith = $1 WHERE id = $2`, [faith, req.params.id]);
    const fief = await Fief.findByIdFull(req.params.id);
    const io = req.app.get('io');
    if (io) {
      const kInfo = await getKingdomForFief(req.params.id);
      if (kInfo) io.to(`campaign_${kInfo.campaign_id}`).emit('kingdomDataChanged', { campaignId: kInfo.campaign_id, kingdomId: kInfo.kingdom_id });
    }
    res.json(fief);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update faith' });
  }
});

// PATCH fief worker assignments
router.patch('/fiefs/:id/workers', authenticateToken, async (req, res) => {
  try {
    const { worker_assignments } = req.body;
    if (!worker_assignments || typeof worker_assignments !== 'object') {
      return res.status(400).json({ error: 'worker_assignments object is required' });
    }

    // Validate total assigned <= workable population.
    // EXCEPTION: if the fief is already over-assigned (e.g. pop died), allow requests
    // that reduce the total, so players can dig their way back to a valid state.
    const fiefRow = await pool.query('SELECT population, worker_assignments FROM fiefs WHERE id = $1', [req.params.id]);
    if (!fiefRow.rows[0]) return res.status(404).json({ error: 'Fief not found' });
    const pop = fiefRow.rows[0].population || 0;
    const workable = getWorkablePopulation(pop);
    const totalAssigned = Object.values(worker_assignments).reduce((s, v) => s + Math.max(0, Number(v) || 0), 0);
    const currentWa = fiefRow.rows[0].worker_assignments || {};
    const currentTotal = Object.values(currentWa).reduce((s, v) => s + Math.max(0, Number(v) || 0), 0);
    // Block only if the new total exceeds workable AND is not a reduction from the current total
    if (totalAssigned > workable && totalAssigned >= currentTotal) {
      return res.status(400).json({ error: `Cannot assign ${totalAssigned} workers — only ${workable} are workable from ${pop} population.` });
    }

    // Sanitise: only allow non-negative integers for known resources (including research)
    const safe = { gold: 0, food: 0, wood: 0, stone: 0, research: 0 };
    for (const res of Object.keys(safe)) {
      safe[res] = Math.max(0, Math.floor(Number(worker_assignments[res]) || 0));
    }

    const fief = await Fief.updateWorkerAssignments(req.params.id, safe);
    const io = req.app.get('io');
    if (io) {
      const kInfo = await getKingdomForFief(req.params.id);
      if (kInfo) io.to(`campaign_${kInfo.campaign_id}`).emit('kingdomDataChanged', { campaignId: kInfo.campaign_id, kingdomId: kInfo.kingdom_id });
    }
    res.json(fief);
  } catch (error) {
    console.error('Error updating worker assignments:', error);
    res.status(500).json({ error: 'Failed to update worker assignments' });
  }
});

// Tier upgrade costs: gold, wood, stone per current tier (no food — food is survival resource)
// Tiers 2→10 scale at ×2 per step. Tier 1→2 is intentionally cheap (tutorial). Days unchanged.
// Tier upgrade costs tuned for ~100d T1, ~200d T2, ~400d T3, ~800d T4 etc.
// Stone removed from T1→T2 (stone can't be mined until tier 2).
const TIER_UPGRADE_COSTS = [
  null,
  { gold:    200, wood:   150, stone:     0,  days:  14 }, // 1 → 2
  { gold:   1500, wood:  1200, stone:   800,  days:  20 }, // 2 → 3
  { gold:   4000, wood:  3000, stone:  2000,  days:  28 }, // 3 → 4
  { gold:   9000, wood:  7000, stone:  5000,  days:  38 }, // 4 → 5
  { gold:  20000, wood: 16000, stone: 12000,  days:  52 }, // 5 → 6
  { gold:  42000, wood: 34000, stone: 25000,  days:  68 }, // 6 → 7
  { gold:  85000, wood: 68000, stone: 50000,  days:  88 }, // 7 → 8
  { gold: 170000, wood:135000, stone:100000,  days: 114 }, // 8 → 9
  { gold: 340000, wood:270000, stone:200000,  days: 148 }, // 9 → 10
];

// POST upgrade fief tier
router.post('/fiefs/:id/upgrade-tier', authenticateToken, async (req, res) => {
  try {
    const fiefRow = await pool.query('SELECT f.*, k.id AS k_id, k.campaign_id FROM fiefs f JOIN kingdoms k ON f.kingdom_id = k.id WHERE f.id = $1', [req.params.id]);
    if (!fiefRow.rows[0]) return res.status(404).json({ error: 'Fief not found' });
    const fief = fiefRow.rows[0];

    if ((fief.tier_upgrade_days_remaining || 0) > 0) {
      return res.status(400).json({ error: `Upgrade already in progress (${fief.tier_upgrade_days_remaining} days remaining).` });
    }
    const currentTier = fief.tier || 1;
    if (currentTier >= 10) return res.status(400).json({ error: 'Already at maximum tier.' });

    const cost = TIER_UPGRADE_COSTS[currentTier];
    // Deduct from fief resources (where players accumulate resources via workers)
    const fiefRes = fief.resources || { gold: 0, food: 0, wood: 0, stone: 0 };
    const insufficient = ['gold','wood','stone'].filter(r => (fiefRes[r] ?? 0) < cost[r]);
    if (insufficient.length > 0) {
      const lacking = insufficient.map(r => `${cost[r]} ${r} (have ${fiefRes[r] ?? 0})`).join(', ');
      return res.status(400).json({ error: `Insufficient fief resources. Need: ${lacking}` });
    }

    // Deduct from fief
    const newFiefRes = { ...fiefRes };
    for (const r of ['gold','wood','stone']) newFiefRes[r] = (newFiefRes[r] ?? 0) - cost[r];
    await pool.query('UPDATE fiefs SET resources = $1 WHERE id = $2', [JSON.stringify(newFiefRes), req.params.id]);

    // Start upgrade timer (tier increments when timer expires in advanceDays)
    const updated = await Fief.startTierUpgrade(req.params.id, cost.days);

    // Log event
    const campResult = await pool.query('SELECT current_day FROM campaigns WHERE id = $1', [fief.campaign_id]);
    const day = campResult.rows[0]?.current_day || 1;
    await FiefEventLog.create({
      fief_id: req.params.id,
      campaign_day: day,
      event_type: 'building_started',
      title: `Tier upgrade started: Tier ${currentTier} → ${currentTier + 1} (${cost.days} days)`,
      details: { fromTier: currentTier, toTier: currentTier + 1, cost, daysRequired: cost.days },
    });

    const io = req.app.get('io');
    if (io) io.to(`campaign_${fief.campaign_id}`).emit('kingdomDataChanged', { campaignId: fief.campaign_id, kingdomId: fief.kingdom_id });
    res.json(updated);
  } catch (error) {
    console.error('Error upgrading fief tier:', error);
    res.status(500).json({ error: 'Failed to upgrade fief tier' });
  }
});

// ── Buildings ─────────────────────────────────────────────────────────────────

// POST start construction of a building
router.post('/fiefs/:id/buildings', authenticateToken, async (req, res) => {
  try {
    const { name, building_type, level, description, construction_days, resource_output, resource_cost } = req.body;
    if (!name || !building_type || !construction_days) {
      return res.status(400).json({ error: 'name, building_type, and construction_days are required' });
    }
    // Determine queue position for this new building
    const queueCountResult = await pool.query(
      `SELECT COALESCE(MAX(queue_position), 0) AS max_pos FROM fief_buildings WHERE fief_id = $1 AND is_complete = false`,
      [req.params.id]
    );
    const nextQueuePos = (queueCountResult.rows[0]?.max_pos || 0) + 1;
    const tierUpgradeRow = await pool.query(`SELECT tier_upgrade_days_remaining FROM fiefs WHERE id = $1`, [req.params.id]);
    const tierUpgradeActive = (tierUpgradeRow.rows[0]?.tier_upgrade_days_remaining || 0) > 0;
    // If tier upgrade is active, queue behind it (tier upgrade occupies the slot)
    const assignedPos = tierUpgradeActive ? nextQueuePos : nextQueuePos;

    const { building, updatedResources } = await FiefBuilding.create({
      fief_id: req.params.id,
      name,
      building_type,
      level: level || 1,
      description: description || '',
      construction_days,
      resource_output: resource_output || {},
      resource_cost: resource_cost || {},
      queue_position: assignedPos,
    });

    // Log building started (need campaign_day)
    const fiefResult = await pool.query(
      `SELECT f.id, k.campaign_id FROM fiefs f JOIN kingdoms k ON f.kingdom_id = k.id WHERE f.id = $1`,
      [req.params.id]
    );
    if (fiefResult.rows[0]) {
      const campResult = await pool.query(
        `SELECT current_day FROM campaigns WHERE id = $1`,
        [fiefResult.rows[0].campaign_id]
      );
      const day = campResult.rows[0]?.current_day || 1;
      await FiefEventLog.create({
        fief_id: req.params.id,
        campaign_day: day,
        event_type: 'building_started',
        title: `Construction started: ${name} (Lv${level || 1})`,
        details: { buildingName: name, level: level || 1, type: building_type, cost: resource_cost, daysRequired: construction_days },
      });
    }

    const io = req.app.get('io');
    if (io) {
      const kInfo = await getKingdomForFief(req.params.id);
      if (kInfo) io.to(`campaign_${kInfo.campaign_id}`).emit('kingdomDataChanged', { campaignId: kInfo.campaign_id, kingdomId: kInfo.kingdom_id });
    }
    res.status(201).json({ building, updatedResources });
  } catch (error) {
    if (error.message.startsWith('Insufficient')) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error starting construction:', error);
    res.status(500).json({ error: 'Failed to start construction' });
  }
});

// POST start building upgrade
router.post('/fiefs/:id/buildings/:buildingId/upgrade', authenticateToken, async (req, res) => {
  try {
    const { upgrade_cost, construction_days, new_resource_output } = req.body;
    const { upgradeBuilding, updatedResources } = await FiefBuilding.startUpgrade({
      fief_id: req.params.id,
      parent_building_id: req.params.buildingId,
      upgrade_cost: upgrade_cost || {},
      construction_days,
      new_resource_output: new_resource_output ?? null,
    });

    const fiefResult = await pool.query(
      `SELECT f.id, k.campaign_id FROM fiefs f JOIN kingdoms k ON f.kingdom_id = k.id WHERE f.id = $1`,
      [req.params.id]
    );
    if (fiefResult.rows[0]) {
      const campResult = await pool.query(
        `SELECT current_day FROM campaigns WHERE id = $1`,
        [fiefResult.rows[0].campaign_id]
      );
      const day = campResult.rows[0]?.current_day || 1;
      await FiefEventLog.create({
        fief_id: req.params.id,
        campaign_day: day,
        event_type: 'building_started',
        title: `Upgrade started: ${upgradeBuilding.name} → Lv${upgradeBuilding.level}`,
        details: { buildingName: upgradeBuilding.name, level: upgradeBuilding.level, cost: upgrade_cost },
      });
    }

    const io = req.app.get('io');
    if (io) {
      const kInfo = await getKingdomForFief(req.params.id);
      if (kInfo) io.to(`campaign_${kInfo.campaign_id}`).emit('kingdomDataChanged', { campaignId: kInfo.campaign_id, kingdomId: kInfo.kingdom_id });
    }
    res.status(201).json({ upgradeBuilding, updatedResources });
  } catch (error) {
    if (error.message.startsWith('Insufficient') || error.message.includes('must be complete') || error.message.includes('already in progress')) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error starting upgrade:', error);
    res.status(500).json({ error: 'Failed to start upgrade' });
  }
});

// DELETE building
router.delete('/fiefs/:id/buildings/:buildingId', authenticateToken, async (req, res) => {
  try {
    await FiefBuilding.delete(req.params.buildingId);
    const io = req.app.get('io');
    if (io) {
      const kInfo = await getKingdomForFief(req.params.id);
      if (kInfo) io.to(`campaign_${kInfo.campaign_id}`).emit('kingdomDataChanged', { campaignId: kInfo.campaign_id, kingdomId: kInfo.kingdom_id });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete building' });
  }
});

// ── Event Log ─────────────────────────────────────────────────────────────────
router.get('/fiefs/:id/log', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const log = await FiefEventLog.findByFief(req.params.id, page, limit);
    res.json(log);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch event log' });
  }
});

// ── Disasters ─────────────────────────────────────────────────────────────────

// resolve_cost: what the DM must spend to end the active disaster
// daily_damage: per-day resource/population drain while active
const DISASTERS = {
  // Natural
  tornado:         { name: 'Tornado',        category: 'Natural',      resolve_cost: { gold: 300, wood: 200 },              daily_damage: { wood: 20 },                       effects: { destroyRandom: 2 } },
  flood:           { name: 'Flood',          category: 'Natural',      resolve_cost: { gold: 200, food: 150 },              daily_damage: { food: 30, wood: 15 },              effects: { resourcePct: { food: -0.5, wood: -0.5 } } },
  earthquake:      { name: 'Earthquake',     category: 'Natural',      resolve_cost: { gold: 500, stone: 300 },             daily_damage: { stone: 20 },                       effects: { destroyTypes: ['Walls', 'Watchtower'], fallbackDestroyRandom: 1 } },
  drought:         { name: 'Drought',        category: 'Natural',      resolve_cost: { gold: 250, food: 200 },              daily_damage: { food: 40 },                        effects: { resourcePct: { food: -0.6 } } },
  wildfire:        { name: 'Wildfire',       category: 'Natural',      resolve_cost: { gold: 350, wood: 250 },              daily_damage: { wood: 35, food: 15 },              effects: { destroyTypes: ['Lumber Camp', 'Farm'], resourcePct: { wood: -0.7 } } },
  // Social
  famine:          { name: 'Famine',         category: 'Social',       resolve_cost: { gold: 400, food: 500 },              daily_damage: { food: 50, population: 5 },         effects: { populationPct: -0.2, resourcePct: { food: -0.8 } } },
  plague:          { name: 'Plague',         category: 'Social',       resolve_cost: { gold: 600 },                         daily_damage: { population: 10 },                  effects: { populationPct: -0.3, statsFlat: { stability: -3 } } },
  rebel_uprising:  { name: 'Rebel Uprising', category: 'Social',       resolve_cost: { gold: 800 },                         daily_damage: { gold: 20, population: 3 },         effects: { statsFlat: { military: -3, stability: -4 }, resourcePct: { gold: -0.4 } } },
  tax_revolt:      { name: 'Tax Revolt',     category: 'Social',       resolve_cost: { gold: 700 },                         daily_damage: { gold: 30 },                        effects: { statsFlat: { economy: -3 }, resourcePct: { gold: -0.6 } } },
  // Magical
  dragon_attack:   { name: 'Dragon Attack',  category: 'Magical',      resolve_cost: { gold: 1500, stone: 500 },            daily_damage: { gold: 50, population: 20 },        effects: { destroyRandom: 2, populationPct: -0.15, resourcePct: { gold: -0.5 } } },
  curse:           { name: 'Curse',          category: 'Magical',      resolve_cost: { gold: 900 },                         daily_damage: { gold: 15 },                        effects: { statsFlat: { economy: -2, military: -2, stability: -2 } } },
  undead_invasion: { name: 'Undead Invasion',category: 'Magical',      resolve_cost: { gold: 1200, stone: 400 },            daily_damage: { population: 15, gold: 25 },        effects: { statsFlat: { military: -5 }, populationPct: -0.25 } },
  // Environmental
  blight:          { name: 'Blight',         category: 'Environmental', resolve_cost: { gold: 300, food: 200 },             daily_damage: { food: 25 },                        effects: { tempModifier: { buildingType: 'Farm', modifier: { food: 0.5 }, days: 5 } } },
  rockslide:       { name: 'Rockslide',      category: 'Environmental', resolve_cost: { gold: 400, stone: 250 },            daily_damage: { stone: 25 },                       effects: { destroyTypes: ['Mine', 'Ore Mine'] } },
  storm:           { name: 'Storm',          category: 'Environmental', resolve_cost: { gold: 350, wood: 200 },             daily_damage: { gold: 20, wood: 20 },              effects: { conditionalResourcePct: { requiresType: 'Docks', resource: 'gold', pct: -0.5 } } },
};

router.post('/fiefs/:id/disaster', authenticateToken, async (req, res) => {
  try {
    const { disasterId } = req.body;
    const disaster = DISASTERS[disasterId];
    if (!disaster) return res.status(400).json({ error: 'Unknown disaster' });

    const fiefId = req.params.id;

    // Load fief + campaign day
    const fiefResult = await pool.query(
      `SELECT f.*, k.id AS kingdom_id, k.campaign_id
       FROM fiefs f JOIN kingdoms k ON f.kingdom_id = k.id
       WHERE f.id = $1`,
      [fiefId]
    );
    if (!fiefResult.rows[0]) return res.status(404).json({ error: 'Fief not found' });
    let fief = fiefResult.rows[0];
    const campResult = await pool.query(`SELECT current_day FROM campaigns WHERE id = $1`, [fief.campaign_id]);
    const day = campResult.rows[0]?.current_day || 1;

    const { effects } = disaster;
    const resources = { ...(fief.resources || { gold: 0, food: 0, wood: 0, stone: 0 }) };
    const stats = { ...(fief.stats || { economy: 5, military: 5, stability: 5 }) };
    let population = fief.population || 0;
    const destroyedBuildings = [];

    // Apply resource percentage losses
    if (effects.resourcePct) {
      for (const [res, pct] of Object.entries(effects.resourcePct)) {
        resources[res] = Math.max(0, Math.floor((resources[res] || 0) * (1 + pct)));
      }
    }

    // Apply flat stat changes (clamped 1-10)
    if (effects.statsFlat) {
      for (const [stat, delta] of Object.entries(effects.statsFlat)) {
        stats[stat] = Math.max(1, Math.min(10, (stats[stat] || 5) + delta));
      }
    }

    // Population percentage loss
    if (effects.populationPct) {
      const loss = Math.floor(population * Math.abs(effects.populationPct));
      population = Math.max(0, population - loss);
    }

    // Destroy buildings of specific types (first match)
    if (effects.destroyTypes && effects.destroyTypes.length) {
      for (const typeName of effects.destroyTypes) {
        const bRes = await pool.query(
          `SELECT id, name FROM fief_buildings WHERE fief_id = $1 AND (name ILIKE $2 OR building_type ILIKE $2) AND is_complete = true LIMIT 1`,
          [fiefId, `%${typeName}%`]
        );
        for (const b of bRes.rows) {
          await pool.query(`DELETE FROM fief_buildings WHERE id = $1`, [b.id]);
          destroyedBuildings.push(b.name);
        }
      }
    }

    // Fallback destroy random
    if (effects.fallbackDestroyRandom && destroyedBuildings.length === 0) {
      const rndRes = await pool.query(
        `SELECT id, name FROM fief_buildings WHERE fief_id = $1 AND is_complete = true ORDER BY RANDOM() LIMIT $2`,
        [fiefId, effects.fallbackDestroyRandom]
      );
      for (const b of rndRes.rows) {
        await pool.query(`DELETE FROM fief_buildings WHERE id = $1`, [b.id]);
        destroyedBuildings.push(b.name);
      }
    }

    // Destroy N random buildings
    if (effects.destroyRandom) {
      const rndRes = await pool.query(
        `SELECT id, name FROM fief_buildings WHERE fief_id = $1 AND is_complete = true ORDER BY RANDOM() LIMIT $2`,
        [fiefId, effects.destroyRandom]
      );
      for (const b of rndRes.rows) {
        await pool.query(`DELETE FROM fief_buildings WHERE id = $1`, [b.id]);
        destroyedBuildings.push(b.name);
      }
    }

    // Conditional resource penalty (e.g. Storm needs Docks)
    if (effects.conditionalResourcePct) {
      const { requiresType, resource, pct } = effects.conditionalResourcePct;
      const has = await pool.query(
        `SELECT 1 FROM fief_buildings WHERE fief_id = $1 AND (name ILIKE $2 OR building_type ILIKE $2) AND is_complete = true LIMIT 1`,
        [fiefId, `%${requiresType}%`]
      );
      if (has.rows.length > 0) {
        resources[resource] = Math.max(0, Math.floor((resources[resource] || 0) * (1 + pct)));
      }
    }

    // Temporary output modifier (Blight)
    if (effects.tempModifier) {
      const { buildingType, modifier, days: modDays } = effects.tempModifier;
      await FiefBuilding.applyTempModifier(fiefId, buildingType, modifier, modDays);
    }

    // Persist changes + push to active_disasters JSONB
    const activeDisasters = Array.isArray(fief.active_disasters) ? fief.active_disasters : [];
    // Avoid duplicates — if same disaster type already active, skip adding again
    if (!activeDisasters.some(d => d.disaster_id === disasterId)) {
      activeDisasters.push({
        uid: `${disasterId}_${Date.now()}`,
        disaster_id: disasterId,
        name: disaster.name,
        category: disaster.category,
        day_started: day,
        daily_damage: disaster.daily_damage || {},
        resolve_cost: disaster.resolve_cost || {},
      });
    }
    await pool.query(`UPDATE fiefs SET resources = $1, stats = $2, population = $3, active_disasters = $4 WHERE id = $5`, [
      JSON.stringify(resources), JSON.stringify(stats), population, JSON.stringify(activeDisasters), fiefId
    ]);

    // Create kingdom event record
    const eventDesc = destroyedBuildings.length
      ? `${disaster.name} struck! Buildings destroyed: ${destroyedBuildings.join(', ')}.`
      : `${disaster.name} struck!`;
    await KingdomEvent.create({
      kingdom_id: fief.kingdom_id,
      fief_id: fiefId,
      title: `⚠️ ${disaster.name}`,
      description: eventDesc,
      event_type: 'disaster',
      severity: 'high',
      created_by: req.user.id,
    });

    // Log to fief event log
    await FiefEventLog.create({
      fief_id: fiefId,
      campaign_day: day,
      event_type: 'disaster',
      title: `Disaster: ${disaster.name}`,
      details: { disaster: disaster.name, category: disaster.category, destroyedBuildings, resourcesAfter: resources, statsAfter: stats, populationAfter: population },
    });

    // Return updated fief
    const io = req.app.get('io');
    if (io) io.to(`campaign_${fief.campaign_id}`).emit('kingdomDataChanged', { campaignId: fief.campaign_id, kingdomId: fief.kingdom_id });
    const updatedFief = await Fief.findByIdFull(fiefId);
    res.json(updatedFief);
  } catch (error) {
    console.error('Error applying disaster:', error);
    res.status(500).json({ error: 'Failed to apply disaster' });
  }
});

// ── Disaster Resolve ─────────────────────────────────────────────────────────

// POST /fiefs/:id/disasters/:uid/resolve — DM spends resources to end an active disaster
router.post('/fiefs/:id/disasters/:uid/resolve', authenticateToken, async (req, res) => {
  try {
    const fiefId = req.params.id;
    const uid = req.params.uid;

    const fiefRow = await pool.query(
      `SELECT f.*, k.id AS kingdom_id, k.campaign_id FROM fiefs f JOIN kingdoms k ON f.kingdom_id = k.id WHERE f.id = $1`,
      [fiefId]
    );
    if (!fiefRow.rows[0]) return res.status(404).json({ error: 'Fief not found' });
    const fief = fiefRow.rows[0];
    const activeDisasters = Array.isArray(fief.active_disasters) ? fief.active_disasters : [];
    const idx = activeDisasters.findIndex(d => d.uid === uid);
    if (idx === -1) return res.status(404).json({ error: 'Active disaster not found' });

    const disaster = activeDisasters[idx];
    const resolveCost = disaster.resolve_cost || {};
    const resources = { ...(fief.resources || { gold: 0, food: 0, wood: 0, stone: 0 }) };

    // Check sufficient resources
    for (const [res, cost] of Object.entries(resolveCost)) {
      if ((resources[res] || 0) < cost) {
        return res.status(400).json({ error: `Insufficient ${res} to resolve disaster (need ${cost}, have ${resources[res] || 0})` });
      }
    }

    // Deduct resources
    for (const [res, cost] of Object.entries(resolveCost)) {
      resources[res] = (resources[res] || 0) - cost;
    }

    // Remove disaster from active list
    activeDisasters.splice(idx, 1);
    await pool.query(`UPDATE fiefs SET resources = $1, active_disasters = $2 WHERE id = $3`, [
      JSON.stringify(resources), JSON.stringify(activeDisasters), fiefId
    ]);

    const campResult = await pool.query(`SELECT current_day FROM campaigns WHERE id = $1`, [fief.campaign_id]);
    const day = campResult.rows[0]?.current_day || 1;
    await FiefEventLog.create({
      fief_id: fiefId,
      campaign_day: day,
      event_type: 'disaster_resolved',
      title: `Disaster Resolved: ${disaster.name}`,
      details: { disaster: disaster.name, resolveCost, resourcesAfter: resources },
    });

    const io = req.app.get('io');
    if (io) io.to(`campaign_${fief.campaign_id}`).emit('kingdomDataChanged', { campaignId: fief.campaign_id, kingdomId: fief.kingdom_id });
    const updatedFief = await Fief.findByIdFull(fiefId);
    res.json(updatedFief);
  } catch (error) {
    console.error('Error resolving disaster:', error);
    res.status(500).json({ error: 'Failed to resolve disaster' });
  }
});

// ── Positive Events (DM only) ─────────────────────────────────────────────────

const POSITIVE_EVENTS = {
  harvest_blessing: {
    name: 'Harvest Blessing',
    description: 'A blessed harvest season fills the granaries.',
    apply: (resources, population) => {
      resources.food = (resources.food || 0) + 400;
      resources.wood = (resources.wood || 0) + 200;
      return { resources, population };
    },
  },
  gold_windfall: {
    name: 'Gold Windfall',
    description: 'A merchant caravan brings unexpected wealth.',
    apply: (resources, population) => {
      resources.gold = (resources.gold || 0) + 500;
      return { resources, population };
    },
  },
  pop_boom: {
    name: 'Population Boom',
    description: 'A wave of settlers arrives, swelling the population.',
    apply: (resources, population) => {
      population = Math.floor(population * 1.15) + 50;
      return { resources, population };
    },
  },
  divine_protection: {
    name: 'Divine Protection',
    description: 'The gods smile upon this land — all resources increased.',
    apply: (resources, population) => {
      resources.gold  = Math.floor((resources.gold  || 0) * 1.2) + 100;
      resources.food  = Math.floor((resources.food  || 0) * 1.2) + 100;
      resources.wood  = Math.floor((resources.wood  || 0) * 1.2) + 100;
      resources.stone = Math.floor((resources.stone || 0) * 1.2) + 50;
      return { resources, population };
    },
  },
};

// GET /fiefs/positive-events — list available positive events
router.get('/fiefs/positive-events', authenticateToken, (req, res) => {
  const list = Object.entries(POSITIVE_EVENTS).map(([id, ev]) => ({
    id,
    name: ev.name,
    description: ev.description,
  }));
  res.json(list);
});

// POST /fiefs/:id/positive-event — DM applies a positive event
router.post('/fiefs/:id/positive-event', authenticateToken, async (req, res) => {
  try {
    const { eventId } = req.body;
    const event = POSITIVE_EVENTS[eventId];
    if (!event) return res.status(400).json({ error: 'Unknown positive event' });

    const fiefId = req.params.id;
    const fiefRow = await pool.query(
      `SELECT f.*, k.id AS kingdom_id, k.campaign_id FROM fiefs f JOIN kingdoms k ON f.kingdom_id = k.id WHERE f.id = $1`,
      [fiefId]
    );
    if (!fiefRow.rows[0]) return res.status(404).json({ error: 'Fief not found' });
    const fief = fiefRow.rows[0];

    let resources = { ...(fief.resources || { gold: 0, food: 0, wood: 0, stone: 0 }) };
    let population = fief.population || 0;
    const result = event.apply(resources, population);
    resources = result.resources;
    population = result.population;

    await pool.query(`UPDATE fiefs SET resources = $1, population = $2 WHERE id = $3`, [
      JSON.stringify(resources), population, fiefId
    ]);

    const campResult = await pool.query(`SELECT current_day FROM campaigns WHERE id = $1`, [fief.campaign_id]);
    const day = campResult.rows[0]?.current_day || 1;
    await FiefEventLog.create({
      fief_id: fiefId,
      campaign_day: day,
      event_type: 'positive_event',
      title: `✨ ${event.name}`,
      details: { event: event.name, description: event.description, resourcesAfter: resources, populationAfter: population },
    });

    await KingdomEvent.create({
      kingdom_id: fief.kingdom_id,
      fief_id: fiefId,
      title: `✨ ${event.name}`,
      description: event.description,
      event_type: 'positive',
      severity: 'low',
      created_by: req.user.id,
    });

    const io = req.app.get('io');
    if (io) io.to(`campaign_${fief.campaign_id}`).emit('kingdomDataChanged', { campaignId: fief.campaign_id, kingdomId: fief.kingdom_id });
    const updatedFief = await Fief.findByIdFull(fiefId);
    res.json(updatedFief);
  } catch (error) {
    console.error('Error applying positive event:', error);
    res.status(500).json({ error: 'Failed to apply positive event' });
  }
});

// ── Build Queue Management ────────────────────────────────────────────────────

// POST /fiefs/:id/buildings/:buildingId/prioritize — move building to queue position 1
router.post('/fiefs/:id/buildings/:buildingId/prioritize', authenticateToken, async (req, res) => {
  try {
    const fiefId = req.params.id;
    const buildingId = req.params.buildingId;

    // Load all incomplete buildings for this fief ordered by queue_position
    const qRes = await pool.query(
      `SELECT id, queue_position FROM fief_buildings WHERE fief_id = $1 AND is_complete = false ORDER BY queue_position ASC NULLS LAST`,
      [fiefId]
    );
    const rows = qRes.rows;
    const target = rows.find(r => String(r.id) === String(buildingId));
    if (!target) return res.status(404).json({ error: 'Building not found in queue' });

    // Shift all buildings with position < target up by 1, then set target to 1
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const r of rows) {
        if (r.id !== target.id && r.queue_position < target.queue_position) {
          await client.query(`UPDATE fief_buildings SET queue_position = $1 WHERE id = $2`, [r.queue_position + 1, r.id]);
        }
      }
      await client.query(`UPDATE fief_buildings SET queue_position = 1 WHERE id = $1`, [buildingId]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    const fiefResult = await pool.query(`SELECT kingdom_id FROM fiefs WHERE id = $1`, [fiefId]);
    const fiefRow2 = fiefResult.rows[0];
    const campResult = await pool.query(`SELECT campaign_id FROM kingdoms WHERE id = $1`, [fiefRow2?.kingdom_id]);
    const io = req.app.get('io');
    if (io && campResult.rows[0]) io.to(`campaign_${campResult.rows[0].campaign_id}`).emit('kingdomDataChanged', {});
    const updatedFief = await Fief.findByIdFull(fiefId);
    res.json(updatedFief);
  } catch (error) {
    console.error('Error prioritizing build:', error);
    res.status(500).json({ error: 'Failed to prioritize building' });
  }
});

// POST /fiefs/:id/buildings/:buildingId/pause — move building to end of queue
router.post('/fiefs/:id/buildings/:buildingId/pause', authenticateToken, async (req, res) => {
  try {
    const fiefId = req.params.id;
    const buildingId = req.params.buildingId;

    const qRes = await pool.query(
      `SELECT id, queue_position FROM fief_buildings WHERE fief_id = $1 AND is_complete = false ORDER BY queue_position ASC NULLS LAST`,
      [fiefId]
    );
    const rows = qRes.rows;
    const target = rows.find(r => String(r.id) === String(buildingId));
    if (!target) return res.status(404).json({ error: 'Building not found in queue' });
    if (target.queue_position === rows.length) return res.json(await Fief.findByIdFull(fiefId)); // already last

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const r of rows) {
        if (r.id !== target.id && r.queue_position > target.queue_position) {
          await client.query(`UPDATE fief_buildings SET queue_position = $1 WHERE id = $2`, [r.queue_position - 1, r.id]);
        }
      }
      await client.query(`UPDATE fief_buildings SET queue_position = $1 WHERE id = $2`, [rows.length, buildingId]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    const updatedFief = await Fief.findByIdFull(fiefId);
    res.json(updatedFief);
  } catch (error) {
    console.error('Error pausing build:', error);
    res.status(500).json({ error: 'Failed to pause building' });
  }
});

// ── Research Routes ───────────────────────────────────────────────────────────

// GET /fiefs/:id/research — queue, completed, and levels
router.get('/fiefs/:id/research', authenticateToken, async (req, res) => {
  try {
    const fiefId = req.params.id;
    const queueRes = await pool.query(
      `SELECT * FROM fief_research_queue WHERE fief_id = $1 ORDER BY queue_position ASC NULLS LAST`,
      [fiefId]
    );
    const levelsRes = await pool.query(
      `SELECT building_type, level FROM fief_research_levels WHERE fief_id = $1`,
      [fiefId]
    );
    res.json({ queue: queueRes.rows, completedLevels: levelsRes.rows });
  } catch (error) {
    console.error('Error fetching research:', error);
    res.status(500).json({ error: 'Failed to fetch research' });
  }
});

// POST /fiefs/:id/research/start — add a research item to the queue
// body: { research_id: 'farm_lv2' }
const VALID_RESEARCH_IDS = new Set([
  'campfire_lv2','campfire_lv3',
  'hunting_ground_lv2','hunting_ground_lv3',
  'basic_storage_lv2','basic_storage_lv3',
  'housing_lv2','housing_lv3','housing_lv4','housing_lv5',
  'watchtower_lv2','watchtower_lv3',
  'farm_lv2','farm_lv3','farm_lv4','farm_lv5',
  'lumber_camp_lv2','lumber_camp_lv3','lumber_camp_lv4','lumber_camp_lv5',
  'basic_mine_lv2','basic_mine_lv3','basic_mine_lv4','basic_mine_lv5',
  'tavern_lv2','tavern_lv3','tavern_lv4','tavern_lv5',
  'chapel_lv2','chapel_lv3','chapel_lv4','chapel_lv5',
  'research_lab_lv2','research_lab_lv3','research_lab_lv4','research_lab_lv5',
  'mill_lv2','mill_lv3','mill_lv4','mill_lv5',
  'market_stall_lv2','market_stall_lv3','market_stall_lv4','market_stall_lv5',
  'blacksmith_lv2','blacksmith_lv3','blacksmith_lv4','blacksmith_lv5',
  'barracks_lv2','barracks_lv3','barracks_lv4','barracks_lv5',
  'ore_mine_lv2','ore_mine_lv3','ore_mine_lv4','ore_mine_lv5',
  'stable_lv2','stable_lv3','stable_lv4','stable_lv5',
  'school_lv2','school_lv3','school_lv4',
  'shrine_lv2','shrine_lv3','shrine_lv4',
  'workshop_lv2','workshop_lv3','workshop_lv4','workshop_lv5',
  'inn_lv2','inn_lv3','inn_lv4','inn_lv5',
  'library_lv2','library_lv3','library_lv4',
  'guard_post_lv2','guard_post_lv3','guard_post_lv4',
  'thieves_guild_lv2','thieves_guild_lv3','thieves_guild_lv4',
  'siege_workshop_lv2','siege_workshop_lv3','siege_workshop_lv4',
  'bank_lv2','bank_lv3','bank_lv4','bank_lv5',
  'alchemist_lv2','alchemist_lv3','alchemist_lv4',
  'armoury_lv2','armoury_lv3','armoury_lv4','armoury_lv5',
  'mason_lv2','mason_lv3','mason_lv4','mason_lv5',
  'monastery_lv2','monastery_lv3','monastery_lv4',
  'academy_lv2','academy_lv3','academy_lv4',
  'docks_lv2','docks_lv3','docks_lv4','docks_lv5',
  'grand_market_lv2','grand_market_lv3','grand_market_lv4','grand_market_lv5',
  'mage_tower_lv2','mage_tower_lv3','mage_tower_lv4',
  'hospital_lv2','hospital_lv3','hospital_lv4',
  'imperial_mint_lv2','imperial_mint_lv3',
  'university_lv2','university_lv3','university_lv4',
]);
router.post('/fiefs/:id/research/start', authenticateToken, async (req, res) => {
  try {
    const fiefId = req.params.id;
    const { research_id } = req.body;
    if (!research_id) return res.status(400).json({ error: 'research_id required' });
    if (!VALID_RESEARCH_IDS.has(research_id)) return res.status(400).json({ error: 'Invalid research_id' });

    // Check not already queued or completed
    const existing = await pool.query(
      `SELECT id, status FROM fief_research_queue WHERE fief_id = $1 AND research_id = $2`,
      [fiefId, research_id]
    );
    if (existing.rows.some(r => r.status !== 'completed')) {
      return res.status(409).json({ error: 'Research already queued or in progress' });
    }

    const countRes = await pool.query(
      `SELECT COALESCE(MAX(queue_position), 0) AS max_pos FROM fief_research_queue WHERE fief_id = $1 AND status != 'completed'`,
      [fiefId]
    );
    const nextPos = (countRes.rows[0]?.max_pos || 0) + 1;
    const status = nextPos === 1 ? 'in_progress' : 'queued';

    const campRes = await pool.query(
      `SELECT c.current_day FROM fiefs f JOIN kingdoms k ON f.kingdom_id=k.id JOIN campaigns c ON k.campaign_id=c.id WHERE f.id=$1`,
      [fiefId]
    );
    const day = campRes.rows[0]?.current_day || 1;

    await pool.query(
      `INSERT INTO fief_research_queue (fief_id, research_id, status, queue_position, points_accumulated, campaign_day_started)
       VALUES ($1, $2, $3, $4, 0, $5)`,
      [fiefId, research_id, status, nextPos, day]
    );

    const updatedFief = await Fief.findByIdFull(fiefId);
    res.json(updatedFief);
  } catch (error) {
    console.error('Error starting research:', error);
    res.status(500).json({ error: 'Failed to start research' });
  }
});

// POST /fiefs/:id/research/:queueId/prioritize — promote research item to active slot
router.post('/fiefs/:id/research/:queueId/prioritize', authenticateToken, async (req, res) => {
  try {
    const fiefId = req.params.id;
    const queueId = req.params.queueId;

    const qRes = await pool.query(
      `SELECT id, queue_position FROM fief_research_queue WHERE fief_id = $1 AND status != 'completed' ORDER BY queue_position ASC NULLS LAST`,
      [fiefId]
    );
    const rows = qRes.rows;
    const target = rows.find(r => String(r.id) === String(queueId));
    if (!target) return res.status(404).json({ error: 'Research queue item not found' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const r of rows) {
        if (r.id !== target.id && r.queue_position < target.queue_position) {
          await client.query(`UPDATE fief_research_queue SET queue_position = $1, status = 'queued' WHERE id = $2`, [r.queue_position + 1, r.id]);
        }
      }
      await client.query(`UPDATE fief_research_queue SET queue_position = 1, status = 'in_progress' WHERE id = $1`, [queueId]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    const updatedFief = await Fief.findByIdFull(fiefId);
    res.json(updatedFief);
  } catch (error) {
    console.error('Error prioritizing research:', error);
    res.status(500).json({ error: 'Failed to prioritize research' });
  }
});

// POST /fiefs/:id/research/:queueId/pause — move research to end of queue
router.post('/fiefs/:id/research/:queueId/pause', authenticateToken, async (req, res) => {
  try {
    const fiefId = req.params.id;
    const queueId = req.params.queueId;

    const qRes = await pool.query(
      `SELECT id, queue_position FROM fief_research_queue WHERE fief_id = $1 AND status != 'completed' ORDER BY queue_position ASC NULLS LAST`,
      [fiefId]
    );
    const rows = qRes.rows;
    const target = rows.find(r => String(r.id) === String(queueId));
    if (!target) return res.status(404).json({ error: 'Research queue item not found' });
    if (target.queue_position === rows.length) return res.json(await Fief.findByIdFull(fiefId));

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const r of rows) {
        if (r.id !== target.id && r.queue_position > target.queue_position) {
          const newStatus = r.queue_position - 1 === 1 ? 'in_progress' : 'queued';
          await client.query(`UPDATE fief_research_queue SET queue_position = $1, status = $2 WHERE id = $3`, [r.queue_position - 1, newStatus, r.id]);
        }
      }
      await client.query(`UPDATE fief_research_queue SET queue_position = $1, status = 'queued' WHERE id = $2`, [rows.length, queueId]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    const updatedFief = await Fief.findByIdFull(fiefId);
    res.json(updatedFief);
  } catch (error) {
    console.error('Error pausing research:', error);
    res.status(500).json({ error: 'Failed to pause research' });
  }
});

// ── Garrison & Training ───────────────────────────────────────────────────────

const { UNIT_TEMPLATES, isTemplateUnlocked } = require('../utils/unitTemplates');

// GET /fiefs/:id/available-unit-types — returns all unlocked unit templates for this fief
router.get('/fiefs/:id/available-unit-types', authenticateToken, async (req, res) => {
  try {
    const fiefId = Number(req.params.id);
    const buildingsResult = await pool.query(
      `SELECT building_type, level FROM fief_buildings WHERE fief_id = $1 AND is_complete = true AND is_upgrade = false`,
      [fiefId]
    );
    const completedBuildings = buildingsResult.rows;
    const unlocked = Object.entries(UNIT_TEMPLATES)
      .filter(([name]) => isTemplateUnlocked(name, completedBuildings))
      .map(([name, tpl]) => ({ name, ...tpl }));
    res.json(unlocked);
  } catch (error) {
    console.error('Error fetching available unit types:', error);
    res.status(500).json({ error: 'Failed to fetch available unit types' });
  }
});

// POST /fiefs/:id/train — queue a training batch
// body: { unit_type: 'Spearman', count: 10, linked_army_id?: 5 }
router.post('/fiefs/:id/train', authenticateToken, async (req, res) => {
  try {
    const fiefId = Number(req.params.id);
    const { unit_type, count, linked_army_id } = req.body;
    if (!unit_type || !count || count < 1) return res.status(400).json({ error: 'unit_type and count (≥1) required' });

    const template = UNIT_TEMPLATES[unit_type];
    if (!template) return res.status(400).json({ error: `Unknown unit type: ${unit_type}` });

    const fiefRow = await pool.query(`SELECT * FROM fiefs WHERE id = $1`, [fiefId]);
    if (!fiefRow.rows[0]) return res.status(404).json({ error: 'Fief not found' });
    const fief = fiefRow.rows[0];

    // Check all building requirements are met (correct type AND level)
    const buildingsResult = await pool.query(
      `SELECT building_type, level FROM fief_buildings WHERE fief_id = $1 AND is_complete = true AND is_upgrade = false`,
      [fiefId]
    );
    const completedBuildings = buildingsResult.rows;
    for (const req of template.buildingRequirements) {
      const found = completedBuildings.find(b => b.building_type === req.type && b.level >= req.minLevel);
      if (!found) {
        const bName = req.type.replace(/_/g, ' ');
        return res.status(400).json({ error: `Requires ${bName} level ${req.minLevel} to train ${unit_type}` });
      }
    }

    // Validate linked_army_id belongs to the same campaign/player if provided
    if (linked_army_id) {
      const armyRow = await pool.query(`SELECT * FROM armies WHERE id = $1`, [linked_army_id]);
      if (!armyRow.rows[0]) return res.status(404).json({ error: 'Linked army not found' });
    }

    // Deduct resources (baseCost × count)
    const resources = fief.resources || { gold: 0, food: 0, wood: 0, stone: 0 };
    const totalCost = {};
    for (const [resourceKey, perUnit] of Object.entries(template.baseCost)) {
      totalCost[resourceKey] = perUnit * count;
      if ((resources[resourceKey] || 0) < totalCost[resourceKey]) {
        return res.status(400).json({ error: `Not enough ${resourceKey}: need ${totalCost[resourceKey]}, have ${resources[resourceKey] || 0}` });
      }
    }
    const newResources = { ...resources };
    for (const [resourceKey, cost] of Object.entries(totalCost)) newResources[resourceKey] -= cost;
    await pool.query(`UPDATE fiefs SET resources = $1 WHERE id = $2`, [JSON.stringify(newResources), fiefId]);

    // Get military stat for training time reduction
    const milStat = Math.max(1, Math.min(10, (fief.stats?.military || 1)));
    const milReduction = 1 - (milStat - 1) * 0.04; // up to -36% at mil 10
    const trainingDays = Math.max(1, Math.round(template.baseDays * count * milReduction));

    await pool.query(
      `INSERT INTO fief_training (fief_id, unit_type, count, training_days_required, days_remaining, resource_cost, tier, linked_army_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [fiefId, unit_type, count, trainingDays, trainingDays, JSON.stringify(totalCost), template.tier, linked_army_id || null]
    );

    const kInfo = await getKingdomForFief(fiefId);
    const io = req.app.get('io');
    if (io && kInfo) io.to(`campaign_${kInfo.campaign_id}`).emit('kingdomDataChanged', { campaignId: kInfo.campaign_id, kingdomId: kInfo.kingdom_id });

    const updatedFief = await Fief.findByIdFull(fiefId);
    res.json(updatedFief);
  } catch (error) {
    console.error('Error queuing training:', error);
    res.status(500).json({ error: 'Failed to queue training' });
  }
});

// DELETE /fiefs/:id/train/:trainId — cancel a training job (refund cost)
router.delete('/fiefs/:id/train/:trainId', authenticateToken, async (req, res) => {
  try {
    const fiefId = Number(req.params.id);
    const trainRow = await pool.query(`SELECT * FROM fief_training WHERE id = $1 AND fief_id = $2`, [req.params.trainId, fiefId]);
    if (!trainRow.rows[0]) return res.status(404).json({ error: 'Training job not found' });
    const job = trainRow.rows[0];

    // Refund resources
    const fiefRow = await pool.query(`SELECT resources FROM fiefs WHERE id = $1`, [fiefId]);
    const resources = fiefRow.rows[0]?.resources || {};
    const refunded = { ...resources };
    for (const [resourceKey, amt] of Object.entries(job.resource_cost || {})) {
      refunded[resourceKey] = (refunded[resourceKey] || 0) + Number(amt);
    }
    await pool.query(`UPDATE fiefs SET resources = $1 WHERE id = $2`, [JSON.stringify(refunded), fiefId]);
    await pool.query(`DELETE FROM fief_training WHERE id = $1`, [job.id]);

    const kInfo = await getKingdomForFief(fiefId);
    const io = req.app.get('io');
    if (io && kInfo) io.to(`campaign_${kInfo.campaign_id}`).emit('kingdomDataChanged', { campaignId: kInfo.campaign_id, kingdomId: kInfo.kingdom_id });

    const updatedFief = await Fief.findByIdFull(fiefId);
    res.json(updatedFief);
  } catch (error) {
    console.error('Error cancelling training:', error);
    res.status(500).json({ error: 'Failed to cancel training' });
  }
});

// PATCH /fiefs/:id/garrison — update garrison counts (any unit type key accepted)
router.patch('/fiefs/:id/garrison', authenticateToken, async (req, res) => {
  try {
    const fiefId = Number(req.params.id);
    const { garrison } = req.body;
    if (!garrison || typeof garrison !== 'object') return res.status(400).json({ error: 'garrison object required' });

    // Sanitize: only allow numeric values, any string key valid
    const safe = {};
    for (const [key, val] of Object.entries(garrison)) {
      safe[key] = Math.max(0, Math.floor(Number(val) || 0));
    }

    await pool.query(`UPDATE fiefs SET garrison = $1 WHERE id = $2`, [JSON.stringify(safe), fiefId]);
    const kInfo = await getKingdomForFief(fiefId);
    const io = req.app.get('io');
    if (io && kInfo) io.to(`campaign_${kInfo.campaign_id}`).emit('kingdomDataChanged', { campaignId: kInfo.campaign_id, kingdomId: kInfo.kingdom_id });

    const updatedFief = await Fief.findByIdFull(fiefId);
    res.json(updatedFief);
  } catch (error) {
    console.error('Error updating garrison:', error);
    res.status(500).json({ error: 'Failed to update garrison' });
  }
});

// POST /fiefs/:id/transfer-troops — move troops between fief garrison and player army
// body: { army_id, unit_type, amount, direction: 'to_garrison' | 'to_army' }
router.post('/fiefs/:id/transfer-troops', authenticateToken, async (req, res) => {
  try {
    const fiefId = Number(req.params.id);
    const { army_id, unit_type, amount, direction } = req.body;
    if (!army_id || !unit_type || !amount || amount < 1 || !['to_garrison','to_army'].includes(direction)) {
      return res.status(400).json({ error: 'army_id, unit_type, amount (≥1), and direction required' });
    }
    // unit_type can be any valid template name or legacy garrison key

    const fiefRow = await pool.query(`SELECT * FROM fiefs WHERE id = $1`, [fiefId]);
    if (!fiefRow.rows[0]) return res.status(404).json({ error: 'Fief not found' });
    const fief = fiefRow.rows[0];

    const armyRow = await pool.query(`SELECT * FROM armies WHERE id = $1`, [army_id]);
    if (!armyRow.rows[0]) return res.status(404).json({ error: 'Army not found' });
    const army = armyRow.rows[0];

    // Verify ownership (DM can always do this; player only if it's their army)
    const kInfo = await getKingdomForFief(fiefId);
    const isOwner = army.player_id === req.user.id;
    if (req.user.role !== 'Dungeon Master' && !isOwner) {
      return res.status(403).json({ error: 'You can only transfer troops from your own army' });
    }

    const garrison = fief.garrison || {};
    const troopsInGarrison = garrison[unit_type] || 0;
    const troopsInArmy = army.total_troops || 0;

    if (direction === 'to_garrison') {
      // Take from army, add to garrison — deduct from army total_troops
      if (troopsInArmy < amount) return res.status(400).json({ error: `Army only has ${troopsInArmy} troops` });
      garrison[unit_type] = troopsInGarrison + amount;
      await pool.query(`UPDATE fiefs SET garrison = $1 WHERE id = $2`, [JSON.stringify(garrison), fiefId]);
      await pool.query(`UPDATE armies SET total_troops = GREATEST(0, total_troops - $1) WHERE id = $2`, [amount, army_id]);
    } else {
      // to_army: take from garrison, add to army
      if (troopsInGarrison < amount) return res.status(400).json({ error: `Garrison only has ${troopsInGarrison} ${unit_type}` });
      garrison[unit_type] = troopsInGarrison - amount;
      await pool.query(`UPDATE fiefs SET garrison = $1 WHERE id = $2`, [JSON.stringify(garrison), fiefId]);
      await pool.query(`UPDATE armies SET total_troops = total_troops + $1 WHERE id = $2`, [amount, army_id]);
    }

    const io = req.app.get('io');
    if (io && kInfo) io.to(`campaign_${kInfo.campaign_id}`).emit('kingdomDataChanged', { campaignId: kInfo.campaign_id, kingdomId: kInfo.kingdom_id });

    const updatedFief = await Fief.findByIdFull(fiefId);
    const updatedArmy = await pool.query(`SELECT * FROM armies WHERE id = $1`, [army_id]);
    res.json({ fief: updatedFief, army: updatedArmy.rows[0] });
  } catch (error) {
    console.error('Error transferring troops:', error);
    res.status(500).json({ error: 'Failed to transfer troops' });
  }
});

module.exports = router;
