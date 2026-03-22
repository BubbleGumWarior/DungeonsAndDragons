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

    // Validate total assigned <= workable population
    const fiefRow = await pool.query('SELECT population FROM fiefs WHERE id = $1', [req.params.id]);
    if (!fiefRow.rows[0]) return res.status(404).json({ error: 'Fief not found' });
    const pop = fiefRow.rows[0].population || 0;
    const workable = getWorkablePopulation(pop);
    const totalAssigned = Object.values(worker_assignments).reduce((s, v) => s + Math.max(0, Number(v) || 0), 0);
    if (totalAssigned > workable) {
      return res.status(400).json({ error: `Cannot assign ${totalAssigned} workers — only ${workable} are workable from ${pop} population.` });
    }

    // Sanitise: only allow non-negative integers for known resources
    const safe = { gold: 0, food: 0, wood: 0, stone: 0 };
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
const TIER_UPGRADE_COSTS = [
  null,                                           // index 0 (unused)
  { gold:    100, wood:    80, stone:    60,  days:  14 }, // 1 → 2 (Camp → Hamlet)
  { gold:   1000, wood:   800, stone:   600,  days:  20 }, // 2 → 3  (×10 wall)
  { gold:   2000, wood:  1600, stone:  1200,  days:  28 }, // 3 → 4  (×2)
  { gold:   4000, wood:  3200, stone:  2400,  days:  38 }, // 4 → 5  (×2)
  { gold:   8000, wood:  6400, stone:  4800,  days:  52 }, // 5 → 6  (×2)
  { gold:  16000, wood: 12800, stone:  9600,  days:  68 }, // 6 → 7  (×2)
  { gold:  32000, wood: 25600, stone: 19200,  days:  88 }, // 7 → 8  (×2)
  { gold:  64000, wood: 51200, stone: 38400,  days: 114 }, // 8 → 9  (×2)
  { gold: 128000, wood:102400, stone: 76800,  days: 148 }, // 9 → 10 (×2)
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
    const { building, updatedResources } = await FiefBuilding.create({
      fief_id: req.params.id,
      name,
      building_type,
      level: level || 1,
      description: description || '',
      construction_days,
      resource_output: resource_output || {},
      resource_cost: resource_cost || {},
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

const DISASTERS = {
  // Natural
  tornado:         { name: 'Tornado',       category: 'Natural',     effects: { destroyRandom: 2 } },
  flood:           { name: 'Flood',         category: 'Natural',     effects: { resourcePct: { food: -0.5, wood: -0.5 } } },
  earthquake:      { name: 'Earthquake',    category: 'Natural',     effects: { destroyTypes: ['Walls', 'Watchtower'], fallbackDestroyRandom: 1 } },
  drought:         { name: 'Drought',       category: 'Natural',     effects: { resourcePct: { food: -0.6 } } },
  wildfire:        { name: 'Wildfire',      category: 'Natural',     effects: { destroyTypes: ['Lumber Camp', 'Farm'], resourcePct: { wood: -0.7 } } },
  // Social
  famine:          { name: 'Famine',        category: 'Social',      effects: { populationPct: -0.2, resourcePct: { food: -0.8 } } },
  plague:          { name: 'Plague',        category: 'Social',      effects: { populationPct: -0.3, statsFlat: { stability: -3 } } },
  rebel_uprising:  { name: 'Rebel Uprising',category: 'Social',      effects: { statsFlat: { military: -3, stability: -4 }, resourcePct: { gold: -0.4 } } },
  tax_revolt:      { name: 'Tax Revolt',    category: 'Social',      effects: { statsFlat: { economy: -3 }, resourcePct: { gold: -0.6 } } },
  // Magical
  dragon_attack:   { name: 'Dragon Attack', category: 'Magical',     effects: { destroyRandom: 2, populationPct: -0.15, resourcePct: { gold: -0.5 } } },
  curse:           { name: 'Curse',         category: 'Magical',     effects: { statsFlat: { economy: -2, military: -2, stability: -2 } } },
  undead_invasion: { name: 'Undead Invasion',category: 'Magical',    effects: { statsFlat: { military: -5 }, populationPct: -0.25 } },
  // Environmental
  blight:          { name: 'Blight',        category: 'Environmental',effects: { tempModifier: { buildingType: 'Farm', modifier: { food: 0.5 }, days: 5 } } },
  rockslide:       { name: 'Rockslide',     category: 'Environmental',effects: { destroyTypes: ['Mine', 'Ore Mine'] } },
  storm:           { name: 'Storm',         category: 'Environmental',effects: { conditionalResourcePct: { requiresType: 'Docks', resource: 'gold', pct: -0.5 } } },
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

    // Persist changes
    await pool.query(`UPDATE fiefs SET resources = $1, stats = $2, population = $3 WHERE id = $4`, [
      JSON.stringify(resources), JSON.stringify(stats), population, fiefId
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
