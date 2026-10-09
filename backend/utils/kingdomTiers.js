/**
 * Tier upgrade configuration for fief tiers 6-10.
 *
 * Tiers 2-5 keep their original hand-written routes; everything from tier 6 up
 * goes through the generic POST /fiefs/:id/upgrade-tier-next route, driven by
 * this table. Costs are keyed by stored_resources key. Mana and the refined
 * goods (planks, dressed_stone, steel) live in stored_resources like any other
 * resource. See KINGDOM_TIER_ROADMAP.md for the design.
 */

const MAX_FIEF_TIER = 10;

// target tier -> { days, cost }
const TIER_UPGRADE_CONFIG = {
  6: {
    days: 45,
    cost: { wood: 59000, stone: 32000, minerals: 18000, gold: 20000 },
  },
  7: {
    days: 60,
    cost: {
      wood: 179000, stone: 113000, minerals: 74000, gold: 67000,
      planks: 27000, dressed_stone: 17000, steel: 11000,
    },
  },
  8: {
    days: 80,
    cost: {
      wood: 544000, stone: 399000, minerals: 302000, gold: 224000,
      planks: 136000, dressed_stone: 100000, steel: 75000,
    },
  },
  9: {
    days: 105,
    cost: {
      wood: 1649000, stone: 1413000, minerals: 1230000, gold: 748000,
      planks: 577000, dressed_stone: 495000, steel: 430000,
      mana: 10000,
    },
  },
  10: {
    days: 140,
    cost: {
      wood: 5000000, stone: 5000000, minerals: 5000000, gold: 2500000,
      planks: 2500000, dressed_stone: 2500000, steel: 2500000,
      mana: 100000,
    },
  },
};

const COST_LABELS = {
  wood: 'wood',
  stone: 'stone',
  minerals: 'iron',
  gold: 'gold',
  planks: 'planks',
  dressed_stone: 'dressed stone',
  steel: 'steel',
  mana: 'mana',
};

const getTierUpgradeConfig = (targetTier) => TIER_UPGRADE_CONFIG[Number(targetTier)] || null;

module.exports = { MAX_FIEF_TIER, TIER_UPGRADE_CONFIG, COST_LABELS, getTierUpgradeConfig };
