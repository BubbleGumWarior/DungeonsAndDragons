/**
 * Tier 9 provinces and governors (see KINGDOM_TIER_ROADMAP.md).
 *
 * A tier 9 fief can found satellite provinces and move citizens into them. A province is run by a
 * governor, sends a share of what it produces (the tribute) to the fief every day, and has a loyalty
 * meter. Push the tribute too high, neglect the governor, or let the fief's unrest climb and loyalty
 * falls; a province with very low loyalty can break away.
 */

const PROVINCE_MIN_FIEF_TIER = 9;
const MAX_PROVINCES_PER_FIEF = 3;
const PROVINCE_POPULATION_CAP = 2000;
const IMPROVEMENT_MAX_LEVEL = 3;

// Paid from the fief's stores when a province is founded.
const PROVINCE_FOUNDING_COST = { wood: 150000, stone: 100000, gold: 100000, steel: 10000 };

// Each improvement level costs gold (level n+1 costs base * (n+1)).
const IMPROVEMENTS = {
  garrison: { label: 'Garrison', base: 20000, blurb: '+8 loyalty per level' },
  market: { label: 'Market', base: 20000, blurb: '+25% production per level' },
  granary: { label: 'Granary', base: 20000, blurb: '+30% food per level' },
};

const GOVERNOR_BONUSES = {
  steward: { label: 'Steward', blurb: '+25% tribute' },
  warden: { label: 'Warden', blurb: '+12 loyalty' },
  scholar: { label: 'Scholar', blurb: 'sends research to the fief' },
};

// What one resident produces per day, before improvements and governor bonuses.
const PER_RESIDENT_DAILY = { food: 0.5, gold: 0.2, wood: 0.3 };
const SCHOLAR_RESEARCH_PER_RESIDENT = 0.01;

const LOYALTY_BASE_TARGET = 70;
const LOYALTY_DAILY_STEP = 2;
const SECESSION_LOYALTY_THRESHOLD = 15;
const SECESSION_MAX_DAILY_CHANCE = 0.1;

const clampPct = (n) => Math.max(0, Math.min(100, Number(n) || 0));

const getImprovementCost = (kind, currentLevel) => {
  const def = IMPROVEMENTS[kind];
  if (!def) return null;
  return def.base * (Math.max(0, Math.floor(Number(currentLevel) || 0)) + 1);
};

/** Where a province's loyalty is heading, given how it is run. */
const getLoyaltyTarget = (province, fiefUnrest) => {
  const improvements = province.improvements || {};
  let target = LOYALTY_BASE_TARGET;
  if (!String(province.governor_name || '').trim()) target -= 15;
  if (province.governor_bonus === 'warden' && String(province.governor_name || '').trim()) target += 12;
  target += (Number(improvements.garrison) || 0) * 8;
  target -= clampPct(province.tribute_pct) * 0.5;
  target -= (Number(fiefUnrest) || 0) * 0.3;
  return Math.max(0, Math.min(100, target));
};

/** One day of a province's output, as it is sent to the fief (tribute) in whole resource amounts. */
const getDailyTribute = (province) => {
  const improvements = province.improvements || {};
  const hasGovernor = Boolean(String(province.governor_name || '').trim());
  const pop = Math.max(0, Number(province.population) || 0);
  const market = 1 + (Number(improvements.market) || 0) * 0.25;
  const granary = 1 + (Number(improvements.granary) || 0) * 0.3;
  // An unmanaged province hands over half as much.
  const governorFactor = hasGovernor ? 1 : 0.5;
  const stewardFactor = hasGovernor && province.governor_bonus === 'steward' ? 1.25 : 1;
  const share = clampPct(province.tribute_pct) / 100;
  const scale = share * market * governorFactor * stewardFactor;
  const tribute = {
    food: pop * PER_RESIDENT_DAILY.food * granary * scale,
    gold: pop * PER_RESIDENT_DAILY.gold * scale,
    wood: pop * PER_RESIDENT_DAILY.wood * scale,
  };
  if (hasGovernor && province.governor_bonus === 'scholar') {
    tribute.research = pop * SCHOLAR_RESEARCH_PER_RESIDENT * share;
  }
  return tribute;
};

const toView = (row) => ({
  id: Number(row.id),
  fief_id: Number(row.fief_id),
  name: row.name,
  governor_name: row.governor_name || '',
  governor_bonus: row.governor_bonus || '',
  population: Number(row.population),
  loyalty: Math.round(Number(row.loyalty) * 10) / 10,
  tribute_pct: Number(row.tribute_pct),
  improvements: row.improvements || {},
  status: row.status,
  tribute_per_day: (() => {
    const t = getDailyTribute(row);
    return { food: t.food, gold: t.gold, wood: t.wood, research: t.research || 0 };
  })(),
  loyalty_target: Math.round(getLoyaltyTarget(row, row.fief_unrest) * 10) / 10,
});

/**
 * Advance every active province in a campaign by `days` days. Called from Campaign.advanceDays inside its
 * transaction, after the fief rows have been saved. Returns events (secessions) for the day summary.
 */
const advanceProvincesForCampaign = async (client, campaignId, days, random = Math.random) => {
  const exists = await client.query(`SELECT to_regclass('public.provinces') AS t`);
  if (!exists.rows[0]?.t) return [];

  const result = await client.query(
    `SELECT p.*, f.unrest AS fief_unrest, f.name AS fief_name
     FROM provinces p
     JOIN fiefs f ON f.id = p.fief_id
     JOIN kingdoms k ON k.id = f.kingdom_id
     WHERE k.campaign_id = $1 AND p.status = 'active'
     ORDER BY p.id
     FOR UPDATE OF p`,
    [campaignId]
  );
  if (!result.rows.length) return [];

  const events = [];
  const tributeByFief = new Map();

  for (const province of result.rows) {
    let loyalty = Number(province.loyalty);
    let seceded = false;
    const totals = { food: 0, gold: 0, wood: 0, research: 0 };

    for (let day = 0; day < days && !seceded; day += 1) {
      const target = getLoyaltyTarget(province, province.fief_unrest);
      if (loyalty < target) loyalty = Math.min(target, loyalty + LOYALTY_DAILY_STEP);
      else if (loyalty > target) loyalty = Math.max(target, loyalty - LOYALTY_DAILY_STEP);

      if (loyalty < SECESSION_LOYALTY_THRESHOLD) {
        const chance = Math.min(SECESSION_MAX_DAILY_CHANCE, ((SECESSION_LOYALTY_THRESHOLD - loyalty) / SECESSION_LOYALTY_THRESHOLD) * SECESSION_MAX_DAILY_CHANCE);
        if (random() < chance) {
          seceded = true;
          break;
        }
      }

      const tribute = getDailyTribute(province);
      totals.food += tribute.food;
      totals.gold += tribute.gold;
      totals.wood += tribute.wood;
      totals.research += tribute.research || 0;
    }

    if (seceded) {
      await client.query(`UPDATE provinces SET status = 'seceded', loyalty = $2, updated_at = NOW() WHERE id = $1`, [province.id, loyalty]);
      events.push({ type: 'secession', provinceId: Number(province.id), name: province.name, fiefId: Number(province.fief_id), fiefName: province.fief_name });
    } else {
      await client.query(`UPDATE provinces SET loyalty = $2, updated_at = NOW() WHERE id = $1`, [province.id, loyalty]);
    }

    const fiefTotals = tributeByFief.get(province.fief_id) || { food: 0, gold: 0, wood: 0, research: 0 };
    for (const key of Object.keys(totals)) fiefTotals[key] += totals[key];
    tributeByFief.set(province.fief_id, fiefTotals);
  }

  // Credit tribute into the fief stores, respecting its capacities so it can't overfill a pool.
  for (const [fiefId, totals] of tributeByFief.entries()) {
    const lock = await client.query(
      `SELECT stored_resources, storage_capacity, food_storage_capacity, bank_capacity FROM fiefs WHERE id = $1 FOR UPDATE`,
      [fiefId]
    );
    if (!lock.rows.length) continue;
    const row = lock.rows[0];
    const stored = { ...(row.stored_resources || {}) };
    const warehouseCap = Math.max(0, Number(row.storage_capacity) || 0);
    const foodCap = Math.max(0, Number(row.food_storage_capacity) || 0);
    const bankCap = Math.max(0, Number(row.bank_capacity) || 0);
    const warehouseUsed = Object.entries(stored)
      .filter(([k]) => !['food', 'gold', 'faith', 'mana', 'research', 'meat', 'vegetables'].includes(k))
      .reduce((sum, [, v]) => sum + Math.max(0, Number(v) || 0), 0);
    let warehouseRoom = Math.max(0, warehouseCap - warehouseUsed);

    const food = Math.max(0, Number(stored.food) || 0);
    const foodRoom = Math.max(0, foodCap - food);
    const foodIn = Math.min(totals.food, foodRoom + warehouseRoom);
    stored.food = food + foodIn;
    warehouseRoom = Math.max(0, warehouseRoom - Math.max(0, foodIn - foodRoom));

    const gold = Math.max(0, Number(stored.gold) || 0);
    const goldRoom = Math.max(0, bankCap - gold);
    const goldIn = Math.min(totals.gold, goldRoom + warehouseRoom);
    stored.gold = gold + goldIn;
    warehouseRoom = Math.max(0, warehouseRoom - Math.max(0, goldIn - goldRoom));

    const woodIn = Math.min(totals.wood, warehouseRoom);
    stored.wood = Math.max(0, Number(stored.wood) || 0) + woodIn;

    // Research is a score, not a stock, so it is not stored; scholars' output is reported only.
    await client.query(`UPDATE fiefs SET stored_resources = $2::jsonb WHERE id = $1`, [fiefId, JSON.stringify(stored)]);
  }

  return events;
};

module.exports = {
  PROVINCE_MIN_FIEF_TIER,
  MAX_PROVINCES_PER_FIEF,
  PROVINCE_POPULATION_CAP,
  IMPROVEMENT_MAX_LEVEL,
  PROVINCE_FOUNDING_COST,
  IMPROVEMENTS,
  GOVERNOR_BONUSES,
  SECESSION_LOYALTY_THRESHOLD,
  clampPct,
  getImprovementCost,
  getLoyaltyTarget,
  getDailyTribute,
  toView,
  advanceProvincesForCampaign,
};
