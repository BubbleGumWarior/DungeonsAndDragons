const { pool } = require('./database');
const { getResearchConfig } = require('../utils/kingdomResearch');
const { normalizeMaturationSchedule, getAssignablePopulation } = require('../utils/population');

class Campaign {
  static WORKER_CAP_BUILDING_MAP = {
    wood: ['lumber_mill', 'timber_mill', 'advanced_timber_mill', 'sawmill_complex', 'industrial_sawmill', 'great_lumber_works'],
    meat: ['hunters_guild', 'hunting_lodge', 'hunters_lodge_advanced', 'tracker_lodge', 'ranger_hall', 'beastmaster_hall', 'warden_lodge', 'great_hunters_keep'],
    vegetables: ['farm', 'irrigated_farm', 'granary', 'farm_advanced', 'terrace_fields', 'orchard_farms', 'fertile_estates', 'greenhouse_complex', 'hydroponic_conservatory', 'reinforced_granary', 'cold_cellar_granary', 'regional_granary', 'central_food_reserve', 'preservation_complex', 'nutrient_reserve_hall', 'strategic_food_vault', 'eternal_harvest_vault'],
    stone: ['quarry', 'quarry_advanced', 'reinforced_quarry', 'deepstone_quarry', 'heavy_quarry_works', 'industrial_quarry', 'grand_quarry_complex', 'earthsplit_quarry', 'titan_quarry'],
    iron: ['mine', 'mine_advanced', 'reinforced_mine', 'crystal_mine', 'industrial_mine', 'great_foundry_mine', 'abyssal_mine', 'mythril_mine', 'primordial_core_mine'],
    gold: ['trade_post', 'market_hall', 'merchant_exchange', 'grand_bazaar', 'great_market', 'trade_consortium', 'royal_exchange', 'imperial_trade_forum'],
    research: ['research_lab', 'research_lab_advanced', 'applied_sciences_lab', 'innovation_institute', 'arcane_research_institute', 'grand_academy_of_sciences', 'experimental_nexus', 'transcendent_research_complex', 'omniscience_institute'],
    faith: ['faith_temple', 'great_temple', 'sanctified_basilica', 'pilgrim_cathedral', 'divine_sanctuary', 'celestial_cathedral', 'high_sacred_citadel', 'eternal_shrine_complex', 'pantheon_spire'],
  };

  static LOGISTICS_BUILDING_TYPES = [
    'logistics_depot',
    'roadworks',
    'supply_depot',
    'quartermaster_depot',
    'supply_network',
    'imperial_logistics_hub',
    'trade_route_office',
  ];

  // Tiered per-worker production rates for food buildings.
  // Workers are distributed into highest-tier building slots first (20 slots per building).
  // Only workers that fit within a building's capacity receive its rate.
  static MEAT_BUILDING_CHAIN = [
    { type: 'great_hunters_keep',     rate: 2.95, capacity: 20 },
    { type: 'warden_lodge',           rate: 2.75, capacity: 20 },
    { type: 'beastmaster_hall',       rate: 2.55, capacity: 20 },
    { type: 'ranger_hall',            rate: 2.35, capacity: 20 },
    { type: 'tracker_lodge',          rate: 2.15, capacity: 20 },
    { type: 'hunters_lodge_advanced', rate: 1.95, capacity: 20 },
    { type: 'hunting_lodge',          rate: 1.73, capacity: 20 },
    { type: 'hunters_guild',          rate: 1.5,  capacity: 20 },
  ];

  // Rates here are effective-worker multipliers: T1=1.0, T2=+15%, T3=+30% (flat over base).
  // granary adds lane cap but no production bonus so it shares the T1 rate.
  static VEG_BUILDING_CHAIN = [
    { type: 'hydroponic_conservatory', rate: 2.05, capacity: 20 },
    { type: 'greenhouse_complex',      rate: 1.90, capacity: 20 },
    { type: 'fertile_estates',         rate: 1.75, capacity: 20 },
    { type: 'orchard_farms',           rate: 1.60, capacity: 20 },
    { type: 'terrace_fields',          rate: 1.45, capacity: 20 },
    { type: 'farm_advanced',           rate: 1.30, capacity: 20 },
    { type: 'irrigated_farm',          rate: 1.15, capacity: 20 },
    { type: 'farm',                    rate: 1.0,  capacity: 20 },
    { type: 'granary',                 rate: 1.0,  capacity: 20 },
    { type: 'reinforced_granary',      rate: 1.0,  capacity: 20 },
    { type: 'cold_cellar_granary',     rate: 1.0,  capacity: 20 },
    { type: 'regional_granary',        rate: 1.0,  capacity: 20 },
    { type: 'central_food_reserve',    rate: 1.0,  capacity: 20 },
    { type: 'preservation_complex',    rate: 1.0,  capacity: 20 },
    { type: 'nutrient_reserve_hall',   rate: 1.0,  capacity: 20 },
    { type: 'strategic_food_vault',    rate: 1.0,  capacity: 20 },
    { type: 'eternal_harvest_vault',   rate: 1.0,  capacity: 20 },
  ];

  static getProductionConfig() {
    return {
      meatPerWorkerPerDay: 1.5,
      vegetablesPerWorkerPerHarvest: 2,
      vegetablesHarvestIntervalDays: 10,
      vegetableAssignmentDays: 4,
      vegetableGrowthDays: 6,
      vegetableHarvestDays: 4,
      // 4 harvest days roughly equals 25 days of baseline meat production (1.5/day => 37.5 total).
      vegetablesPerWorkerPerHarvestDay: 9.375,
    };
  }

  static normalizeVegetableHarvestState(value) {
    const raw = (value && typeof value === 'object') ? value : {};
    const legacyDayInCycle = Math.max(0, Math.floor(Number(raw.day_in_cycle || 0)));
    const phaseRaw = String(raw.phase || '').trim().toLowerCase();
    let phase = 'assigning';
    if (phaseRaw === 'growing' || phaseRaw === 'harvesting' || phaseRaw === 'assigning') {
      phase = phaseRaw;
    } else if (legacyDayInCycle >= 4 && legacyDayInCycle < 10) {
      phase = 'growing';
    }

    const dayInPhase = Math.max(0, Math.floor(Number(raw.day_in_phase || 0)));
    const lockedWorkers = Math.max(0, Math.floor(Number(raw.locked_workers || 0)));

    return {
      phase,
      dayInPhase,
      lockedWorkers,
      // Legacy compatibility fields used by old clients/debug outputs.
      dayInCycle: legacyDayInCycle,
      accumulatedWorkerDays: Math.max(0, Number(raw.accumulated_worker_days || 0)),
    };
  }

  static getPopulationConfig() {
    const dailyBirthChanceRaw = Number(process.env.KINGDOM_DAILY_BIRTH_CHANCE_PER_ADULT);
    const dailyBirthChance = Number.isFinite(dailyBirthChanceRaw)
      ? Math.min(1, Math.max(0, dailyBirthChanceRaw))
      : 0.001;

    return {
      dailyBirthChance,
      maturityDays: 15 * 365,
    };
  }

  static getFoodConsumptionRateForTier(tier) {
    const numericTier = Math.max(1, Math.floor(Number(tier) || 1));
    return numericTier <= 1 ? 0.7 : 1;
  }

  static getDailyFoodConsumption(population, tier) {
    const pop = Math.max(0, Number(population) || 0);
    return pop * Campaign.getFoodConsumptionRateForTier(tier);
  }

  static getBirthChanceMultiplier(foodProducedToday, foodNeededToday, starvationDeaths, season = null) {
    if (Number(starvationDeaths || 0) > 0) return 0;

    const produced = Math.max(0, Number(foodProducedToday) || 0);
    const needed = Math.max(0, Number(foodNeededToday) || 0);
    if (needed <= 0) return 1;

    const ratio = produced / needed;
    let multiplier = 1;
    if (ratio < 0.5) multiplier = 0.35;
    else if (ratio < 0.9) multiplier = 0.6;
    else if (ratio <= 1.1) multiplier = 1;
    else if (ratio <= 1.5) multiplier = 1.25;
    else multiplier = 1.5;

    // Winter bonus: +25% more births (people stay indoors and create more children)
    if (season === 'Winter') multiplier *= 1.25;

    return multiplier;
  }

  static trimMaturationScheduleToPopulation(schedule, population) {
    const normalized = normalizeMaturationSchedule(schedule);
    const totalPopulation = Math.max(0, Math.floor(Number(population) || 0));
    const underage = Object.values(normalized).reduce((sum, count) => sum + Math.max(0, Number(count) || 0), 0);
    let excess = Math.max(0, underage - totalPopulation);
    if (excess <= 0) return normalized;

    const maturityDaysDesc = Object.keys(normalized)
      .map((k) => Number(k))
      .filter(Number.isFinite)
      .sort((a, b) => b - a);

    for (const day of maturityDaysDesc) {
      if (excess <= 0) break;
      const key = String(day);
      const count = Math.max(0, Number(normalized[key] || 0));
      if (count <= 0) continue;

      const removed = Math.min(count, excess);
      const next = count - removed;
      if (next <= 0) delete normalized[key];
      else normalized[key] = next;
      excess -= removed;
    }

    return normalized;
  }

  static sampleBirths(adultPopulation, dailyBirthChance) {
    const adults = Math.max(0, Math.floor(Number(adultPopulation) || 0));
    const chance = Math.min(1, Math.max(0, Number(dailyBirthChance) || 0));
    if (adults <= 0 || chance <= 0) return 0;
    if (chance >= 1) return adults;

    if (adults <= 2000) {
      let births = 0;
      for (let i = 0; i < adults; i++) {
        if (Math.random() < chance) births += 1;
      }
      return births;
    }

    const mean = adults * chance;
    const variance = adults * chance * (1 - chance);
    const stdDev = Math.sqrt(Math.max(0, variance));
    const u1 = Math.max(Number.EPSILON, Math.random());
    const u2 = Math.random();
    const gaussian = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const sampled = Math.round(mean + (gaussian * stdDev));
    return Math.max(0, Math.min(adults, sampled));
  }

  // Trim worker assignments down so the total does not exceed `assignableAdults`.
  // Removes workers in lowest-priority-first order so important lanes are preserved.
  static trimWorkerAssignmentsToAssignable(workerAssignments, assignableAdults) {
    const assignments = { ...(Campaign.toNumericResourceMap(workerAssignments)) };
    const target = Math.max(0, Math.floor(Number(assignableAdults) || 0));
    let total = Object.values(assignments).reduce((s, v) => s + Math.max(0, Number(v) || 0), 0);
    if (total <= target) return assignments;

    const removeOrder = ['building', 'research', 'faith', 'iron', 'stone', 'wood', 'vegetables', 'meat'];
    for (const lane of removeOrder) {
      if (total <= target) break;
      const current = Math.max(0, Number(assignments[lane] || 0));
      const toRemove = Math.min(current, total - target);
      assignments[lane] = current - toRemove;
      total -= toRemove;
    }
    return assignments;
  }

  static applyResourceUnlock(unlockedResources, maxWorkersPerResource, resourceKey, workerCap = 20) {
    const nextUnlocked = { ...(unlockedResources || {}) };
    const nextMaxWorkers = { ...(maxWorkersPerResource || {}) };
    nextUnlocked[resourceKey] = true;
    nextMaxWorkers[resourceKey] = Math.max(Number(nextMaxWorkers[resourceKey] || 0), Number(workerCap) || 0);
    return { nextUnlocked, nextMaxWorkers };
  }

  static applyResourceCapIncrement(unlockedResources, maxWorkersPerResource, resourceKey, increment = 20) {
    const nextUnlocked = { ...(unlockedResources || {}) };
    const nextMaxWorkers = { ...(maxWorkersPerResource || {}) };
    nextUnlocked[resourceKey] = true;
    nextMaxWorkers[resourceKey] = Math.max(0, Number(nextMaxWorkers[resourceKey] || 0)) + Math.max(0, Number(increment || 0));
    return { nextUnlocked, nextMaxWorkers };
  }

  static getTierWorkerYieldMultiplier(tier) {
    const normalizedTier = Math.max(1, Math.floor(Number(tier) || 1));
    return 1 + ((normalizedTier - 1) * 0.1);
  }

  static getResearchWorkerYieldMultiplier(completedResearch, lane) {
    const done = new Set(Array.isArray(completedResearch) ? completedResearch : []);
    if (lane === 'meat') {
      let bonus = 0;
      if (done.has('tier2_hunter')) bonus += 0.15;
      if (done.has('tier3_hunter')) bonus += 0.15;
      return 1 + bonus;
    }
    if (lane === 'vegetables') {
      let bonus = 0;
      if (done.has('tier2_vegetable')) bonus += 0.15;
      if (done.has('tier3_vegetable')) bonus += 0.15;
      return 1 + bonus;
    }
    return 1;
  }

  static getHousingPopulationPerBuilding(completedResearch) {
    // Deprecated: capacity is now tracked per building type via HOUSING_CAPACITY_BY_TYPE.
    // Kept for backward compatibility with any external callers.
    const done = new Set(Array.isArray(completedResearch) ? completedResearch : []);
    if (done.has('tier3_housing')) return 12;
    if (done.has('tier2_housing')) return 8;
    return 4;
  }

  static HOUSING_CAPACITY_BY_TYPE = {
    housing: 4,
    wood_lodge: 8,
    reinforced_lodge: 12,
    stone_lodge: 16,
    longhouse_block: 20,
    manor_house: 24,
    townhouse_row: 28,
    urban_residence: 32,
    noble_residence: 36,
    royal_estate: 40,
  };

  static getCompletedBuildingCount(completedBuildings, buildingTypes) {
    const types = new Set((buildingTypes || []).map((t) => String(t)));
    return (completedBuildings || []).reduce((sum, building) => {
      const type = String(building?.buildingType || building?.building_type || '');
      return sum + (types.has(type) ? 1 : 0);
    }, 0);
  }

  static calculateHousingCapacityFromCompletedBuildings(completedBuildings, completedResearch = [], floorPopulation = 0) {
    let capacity = 0;
    for (const building of (completedBuildings || [])) {
      const type = String(building?.buildingType || building?.building_type || '');
      capacity += Campaign.HOUSING_CAPACITY_BY_TYPE[type] || 0;
    }
    return Math.max(Math.max(0, Number(floorPopulation) || 0), capacity);
  }

  static getPrisonerCapacityForBuildingType(type) {
    const caps = {
      prison: 20,
      dungeon: 40,
      black_cells: 60,
      deep_prison: 80,
      high_security_prison: 100,
      iron_keep: 120,
      shadow_vault: 140,
    };
    return caps[String(type)] || 0;
  }

  static calculatePrisonerCapacityFromCompletedBuildings(completedBuildings) {
    let cap = 0;
    for (const b of (completedBuildings || [])) {
      cap += Campaign.getPrisonerCapacityForBuildingType(b?.buildingType || b?.building_type);
    }
    return cap;
  }

  static applyBuildingBasedWorkerCaps(fief, completedBuildings) {
    const unlockedResources = { ...(fief.unlockedResources || {}) };
    const maxWorkersPerResource = { ...(fief.maxWorkersPerResource || {}) };

    for (const [resource, buildingTypes] of Object.entries(Campaign.WORKER_CAP_BUILDING_MAP)) {
      const count = (completedBuildings || []).reduce((sum, building) => {
        const type = String(building?.buildingType || building?.building_type || '');
        return sum + (buildingTypes.includes(type) ? 1 : 0);
      }, 0);
      if (count <= 0) continue;

      unlockedResources[resource] = true;
      const requiredCap = count * 20;
      maxWorkersPerResource[resource] = Math.max(0, Number(maxWorkersPerResource[resource] || 0), requiredCap);
    }

    fief.unlockedResources = unlockedResources;
    fief.maxWorkersPerResource = maxWorkersPerResource;
  }

  static getStorageCapacityBonusForBuilding(buildingType) {
    const key = String(buildingType || '');
    return Campaign.STORAGE_CAPACITY_BONUS_BY_TYPE[key] || 0;
  }

  static STORAGE_CAPACITY_BONUS_BY_TYPE = {
    storage: 100,
    storage_shack: 200,
    granary: 200,
    reinforced_granary: 250,
    cold_cellar_granary: 300,
    regional_granary: 350,
    central_food_reserve: 400,
    preservation_complex: 450,
    nutrient_reserve_hall: 500,
    strategic_food_vault: 550,
    eternal_harvest_vault: 600,
    advanced_storage_tent: 300,
    storehouse: 400,
    reinforced_storehouse: 500,
    central_storehouse: 600,
    storage_advanced: 700,
    vaulted_warehouse: 800,
  };

  static getStorageCapacityResearchMultiplier(completedResearch) {
    const done = new Set(Array.isArray(completedResearch) ? completedResearch : []);
    if (done.has('tier3_storage')) return 2;
    if (done.has('tier2_storage')) return 1.5;
    return 1;
  }

  static calculateStorageCapacityFromCompletedBuildings(completedBuildings, completedResearch = []) {
    const baseCapacity = 100;
    let bonus = 0;
    for (const building of (completedBuildings || [])) {
      const type = String(building?.buildingType || building?.building_type || '');
      bonus += Campaign.getStorageCapacityBonusForBuilding(type);
    }
    const multiplier = Campaign.getStorageCapacityResearchMultiplier(completedResearch);
    const capacity = (baseCapacity + bonus) * multiplier;
    return Math.max(baseCapacity, capacity);
  }

  static applyBuildingUnlockEffects(fief, buildingType) {
    if (!buildingType) return;
    const key = String(buildingType);

    const storageBonus = Campaign.getStorageCapacityBonusForBuilding(key);
    if (storageBonus > 0) {
      fief.storageCapacity = Math.max(0, Number(fief.storageCapacity || 100)) + storageBonus;
    }

    if (key === 'hunters_guild' || key === 'hunting_lodge') {
      const unlocked = Campaign.applyResourceCapIncrement(fief.unlockedResources, fief.maxWorkersPerResource, 'meat', 20);
      fief.unlockedResources = unlocked.nextUnlocked;
      fief.maxWorkersPerResource = unlocked.nextMaxWorkers;
    }

    if (key === 'farm' || key === 'irrigated_farm' || key === 'granary') {
      const unlocked = Campaign.applyResourceCapIncrement(fief.unlockedResources, fief.maxWorkersPerResource, 'vegetables', 20);
      fief.unlockedResources = unlocked.nextUnlocked;
      fief.maxWorkersPerResource = unlocked.nextMaxWorkers;
    }

    if (key === 'lumber_mill') {
      const unlocked = Campaign.applyResourceCapIncrement(fief.unlockedResources, fief.maxWorkersPerResource, 'wood', 20);
      fief.unlockedResources = unlocked.nextUnlocked;
      fief.maxWorkersPerResource = unlocked.nextMaxWorkers;
    }

    if (key === 'quarry') {
      const unlocked = Campaign.applyResourceCapIncrement(fief.unlockedResources, fief.maxWorkersPerResource, 'stone', 20);
      fief.unlockedResources = unlocked.nextUnlocked;
      fief.maxWorkersPerResource = unlocked.nextMaxWorkers;
    }

    if (key === 'mine') {
      const unlocked = Campaign.applyResourceCapIncrement(fief.unlockedResources, fief.maxWorkersPerResource, 'iron', 20);
      fief.unlockedResources = unlocked.nextUnlocked;
      fief.maxWorkersPerResource = unlocked.nextMaxWorkers;
    }

    if (key === 'research_lab') {
      const unlocked = Campaign.applyResourceCapIncrement(fief.unlockedResources, fief.maxWorkersPerResource, 'research', 20);
      fief.unlockedResources = unlocked.nextUnlocked;
      fief.maxWorkersPerResource = unlocked.nextMaxWorkers;
    }

    if (key === 'faith_temple') {
      const unlocked = Campaign.applyResourceCapIncrement(fief.unlockedResources, fief.maxWorkersPerResource, 'faith', 20);
      fief.unlockedResources = unlocked.nextUnlocked;
      fief.maxWorkersPerResource = unlocked.nextMaxWorkers;
    }

    if (['trade_post', 'market_hall', 'merchant_exchange', 'grand_bazaar', 'great_market', 'trade_consortium', 'royal_exchange', 'imperial_trade_forum'].includes(key)) {
      const unlocked = Campaign.applyResourceCapIncrement(fief.unlockedResources, fief.maxWorkersPerResource, 'gold', 20);
      fief.unlockedResources = unlocked.nextUnlocked;
      fief.maxWorkersPerResource = unlocked.nextMaxWorkers;
    }
  }

  static applyTierUpgradeCompletionEffects(fief) {
    // Tier upgrade completion does NOT automatically unlock resources.
    // Instead, tier 2 buildings (like lumber_yard, quarry, mine, research_lab) become available to construct.
    // When those buildings are completed, they unlock their respective resources through applyBuildingUnlockEffects.
    // This ensures players must invest in buildings to get resources, rather than getting them free.
  }

  static getDayOfYear(day) {
    const normalized = ((Number(day) - 1) % 365 + 365) % 365;
    return normalized + 1;
  }

  static getSeasonForDay(day) {
    const dayOfYear = Campaign.getDayOfYear(day);

    if (dayOfYear >= 60 && dayOfYear <= 151) return 'Spring';
    if (dayOfYear >= 152 && dayOfYear <= 243) return 'Summer';
    if (dayOfYear >= 244 && dayOfYear <= 334) return 'Autumn';
    return 'Winter';
  }

  static getSeasonEffects(season) {
    const seasonalEffects = {
      Spring: { vegetables: 0.2, meat: 0.05, wood: 0.05 },
      Summer: { vegetables: 0.3, meat: 0.1, wood: -0.05 },
      Autumn: { wood: 0.2, stone: 0.1 },
      Winter: { vegetables: -0.4, wood: -0.1, meat: -0.15, faith: 0.15 },
    };

    return seasonalEffects[season] || {};
  }

  static getSeasonMetadata(day) {
    const dayOfYear = Campaign.getDayOfYear(day);
    const season = Campaign.getSeasonForDay(day);
    return {
      dayOfYear,
      season,
      seasonEffects: Campaign.getSeasonEffects(season),
    };
  }

  static async updateMilitaryTrainingForDay(client, fiefId, dayNumber) {
    const tableCheck = await client.query(`SELECT to_regclass('public.fief_training') AS name`);
    if (!tableCheck.rows[0]?.name) return;

    await client.query(
      `UPDATE fief_training
       SET days_remaining = GREATEST(0, COALESCE(complete_day, $2) - $2),
           status = CASE
             WHEN COALESCE(complete_day, $2) <= $2 THEN 'ready'
             ELSE status
           END
       WHERE fief_id = $1
         AND status = 'training'`,
      [fiefId, dayNumber]
    );
  }

  static toNumericResourceMap(value) {
    const input = (value && typeof value === 'object') ? value : {};
    const output = {};
    for (const [key, raw] of Object.entries(input)) {
      const num = Number(raw);
      output[key] = Number.isFinite(num) ? num : 0;
    }
    return output;
  }

  static getSeasonalModifierForResource(resource, seasonEffects) {
    let modifier = Number(seasonEffects?.[resource] || 0);
    if (resource === 'vegetables' || resource === 'meat') {
      modifier += Number(seasonEffects?.food || 0);
    }
    if (resource === 'minerals') {
      modifier += Number(seasonEffects?.iron || 0);
    }
    if (resource === 'iron') {
      modifier += Number(seasonEffects?.minerals || 0);
    }
    return modifier;
  }

  static applySeasonToProduction(baseProduction, seasonEffects) {
    const adjusted = {};
    for (const [resource, amountRaw] of Object.entries(baseProduction)) {
      const amount = Number(amountRaw) || 0;
      const modifier = Campaign.getSeasonalModifierForResource(resource, seasonEffects);
      const adjustedAmount = Math.max(0, amount * (1 + modifier));
      adjusted[resource] = adjustedAmount;
    }
    return adjusted;
  }

  static applyLogisticsBonus(production, logisticsLevel) {
    const level = Math.max(0, Number(logisticsLevel || 0));
    if (level <= 0) return { ...(production || {}) };

    const multiplier = 1 + (level * 0.05);
    const adjusted = { ...(production || {}) };
    for (const resource of ['vegetables', 'meat', 'wood', 'stone', 'minerals', 'gold', 'faith', 'research']) {
      const amount = Number(adjusted[resource] || 0);
      if (amount > 0) {
        adjusted[resource] = amount * multiplier;
      }
    }
    return adjusted;
  }

  static applyLocationModifiers(production, locationModifiers) {
    if (!locationModifiers || typeof locationModifiers !== 'object') return { ...(production || {}) };
    const adjusted = { ...(production || {}) };
    for (const [resource, modRaw] of Object.entries(locationModifiers)) {
      const mod = Number(modRaw || 0);
      if (mod === 0) continue;
      const amount = Number(adjusted[resource] || 0);
      if (amount > 0) {
        adjusted[resource] = Math.max(0, amount * (1 + mod));
      }
    }
    return adjusted;
  }

  // All modifiers (seasonal + logistics + location) are summed then applied as a single multiplier
  static applyCombinedModifiers(baseProduction, seasonEffects, logisticsLevel, locationModifiers) {
    const LOGISTICS_RESOURCES = new Set(['vegetables', 'meat', 'wood', 'stone', 'minerals', 'gold', 'faith', 'research']);
    const logisticsBonus = Math.max(0, Number(logisticsLevel || 0)) * 0.05;
    const locMods = (locationModifiers && typeof locationModifiers === 'object') ? locationModifiers : {};
    const adjusted = {};
    for (const [resource, amountRaw] of Object.entries(baseProduction)) {
      const amount = Number(amountRaw) || 0;
      const seasonMod = Campaign.getSeasonalModifierForResource(resource, seasonEffects);
      const logMod = LOGISTICS_RESOURCES.has(resource) ? logisticsBonus : 0;
      const locationMod = Number(locMods[resource] || 0);
      const totalMod = seasonMod + logMod + locationMod;
      adjusted[resource] = Math.max(0, amount * (1 + totalMod));
    }
    return adjusted;
  }

  static applyLegendaryBonuses(production, legendaryBonuses) {
    const adjusted = { ...(production || {}) };
    const bonuses = (legendaryBonuses && typeof legendaryBonuses === 'object') ? legendaryBonuses : {};
    const map = {
      wood: 'wood_bonus_pct',
      stone: 'stone_bonus_pct',
      minerals: 'iron_bonus_pct',
      meat: 'meat_bonus_pct',
      vegetables: 'vegetables_bonus_pct',
      gold: 'gold_bonus_pct',
      research: 'research_bonus_pct',
      faith: 'faith_bonus_pct',
      building: 'building_bonus_pct',
    };

    for (const [resource, key] of Object.entries(map)) {
      const pct = Number(bonuses[key] || 0);
      const value = Number(adjusted[resource] || 0);
      if (!Number.isFinite(pct) || pct === 0 || value <= 0) continue;
      adjusted[resource] = Math.max(0, value * (1 + (pct / 100)));
    }

    return adjusted;
  }

  /**
   * Distribute `totalWorkers` into building slots from highest tier first.
   * Each building in the chain provides `capacity` slots at its `rate`.
   * For meat: rate is meat/worker/day. For vegetables: rate is an effective-worker multiplier.
   * Returns the total weighted output (meat produced, or effective worker-days for veg).
   */
  static computeTieredWorkerOutput(totalWorkers, completedBuildings, tierChain) {
    const countByType = {};
    for (const b of (completedBuildings || [])) {
      const t = String(b?.buildingType || b?.building_type || '');
      countByType[t] = (countByType[t] || 0) + 1;
    }

    let remaining = Math.max(0, totalWorkers);
    let total = 0;

    for (const { type, rate, capacity } of tierChain) {
      if (remaining <= 0) break;
      const buildingCount = countByType[type] || 0;
      if (buildingCount === 0) continue;
      const slots = buildingCount * capacity;
      const assigned = Math.min(remaining, slots);
      total += assigned * rate;
      remaining -= assigned;
    }

    // Fallback: any workers not covered by listed buildings use the lowest-tier rate.
    if (remaining > 0) {
      const lowestRate = tierChain[tierChain.length - 1]?.rate ?? 1;
      total += remaining * lowestRate;
    }

    return total;
  }

  static computeBaseProduction(workerAssignments, completedBuildings, options = {}) {
    const workers = Campaign.toNumericResourceMap(workerAssignments);
    const dayNumber = Number(options.dayNumber || 0);
    const tier = Number(options.tier || 1);
    const completedResearch = Array.isArray(options.completedResearch) ? options.completedResearch : [];
    const tierWorkerYieldMultiplier = Campaign.getTierWorkerYieldMultiplier(tier);
    const hunterResearchMultiplier = Campaign.getResearchWorkerYieldMultiplier(completedResearch, 'meat');
    const productionConfig = Campaign.getProductionConfig();
    const output = {
      vegetables: 0,
      meat: 0,
      wood: 0,
      stone: 0,
      minerals: 0,
      gold: 0,
      faith: 0,
      research: 0,
    };

    const legacyFoodWorkers = Number(workers.food || 0);
    const meatWorkers = Number(workers.meat || 0) + legacyFoodWorkers;
    const vegetablesWorkers = Number(workers.vegetables || 0);

    output.meat += Campaign.computeTieredWorkerOutput(meatWorkers, completedBuildings, Campaign.MEAT_BUILDING_CHAIN) * tierWorkerYieldMultiplier * hunterResearchMultiplier;

    // Vegetable production is handled via accumulated worker-days in advanceDays to prevent
    // the exploit of reassigning workers only on harvest day. computeBaseProduction returns 0 here.
    // Building resource outputs (e.g. hunters_guild vegetable bonuses) still apply below.

    output.wood += Number(workers.wood || 0) * tierWorkerYieldMultiplier;
    output.stone += Number(workers.stone || 0) * tierWorkerYieldMultiplier;
    output.minerals += (Number(workers.iron || 0) + (Number(workers.minerals || 0) * 0.5)) * tierWorkerYieldMultiplier;
    output.gold += Number(workers.gold || 0) * tierWorkerYieldMultiplier;
    output.faith += (Number(workers.faith || 0) * 0.5) * tierWorkerYieldMultiplier;
    output.research += Number(workers.research || 0) * tierWorkerYieldMultiplier;

    for (const building of completedBuildings) {
      const bOutput = Campaign.toNumericResourceMap(building.resource_output);
      for (const [resource, amount] of Object.entries(bOutput)) {
        output[resource] = (output[resource] || 0) + amount;
      }
    }

    return output;
  }

  static applyStorageCapacity(storedResources, producedResources, capacity) {
    const stored = Campaign.toNumericResourceMap(storedResources);
    const legacyFood = Math.max(0, Number(stored.food || 0)) + Math.max(0, Number(stored.meat || 0)) + Math.max(0, Number(stored.vegetables || 0));
    stored.food = legacyFood;
    delete stored.meat;
    delete stored.vegetables;
    delete stored.research;

    const normalizedProduced = {};
    for (const [resource, amountRaw] of Object.entries(producedResources || {})) {
      const amount = Math.max(0, Number(amountRaw) || 0);
      if (resource === 'research') {
        continue;
      }
      if (resource === 'meat' || resource === 'vegetables') {
        normalizedProduced.food = (Number(normalizedProduced.food) || 0) + amount;
      } else {
        normalizedProduced[resource] = (Number(normalizedProduced[resource]) || 0) + amount;
      }
    }
    const applied = {};
    let used = Object.values(stored).reduce((sum, n) => sum + Math.max(0, Number(n) || 0), 0);

    for (const [resource, amountRaw] of Object.entries(normalizedProduced)) {
      const amount = Math.max(0, Number(amountRaw) || 0);
      if (amount <= 0) {
        applied[resource] = 0;
        continue;
      }

      const available = Math.max(0, Number(capacity) - used);
      const accepted = Math.min(amount, available);
      if (accepted > 0) {
        stored[resource] = (Number(stored[resource]) || 0) + accepted;
        used += accepted;
      }
      applied[resource] = accepted;
    }

    return { stored, applied };
  }

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
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const beforeResult = await client.query(
        `SELECT COALESCE(current_day, 1) AS current_day FROM campaigns WHERE id = $1 FOR UPDATE`,
        [campaignId]
      );
      if (!beforeResult.rows[0]) {
        throw new Error('Campaign not found');
      }
      const previousDay = Number(beforeResult.rows[0].current_day);
      const previousSeason = Campaign.getSeasonForDay(previousDay);

      // Kingdom simulation is optional; if core tables do not exist yet, skip gracefully.
      const tableCheck = await client.query(`
        SELECT to_regclass('public.kingdoms') AS kingdoms,
               to_regclass('public.fiefs') AS fiefs,
               to_regclass('public.fief_buildings') AS fief_buildings,
               to_regclass('public.fief_research_queue') AS fief_research_queue,
               to_regclass('public.fief_research_levels') AS fief_research_levels
      `);
      const canSimulateKingdoms = Boolean(
        tableCheck.rows[0]?.kingdoms &&
        tableCheck.rows[0]?.fiefs &&
        tableCheck.rows[0]?.fief_buildings
      );
      const canSimulateResearch = Boolean(
        tableCheck.rows[0]?.fief_research_queue &&
        tableCheck.rows[0]?.fief_research_levels
      );

      let hasConsecutiveStarvationDaysColumn = false;
      let hasTierUpgradeDaysRemaining3Column = false;
      let hasCompletedResearchColumn = false;
      let hasVegetableHarvestStateColumn = false;
      let hasSickInjuredPopulationColumn = false;
      let hasSlaveWorkerAssignmentsColumn = false;
      let hasLocationModifiersColumn = false;
      let hasTravelDaysColumn = false;
      if (canSimulateKingdoms) {
        const fiefColumnsCheck = await client.query(
          `SELECT column_name
           FROM information_schema.columns
           WHERE table_name = 'fiefs'
             AND column_name = ANY($1::text[])`,
          [[
            'consecutive_starvation_days',
            'tier_upgrade_days_remaining_3',
            'completed_research',
            'vegetable_harvest_state',
            'sick_injured_population',
            'slave_worker_assignments',
            'location_modifiers',
            'travel_days_remaining',
          ]]
        );
        const availableColumns = new Set(fiefColumnsCheck.rows.map((r) => String(r.column_name || '')));
        hasConsecutiveStarvationDaysColumn = availableColumns.has('consecutive_starvation_days');
        hasTierUpgradeDaysRemaining3Column = availableColumns.has('tier_upgrade_days_remaining_3');
        hasCompletedResearchColumn = availableColumns.has('completed_research');
        hasVegetableHarvestStateColumn = availableColumns.has('vegetable_harvest_state');
        hasSickInjuredPopulationColumn = availableColumns.has('sick_injured_population');
        hasSlaveWorkerAssignmentsColumn = availableColumns.has('slave_worker_assignments');
        hasLocationModifiersColumn = availableColumns.has('location_modifiers');
        hasTravelDaysColumn = availableColumns.has('travel_days_remaining');
      }

      const resourcesGained = {};
      const populationGained = {};
      const completedBuildings = [];
      const completedResearch = [];
      const completedTierUpgrades = [];

      const fiefStates = [];
      const buildingsByFief = new Map();
      const researchByFief = new Map();
      const legendaryBonusesByFief = new Map();

      if (canSimulateKingdoms) {
        const fiefsResult = await client.query(
          `SELECT f.id,
                  f.name,
                  COALESCE(f.population, 0) AS population,
                  COALESCE(f.population_maturation_schedule, '{}'::jsonb) AS population_maturation_schedule,
                  COALESCE(f.tier, 1) AS tier,
                  COALESCE(f.tier_upgrade_days_remaining, 0) AS tier_upgrade_days_remaining,
                    ${hasTierUpgradeDaysRemaining3Column ? "COALESCE(f.tier_upgrade_days_remaining_3, 0)" : '0'} AS tier_upgrade_days_remaining_3,
                  COALESCE(f.storage_capacity, 100) AS storage_capacity,
                  COALESCE(f.stored_resources, '{}'::jsonb) AS stored_resources,
                  COALESCE(f.worker_assignments, '{}'::jsonb) AS worker_assignments,
                    ${hasSlaveWorkerAssignmentsColumn ? "COALESCE(f.slave_worker_assignments, '{}'::jsonb)" : "'{}'::jsonb"} AS slave_worker_assignments,
                  COALESCE(f.unlocked_resources, '{}'::jsonb) AS unlocked_resources,
                  COALESCE(f.max_workers_per_resource, '{}'::jsonb) AS max_workers_per_resource,
                    ${hasSickInjuredPopulationColumn ? 'COALESCE(f.sick_injured_population, 0)' : '0'} AS sick_injured_population,
                    ${hasCompletedResearchColumn ? "COALESCE(f.completed_research, '[]'::jsonb)" : "'[]'::jsonb"} AS completed_research,
                    ${hasVegetableHarvestStateColumn ? "COALESCE(f.vegetable_harvest_state, '{\"day_in_cycle\":0,\"accumulated_worker_days\":0}'::jsonb)" : "'{\"day_in_cycle\":0,\"accumulated_worker_days\":0}'::jsonb"} AS vegetable_harvest_state${hasConsecutiveStarvationDaysColumn ? ",\n                  COALESCE(f.consecutive_starvation_days, 0) AS consecutive_starvation_days" : ''},
                  COALESCE(f.slaves, 0) AS slaves,
                  COALESCE(f.prisoners, 0) AS prisoners,
                    ${hasLocationModifiersColumn ? "COALESCE(f.location_modifiers, '{}'::jsonb)" : "'{}'::jsonb"} AS location_modifiers,
                    ${hasTravelDaysColumn ? 'COALESCE(f.travel_days_remaining, 0)' : '0'} AS travel_days_remaining
           FROM fiefs f
           JOIN kingdoms k ON k.id = f.kingdom_id
           WHERE k.campaign_id = $1`,
          [campaignId]
        );

        for (const row of fiefsResult.rows) {
          const id = Number(row.id);
          // Ensure meat is locked unless explicitly unlocked
          const unlockedResources = { ...(row.unlocked_resources || {}) };
          if (unlockedResources.meat !== true) unlockedResources.meat = false;
          fiefStates.push({
            id,
            name: row.name,
            population: Number(row.population || 0),
            populationMaturationSchedule: normalizeMaturationSchedule(row.population_maturation_schedule),
            tier: Number(row.tier || 1),
            tierUpgradeDaysRemaining: Number(row.tier_upgrade_days_remaining || 0),
            tierUpgradeDaysRemaining3: Number(row.tier_upgrade_days_remaining_3 || 0),
            storageCapacity: Number(row.storage_capacity || 100),
            storedResources: Campaign.toNumericResourceMap(row.stored_resources),
            workerAssignments: Campaign.toNumericResourceMap(row.worker_assignments),
            slaveWorkerAssignments: Campaign.toNumericResourceMap(row.slave_worker_assignments),
            unlockedResources,
            maxWorkersPerResource: Campaign.toNumericResourceMap(row.max_workers_per_resource),
            sickInjuredPopulation: Math.max(0, Number(row.sick_injured_population || 0)),
            vegetableHarvestState: Campaign.normalizeVegetableHarvestState(row.vegetable_harvest_state),
            consecutiveStarvationDays: Number(row.consecutive_starvation_days || 0),
            completedResearch: Array.isArray(row.completed_research) ? row.completed_research : [],
            slaves: Math.max(0, Number(row.slaves || 0)),
            prisoners: Math.max(0, Number(row.prisoners || 0)),
            locationModifiers: Campaign.toNumericResourceMap(row.location_modifiers),
            travelDaysRemaining: Number(row.travel_days_remaining || 0),
          });
          resourcesGained[id] = {};
          populationGained[id] = 0;
        }

        if (fiefStates.length > 0) {
          const buildingResult = await client.query(
            `SELECT id,
                    fief_id,
                    name,
                    level,
                    building_type,
                    days_remaining,
                    is_complete,
                    queue_position,
                    resource_output
             FROM fief_buildings
             WHERE fief_id = ANY($1::int[])`,
            [fiefStates.map((f) => f.id)]
          );

          for (const row of buildingResult.rows) {
            const fiefId = Number(row.fief_id);
            if (!buildingsByFief.has(fiefId)) {
              buildingsByFief.set(fiefId, []);
            }
            buildingsByFief.get(fiefId).push({
              id: Number(row.id),
              fiefId,
              name: row.name,
              level: Number(row.level || 1),
              buildingType: row.building_type,
              daysRemaining: Number(row.days_remaining || 0),
              isComplete: Boolean(row.is_complete),
              queuePosition: row.queue_position == null ? null : Number(row.queue_position),
              resource_output: Campaign.toNumericResourceMap(row.resource_output),
              resourceOutput: Campaign.toNumericResourceMap(row.resource_output),
              dirty: false,
            });
          }

          const legendaryTables = await client.query(
            `SELECT to_regclass('public.kingdom_legendary_assignments') AS assignments,
                    to_regclass('public.kingdom_legendary_characters') AS characters`
          );
          const canUseLegendary = Boolean(
            legendaryTables.rows[0]?.assignments &&
            legendaryTables.rows[0]?.characters
          );

          if (canUseLegendary) {
            const legendaryResult = await client.query(
              `SELECT la.fief_id, lc.bonuses
               FROM kingdom_legendary_assignments la
               JOIN kingdom_legendary_characters lc ON lc.id = la.legendary_id
               WHERE la.fief_id = ANY($1::int[])
                 AND lc.is_active = true`,
              [fiefStates.map((f) => f.id)]
            );

            for (const row of legendaryResult.rows) {
              const fiefId = Number(row.fief_id);
              if (!legendaryBonusesByFief.has(fiefId)) legendaryBonusesByFief.set(fiefId, {});
              const current = legendaryBonusesByFief.get(fiefId);
              const bonuses = (row.bonuses && typeof row.bonuses === 'object') ? row.bonuses : {};
              for (const [key, value] of Object.entries(bonuses)) {
                const numeric = Number(value || 0);
                if (!Number.isFinite(numeric) || numeric === 0) continue;
                current[key] = Number(current[key] || 0) + numeric;
              }
            }
          }

          if (canSimulateResearch) {
            const researchResult = await client.query(
              `SELECT id,
                      fief_id,
                      research_id,
                      status,
                      queue_position,
                      points_accumulated,
                      campaign_day_started,
                      campaign_day_completed
               FROM fief_research_queue
               WHERE fief_id = ANY($1::int[]) AND status IN ('queued', 'active')`,
              [fiefStates.map((f) => f.id)]
            );

            for (const row of researchResult.rows) {
              const fiefId = Number(row.fief_id);
              if (!researchByFief.has(fiefId)) {
                researchByFief.set(fiefId, []);
              }
              researchByFief.get(fiefId).push({
                id: Number(row.id),
                fiefId,
                researchId: row.research_id,
                status: row.status,
                queuePosition: row.queue_position == null ? null : Number(row.queue_position),
                pointsAccumulated: Number(row.points_accumulated || 0),
                campaignDayStarted: row.campaign_day_started == null ? null : Number(row.campaign_day_started),
                campaignDayCompleted: row.campaign_day_completed == null ? null : Number(row.campaign_day_completed),
                dirty: false,
              });
            }
          }
        }
      }

      for (let offset = 1; offset <= days; offset++) {
        const dayNumber = previousDay + offset;
        const seasonEffects = Campaign.getSeasonEffects(Campaign.getSeasonForDay(dayNumber));
        const populationConfig = Campaign.getPopulationConfig();

        for (const fief of fiefStates) {
          // Fief in transit: skip all production, decrement travel counter only
          if (fief.travelDaysRemaining > 0) {
            fief.travelDaysRemaining = Math.max(0, fief.travelDaysRemaining - 1);
            continue;
          }

          await Campaign.updateMilitaryTrainingForDay(client, fief.id, dayNumber);

          const matureToday = Math.max(0, Math.floor(Number(fief.populationMaturationSchedule[String(dayNumber)] || 0)));
          if (matureToday > 0) {
            delete fief.populationMaturationSchedule[String(dayNumber)];
          }

          const fiefBuildings = buildingsByFief.get(fief.id) || [];
          const completed = fiefBuildings.filter((b) => b.isComplete);
          fief.storageCapacity = Campaign.calculateStorageCapacityFromCompletedBuildings(completed, fief.completedResearch);
          Campaign.applyBuildingBasedWorkerCaps(fief, completed);

          const effectiveAssignments = { ...(fief.workerAssignments || {}) };
          for (const lane of ['meat', 'vegetables', 'wood', 'stone', 'iron', 'gold']) {
            effectiveAssignments[lane] =
              Math.max(0, Number(effectiveAssignments[lane] || 0))
              + Math.max(0, Number((fief.slaveWorkerAssignments || {})[lane] || 0));
          }

          const baseProduction = Campaign.computeBaseProduction(effectiveAssignments, completed, {
            dayNumber,
            tier: fief.tier,
            completedResearch: fief.completedResearch,
          });

          // Vegetable lane cycle:
          // - assigning (4d): workers may be set by players
          // - growing (6d): lane cap forced to 0; assigned workers remain but produce nothing
          // - harvesting (4d): only days when vegetables are collected from locked workers
          const productionConfig = Campaign.getProductionConfig();
          const tierWorkerYieldMultiplier = Campaign.getTierWorkerYieldMultiplier(fief.tier);
          const assignmentDays = Math.max(1, Number(productionConfig.vegetableAssignmentDays || 4));
          const growthDays = Math.max(1, Number(productionConfig.vegetableGrowthDays || 6));
          const harvestDays = Math.max(1, Number(productionConfig.vegetableHarvestDays || 4));
          const vegHarvestPerWorkerPerDay = Math.max(0, Number(productionConfig.vegetablesPerWorkerPerHarvestDay || 9.375));
          const vegetableResearchMultiplier = Campaign.getResearchWorkerYieldMultiplier(fief.completedResearch, 'vegetables');
          if (hasVegetableHarvestStateColumn) {
            const state = Campaign.normalizeVegetableHarvestState(fief.vegetableHarvestState);
            const currentAssignedVegetableWorkers = Math.max(0, Math.floor(Number((fief.workerAssignments || {}).vegetables || 0)));

            // Keep farming idle until a fief actually has vegetable workers assigned.
            // Also recover from stale locked phases that have no locked workers.
            if (state.phase !== 'assigning' && state.lockedWorkers <= 0) {
              state.phase = 'assigning';
              state.dayInPhase = 0;
              state.dayInCycle = 0;
              state.accumulatedWorkerDays = 0;
            }

            if (state.phase === 'harvesting') {
              const effectiveLockedWorkers = Campaign.computeTieredWorkerOutput(state.lockedWorkers, completed, Campaign.VEG_BUILDING_CHAIN);
              const harvestedToday = effectiveLockedWorkers * tierWorkerYieldMultiplier * vegetableResearchMultiplier * vegHarvestPerWorkerPerDay;
              baseProduction.vegetables += harvestedToday;
            }

            if (state.phase === 'assigning') {
              if (currentAssignedVegetableWorkers > 0) {
                state.dayInPhase += 1;
                if (state.dayInPhase >= assignmentDays) {
                  state.lockedWorkers = currentAssignedVegetableWorkers;
                  state.phase = 'growing';
                  state.dayInPhase = 0;
                }
              } else {
                // No workers assigned: keep this fief at an idle, editable start state.
                state.dayInPhase = 0;
                state.dayInCycle = 0;
                state.lockedWorkers = 0;
              }
            } else if (state.phase === 'growing') {
              // Lane appears closed while crops are growing.
              fief.maxWorkersPerResource.vegetables = 0;
              state.dayInPhase += 1;
              if (state.dayInPhase >= growthDays) {
                state.phase = 'harvesting';
                state.dayInPhase = 0;
              }
            } else {
              state.dayInPhase += 1;
              if (state.dayInPhase >= harvestDays) {
                state.phase = 'assigning';
                state.dayInPhase = 0;
                state.lockedWorkers = 0;
              }
            }

            // Keep a legacy cycle-day approximation for backwards compatibility.
            if (state.phase === 'assigning') {
              state.dayInCycle = Math.max(0, Math.min(assignmentDays, state.dayInPhase));
            } else if (state.phase === 'growing') {
              state.dayInCycle = assignmentDays + Math.max(0, Math.min(growthDays, state.dayInPhase));
            } else {
              state.dayInCycle = assignmentDays + growthDays + Math.max(0, Math.min(harvestDays, state.dayInPhase));
            }

            fief.vegetableHarvestState = state;
          } else {
            // Fallback for partially migrated schemas: apply average daily vegetable output
            // so single-day advances do not lose harvest progress.
            const harvestInterval = Math.max(1, Number(productionConfig.vegetablesHarvestIntervalDays || 10));
            const vegsPerWorkerPerHarvest = Number(productionConfig.vegetablesPerWorkerPerHarvest || 2);
            const vegetablesWorkers = Math.max(0, Number(effectiveAssignments.vegetables || 0));
            const effectiveVegWorkers = Campaign.computeTieredWorkerOutput(vegetablesWorkers, completed, Campaign.VEG_BUILDING_CHAIN);
            baseProduction.vegetables += (effectiveVegWorkers * tierWorkerYieldMultiplier * vegetableResearchMultiplier * vegsPerWorkerPerHarvest) / harvestInterval;
          }

          const logisticsLevel = Campaign.getCompletedBuildingCount(completed, Campaign.LOGISTICS_BUILDING_TYPES);
          const legendaryBonuses = legendaryBonusesByFief.get(fief.id) || {};
          const modifiedProduction = Campaign.applyLegendaryBonuses(
            Campaign.applyCombinedModifiers(baseProduction, seasonEffects, logisticsLevel, fief.locationModifiers),
            legendaryBonuses
          );
          const capacityApplied = Campaign.applyStorageCapacity(fief.storedResources, modifiedProduction, fief.storageCapacity);
          fief.storedResources = capacityApplied.stored;

          for (const [resource, amount] of Object.entries(capacityApplied.applied)) {
            resourcesGained[fief.id][resource] = (Number(resourcesGained[fief.id][resource]) || 0) + amount;
          }

          // Negative values are intentional debuffs and increase consumption instead of reducing it.
          const foodConsumptionReductionPct = Number(legendaryBonuses.food_consumption_reduction_pct || 0);
          const consumptionMultiplier = Math.max(0, 1 - (foodConsumptionReductionPct / 100));
          const dailyFoodNeeded = Campaign.getDailyFoodConsumption(fief.population, fief.tier)
            + (fief.slaves + fief.prisoners) * 0.5;
          const adjustedDailyFoodNeeded = Math.max(0, dailyFoodNeeded * consumptionMultiplier);
          const currentFood = Math.max(0, Number(fief.storedResources.food || 0));
          const consumedFood = Math.min(currentFood, adjustedDailyFoodNeeded);
          fief.storedResources.food = currentFood - consumedFood;
          const foodDeficit = Math.max(0, adjustedDailyFoodNeeded - consumedFood);

          let starvationDeaths = 0;
          // Only apply starvation deaths if storage is completely depleted (currentFood was 0 before consumption)
          if (foodDeficit > 0 && currentFood === 0 && fief.population > 0) {
            fief.consecutiveStarvationDays += 1;
            // Base death chance per villager: 5% per day
            const baseDeathChance = 0.05;
            // Consecutive days multiplier: increases chance exponentially
            const daysMultiplier = Math.min(5, 1 + (fief.consecutiveStarvationDays - 1) * 0.3);
            // Deficit severity multiplier: scales with how much food is missing relative to consumption
            const deficitMultiplier = Math.min(3, 1 + (foodDeficit / Math.max(1, adjustedDailyFoodNeeded)));
            // Combined death chance per villager
            const deathChancePerVillager = Math.min(1, baseDeathChance * daysMultiplier * deficitMultiplier);
            // Roll for each villager
            const population = Math.max(0, Math.floor(Number(fief.population || 0)));
            for (let i = 0; i < population; i++) {
              if (Math.random() < deathChancePerVillager) {
                starvationDeaths += 1;
              }
            }
            if (starvationDeaths > 0) {
              fief.population = Math.max(0, population - starvationDeaths);
              fief.populationMaturationSchedule = Campaign.trimMaturationScheduleToPopulation(
                fief.populationMaturationSchedule,
                fief.population
              );
              populationGained[fief.id] = (Number(populationGained[fief.id]) || 0) - starvationDeaths;
            }
          } else if (currentFood > 0 || foodDeficit <= 0) {
            // Reset consecutive starvation counter if food is available or no deficit
            fief.consecutiveStarvationDays = 0;
          }

          const assignableAdults = getAssignablePopulation(
            fief.population,
            fief.populationMaturationSchedule,
            fief.sickInjuredPopulation
          );

          // Trim worker assignments if starvation killed workers
          if (starvationDeaths > 0) {
            fief.workerAssignments = Campaign.trimWorkerAssignmentsToAssignable(fief.workerAssignments, assignableAdults);
          }
          const foodProducedToday = Math.max(0, Number(capacityApplied.applied.food || 0));
          const season = Campaign.getSeasonForDay(dayNumber);
          // Negative values are intentional debuffs and reduce birth chance instead of boosting it.
          const populationGrowthBonusPct = Number(legendaryBonuses.population_growth_bonus_pct || 0);
          const birthChanceMultiplier = Math.max(0, Campaign.getBirthChanceMultiplier(foodProducedToday, adjustedDailyFoodNeeded, starvationDeaths, season)
            * (1 + (populationGrowthBonusPct / 100)));
          const birthsToday = Campaign.sampleBirths(assignableAdults, populationConfig.dailyBirthChance * birthChanceMultiplier);
          const housingCapacity = Campaign.calculateHousingCapacityFromCompletedBuildings(completed, fief.completedResearch, fief.population);

          // Enforce prisoner cap: excess prisoners escape and blend into civilian population
          const prisonerCap = Campaign.calculatePrisonerCapacityFromCompletedBuildings(completed);
          if (prisonerCap > 0 && fief.prisoners > prisonerCap) {
            const escaped = fief.prisoners - prisonerCap;
            fief.prisoners = prisonerCap;
            fief.population += escaped;
            populationGained[fief.id] = (Number(populationGained[fief.id]) || 0) + escaped;
          }

          // Enforce housing cap: emigrants leave if population + slaves exceeds cap (slaves count as occupying housing)
          const slavesCount = Math.max(0, Number(fief.slaves || 0));
          const effectiveOccupancy = fief.population + slavesCount;
          if (effectiveOccupancy > housingCapacity) {
            const emigrants = Math.min(fief.population, effectiveOccupancy - housingCapacity);
            if (emigrants > 0) {
              fief.population = Math.max(0, fief.population - emigrants);
              fief.populationMaturationSchedule = Campaign.trimMaturationScheduleToPopulation(
                fief.populationMaturationSchedule,
                fief.population
              );
              populationGained[fief.id] = (Number(populationGained[fief.id]) || 0) - emigrants;
              const postEmigrationAssignable = getAssignablePopulation(
                fief.population,
                fief.populationMaturationSchedule,
                fief.sickInjuredPopulation
              );
              fief.workerAssignments = Campaign.trimWorkerAssignmentsToAssignable(fief.workerAssignments, postEmigrationAssignable);
            }
          }

          const birthsAllowedByHousing = Math.max(0, Math.floor(housingCapacity - fief.population - slavesCount));
          const birthsToApply = Math.min(birthsToday, birthsAllowedByHousing);
          if (birthsToApply > 0) {
            fief.population += birthsToApply;
            populationGained[fief.id] = (Number(populationGained[fief.id]) || 0) + birthsToApply;
            const maturityDay = dayNumber + populationConfig.maturityDays;
            const maturityKey = String(maturityDay);
            fief.populationMaturationSchedule[maturityKey] =
              Math.max(0, Number(fief.populationMaturationSchedule[maturityKey] || 0)) + birthsToApply;
          }

          const BUILDER_HUT_BONUS_BY_TYPE = {
            builders_hut: 3,
            masons_workshop: 6,
            engineers_lodge: 9,
            construction_guildhall: 12,
            master_builder_hall: 15,
            grand_architect_hall: 18,
          };
          const passiveBuilderBonus = (completed || []).reduce((sum, b) => {
            const type = String(b?.buildingType || b?.building_type || '');
            return sum + (BUILDER_HUT_BONUS_BY_TYPE[type] || 0);
          }, 0);
          const builderWorkers = Math.max(0, Number(fief.workerAssignments.building || 0))
            + Math.max(0, Number((fief.slaveWorkerAssignments || {}).building || 0))
            + passiveBuilderBonus;
          if (builderWorkers > 0) {
            let remainingEffort = builderWorkers;

            while (remainingEffort > 0) {
              const active = fiefBuildings
                .filter((b) => !b.isComplete)
                .sort((a, b) => {
                  const ap = a.queuePosition == null ? Number.MAX_SAFE_INTEGER : a.queuePosition;
                  const bp = b.queuePosition == null ? Number.MAX_SAFE_INTEGER : b.queuePosition;
                  return ap === bp ? a.id - b.id : ap - bp;
                })[0];

              if (!active) break;

              const effortSpent = Math.max(0, Math.min(remainingEffort, Math.max(0, Number(active.daysRemaining || 0))));
              active.daysRemaining = Math.max(0, active.daysRemaining - remainingEffort);
              active.dirty = true;
              remainingEffort -= effortSpent;

              if (active.daysRemaining <= 0) {
                const finishedQueuePosition = active.queuePosition;
                active.isComplete = true;
                active.queuePosition = null;
                active.dirty = true;
                completedBuildings.push({
                  name: active.name,
                  buildingType: active.buildingType,
                  level: active.level,
                  fiefId: fief.id,
                  fiefName: fief.name,
                });
                Campaign.applyBuildingUnlockEffects(fief, active.buildingType);

                if (finishedQueuePosition != null) {
                  for (const queued of fiefBuildings) {
                    if (!queued.isComplete && queued.queuePosition != null && queued.queuePosition > finishedQueuePosition) {
                      queued.queuePosition -= 1;
                      queued.dirty = true;
                    }
                  }
                }

                // If this building had 0 remaining time before spending effort,
                // ensure the loop still progresses to the next queued building.
                if (effortSpent === 0) {
                  continue;
                }
              } else {
                // Ran out of builder effort before completing this building.
                break;
              }
            }
          }

          if (fief.tierUpgradeDaysRemaining > 0) {
            fief.tierUpgradeDaysRemaining = Math.max(0, fief.tierUpgradeDaysRemaining - 1);
            if (fief.tierUpgradeDaysRemaining === 0 && fief.tier < 2) {
              fief.tier = 2;
              Campaign.applyTierUpgradeCompletionEffects(fief);
              completedTierUpgrades.push({
                fiefId: fief.id,
                fiefName: fief.name,
                newTier: fief.tier,
              });
            }
          }

          if (fief.tierUpgradeDaysRemaining3 > 0) {
            fief.tierUpgradeDaysRemaining3 = Math.max(0, fief.tierUpgradeDaysRemaining3 - 1);
            if (fief.tierUpgradeDaysRemaining3 === 0 && fief.tier < 3) {
              fief.tier = 3;
              Campaign.applyTierUpgradeCompletionEffects(fief);
              completedTierUpgrades.push({
                fiefId: fief.id,
                fiefName: fief.name,
                newTier: fief.tier,
              });
            }
          }

          if (canSimulateResearch) {
            const queue = researchByFief.get(fief.id) || [];
            const researchWorkers = Math.max(0, Number(fief.workerAssignments.research || 0));
            if ((researchWorkers > 0 || completed.some((b) => {
              const output = Campaign.toNumericResourceMap(b.resource_output);
              return Number(output.research || 0) > 0;
            })) && queue.length > 0) {
              const activeResearch = queue.find((entry) => entry.status === 'active');
              if (activeResearch) {
                // Accumulate research from workers only (no tier multiplier)
                let researchAccumulation = researchWorkers;
                
                // Add research from building outputs
                for (const building of completed) {
                  const buildingOutput = Campaign.toNumericResourceMap(building.resource_output);
                  const buildingResearch = Number(buildingOutput.research || 0);
                  if (buildingResearch > 0) {
                    researchAccumulation += buildingResearch;
                  }
                }
                
                activeResearch.pointsAccumulated += researchAccumulation;
                activeResearch.dirty = true;

                const researchConfig = getResearchConfig(activeResearch.researchId);
                const pointsRequired = Number(researchConfig?.pointsRequired || 100);

                if (activeResearch.pointsAccumulated >= pointsRequired) {
                  const finishedQueuePosition = activeResearch.queuePosition;
                  activeResearch.status = 'completed';
                  activeResearch.queuePosition = null;
                  activeResearch.campaignDayCompleted = dayNumber;
                  activeResearch.dirty = true;

                  completedResearch.push({
                    fiefId: fief.id,
                    fiefName: fief.name,
                    researchId: activeResearch.researchId,
                  });

                  // Track completed research in fief state
                  if (!fief.completedResearch.includes(activeResearch.researchId)) {
                    fief.completedResearch.push(activeResearch.researchId);
                  }

                  // Housing capacity now scales per building type (see HOUSING_CAPACITY_BY_TYPE),
                  // so completing tier2_housing/tier3_housing research no longer grants instant
                  // population — players must build/upgrade the housing structures themselves.

                  const nextQueued = queue
                    .filter((entry) => entry.status === 'queued')
                    .sort((a, b) => {
                      const ap = a.queuePosition == null ? Number.MAX_SAFE_INTEGER : a.queuePosition;
                      const bp = b.queuePosition == null ? Number.MAX_SAFE_INTEGER : b.queuePosition;
                      return ap === bp ? a.id - b.id : ap - bp;
                    })[0];

                  if (nextQueued) {
                    nextQueued.status = 'active';
                    if (!nextQueued.campaignDayStarted) {
                      nextQueued.campaignDayStarted = dayNumber;
                    }
                    nextQueued.dirty = true;
                  }

                  if (finishedQueuePosition != null) {
                    for (const queued of queue) {
                      if (queued.status === 'queued' && queued.queuePosition != null && queued.queuePosition > finishedQueuePosition) {
                        queued.queuePosition -= 1;
                        queued.dirty = true;
                      }
                    }
                  }

                  await client.query(
                    `INSERT INTO fief_research_levels (fief_id, building_type, level)
                     VALUES ($1, $2, 1)
                     ON CONFLICT (fief_id, building_type)
                     DO UPDATE SET level = fief_research_levels.level + 1`,
                    [fief.id, activeResearch.researchId]
                  );
                }
              }
            }
          }
        }
      }

      if (canSimulateKingdoms) {
        for (const fief of fiefStates) {
          const updateSetClauses = [
            'stored_resources = $1::jsonb',
            'tier = $2',
            'tier_upgrade_days_remaining = $3',
          ];
          const updateValues = [
            JSON.stringify(fief.storedResources),
            fief.tier,
            fief.tierUpgradeDaysRemaining,
          ];

          let paramIndex = 4;
          if (hasTierUpgradeDaysRemaining3Column) {
            updateSetClauses.push(`tier_upgrade_days_remaining_3 = $${paramIndex}`);
            updateValues.push(fief.tierUpgradeDaysRemaining3);
            paramIndex += 1;
          }

          updateSetClauses.push(`unlocked_resources = $${paramIndex}::jsonb`);
          updateValues.push(JSON.stringify(fief.unlockedResources || {}));
          paramIndex += 1;

          updateSetClauses.push(`max_workers_per_resource = $${paramIndex}::jsonb`);
          updateValues.push(JSON.stringify(fief.maxWorkersPerResource || {}));
          paramIndex += 1;

          updateSetClauses.push(`storage_capacity = $${paramIndex}`);
          updateValues.push(Math.max(0, Number(fief.storageCapacity || 100)));
          paramIndex += 1;

          updateSetClauses.push(`population = $${paramIndex}`);
          updateValues.push(Math.max(0, Math.floor(Number(fief.population || 0))));
          paramIndex += 1;

          updateSetClauses.push(`population_maturation_schedule = $${paramIndex}::jsonb`);
          updateValues.push(JSON.stringify(fief.populationMaturationSchedule || {}));
          paramIndex += 1;

          if (hasVegetableHarvestStateColumn) {
            updateSetClauses.push(`vegetable_harvest_state = $${paramIndex}::jsonb`);
            updateValues.push(JSON.stringify({
              phase: String(fief.vegetableHarvestState.phase || 'assigning'),
              day_in_phase: Math.max(0, Number(fief.vegetableHarvestState.dayInPhase || 0)),
              locked_workers: Math.max(0, Number(fief.vegetableHarvestState.lockedWorkers || 0)),
              day_in_cycle: fief.vegetableHarvestState.dayInCycle,
              accumulated_worker_days: fief.vegetableHarvestState.accumulatedWorkerDays,
            }));
            paramIndex += 1;
          }

          if (hasCompletedResearchColumn) {
            updateSetClauses.push(`completed_research = $${paramIndex}::jsonb`);
            updateValues.push(JSON.stringify(fief.completedResearch || []));
            paramIndex += 1;
          }

          if (hasConsecutiveStarvationDaysColumn) {
            updateSetClauses.push(`consecutive_starvation_days = $${paramIndex}`);
            updateValues.push(Math.max(0, Number(fief.consecutiveStarvationDays || 0)));
            paramIndex += 1;
          }

          updateSetClauses.push(`prisoners = $${paramIndex}`);
          updateValues.push(Math.max(0, Math.floor(Number(fief.prisoners || 0))));
          paramIndex += 1;

          if (hasTravelDaysColumn) {
            updateSetClauses.push(`travel_days_remaining = $${paramIndex}`);
            updateValues.push(Math.max(0, Math.floor(Number(fief.travelDaysRemaining || 0))));
            paramIndex += 1;
          }

          const whereParam = paramIndex;
          updateValues.push(fief.id);

          await client.query(
            `UPDATE fiefs
             SET ${updateSetClauses.join(',\n                 ')}
             WHERE id = $${whereParam}`,
            updateValues
          );
        }

        for (const fiefBuildings of buildingsByFief.values()) {
          for (const building of fiefBuildings) {
            if (!building.dirty) continue;
            await client.query(
              `UPDATE fief_buildings
               SET days_remaining = $1,
                   is_complete = $2,
                   queue_position = $3,
                   built_at = CASE
                     WHEN $2 = true AND built_at IS NULL THEN NOW()
                     ELSE built_at
                   END
               WHERE id = $4`,
              [building.daysRemaining, building.isComplete, building.queuePosition, building.id]
            );
          }
        }

        if (canSimulateResearch) {
          for (const queue of researchByFief.values()) {
            for (const item of queue) {
              if (!item.dirty) continue;
              await client.query(
                `UPDATE fief_research_queue
                 SET status = $1,
                     queue_position = $2,
                     points_accumulated = $3,
                     campaign_day_started = $4,
                     campaign_day_completed = $5
                 WHERE id = $6`,
                [
                  item.status,
                  item.queuePosition,
                  item.pointsAccumulated,
                  item.campaignDayStarted,
                  item.campaignDayCompleted,
                  item.id,
                ]
              );
            }
          }
        }
      }

      // Bump current_day
      const campResult = await client.query(
        `UPDATE campaigns SET current_day = COALESCE(current_day, 1) + $1 WHERE id = $2 RETURNING current_day`,
        [days, campaignId]
      );
      const newDay = Number(campResult.rows[0].current_day);
      const seasonMetadata = Campaign.getSeasonMetadata(newDay);

      const crossedSeasons = [];
      let lastSeason = previousSeason;
      for (let i = 1; i <= days; i++) {
        const season = Campaign.getSeasonForDay(previousDay + i);
        if (season !== lastSeason) {
          crossedSeasons.push(season);
          lastSeason = season;
        }
      }
      const seasonChanged = previousSeason !== seasonMetadata.season;

      await client.query('COMMIT');
      return {
        newDay,
        dayOfYear: seasonMetadata.dayOfYear,
        season: seasonMetadata.season,
        seasonEffects: seasonMetadata.seasonEffects,
        seasonChanged,
        previousSeason,
        crossedSeasons,
        completedBuildings,
        completedResearch,
        completedTierUpgrades,
        resourcesGained,
        populationGained,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}


module.exports = Campaign;
