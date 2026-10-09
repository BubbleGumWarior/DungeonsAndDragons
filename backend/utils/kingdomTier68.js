/**
 * Shared constants for the tier 6 refining lanes and the tier 8 mana system
 * (see KINGDOM_TIER_ROADMAP.md). Used by both routes/kingdoms.js and models/Campaign.js
 * so the two can't drift apart.
 */

// ── Tier 6: refined goods ────────────────────────────────────────────────────
// A worker in a refining lane turns REFINING_RAW_PER_UNIT of the raw resource into one refined
// good, REFINING_UNITS_PER_WORKER times a day (before the tier yield multiplier). Citizens only.
const REFINING_RAW_PER_UNIT = 3;
const REFINING_UNITS_PER_WORKER = 2;
const REFINING_LANES = {
  planks: { raw: 'wood', buildings: ['sawyers_workshop'] },
  dressed_stone: { raw: 'stone', buildings: ['stonecutters_yard'] },
  steel: { raw: 'minerals', buildings: ['steel_foundry'] },
};
const REFINED_GOODS = Object.keys(REFINING_LANES);

// ── Tier 8: mana ─────────────────────────────────────────────────────────────
// Highest first, so computeTieredWorkerOutput fills the best wells' slots first.
const MANA_WELL_CHAIN = [
  { type: 'ley_font', rate: 8, capacity: 20 },
  { type: 'deep_mana_well', rate: 6, capacity: 20 },
  { type: 'mana_well', rate: 4, capacity: 20 },
];
const MANA_WELL_TYPES = MANA_WELL_CHAIN.map((w) => w.type);
// How much mana each completed well can hold.
const MANA_CAPACITY_BY_TYPE = { mana_well: 5000, deep_mana_well: 25000, ley_font: 125000 };

// Buildings whose own tier is at least this draw mana every day once their fief is tier 8+.
const MANA_DRAW_MIN_BUILDING_TIER = 8;
const MANA_DRAW_MIN_FIEF_TIER = 8;

// Storage that runs on magic: each step is 10x the one before (tier 7 Advanced Warehouse is +700).
const MAGIC_STORAGE_BONUS_BY_TYPE = {
  vaulted_warehouse: 7000,
  arcane_vault: 70000,
  dimensional_depository: 700000,
};

module.exports = {
  REFINING_RAW_PER_UNIT,
  REFINING_UNITS_PER_WORKER,
  REFINING_LANES,
  REFINED_GOODS,
  MANA_WELL_CHAIN,
  MANA_WELL_TYPES,
  MANA_CAPACITY_BY_TYPE,
  MANA_DRAW_MIN_BUILDING_TIER,
  MANA_DRAW_MIN_FIEF_TIER,
  MAGIC_STORAGE_BONUS_BY_TYPE,
};
