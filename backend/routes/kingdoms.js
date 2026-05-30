const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { pool } = require('../models/database');
const Kingdom = require('../models/Kingdom');
const { RESEARCH_CATALOG, getResearchConfig } = require('../utils/kingdomResearch');
const { getAssignablePopulation, getUnderagePopulation, normalizeMaturationSchedule } = require('../utils/population');

const BUILDING_CATALOG = {
  housing: {
    key: 'housing',
    name: 'Tent',
    description: 'Adds +4 population capacity per Tent built. More tents = more adults available as workers. Research Tier 2 Housing to upgrade these to Wooden Lodges (+8 pop each).',
    tierRequired: 1,
    cost: { wood: 8 },
    days: 1,
    resourceOutput: {},
    prerequisites: [],
  },
  storage: {
    key: 'storage',
    name: 'Storage Tent',
    description: 'Adds +100 storage capacity. Each Storage Tent stacks, so building more lets you stockpile larger reserves before hitting the cap.',
    tierRequired: 1,
    cost: { wood: 16 },
    days: 2,
    resourceOutput: {},
    prerequisites: [],
  },
  storage_shack: {
    key: 'storage_shack',
    name: 'Basic Storage Shack',
    description: 'Adds +200 storage capacity. An upgraded Storage Tent with reinforced walls and better organisation. Requires Tier 2 Storage research.',
    tierRequired: 2,
    cost: { wood: 20, stone: 10 },
    days: 3,
    resourceOutput: {},
    prerequisites: [],
  },

  hunters_guild: {
    key: 'hunters_guild',
    name: 'Hunters Cabin',
    description: 'Unlocks the meat worker lane with a cap of +20 hunters. Passively produces +1 meat/day. Each assigned hunter adds +1.5 meat/day on top.',
    tierRequired: 1,
    cost: { wood: 14 },
    days: 5,
    resourceOutput: { meat: 1 },
    prerequisites: [],
  },
  farm: {
    key: 'farm',
    name: 'Vegetable Patch',
    description: 'Unlocks the vegetable worker lane with a cap of +20 farmers. Passively yields +1 vegetable per harvest cycle (every 10 days). Assigned farmers contribute to the cycle total.',
    tierRequired: 1,
    cost: { wood: 8 },
    days: 3,
    resourceOutput: { vegetables: 1 },
    prerequisites: [],
  },
  quarry: {
    key: 'quarry',
    name: 'Quarry Camp',
    description: 'Unlocks the stone worker lane with a cap of +20 quarriers. Passively produces +1 stone/day. Each assigned quarrier adds +1 stone/day. Stone is required for most Tier 2 buildings.',
    tierRequired: 1,
    cost: { wood: 20 },
    days: 15,
    resourceOutput: { stone: 1 },
    prerequisites: [],
  },
  granary: {
    key: 'granary',
    name: 'Granary',
    description: 'Adds +200 storage capacity and raises the vegetable worker cap by +20. A key building for surviving long winters with surplus food.',
    tierRequired: 2,
    cost: { wood: 24, stone: 14 },
    days: 3,
    resourceOutput: {},
    prerequisites: [{ type: 'storage', minCount: 1 }],
  },

  hunting_lodge: {
    key: 'hunting_lodge',
    name: 'Hunting Lodge',
    description: 'Raises the hunter worker cap by +20 (stacks with Hunters Cabin). Passively produces +1 meat/day. Each assigned hunter adds +1.5 meat/day.',
    tierRequired: 2,
    cost: { wood: 18, stone: 10 },
    days: 3,
    resourceOutput: { meat: 1 },
    prerequisites: [{ type: 'hunters_guild', minCount: 1 }],
  },
  irrigated_farm: {
    key: 'irrigated_farm',
    name: 'Irrigated Fields',
    description: 'Raises the farmer worker cap by +20 (stacks with Vegetable Patch). Passively yields +2 vegetables per harvest cycle (every 10 days).',
    tierRequired: 2,
    cost: { wood: 16, stone: 12 },
    days: 2,
    resourceOutput: { vegetables: 2 },
    prerequisites: [{ type: 'farm', minCount: 1 }],
  },
  mine: {
    key: 'mine',
    name: 'Mine Shaft',
    description: 'Unlocks the iron/minerals worker lane with a cap of +20 miners. Passively produces +1 mineral/day. Each miner adds +1 mineral/day. Required for Tier 3 structures.',
    tierRequired: 2,
    cost: { wood: 20, stone: 16 },
    days: 4,
    resourceOutput: { minerals: 1 },
    prerequisites: [{ type: 'quarry', minCount: 1 }],
  },
  research_lab: {
    key: 'research_lab',
    name: 'Research Lab',
    description: 'Unlocks the research worker lane with a cap of +20 researchers. Passively produces +1 research/day. Assign researchers to generate more per day.',
    tierRequired: 2,
    cost: { wood: 22, stone: 18, iron: 6 },
    days: 4,
    resourceOutput: { research: 1 },
    prerequisites: [{ anyTier1Completed: 3 }],
  },
  faith_temple: {
    key: 'faith_temple',
    name: 'Faith Temple',
    description: 'Unlocks the faith worker lane with a cap of +20 clerics. Passively produces +0.5 faith/day. Each assigned cleric adds +0.5 faith/day.',
    tierRequired: 2,
    cost: { wood: 18, stone: 20, iron: 4 },
    days: 4,
    resourceOutput: { faith: 1 },
    prerequisites: [{ type: 'housing', minCount: 4 }, { type: 'storage', minCount: 1 }],
  },
  lumber_mill: {
    key: 'lumber_mill',
    name: "Forester's Hut",
    description: 'Unlocks the wood worker lane with a cap of +20 woodcutters. Passively produces +1 wood/day. Each assigned woodcutter adds +1 wood/day.',
    tierRequired: 2,
    cost: { wood: 20 },
    days: 5,
    resourceOutput: { wood: 1 },
    prerequisites: [],
  },
  trade_post: {
    key: 'trade_post',
    name: 'Trade Post',
    description: 'Unlocks the gold worker lane with a cap of +20 traders. Passively produces +1 gold/day. Each assigned trader adds +1 gold/day.',
    tierRequired: 2,
    cost: { wood: 18, stone: 10, iron: 4 },
    days: 4,
    resourceOutput: { gold: 1 },
    prerequisites: [{ anyTier1Completed: 2 }],
  },
  logistics_depot: {
    key: 'logistics_depot',
    name: 'Logistics Depot',
    description: 'Increases all active resource production lanes by +5%. Each additional Logistics Depot stacks for a further +5% bonus (e.g. 2 depots = +10% to all producing lanes).',
    tierRequired: 2,
    cost: { wood: 16, stone: 12, iron: 4 },
    days: 3,
    resourceOutput: {},
    prerequisites: [{ anyTier1Completed: 2 }],
  },
  prison: {
    key: 'prison',
    name: 'Prison',
    description: 'Holds captured enemies and criminals. Enables prisoner management and slave labor conversion. Provides 20 prisoner capacity. Upgrade to increase capacity by +20 per tier.',
    tierRequired: 2,
    cost: { wood: 20, stone: 18, iron: 4 },
    days: 4,
    resourceOutput: {},
    prerequisites: [{ type: 'housing', minCount: 2 }],
  },
  watchtower: {
    key: 'watchtower',
    name: 'Watchtower',
    description: 'Early warning and border surveillance structure for military readiness.',
    tierRequired: 2,
    cost: { wood: 14, stone: 12 },
    days: 3,
    resourceOutput: {},
    prerequisites: [{ type: 'housing', minCount: 1 }],
  },
  palisades: {
    key: 'palisades',
    name: 'Palisades',
    description: 'Basic fortifications that protect your settlement against raids.',
    tierRequired: 2,
    cost: { wood: 24, stone: 10 },
    days: 4,
    resourceOutput: {},
    prerequisites: [{ type: 'watchtower', minCount: 1 }],
  },
  infirmary: {
    key: 'infirmary',
    name: 'Infirmary',
    description: 'Treats injuries and disease, reducing effective sick and injured population pressure.',
    tierRequired: 2,
    cost: { wood: 14, stone: 8, iron: 2 },
    days: 3,
    resourceOutput: {},
    prerequisites: [{ type: 'housing', minCount: 1 }],
  },
  embassy: {
    key: 'embassy',
    name: 'Embassy',
    description: 'Formal diplomatic office for treaties, envoys, and alliance negotiations.',
    tierRequired: 3,
    cost: { wood: 20, stone: 16, iron: 8 },
    days: 4,
    resourceOutput: {},
    prerequisites: [{ type: 'trade_post', minCount: 1 }],
  },
  smithy: {
    key: 'smithy',
    name: 'Smithy',
    description: 'Forges weapons, armor, and tools to sustain military growth and heavy industry.',
    tierRequired: 3,
    cost: { wood: 18, stone: 14, iron: 10 },
    days: 4,
    resourceOutput: { minerals: 1 },
    prerequisites: [{ type: 'mine', minCount: 1 }],
  },
  wood_lodge: {
    key: 'wood_lodge',
    name: 'Wooden Lodge',
    description: 'Adds +8 population capacity per Wooden Lodge (requires Tier 2 Housing research). Stacks with other housing — build more to increase your worker pool.',
    tierRequired: 2,
    cost: { wood: 16, stone: 8, iron: 4 },
    days: 4,
    resourceOutput: {},
    prerequisites: [{ type: 'housing', minCount: 2 }],
  },
  hunters_lodge_advanced: {
    key: 'hunters_lodge_advanced',
    name: 'Grand Hunting Lodge',
    description: 'Raises the hunter worker cap by +20 (stacks with prior hunting buildings). Passively produces +1 meat/day. Each assigned hunter adds +1.5 meat/day.',
    tierRequired: 3,
    cost: { wood: 24, stone: 16, iron: 8 },
    days: 4,
    resourceOutput: { meat: 1 },
    prerequisites: [{ type: 'hunting_lodge', minCount: 1 }],
  },
  farm_advanced: {
    key: 'farm_advanced',
    name: 'Premium Farmland',
    description: 'Raises the farmer worker cap by +20. Passively yields +3 vegetables per harvest cycle (every 10 days). Best food output per building in the game.',
    tierRequired: 3,
    cost: { wood: 20, stone: 14, iron: 6 },
    days: 3,
    resourceOutput: { vegetables: 3 },
    prerequisites: [{ type: 'irrigated_farm', minCount: 1 }],
  },
  storage_advanced: {
    key: 'storage_advanced',
    name: 'Advanced Warehouse',
    description: 'Adds +300 storage capacity. The highest single-building storage bonus available.',
    tierRequired: 3,
    cost: { wood: 32, stone: 24, iron: 12 },
    days: 4,
    resourceOutput: {},
    prerequisites: [{ type: 'granary', minCount: 1 }],
  },
  quarry_advanced: {
    key: 'quarry_advanced',
    name: 'Advanced Quarry',
    description: 'Raises the stone worker cap by +20. Passively produces +2 stone/day. Each assigned quarrier still adds +1 stone/day.',
    tierRequired: 3,
    cost: { wood: 28, stone: 20, iron: 10 },
    days: 5,
    resourceOutput: { stone: 2 },
    prerequisites: [{ type: 'mine', minCount: 1 }],
  },
  mine_advanced: {
    key: 'mine_advanced',
    name: 'Deep Mine',
    description: 'Raises the iron/minerals worker cap by +20. Passively produces +2 minerals/day. Each assigned miner adds +1 mineral/day.',
    tierRequired: 3,
    cost: { wood: 32, stone: 28, iron: 14 },
    days: 5,
    resourceOutput: { minerals: 2 },
    prerequisites: [{ type: 'mine', minCount: 1 }],
  },
  research_lab_advanced: {
    key: 'research_lab_advanced',
    name: 'Advanced Research Lab',
    description: 'Raises the research worker cap by +20. Passively generates +2 research/day. Assign researchers to further increase daily output.',
    tierRequired: 3,
    cost: { wood: 30, stone: 28, iron: 16 },
    days: 5,
    resourceOutput: { research: 2 },
    prerequisites: [{ type: 'research_lab', minCount: 1 }],
  },
  builders_hut: {
    key: 'builders_hut',
    name: "Builder's Hut",
    description: 'Passively adds +3 to the construction lane each day, speeding up all active building projects. Stacks — each Builder\'s Hut adds another +3/day.',
    tierRequired: 3,
    cost: { wood: 20, stone: 16, iron: 8 },
    days: 3,
    resourceOutput: {},
    prerequisites: [],
  },
};

Object.assign(BUILDING_CATALOG, {
  market_hall: {
    key: 'market_hall',
    name: 'Market Hall',
    description: 'A formalized trade district that expands taxable commerce and caravan throughput.',
    tierRequired: 3,
    cost: { wood: 24, stone: 16, iron: 8 },
    days: 4,
    resourceOutput: { gold: 2 },
    prerequisites: [{ type: 'trade_post', minCount: 1 }],
  },
  merchant_exchange: {
    key: 'merchant_exchange',
    name: 'Merchant Exchange',
    description: 'Guild-backed trade contracts improve market velocity and regional prices.',
    tierRequired: 4,
    cost: { wood: 32, stone: 24, iron: 12 },
    days: 5,
    resourceOutput: { gold: 3 },
    prerequisites: [{ type: 'market_hall', minCount: 1 }],
  },
  grand_bazaar: {
    key: 'grand_bazaar',
    name: 'Grand Bazaar',
    description: 'A major bazaar that attracts caravans, brokers, and long-distance traders.',
    tierRequired: 5,
    cost: { wood: 40, stone: 30, iron: 16 },
    days: 6,
    resourceOutput: { gold: 4 },
    prerequisites: [{ type: 'merchant_exchange', minCount: 1 }],
  },
  great_market: {
    key: 'great_market',
    name: 'Great Market',
    description: 'A sprawling civic marketplace with regulated stalls and premium tax yields.',
    tierRequired: 6,
    cost: { wood: 48, stone: 36, iron: 20 },
    days: 7,
    resourceOutput: { gold: 5 },
    prerequisites: [{ type: 'grand_bazaar', minCount: 1 }],
  },
  trade_consortium: {
    key: 'trade_consortium',
    name: 'Trade Consortium',
    description: 'Merchant houses consolidate routes and financing into a single trade authority.',
    tierRequired: 7,
    cost: { wood: 56, stone: 42, iron: 24 },
    days: 8,
    resourceOutput: { gold: 6 },
    prerequisites: [{ type: 'great_market', minCount: 1 }],
  },
  royal_exchange: {
    key: 'royal_exchange',
    name: 'Royal Exchange',
    description: 'State-chartered exchange with superior tariffs, arbitration, and market confidence.',
    tierRequired: 8,
    cost: { wood: 64, stone: 50, iron: 30 },
    days: 9,
    resourceOutput: { gold: 7 },
    prerequisites: [{ type: 'trade_consortium', minCount: 1 }],
  },
  imperial_trade_forum: {
    key: 'imperial_trade_forum',
    name: 'Imperial Trade Forum',
    description: 'Empire-scale trade governance and premium merchant throughput.',
    tierRequired: 10,
    cost: { wood: 80, stone: 64, iron: 40 },
    days: 10,
    resourceOutput: { gold: 8 },
    prerequisites: [{ type: 'royal_exchange', minCount: 1 }],
  },

  forge: {
    key: 'forge',
    name: 'Forge',
    description: 'A hardened production forge for higher-quality tools and military equipment.',
    tierRequired: 4,
    cost: { wood: 24, stone: 20, iron: 14 },
    days: 5,
    resourceOutput: { minerals: 2 },
    prerequisites: [{ type: 'smithy', minCount: 1 }],
  },
  master_smithy: {
    key: 'master_smithy',
    name: 'Master Smithy',
    description: 'Master craftsmen significantly improve output quality and consistency.',
    tierRequired: 5,
    cost: { wood: 30, stone: 24, iron: 18 },
    days: 6,
    resourceOutput: { minerals: 3 },
    prerequisites: [{ type: 'forge', minCount: 1 }],
  },
  royal_forge: {
    key: 'royal_forge',
    name: 'Royal Forge',
    description: 'Royal contracts standardize superior arms and armor production.',
    tierRequired: 6,
    cost: { wood: 36, stone: 30, iron: 24 },
    days: 7,
    resourceOutput: { minerals: 4 },
    prerequisites: [{ type: 'master_smithy', minCount: 1 }],
  },
  grand_forge: {
    key: 'grand_forge',
    name: 'Grand Forge',
    description: 'Heavy industrial furnaces support mass production and advanced alloys.',
    tierRequired: 7,
    cost: { wood: 44, stone: 36, iron: 30 },
    days: 8,
    resourceOutput: { minerals: 5 },
    prerequisites: [{ type: 'royal_forge', minCount: 1 }],
  },
  war_smithy: {
    key: 'war_smithy',
    name: 'War Smithy',
    description: 'Dedicated wartime manufacture for elite offensive and defensive gear.',
    tierRequired: 8,
    cost: { wood: 52, stone: 44, iron: 38 },
    days: 9,
    resourceOutput: { minerals: 6 },
    prerequisites: [{ type: 'grand_forge', minCount: 1 }],
  },
  imperial_forge: {
    key: 'imperial_forge',
    name: 'Imperial Forge',
    description: 'Top-tier military metallurgy and strategic arms output.',
    tierRequired: 9,
    cost: { wood: 62, stone: 52, iron: 46 },
    days: 10,
    resourceOutput: { minerals: 7 },
    prerequisites: [{ type: 'war_smithy', minCount: 1 }],
  },

  signal_tower: {
    key: 'signal_tower',
    name: 'Signal Tower',
    description: 'Extended sight lines and signal systems improve response time.',
    tierRequired: 4,
    cost: { wood: 20, stone: 16, iron: 6 },
    days: 4,
    resourceOutput: {},
    prerequisites: [{ type: 'watchtower', minCount: 1 }],
  },
  sentinel_tower: {
    key: 'sentinel_tower',
    name: 'Sentinel Tower',
    description: 'Permanent sentry staffing expands early warning coverage.',
    tierRequired: 5,
    cost: { wood: 26, stone: 22, iron: 10 },
    days: 5,
    resourceOutput: {},
    prerequisites: [{ type: 'signal_tower', minCount: 1 }],
  },
  border_tower: {
    key: 'border_tower',
    name: 'Border Tower',
    description: 'Frontier surveillance post for high-risk perimeter zones.',
    tierRequired: 6,
    cost: { wood: 32, stone: 28, iron: 14 },
    days: 6,
    resourceOutput: {},
    prerequisites: [{ type: 'sentinel_tower', minCount: 1 }],
  },
  high_watch: {
    key: 'high_watch',
    name: 'High Watch',
    description: 'Elevated defensive watch improves broad-range threat detection.',
    tierRequired: 7,
    cost: { wood: 40, stone: 34, iron: 18 },
    days: 7,
    resourceOutput: {},
    prerequisites: [{ type: 'border_tower', minCount: 1 }],
  },
  beacon_tower: {
    key: 'beacon_tower',
    name: 'Beacon Tower',
    description: 'Long-range beacon relays coordinate fast regional alerts.',
    tierRequired: 8,
    cost: { wood: 48, stone: 40, iron: 24 },
    days: 8,
    resourceOutput: {},
    prerequisites: [{ type: 'high_watch', minCount: 1 }],
  },
  watch_bastion: {
    key: 'watch_bastion',
    name: 'Watch Bastion',
    description: 'Fortified strategic lookout that anchors your defensive network.',
    tierRequired: 9,
    cost: { wood: 56, stone: 48, iron: 30 },
    days: 9,
    resourceOutput: {},
    prerequisites: [{ type: 'beacon_tower', minCount: 1 }],
  },

  fortified_palisades: {
    key: 'fortified_palisades',
    name: 'Fortified Palisades',
    description: 'Strengthened palisades with improved anti-raid durability.',
    tierRequired: 3,
    cost: { wood: 30, stone: 14, iron: 4 },
    days: 4,
    resourceOutput: {},
    prerequisites: [{ type: 'palisades', minCount: 1 }],
  },
  wooden_ramparts: {
    key: 'wooden_ramparts',
    name: 'Wooden Ramparts',
    description: 'Raised fighting positions with stronger perimeter control.',
    tierRequired: 4,
    cost: { wood: 36, stone: 20, iron: 8 },
    days: 5,
    resourceOutput: {},
    prerequisites: [{ type: 'fortified_palisades', minCount: 1 }],
  },
  stone_walls: {
    key: 'stone_walls',
    name: 'Stone Walls',
    description: 'Permanent stone fortifications with substantial defense gains.',
    tierRequired: 5,
    cost: { wood: 42, stone: 30, iron: 12 },
    days: 6,
    resourceOutput: {},
    prerequisites: [{ type: 'wooden_ramparts', minCount: 1 }],
  },
  reinforced_walls: {
    key: 'reinforced_walls',
    name: 'Reinforced Walls',
    description: 'Layered wall segments designed for prolonged siege resistance.',
    tierRequired: 6,
    cost: { wood: 48, stone: 38, iron: 18 },
    days: 7,
    resourceOutput: {},
    prerequisites: [{ type: 'stone_walls', minCount: 1 }],
  },
  fortified_walls: {
    key: 'fortified_walls',
    name: 'Fortified Walls',
    description: 'Expanded defensive architecture with stronger gate protections.',
    tierRequired: 7,
    cost: { wood: 56, stone: 46, iron: 24 },
    days: 8,
    resourceOutput: {},
    prerequisites: [{ type: 'reinforced_walls', minCount: 1 }],
  },
  bastion_walls: {
    key: 'bastion_walls',
    name: 'Bastion Walls',
    description: 'Bastion design improves crossfire coverage and defensive depth.',
    tierRequired: 8,
    cost: { wood: 64, stone: 56, iron: 30 },
    days: 9,
    resourceOutput: {},
    prerequisites: [{ type: 'fortified_walls', minCount: 1 }],
  },
  citadel_walls: {
    key: 'citadel_walls',
    name: 'Citadel Walls',
    description: 'Citadel-grade walls deliver high-end fortress survivability.',
    tierRequired: 9,
    cost: { wood: 74, stone: 66, iron: 38 },
    days: 10,
    resourceOutput: {},
    prerequisites: [{ type: 'bastion_walls', minCount: 1 }],
  },
  fortress_walls: {
    key: 'fortress_walls',
    name: 'Fortress Walls',
    description: 'Peak fortification standard for maximal settlement defense.',
    tierRequired: 10,
    cost: { wood: 86, stone: 78, iron: 48 },
    days: 11,
    resourceOutput: {},
    prerequisites: [{ type: 'citadel_walls', minCount: 1 }],
  },

  hospital: {
    key: 'hospital',
    name: 'Hospital',
    description: 'Dedicated medical treatment capacity for disease and battlefield injury.',
    tierRequired: 3,
    cost: { wood: 18, stone: 12, iron: 4 },
    days: 4,
    resourceOutput: {},
    prerequisites: [{ type: 'housing', minCount: 2 }],
  },
  field_hospital: {
    key: 'field_hospital',
    name: 'Field Hospital',
    description: 'Forward treatment and triage to reduce severe casualty losses.',
    tierRequired: 5,
    cost: { wood: 24, stone: 18, iron: 8 },
    days: 5,
    resourceOutput: {},
    prerequisites: [{ type: 'infirmary', minCount: 1 }],
  },
  grand_infirmary: {
    key: 'grand_infirmary',
    name: 'Grand Infirmary',
    description: 'Expanded recovery wards for rapid stabilization and treatment throughput.',
    tierRequired: 6,
    cost: { wood: 30, stone: 24, iron: 12 },
    days: 6,
    resourceOutput: {},
    prerequisites: [{ type: 'field_hospital', minCount: 1 }],
  },
  healing_hall: {
    key: 'healing_hall',
    name: 'Healing Hall',
    description: 'Improved diagnostics and treatment infrastructure.',
    tierRequired: 7,
    cost: { wood: 36, stone: 30, iron: 18 },
    days: 7,
    resourceOutput: {},
    prerequisites: [{ type: 'grand_infirmary', minCount: 1 }],
  },
  restorative_ward: {
    key: 'restorative_ward',
    name: 'Restorative Ward',
    description: 'Long-term care and rehabilitation for faster workforce recovery.',
    tierRequired: 8,
    cost: { wood: 44, stone: 36, iron: 24 },
    days: 8,
    resourceOutput: {},
    prerequisites: [{ type: 'healing_hall', minCount: 1 }],
  },
  sanctified_clinic: {
    key: 'sanctified_clinic',
    name: 'Sanctified Clinic',
    description: 'Hybrid spiritual and medical care for robust resilience.',
    tierRequired: 9,
    cost: { wood: 52, stone: 44, iron: 30 },
    days: 9,
    resourceOutput: {},
    prerequisites: [{ type: 'restorative_ward', minCount: 1 }],
  },
  royal_medical_hall: {
    key: 'royal_medical_hall',
    name: 'Royal Medical Hall',
    description: 'Top-tier medical institution for kingdom-scale health support.',
    tierRequired: 10,
    cost: { wood: 62, stone: 52, iron: 38 },
    days: 10,
    resourceOutput: {},
    prerequisites: [{ type: 'sanctified_clinic', minCount: 1 }],
  },

  council_hall: {
    key: 'council_hall',
    name: 'Council Hall',
    description: 'Formal council governance for treaties, envoys, and local diplomacy.',
    tierRequired: 4,
    cost: { wood: 26, stone: 20, iron: 8 },
    days: 5,
    resourceOutput: {},
    prerequisites: [{ type: 'embassy', minCount: 1 }],
  },
  diplomatic_office: {
    key: 'diplomatic_office',
    name: 'Diplomatic Office',
    description: 'Permanent diplomatic staff improve alliance reliability and response.',
    tierRequired: 5,
    cost: { wood: 32, stone: 26, iron: 12 },
    days: 6,
    resourceOutput: {},
    prerequisites: [{ type: 'council_hall', minCount: 1 }],
  },
  royal_embassy: {
    key: 'royal_embassy',
    name: 'Royal Embassy',
    description: 'Royal diplomatic prestige expands influence with neighboring powers.',
    tierRequired: 6,
    cost: { wood: 38, stone: 32, iron: 16 },
    days: 7,
    resourceOutput: {},
    prerequisites: [{ type: 'diplomatic_office', minCount: 1 }],
  },
  grand_embassy: {
    key: 'grand_embassy',
    name: 'Grand Embassy',
    description: 'Expanded envoy capacity for multi-state diplomatic campaigns.',
    tierRequired: 7,
    cost: { wood: 46, stone: 40, iron: 22 },
    days: 8,
    resourceOutput: {},
    prerequisites: [{ type: 'royal_embassy', minCount: 1 }],
  },
  treaty_hall: {
    key: 'treaty_hall',
    name: 'Treaty Hall',
    description: 'Dedicated treaty negotiation and ratification infrastructure.',
    tierRequired: 8,
    cost: { wood: 54, stone: 48, iron: 28 },
    days: 9,
    resourceOutput: {},
    prerequisites: [{ type: 'grand_embassy', minCount: 1 }],
  },
  foreign_affairs_hall: {
    key: 'foreign_affairs_hall',
    name: 'Foreign Affairs Hall',
    description: 'High-level diplomatic command center for international policy.',
    tierRequired: 9,
    cost: { wood: 64, stone: 56, iron: 36 },
    days: 10,
    resourceOutput: {},
    prerequisites: [{ type: 'treaty_hall', minCount: 1 }],
  },

  supply_depot: {
    key: 'supply_depot',
    name: 'Supply Depot',
    description: 'Improved stock movement and distribution discipline across the fief.',
    tierRequired: 4,
    cost: { wood: 22, stone: 18, iron: 8 },
    days: 4,
    resourceOutput: {},
    prerequisites: [{ type: 'logistics_depot', minCount: 1 }],
  },
  roadworks: {
    key: 'roadworks',
    name: 'Roadworks',
    description: 'Road upgrades reduce transport friction for all production lanes.',
    tierRequired: 5,
    cost: { wood: 28, stone: 24, iron: 12 },
    days: 5,
    resourceOutput: {},
    prerequisites: [{ type: 'supply_depot', minCount: 1 }],
  },
  quartermaster_depot: {
    key: 'quartermaster_depot',
    name: 'Quartermaster Depot',
    description: 'Professional logistics management improves resource throughput reliability.',
    tierRequired: 6,
    cost: { wood: 34, stone: 30, iron: 16 },
    days: 6,
    resourceOutput: {},
    prerequisites: [{ type: 'roadworks', minCount: 1 }],
  },
  supply_network: {
    key: 'supply_network',
    name: 'Supply Network',
    description: 'Integrated depots and routing maximize city-wide gathering consistency.',
    tierRequired: 7,
    cost: { wood: 42, stone: 36, iron: 22 },
    days: 7,
    resourceOutput: {},
    prerequisites: [{ type: 'quartermaster_depot', minCount: 1 }],
  },
  imperial_logistics_hub: {
    key: 'imperial_logistics_hub',
    name: 'Imperial Logistics Hub',
    description: 'Large-scale logistics command accelerates every active production lane.',
    tierRequired: 8,
    cost: { wood: 50, stone: 44, iron: 28 },
    days: 8,
    resourceOutput: {},
    prerequisites: [{ type: 'supply_network', minCount: 1 }],
  },
  trade_route_office: {
    key: 'trade_route_office',
    name: 'Trade Route Office',
    description: 'Route optimization office for final-stage logistics efficiency.',
    tierRequired: 9,
    cost: { wood: 60, stone: 54, iron: 36 },
    days: 9,
    resourceOutput: {},
    prerequisites: [{ type: 'imperial_logistics_hub', minCount: 1 }],
  },

  dungeon: {
    key: 'dungeon',
    name: 'Dungeon',
    description: 'Secure underground prison with stronger confinement standards. Provides 40 prisoner capacity (+20 over Prison). Excess prisoners automatically escape into the civilian population.',
    tierRequired: 4,
    cost: { wood: 24, stone: 24, iron: 8 },
    days: 5,
    resourceOutput: {},
    prerequisites: [{ type: 'prison', minCount: 1 }],
  },
  black_cells: {
    key: 'black_cells',
    name: 'Black Cells',
    description: 'High-control isolation blocks for dangerous detainees. Provides 60 prisoner capacity. Prisoners above the cap will escape and blend into the civilian population.',
    tierRequired: 5,
    cost: { wood: 30, stone: 30, iron: 14 },
    days: 6,
    resourceOutput: {},
    prerequisites: [{ type: 'dungeon', minCount: 1 }],
  },
  deep_prison: {
    key: 'deep_prison',
    name: 'Deep Prison',
    description: 'Layered subterranean containment for long-term high-risk detention. Provides 80 prisoner capacity.',
    tierRequired: 6,
    cost: { wood: 36, stone: 38, iron: 18 },
    days: 7,
    resourceOutput: {},
    prerequisites: [{ type: 'black_cells', minCount: 1 }],
  },
  high_security_prison: {
    key: 'high_security_prison',
    name: 'High Security Prison',
    description: 'Fortified incarceration complex with advanced oversight. Provides 100 prisoner capacity.',
    tierRequired: 7,
    cost: { wood: 44, stone: 46, iron: 24 },
    days: 8,
    resourceOutput: {},
    prerequisites: [{ type: 'deep_prison', minCount: 1 }],
  },
  iron_keep: {
    key: 'iron_keep',
    name: 'Iron Keep',
    description: 'Heavy confinement fortress for maximal prisoner control. Provides 120 prisoner capacity.',
    tierRequired: 8,
    cost: { wood: 52, stone: 54, iron: 32 },
    days: 9,
    resourceOutput: {},
    prerequisites: [{ type: 'high_security_prison', minCount: 1 }],
  },
  shadow_vault: {
    key: 'shadow_vault',
    name: 'Shadow Vault',
    description: 'Final-tier detention architecture for covert and strategic prisoners. Provides 140 prisoner capacity — the maximum.',
    tierRequired: 9,
    cost: { wood: 62, stone: 64, iron: 40 },
    days: 10,
    resourceOutput: {},
    prerequisites: [{ type: 'iron_keep', minCount: 1 }],
  },

  militia_camp: {
    key: 'militia_camp',
    name: 'Militia Camp',
    description: 'Basic militia training grounds for local defense preparedness.',
    tierRequired: 3,
    cost: { wood: 20, stone: 12, iron: 4 },
    days: 4,
    resourceOutput: {},
    prerequisites: [{ type: 'watchtower', minCount: 1 }],
  },
  militia_barracks: {
    key: 'militia_barracks',
    name: 'Militia Barracks',
    description: 'Structured militia housing and drill space for stronger defenders.',
    tierRequired: 4,
    cost: { wood: 26, stone: 18, iron: 8 },
    days: 5,
    resourceOutput: {},
    prerequisites: [{ type: 'militia_camp', minCount: 1 }],
  },
  veteran_barracks: {
    key: 'veteran_barracks',
    name: 'Veteran Barracks',
    description: 'Veteran-led training improves unit readiness and durability.',
    tierRequired: 5,
    cost: { wood: 32, stone: 26, iron: 12 },
    days: 6,
    resourceOutput: {},
    prerequisites: [{ type: 'militia_barracks', minCount: 1 }],
  },
  elite_garrison: {
    key: 'elite_garrison',
    name: 'Elite Garrison',
    description: 'Professional defense corps with superior discipline.',
    tierRequired: 6,
    cost: { wood: 40, stone: 34, iron: 18 },
    days: 7,
    resourceOutput: {},
    prerequisites: [{ type: 'veteran_barracks', minCount: 1 }],
  },
  war_garrison: {
    key: 'war_garrison',
    name: 'War Garrison',
    description: 'Operational wartime barracks for sustained deployments.',
    tierRequired: 7,
    cost: { wood: 48, stone: 42, iron: 24 },
    days: 8,
    resourceOutput: {},
    prerequisites: [{ type: 'elite_garrison', minCount: 1 }],
  },
  legion_garrison: {
    key: 'legion_garrison',
    name: 'Legion Garrison',
    description: 'Large-scale formation and command housing for veteran units.',
    tierRequired: 8,
    cost: { wood: 56, stone: 50, iron: 30 },
    days: 9,
    resourceOutput: {},
    prerequisites: [{ type: 'war_garrison', minCount: 1 }],
  },
  imperial_muster_hall: {
    key: 'imperial_muster_hall',
    name: 'Imperial Muster Hall',
    description: 'Final-tier troop mustering center with strategic mobilization capacity.',
    tierRequired: 9,
    cost: { wood: 66, stone: 60, iron: 38 },
    days: 10,
    resourceOutput: {},
    prerequisites: [{ type: 'legion_garrison', minCount: 1 }],
  },

  stables: {
    key: 'stables',
    name: 'Stables',
    description: 'Mounted training and horse management for cavalry foundations.',
    tierRequired: 3,
    cost: { wood: 20, stone: 10, iron: 4 },
    days: 4,
    resourceOutput: {},
    prerequisites: [{ type: 'militia_camp', minCount: 1 }],
  },
  war_stables: {
    key: 'war_stables',
    name: 'War Stables',
    description: 'Battle-ready cavalry training and heavier mount support.',
    tierRequired: 4,
    cost: { wood: 26, stone: 16, iron: 8 },
    days: 5,
    resourceOutput: {},
    prerequisites: [{ type: 'stables', minCount: 1 }],
  },
  royal_stables: {
    key: 'royal_stables',
    name: 'Royal Stables',
    description: 'Elite cavalry breeding and command rider training.',
    tierRequired: 5,
    cost: { wood: 32, stone: 22, iron: 12 },
    days: 6,
    resourceOutput: {},
    prerequisites: [{ type: 'war_stables', minCount: 1 }],
  },
  elite_stables: {
    key: 'elite_stables',
    name: 'Elite Stables',
    description: 'Higher-quality mounts and improved cavalry tactical readiness.',
    tierRequired: 6,
    cost: { wood: 40, stone: 30, iron: 16 },
    days: 7,
    resourceOutput: {},
    prerequisites: [{ type: 'royal_stables', minCount: 1 }],
  },
  royal_cavalry_stables: {
    key: 'royal_cavalry_stables',
    name: 'Royal Cavalry Stables',
    description: 'Top-tier cavalry infrastructure for charge power and mobility.',
    tierRequired: 7,
    cost: { wood: 48, stone: 38, iron: 22 },
    days: 8,
    resourceOutput: {},
    prerequisites: [{ type: 'elite_stables', minCount: 1 }],
  },

  archer_range: {
    key: 'archer_range',
    name: 'Archer Range',
    description: 'Foundational ranged training for volley discipline and accuracy.',
    tierRequired: 3,
    cost: { wood: 20, stone: 12, iron: 4 },
    days: 4,
    resourceOutput: {},
    prerequisites: [{ type: 'militia_camp', minCount: 1 }],
  },
  bowyer_hall: {
    key: 'bowyer_hall',
    name: 'Bowyer Hall',
    description: 'Professional bowcraft and tactical range drills improve ranged reliability.',
    tierRequired: 4,
    cost: { wood: 26, stone: 18, iron: 8 },
    days: 5,
    resourceOutput: {},
    prerequisites: [{ type: 'archer_range', minCount: 1 }],
  },
  master_fletcher_range: {
    key: 'master_fletcher_range',
    name: 'Master Fletcher Range',
    description: 'Advanced arrowcraft and marksmanship training for elite ranged units.',
    tierRequired: 5,
    cost: { wood: 32, stone: 24, iron: 12 },
    days: 6,
    resourceOutput: {},
    prerequisites: [{ type: 'bowyer_hall', minCount: 1 }],
  },
  elite_fletching_hall: {
    key: 'elite_fletching_hall',
    name: 'Elite Fletching Hall',
    description: 'Refined fletching and advanced drills produce disciplined volleys.',
    tierRequired: 6,
    cost: { wood: 40, stone: 30, iron: 16 },
    days: 7,
    resourceOutput: {},
    prerequisites: [{ type: 'master_fletcher_range', minCount: 1 }],
  },
  royal_marksman_range: {
    key: 'royal_marksman_range',
    name: 'Royal Marksman Range',
    description: 'Top-tier marksman training grounds with superior ranged effectiveness.',
    tierRequired: 7,
    cost: { wood: 48, stone: 38, iron: 22 },
    days: 8,
    resourceOutput: {},
    prerequisites: [{ type: 'elite_fletching_hall', minCount: 1 }],
  },

  swordsmith_hall: {
    key: 'swordsmith_hall',
    name: 'Swordsmith Hall',
    description: 'Melee infantry support line for blade production and training quality.',
    tierRequired: 3,
    cost: { wood: 22, stone: 14, iron: 8 },
    days: 4,
    resourceOutput: {},
    prerequisites: [{ type: 'smithy', minCount: 1 }],
  },
  blade_hall: {
    key: 'blade_hall',
    name: 'Blade Hall',
    description: 'Expanded melee equipment and advanced blade drills.',
    tierRequired: 4,
    cost: { wood: 28, stone: 20, iron: 12 },
    days: 5,
    resourceOutput: {},
    prerequisites: [{ type: 'swordsmith_hall', minCount: 1 }],
  },
  champion_forge: {
    key: 'champion_forge',
    name: 'Champion Forge',
    description: 'Champion-grade forging and training support for frontline elites.',
    tierRequired: 5,
    cost: { wood: 34, stone: 26, iron: 16 },
    days: 6,
    resourceOutput: {},
    prerequisites: [{ type: 'blade_hall', minCount: 1 }],
  },
  veteran_bladesmith_hall: {
    key: 'veteran_bladesmith_hall',
    name: 'Veteran Bladesmith Hall',
    description: 'Veteran smith coordination improves battle-ready melee kit quality.',
    tierRequired: 6,
    cost: { wood: 42, stone: 34, iron: 22 },
    days: 7,
    resourceOutput: {},
    prerequisites: [{ type: 'champion_forge', minCount: 1 }],
  },
  royal_blade_forge: {
    key: 'royal_blade_forge',
    name: 'Royal Blade Forge',
    description: 'Royal-grade blade production line for top-tier melee forces.',
    tierRequired: 7,
    cost: { wood: 50, stone: 42, iron: 30 },
    days: 8,
    resourceOutput: {},
    prerequisites: [{ type: 'veteran_bladesmith_hall', minCount: 1 }],
  },

  spear_drill_yard: {
    key: 'spear_drill_yard',
    name: 'Spear Drill Yard',
    description: 'Formation-focused anti-cavalry training and pike discipline.',
    tierRequired: 3,
    cost: { wood: 20, stone: 14, iron: 6 },
    days: 4,
    resourceOutput: {},
    prerequisites: [{ type: 'militia_camp', minCount: 1 }],
  },
  pike_yard: {
    key: 'pike_yard',
    name: 'Pike Yard',
    description: 'Improved anti-cavalry drills and formation cohesion.',
    tierRequired: 4,
    cost: { wood: 26, stone: 20, iron: 10 },
    days: 5,
    resourceOutput: {},
    prerequisites: [{ type: 'spear_drill_yard', minCount: 1 }],
  },
  formation_citadel: {
    key: 'formation_citadel',
    name: 'Formation Citadel',
    description: 'Command-grade formation training for disciplined defensive lines.',
    tierRequired: 5,
    cost: { wood: 32, stone: 28, iron: 14 },
    days: 6,
    resourceOutput: {},
    prerequisites: [{ type: 'pike_yard', minCount: 1 }],
  },
  shieldwall_hall: {
    key: 'shieldwall_hall',
    name: 'Shieldwall Hall',
    description: 'Advanced shieldwall doctrine and anti-charge battlefield control.',
    tierRequired: 6,
    cost: { wood: 40, stone: 36, iron: 20 },
    days: 7,
    resourceOutput: {},
    prerequisites: [{ type: 'formation_citadel', minCount: 1 }],
  },
  phalanx_command: {
    key: 'phalanx_command',
    name: 'Phalanx Command',
    description: 'Elite anti-cavalry command center for high-discipline formations.',
    tierRequired: 7,
    cost: { wood: 48, stone: 44, iron: 28 },
    days: 8,
    resourceOutput: {},
    prerequisites: [{ type: 'shieldwall_hall', minCount: 1 }],
  },

  armory: {
    key: 'armory',
    name: 'Armory',
    description: 'Centralized military equipment storage and distribution support.',
    tierRequired: 3,
    cost: { wood: 22, stone: 18, iron: 10 },
    days: 5,
    resourceOutput: {},
    prerequisites: [{ type: 'smithy', minCount: 1 }],
  },
  expanded_armory: {
    key: 'expanded_armory',
    name: 'Expanded Armory',
    description: 'Larger arms stock and improved upkeep for military lines.',
    tierRequired: 4,
    cost: { wood: 28, stone: 24, iron: 14 },
    days: 6,
    resourceOutput: {},
    prerequisites: [{ type: 'armory', minCount: 1 }],
  },
  royal_armory: {
    key: 'royal_armory',
    name: 'Royal Armory',
    description: 'Royal-issued standards boost equipment quality and consistency.',
    tierRequired: 5,
    cost: { wood: 34, stone: 30, iron: 20 },
    days: 7,
    resourceOutput: {},
    prerequisites: [{ type: 'expanded_armory', minCount: 1 }],
  },
  grand_armory: {
    key: 'grand_armory',
    name: 'Grand Armory',
    description: 'Large arsenal logistics for high-volume unit support.',
    tierRequired: 6,
    cost: { wood: 42, stone: 38, iron: 26 },
    days: 8,
    resourceOutput: {},
    prerequisites: [{ type: 'royal_armory', minCount: 1 }],
  },
  war_arsenal: {
    key: 'war_arsenal',
    name: 'War Arsenal',
    description: 'Final-tier military supply complex for campaign-scale deployment.',
    tierRequired: 7,
    cost: { wood: 50, stone: 46, iron: 34 },
    days: 9,
    resourceOutput: {},
    prerequisites: [{ type: 'grand_armory', minCount: 1 }],
  },

  drill_yard: {
    key: 'drill_yard',
    name: 'Drill Yard',
    description: 'Broad military drill and discipline throughput support.',
    tierRequired: 3,
    cost: { wood: 20, stone: 14, iron: 6 },
    days: 4,
    resourceOutput: {},
    prerequisites: [{ type: 'militia_camp', minCount: 1 }],
  },
  training_grounds: {
    key: 'training_grounds',
    name: 'Training Grounds',
    description: 'Expanded training infrastructure for faster military readiness.',
    tierRequired: 4,
    cost: { wood: 26, stone: 20, iron: 10 },
    days: 5,
    resourceOutput: {},
    prerequisites: [{ type: 'drill_yard', minCount: 1 }],
  },
  elite_drill_grounds: {
    key: 'elite_drill_grounds',
    name: 'Elite Drill Grounds',
    description: 'Advanced tactical training for veteran troop performance.',
    tierRequired: 5,
    cost: { wood: 32, stone: 28, iron: 14 },
    days: 6,
    resourceOutput: {},
    prerequisites: [{ type: 'training_grounds', minCount: 1 }],
  },
  veteran_training_grounds: {
    key: 'veteran_training_grounds',
    name: 'Veteran Training Grounds',
    description: 'Specialized training programs for advanced battlefield roles.',
    tierRequired: 6,
    cost: { wood: 40, stone: 36, iron: 20 },
    days: 7,
    resourceOutput: {},
    prerequisites: [{ type: 'elite_drill_grounds', minCount: 1 }],
  },
  war_college: {
    key: 'war_college',
    name: 'War College',
    description: 'Strategic military academy for top-tier doctrine and training speed.',
    tierRequired: 7,
    cost: { wood: 50, stone: 46, iron: 28 },
    days: 8,
    resourceOutput: {},
    prerequisites: [{ type: 'veteran_training_grounds', minCount: 1 }],
  },

  command_post: {
    key: 'command_post',
    name: 'Command Post',
    description: 'Foundational command and coordination hub for active armies.',
    tierRequired: 3,
    cost: { wood: 22, stone: 16, iron: 8 },
    days: 5,
    resourceOutput: {},
    prerequisites: [{ type: 'militia_camp', minCount: 1 }],
  },
  war_room: {
    key: 'war_room',
    name: 'War Room',
    description: 'Operational planning center for coordinated campaign maneuvers.',
    tierRequired: 4,
    cost: { wood: 28, stone: 22, iron: 12 },
    days: 6,
    resourceOutput: {},
    prerequisites: [{ type: 'command_post', minCount: 1 }],
  },
  strategic_command: {
    key: 'strategic_command',
    name: 'Strategic Command',
    description: 'Higher-order military coordination and readiness management.',
    tierRequired: 5,
    cost: { wood: 34, stone: 30, iron: 16 },
    days: 7,
    resourceOutput: {},
    prerequisites: [{ type: 'war_room', minCount: 1 }],
  },
  advanced_command_center: {
    key: 'advanced_command_center',
    name: 'Advanced Command Center',
    description: 'Improved command logistics for large-scale force deployment.',
    tierRequired: 6,
    cost: { wood: 42, stone: 38, iron: 22 },
    days: 8,
    resourceOutput: {},
    prerequisites: [{ type: 'strategic_command', minCount: 1 }],
  },
  high_command_citadel: {
    key: 'high_command_citadel',
    name: 'High Command Citadel',
    description: 'Final-tier military command complex for strategic dominance.',
    tierRequired: 7,
    cost: { wood: 52, stone: 48, iron: 30 },
    days: 9,
    resourceOutput: {},
    prerequisites: [{ type: 'advanced_command_center', minCount: 1 }],
  },

  siege_engine_workshop: {
    key: 'siege_engine_workshop',
    name: 'Siege Engine Workshop',
    description: 'Workshop line for siege assembly and engineering support.',
    tierRequired: 3,
    cost: { wood: 24, stone: 20, iron: 10 },
    days: 6,
    resourceOutput: {},
    prerequisites: [{ type: 'armory', minCount: 1 }],
  },
  siege_foundry: {
    key: 'siege_foundry',
    name: 'Siege Foundry',
    description: 'Foundry expansion for stronger and more reliable siege frames.',
    tierRequired: 4,
    cost: { wood: 30, stone: 28, iron: 16 },
    days: 7,
    resourceOutput: {},
    prerequisites: [{ type: 'siege_engine_workshop', minCount: 1 }],
  },
  war_engine_forge: {
    key: 'war_engine_forge',
    name: 'War Engine Forge',
    description: 'Advanced siege metallurgy for stronger engine quality.',
    tierRequired: 5,
    cost: { wood: 36, stone: 36, iron: 22 },
    days: 8,
    resourceOutput: {},
    prerequisites: [{ type: 'siege_foundry', minCount: 1 }],
  },
  advanced_siege_workshop: {
    key: 'advanced_siege_workshop',
    name: 'Advanced Siege Workshop',
    description: 'High-throughput siege engineering and assembly systems.',
    tierRequired: 6,
    cost: { wood: 44, stone: 44, iron: 28 },
    days: 9,
    resourceOutput: {},
    prerequisites: [{ type: 'war_engine_forge', minCount: 1 }],
  },
  imperial_siege_hall: {
    key: 'imperial_siege_hall',
    name: 'Imperial Siege Hall',
    description: 'Top-tier siege doctrine and production control center.',
    tierRequired: 7,
    cost: { wood: 54, stone: 54, iron: 36 },
    days: 10,
    resourceOutput: {},
    prerequisites: [{ type: 'advanced_siege_workshop', minCount: 1 }],
  },
});

const TIER1_BUILDING_TYPES = new Set(['housing', 'storage', 'hunters_guild', 'farm', 'quarry']);
const TIER2_BUILDING_TYPES = new Set(['lumber_mill', 'granary', 'hunting_lodge', 'irrigated_farm', 'mine', 'research_lab', 'faith_temple', 'trade_post', 'logistics_depot', 'prison', 'watchtower', 'palisades', 'infirmary', 'wood_lodge', 'storage_shack']);
const TIER3_BUILDING_TYPES = new Set(['hunters_lodge_advanced', 'farm_advanced', 'storage_advanced', 'quarry_advanced', 'mine_advanced', 'research_lab_advanced', 'builders_hut', 'embassy', 'smithy']);

const BUILDING_UPGRADE_MAP = {
  housing: {
    researchRequired: 'tier2_housing',
    upgradedBuilding: 'wood_lodge',
    tier3: 'wood_lodge',
  },
  storage: {
    researchRequired: 'tier2_storage',
    upgradedBuilding: 'storage_shack',
    tier3: 'storage_advanced',
  },
  storage_shack: {
    researchRequired: 'tier3_storage',
    upgradedBuilding: 'storage_advanced',
    tier3: 'storage_advanced',
  },
  hunters_guild: {
    researchRequired: 'tier2_hunter',
    upgradedBuilding: 'hunting_lodge',
    tier3: 'hunters_lodge_advanced',
  },
  hunting_lodge: {
    researchRequired: 'tier3_hunter',
    upgradedBuilding: 'hunters_lodge_advanced',
    tier3: 'hunters_lodge_advanced',
  },
  farm: {
    researchRequired: 'tier2_vegetable',
    upgradedBuilding: 'irrigated_farm',
    tier3: 'farm_advanced',
  },
  irrigated_farm: {
    researchRequired: 'tier3_vegetable',
    upgradedBuilding: 'farm_advanced',
    tier3: 'farm_advanced',
  },
  quarry: {
    researchRequired: 'tier2_quarry',
    upgradedBuilding: 'quarry_advanced',
    tier3: 'quarry_advanced',
  },
  mine: {
    researchRequired: 'tier2_mine',
    upgradedBuilding: 'mine_advanced',
    tier3: 'mine_advanced',
  },
  research_lab: {
    researchRequired: 'tier2_research_lab',
    upgradedBuilding: 'research_lab_advanced',
    tier3: 'research_lab_advanced',
  },
};

Object.assign(BUILDING_UPGRADE_MAP, {
  trade_post: { researchRequired: null, upgradedBuilding: 'market_hall', tier3: 'market_hall' },
  market_hall: { researchRequired: null, upgradedBuilding: 'merchant_exchange', tier3: 'merchant_exchange' },
  merchant_exchange: { researchRequired: null, upgradedBuilding: 'grand_bazaar', tier3: 'grand_bazaar' },
  grand_bazaar: { researchRequired: null, upgradedBuilding: 'great_market', tier3: 'great_market' },
  great_market: { researchRequired: null, upgradedBuilding: 'trade_consortium', tier3: 'trade_consortium' },
  trade_consortium: { researchRequired: null, upgradedBuilding: 'royal_exchange', tier3: 'royal_exchange' },
  royal_exchange: { researchRequired: null, upgradedBuilding: 'imperial_trade_forum', tier3: 'imperial_trade_forum' },

  smithy: { researchRequired: null, upgradedBuilding: 'forge', tier3: 'forge' },
  forge: { researchRequired: null, upgradedBuilding: 'master_smithy', tier3: 'master_smithy' },
  master_smithy: { researchRequired: null, upgradedBuilding: 'royal_forge', tier3: 'royal_forge' },
  royal_forge: { researchRequired: null, upgradedBuilding: 'grand_forge', tier3: 'grand_forge' },
  grand_forge: { researchRequired: null, upgradedBuilding: 'war_smithy', tier3: 'war_smithy' },
  war_smithy: { researchRequired: null, upgradedBuilding: 'imperial_forge', tier3: 'imperial_forge' },

  watchtower: { researchRequired: null, upgradedBuilding: 'signal_tower', tier3: 'signal_tower' },
  signal_tower: { researchRequired: null, upgradedBuilding: 'sentinel_tower', tier3: 'sentinel_tower' },
  sentinel_tower: { researchRequired: null, upgradedBuilding: 'border_tower', tier3: 'border_tower' },
  border_tower: { researchRequired: null, upgradedBuilding: 'high_watch', tier3: 'high_watch' },
  high_watch: { researchRequired: null, upgradedBuilding: 'beacon_tower', tier3: 'beacon_tower' },
  beacon_tower: { researchRequired: null, upgradedBuilding: 'watch_bastion', tier3: 'watch_bastion' },

  palisades: { researchRequired: null, upgradedBuilding: 'fortified_palisades', tier3: 'fortified_palisades' },
  fortified_palisades: { researchRequired: null, upgradedBuilding: 'wooden_ramparts', tier3: 'wooden_ramparts' },
  wooden_ramparts: { researchRequired: null, upgradedBuilding: 'stone_walls', tier3: 'stone_walls' },
  stone_walls: { researchRequired: null, upgradedBuilding: 'reinforced_walls', tier3: 'reinforced_walls' },
  reinforced_walls: { researchRequired: null, upgradedBuilding: 'fortified_walls', tier3: 'fortified_walls' },
  fortified_walls: { researchRequired: null, upgradedBuilding: 'bastion_walls', tier3: 'bastion_walls' },
  bastion_walls: { researchRequired: null, upgradedBuilding: 'citadel_walls', tier3: 'citadel_walls' },
  citadel_walls: { researchRequired: null, upgradedBuilding: 'fortress_walls', tier3: 'fortress_walls' },

  hospital: { researchRequired: null, upgradedBuilding: 'infirmary', tier3: 'infirmary' },
  infirmary: { researchRequired: null, upgradedBuilding: 'field_hospital', tier3: 'field_hospital' },
  field_hospital: { researchRequired: null, upgradedBuilding: 'grand_infirmary', tier3: 'grand_infirmary' },
  grand_infirmary: { researchRequired: null, upgradedBuilding: 'healing_hall', tier3: 'healing_hall' },
  healing_hall: { researchRequired: null, upgradedBuilding: 'restorative_ward', tier3: 'restorative_ward' },
  restorative_ward: { researchRequired: null, upgradedBuilding: 'sanctified_clinic', tier3: 'sanctified_clinic' },
  sanctified_clinic: { researchRequired: null, upgradedBuilding: 'royal_medical_hall', tier3: 'royal_medical_hall' },

  embassy: { researchRequired: null, upgradedBuilding: 'council_hall', tier3: 'council_hall' },
  council_hall: { researchRequired: null, upgradedBuilding: 'diplomatic_office', tier3: 'diplomatic_office' },
  diplomatic_office: { researchRequired: null, upgradedBuilding: 'royal_embassy', tier3: 'royal_embassy' },
  royal_embassy: { researchRequired: null, upgradedBuilding: 'grand_embassy', tier3: 'grand_embassy' },
  grand_embassy: { researchRequired: null, upgradedBuilding: 'treaty_hall', tier3: 'treaty_hall' },
  treaty_hall: { researchRequired: null, upgradedBuilding: 'foreign_affairs_hall', tier3: 'foreign_affairs_hall' },

  logistics_depot: { researchRequired: null, upgradedBuilding: 'supply_depot', tier3: 'supply_depot' },
  supply_depot: { researchRequired: null, upgradedBuilding: 'roadworks', tier3: 'roadworks' },
  roadworks: { researchRequired: null, upgradedBuilding: 'quartermaster_depot', tier3: 'quartermaster_depot' },
  quartermaster_depot: { researchRequired: null, upgradedBuilding: 'supply_network', tier3: 'supply_network' },
  supply_network: { researchRequired: null, upgradedBuilding: 'imperial_logistics_hub', tier3: 'imperial_logistics_hub' },
  imperial_logistics_hub: { researchRequired: null, upgradedBuilding: 'trade_route_office', tier3: 'trade_route_office' },

  prison: { researchRequired: null, upgradedBuilding: 'dungeon', tier3: 'dungeon' },
  dungeon: { researchRequired: null, upgradedBuilding: 'black_cells', tier3: 'black_cells' },
  black_cells: { researchRequired: null, upgradedBuilding: 'deep_prison', tier3: 'deep_prison' },
  deep_prison: { researchRequired: null, upgradedBuilding: 'high_security_prison', tier3: 'high_security_prison' },
  high_security_prison: { researchRequired: null, upgradedBuilding: 'iron_keep', tier3: 'iron_keep' },
  iron_keep: { researchRequired: null, upgradedBuilding: 'shadow_vault', tier3: 'shadow_vault' },

  militia_camp: { researchRequired: null, upgradedBuilding: 'militia_barracks', tier3: 'militia_barracks' },
  militia_barracks: { researchRequired: null, upgradedBuilding: 'veteran_barracks', tier3: 'veteran_barracks' },
  veteran_barracks: { researchRequired: null, upgradedBuilding: 'elite_garrison', tier3: 'elite_garrison' },
  elite_garrison: { researchRequired: null, upgradedBuilding: 'war_garrison', tier3: 'war_garrison' },
  war_garrison: { researchRequired: null, upgradedBuilding: 'legion_garrison', tier3: 'legion_garrison' },
  legion_garrison: { researchRequired: null, upgradedBuilding: 'imperial_muster_hall', tier3: 'imperial_muster_hall' },

  stables: { researchRequired: null, upgradedBuilding: 'war_stables', tier3: 'war_stables' },
  war_stables: { researchRequired: null, upgradedBuilding: 'royal_stables', tier3: 'royal_stables' },
  royal_stables: { researchRequired: null, upgradedBuilding: 'elite_stables', tier3: 'elite_stables' },
  elite_stables: { researchRequired: null, upgradedBuilding: 'royal_cavalry_stables', tier3: 'royal_cavalry_stables' },

  archer_range: { researchRequired: null, upgradedBuilding: 'bowyer_hall', tier3: 'bowyer_hall' },
  bowyer_hall: { researchRequired: null, upgradedBuilding: 'master_fletcher_range', tier3: 'master_fletcher_range' },
  master_fletcher_range: { researchRequired: null, upgradedBuilding: 'elite_fletching_hall', tier3: 'elite_fletching_hall' },
  elite_fletching_hall: { researchRequired: null, upgradedBuilding: 'royal_marksman_range', tier3: 'royal_marksman_range' },

  swordsmith_hall: { researchRequired: null, upgradedBuilding: 'blade_hall', tier3: 'blade_hall' },
  blade_hall: { researchRequired: null, upgradedBuilding: 'champion_forge', tier3: 'champion_forge' },
  champion_forge: { researchRequired: null, upgradedBuilding: 'veteran_bladesmith_hall', tier3: 'veteran_bladesmith_hall' },
  veteran_bladesmith_hall: { researchRequired: null, upgradedBuilding: 'royal_blade_forge', tier3: 'royal_blade_forge' },

  spear_drill_yard: { researchRequired: null, upgradedBuilding: 'pike_yard', tier3: 'pike_yard' },
  pike_yard: { researchRequired: null, upgradedBuilding: 'formation_citadel', tier3: 'formation_citadel' },
  formation_citadel: { researchRequired: null, upgradedBuilding: 'shieldwall_hall', tier3: 'shieldwall_hall' },
  shieldwall_hall: { researchRequired: null, upgradedBuilding: 'phalanx_command', tier3: 'phalanx_command' },

  armory: { researchRequired: null, upgradedBuilding: 'expanded_armory', tier3: 'expanded_armory' },
  expanded_armory: { researchRequired: null, upgradedBuilding: 'royal_armory', tier3: 'royal_armory' },
  royal_armory: { researchRequired: null, upgradedBuilding: 'grand_armory', tier3: 'grand_armory' },
  grand_armory: { researchRequired: null, upgradedBuilding: 'war_arsenal', tier3: 'war_arsenal' },

  drill_yard: { researchRequired: null, upgradedBuilding: 'training_grounds', tier3: 'training_grounds' },
  training_grounds: { researchRequired: null, upgradedBuilding: 'elite_drill_grounds', tier3: 'elite_drill_grounds' },
  elite_drill_grounds: { researchRequired: null, upgradedBuilding: 'veteran_training_grounds', tier3: 'veteran_training_grounds' },
  veteran_training_grounds: { researchRequired: null, upgradedBuilding: 'war_college', tier3: 'war_college' },

  command_post: { researchRequired: null, upgradedBuilding: 'war_room', tier3: 'war_room' },
  war_room: { researchRequired: null, upgradedBuilding: 'strategic_command', tier3: 'strategic_command' },
  strategic_command: { researchRequired: null, upgradedBuilding: 'advanced_command_center', tier3: 'advanced_command_center' },
  advanced_command_center: { researchRequired: null, upgradedBuilding: 'high_command_citadel', tier3: 'high_command_citadel' },

  siege_engine_workshop: { researchRequired: null, upgradedBuilding: 'siege_foundry', tier3: 'siege_foundry' },
  siege_foundry: { researchRequired: null, upgradedBuilding: 'war_engine_forge', tier3: 'war_engine_forge' },
  war_engine_forge: { researchRequired: null, upgradedBuilding: 'advanced_siege_workshop', tier3: 'advanced_siege_workshop' },
  advanced_siege_workshop: { researchRequired: null, upgradedBuilding: 'imperial_siege_hall', tier3: 'imperial_siege_hall' },
});

const UPGRADE_ONLY_BUILDING_TYPES = new Set([
  'wood_lodge',
  'hunting_lodge',
  'hunters_lodge_advanced',
  'irrigated_farm',
  'farm_advanced',
  'storage_shack',
  'storage_advanced',
  'quarry_advanced',
  'mine_advanced',
  'research_lab_advanced',
]);

[
  'market_hall', 'merchant_exchange', 'grand_bazaar', 'great_market', 'trade_consortium', 'royal_exchange', 'imperial_trade_forum',
  'forge', 'master_smithy', 'royal_forge', 'grand_forge', 'war_smithy', 'imperial_forge',
  'signal_tower', 'sentinel_tower', 'border_tower', 'high_watch', 'beacon_tower', 'watch_bastion',
  'fortified_palisades', 'wooden_ramparts', 'stone_walls', 'reinforced_walls', 'fortified_walls', 'bastion_walls', 'citadel_walls', 'fortress_walls',
  'field_hospital', 'grand_infirmary', 'healing_hall', 'restorative_ward', 'sanctified_clinic', 'royal_medical_hall',
  'council_hall', 'diplomatic_office', 'royal_embassy', 'grand_embassy', 'treaty_hall', 'foreign_affairs_hall',
  'supply_depot', 'roadworks', 'quartermaster_depot', 'supply_network', 'imperial_logistics_hub', 'trade_route_office',
  'dungeon', 'black_cells', 'deep_prison', 'high_security_prison', 'iron_keep', 'shadow_vault',
  'militia_barracks', 'veteran_barracks', 'elite_garrison', 'war_garrison', 'legion_garrison', 'imperial_muster_hall',
  'war_stables', 'royal_stables', 'elite_stables', 'royal_cavalry_stables',
  'bowyer_hall', 'master_fletcher_range', 'elite_fletching_hall', 'royal_marksman_range',
  'blade_hall', 'champion_forge', 'veteran_bladesmith_hall', 'royal_blade_forge',
  'pike_yard', 'formation_citadel', 'shieldwall_hall', 'phalanx_command',
  'expanded_armory', 'royal_armory', 'grand_armory', 'war_arsenal',
  'training_grounds', 'elite_drill_grounds', 'veteran_training_grounds', 'war_college',
  'war_room', 'strategic_command', 'advanced_command_center', 'high_command_citadel',
  'siege_foundry', 'war_engine_forge', 'advanced_siege_workshop', 'imperial_siege_hall',
].forEach((type) => UPGRADE_ONLY_BUILDING_TYPES.add(type));

// All building types that are the destination of any upgrade path.
// Used to guard the legacy-repair loop so that buildings already sitting at a
// correctly-upgraded type are never auto-advanced to the NEXT tier on page load.
const UPGRADE_DESTINATION_TYPES = new Set(
  Object.values(BUILDING_UPGRADE_MAP).flatMap((info) =>
    [info.upgradedBuilding, info.tier3].filter(Boolean)
  )
);

const getNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeResourceMap = (value) => {
  const source = (value && typeof value === 'object') ? value : {};
  const out = {};
  for (const [key, raw] of Object.entries(source)) out[key] = Math.max(0, getNumber(raw));
  return out;
};

const normalizeStoredResources = (value) => {
  const source = normalizeResourceMap(value);
  const food = Math.max(0, getNumber(source.food || 0))
    + Math.max(0, getNumber(source.meat || 0))
    + Math.max(0, getNumber(source.vegetables || 0));

  const out = { ...source, food };
  delete out.meat;
  delete out.vegetables;
  return out;
};

const normalizeWorkerAssignments = (value) => {
  const source = normalizeResourceMap(value);
  const out = {
    meat: Math.max(0, getNumber(source.meat)),
    vegetables: Math.max(0, getNumber(source.vegetables)),
    wood: Math.max(0, getNumber(source.wood)),
    stone: Math.max(0, getNumber(source.stone)),
    iron: Math.max(0, getNumber(source.iron)),
    gold: Math.max(0, getNumber(source.gold)),
    research: Math.max(0, getNumber(source.research)),
    faith: Math.max(0, getNumber(source.faith)),
    building: Math.max(0, getNumber(source.building)),
  };

  const legacyFood = Math.max(0, getNumber(source.food));
  if (legacyFood > 0 && out.meat === 0) {
    out.meat = legacyFood;
  }
  return out;
};

const normalizeSlaveWorkerAssignments = (value) => {
  const source = normalizeResourceMap(value);
  return {
    wood: Math.max(0, getNumber(source.wood)),
    stone: Math.max(0, getNumber(source.stone)),
    iron: Math.max(0, getNumber(source.iron)),
    building: Math.max(0, getNumber(source.building)),
  };
};

const clampSlaveAssignmentsToPool = (assignments, newPool) => {
  const normalized = normalizeSlaveWorkerAssignments(assignments);
  const total = Object.values(normalized).reduce((sum, v) => sum + v, 0);
  if (total <= newPool) return normalized;
  const result = { ...normalized };
  let excess = total - newPool;
  for (const k of Object.keys(result).reverse()) {
    if (excess <= 0) break;
    const reduce = Math.min(result[k], excess);
    result[k] -= reduce;
    excess -= reduce;
  }
  return result;
};

const WORKER_CAP_BUILDING_MAP = {
  wood: ['lumber_mill', 'wood_lodge'],
  meat: ['hunters_guild', 'hunting_lodge', 'hunters_lodge_advanced'],
  vegetables: ['farm', 'irrigated_farm', 'granary', 'farm_advanced'],
  stone: ['quarry', 'quarry_advanced'],
  iron: ['mine', 'mine_advanced'],
  gold: ['trade_post', 'market_hall', 'merchant_exchange', 'grand_bazaar', 'great_market', 'trade_consortium', 'royal_exchange', 'imperial_trade_forum'],
  research: ['research_lab', 'research_lab_advanced'],
  faith: ['faith_temple'],
};

const applyBuildingBasedWorkerCaps = (unlockedResources, maxWorkersPerResource, completedBuildings) => {
  const nextUnlocked = { ...(unlockedResources || {}) };
  const nextMaxWorkers = { ...(maxWorkersPerResource || {}) };

  for (const [resource, buildingTypes] of Object.entries(WORKER_CAP_BUILDING_MAP)) {
    const count = (completedBuildings || []).reduce((sum, building) => {
      const type = String(building?.building_type || '');
      return sum + (buildingTypes.includes(type) ? 1 : 0);
    }, 0);
    if (count <= 0) continue;

    nextUnlocked[resource] = true;
    nextMaxWorkers[resource] = Math.max(0, Number(nextMaxWorkers[resource] || 0), count * 20);
  }

  return { nextUnlocked, nextMaxWorkers };
};

const getStorageCapacityBonusForBuilding = (buildingType) => {
  const key = String(buildingType || '');
  if (key === 'storage') return 100;
  if (key === 'storage_shack') return 200;
  if (key === 'granary') return 200;
  if (key === 'storage_advanced') return 300;
  return 0;
};

const calculateStorageCapacityFromBuildings = (buildings) => {
  const baseCapacity = 100;
  let bonus = 0;
  for (const building of (buildings || [])) {
    if (!building?.is_complete) continue;
    bonus += getStorageCapacityBonusForBuilding(building.building_type);
  }
  return Math.max(baseCapacity, baseCapacity + bonus);
};

const getHousingCapPerBuilding = (completedResearchSet) => {
  if (completedResearchSet.has('tier3_housing')) return 12;
  if (completedResearchSet.has('tier2_housing')) return 8;
  return 4;
};

const calculateHousingCapacityFromBuildings = (buildings, completedResearchArr) => {
  const done = new Set(Array.isArray(completedResearchArr) ? completedResearchArr.map(String) : []);
  const perBuilding = getHousingCapPerBuilding(done);
  let count = 0;
  for (const building of (buildings || [])) {
    if (!building?.is_complete) continue;
    const type = String(building.building_type || '');
    if (type === 'housing' || type === 'wood_lodge') count += 1;
  }
  return count * perBuilding;
};

const PRISONER_CAP_BY_BUILDING = {
  prison: 20,
  dungeon: 40,
  black_cells: 60,
  deep_prison: 80,
  high_security_prison: 100,
  iron_keep: 120,
  shadow_vault: 140,
};

const calculatePrisonerCapacityFromBuildings = (buildings) => {
  let cap = 0;
  for (const building of (buildings || [])) {
    if (!building?.is_complete) continue;
    cap += PRISONER_CAP_BY_BUILDING[String(building.building_type || '')] || 0;
  }
  return cap;
};

const tableExists = async (name) => {
  const result = await pool.query(`SELECT to_regclass($1) AS name`, [`public.${name}`]);
  return Boolean(result.rows[0]?.name);
};

const getFiefContext = async (fiefId) => {
  const result = await pool.query(
    `SELECT f.*, k.player_id, k.campaign_id, c.dungeon_master_id
     FROM fiefs f
     JOIN kingdoms k ON k.id = f.kingdom_id
     JOIN campaigns c ON c.id = k.campaign_id
     WHERE f.id = $1`,
    [fiefId]
  );
  return result.rows[0] || null;
};

const canManageFief = (user, fief) => {
  if (!user || !fief) return false;
  if (user.role === 'Dungeon Master') {
    return Number(fief.dungeon_master_id) === Number(user.id);
  }
  return Number(fief.player_id) === Number(user.id);
};

const withPopulationBreakdown = (fief) => {
  const schedule = (fief?.population_maturation_schedule && typeof fief.population_maturation_schedule === 'object')
    ? fief.population_maturation_schedule
    : {};
  const totalPopulation = Math.max(0, Number(fief?.population || 0));
  const underagePopulation = getUnderagePopulation(schedule);
  const sickInjuredPopulation = Math.max(0, Number(fief?.sick_injured_population || 0));
  const assignablePopulation = getAssignablePopulation(totalPopulation, schedule, sickInjuredPopulation);
  return {
    ...fief,
    underage_population: underagePopulation,
    sick_injured_population: sickInjuredPopulation,
    assignable_population: assignablePopulation,
    soldiers: Math.max(0, Number(fief?.soldiers || 0)),
    prisoners: Math.max(0, Number(fief?.prisoners || 0)),
    slaves: Math.max(0, Number(fief?.slaves || 0)),
  };
};

const trimMaturationScheduleToPopulation = (schedule, population) => {
  const total = Math.max(0, Math.floor(Number(population) || 0));
  const normalized = normalizeMaturationSchedule(schedule);
  const underage = Object.values(normalized).reduce((sum, count) => sum + Math.max(0, Number(count) || 0), 0);
  if (underage <= total) return normalized;

  let excess = underage - total;
  const entries = Object.entries(normalized)
    .map(([day, count]) => [String(day), Math.max(0, Math.floor(Number(count) || 0))])
    .sort((a, b) => Number(b[0]) - Number(a[0]));

  for (const [day, count] of entries) {
    if (excess <= 0) break;
    const remove = Math.min(count, excess);
    const next = count - remove;
    excess -= remove;
    if (next > 0) normalized[day] = next;
    else delete normalized[day];
  }

  return normalized;
};

const clampWorkersToAssignablePopulation = (assignments, maxByResource, assignablePopulation) => {
  const normalized = normalizeWorkerAssignments(assignments);
  const clampedByLane = {};

  for (const [resource, value] of Object.entries(normalized)) {
    const num = Math.max(0, Math.floor(Number(value) || 0));
    const maxForLane = Number(maxByResource?.[resource]);
    clampedByLane[resource] = Number.isFinite(maxForLane) ? Math.min(num, Math.max(0, maxForLane)) : num;
  }

  let totalAssigned = Object.values(clampedByLane).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
  const target = Math.max(0, Math.floor(Number(assignablePopulation) || 0));
  if (totalAssigned <= target) return clampedByLane;

  const reduceOrder = ['building', 'research', 'faith', 'iron', 'stone', 'wood', 'vegetables', 'meat'];
  for (const lane of reduceOrder) {
    if (totalAssigned <= target) break;
    const current = Math.max(0, Number(clampedByLane[lane] || 0));
    const toRemove = Math.min(current, totalAssigned - target);
    clampedByLane[lane] = current - toRemove;
    totalAssigned -= toRemove;
  }

  return clampedByLane;
};

const hasPrerequisites = (catalogEntry, completedBuildings) => {
  const list = Array.isArray(catalogEntry.prerequisites) ? catalogEntry.prerequisites : [];
  const byTypeCount = {};
  for (const b of completedBuildings) {
    const type = String(b.building_type || '');
    byTypeCount[type] = (byTypeCount[type] || 0) + 1;
  }

  for (const req of list) {
    if (req.anyTier1Completed) {
      const count = completedBuildings.filter((b) => TIER1_BUILDING_TYPES.has(String(b.building_type || ''))).length;
      if (count < req.anyTier1Completed) return false;
      continue;
    }

    if (req.type) {
      const have = byTypeCount[req.type] || 0;
      if (have < (req.minCount || 1)) return false;
      continue;
    }
  }

  return true;
};

const requireDM = (req, res) => {
  if (req.user?.role !== 'Dungeon Master') {
    res.status(403).json({ error: 'DM only' });
    return false;
  }
  return true;
};

router.get('/campaign/:id', authenticateToken, async (req, res) => {
  try {
    const campaignId = Number(req.params.id);
    if (!Number.isFinite(campaignId)) return res.status(400).json({ error: 'Invalid campaign ID' });

    const kingdoms = await Kingdom.getByCampaign(campaignId);
    res.json({ kingdoms });
  } catch (error) {
    console.error('Error fetching kingdoms:', error);
    res.status(500).json({ error: 'Failed to fetch kingdoms' });
  }
});

const VALID_LOCATION_MODIFIER_KEYS = new Set(['building', 'wood', 'iron', 'stone', 'vegetables', 'meat', 'gold', 'research', 'faith']);

const sanitizeLocationModifiers = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result = {};
  for (const [key, val] of Object.entries(raw)) {
    if (!VALID_LOCATION_MODIFIER_KEYS.has(key)) continue;
    const num = Number(val);
    if (!Number.isFinite(num)) continue;
    if (num !== 0) result[key] = num;
  }
  return result;
};

router.post('/grant', authenticateToken, async (req, res) => {
  try {
    if (!requireDM(req, res)) return;

    const campaignId = Number(req.body.campaignId);
    const playerIds = Array.isArray(req.body.playerIds) ? req.body.playerIds.map((id) => Number(id)).filter(Number.isFinite) : [];

    if (!Number.isFinite(campaignId) || playerIds.length === 0) {
      return res.status(400).json({ error: 'campaignId and at least one playerId are required' });
    }

    const locationModifiers = sanitizeLocationModifiers(req.body.locationModifiers);
    const hasLocationModifiers = Object.keys(locationModifiers).length > 0;

    // Check if location_modifiers column exists on kingdoms table
    const colCheck = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'kingdoms' AND column_name = 'location_modifiers'`
    );
    const hasLocationModifiersColumn = colCheck.rows.length > 0;

    const created = [];
    const io = req.app.get('io') || req.io;
    const userSocketMap = req.app.get('userSocketMap');
    for (const playerId of playerIds) {
      const kingdom = await Kingdom.create({ campaign_id: campaignId, player_id: playerId });

      if (hasLocationModifiers && hasLocationModifiersColumn) {
        await pool.query(
          `UPDATE kingdoms SET location_modifiers = $2::jsonb WHERE id = $1`,
          [kingdom.id, JSON.stringify(locationModifiers)]
        );
        kingdom.location_modifiers = locationModifiers;
      }

      created.push(kingdom);

      if (io && userSocketMap) {
        const targetSocketId = userSocketMap.get(playerId);
        if (targetSocketId) {
          io.to(targetSocketId).emit('kingdomNameRequest', {
            kingdomId: kingdom.id,
            targetPlayerId: playerId,
          });
        }
      } else if (req.io) {
        req.io.to(`campaign_${campaignId}`).emit('kingdomNameRequest', {
          kingdomId: kingdom.id,
          targetPlayerId: playerId,
        });
      }
    }

    if (req.io) {
      req.io.to(`campaign_${campaignId}`).emit('kingdomDataChanged', { campaignId });
    }

    res.status(201).json({ kingdoms: created });
  } catch (error) {
    console.error('Error granting kingdoms:', error);
    res.status(500).json({ error: 'Failed to grant kingdoms' });
  }
});

router.post('/:id/name', authenticateToken, async (req, res) => {
  try {
    const kingdomId = Number(req.params.id);
    const { name, capitalName } = req.body;

    if (!Number.isFinite(kingdomId) || !name || String(name).trim().length === 0) {
      return res.status(400).json({ error: 'Valid kingdom id and name are required' });
    }

    const ownershipResult = await pool.query(
      `SELECT k.id, k.player_id, k.campaign_id, c.dungeon_master_id
       FROM kingdoms k
       JOIN campaigns c ON c.id = k.campaign_id
       WHERE k.id = $1`,
      [kingdomId]
    );
    const ownership = ownershipResult.rows[0];
    if (!ownership) return res.status(404).json({ error: 'Kingdom not found' });

    const canEdit = req.user.role === 'Dungeon Master'
      ? Number(ownership.dungeon_master_id) === Number(req.user.id)
      : Number(ownership.player_id) === Number(req.user.id);

    if (!canEdit) return res.status(403).json({ error: 'Not authorized to name this kingdom' });

    const kingdom = await Kingdom.setName(kingdomId, String(name).trim(), String(capitalName || 'Capital').trim());
    if (!kingdom) return res.status(404).json({ error: 'Kingdom not found' });

    if (req.io) {
      req.io.to(`campaign_${ownership.campaign_id}`).emit('kingdomActivated', { kingdom });
      req.io.to(`campaign_${ownership.campaign_id}`).emit('kingdomDataChanged', { campaignId: ownership.campaign_id, kingdomId });
    }

    res.json({ kingdom });
  } catch (error) {
    console.error('Error naming kingdom:', error);
    res.status(500).json({ error: 'Failed to name kingdom' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    if (!requireDM(req, res)) return;

    const kingdomId = Number(req.params.id);
    if (!Number.isFinite(kingdomId)) {
      return res.status(400).json({ error: 'Invalid kingdom ID' });
    }

    await client.query('BEGIN');

    const ownershipResult = await client.query(
      `SELECT k.id, k.campaign_id, k.player_id, c.dungeon_master_id
       FROM kingdoms k
       JOIN campaigns c ON c.id = k.campaign_id
       WHERE k.id = $1
       FOR UPDATE`,
      [kingdomId]
    );
    const ownership = ownershipResult.rows[0];
    if (!ownership) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Kingdom not found' });
    }

    if (Number(ownership.dungeon_master_id) !== Number(req.user.id)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not authorized to delete this kingdom' });
    }

    await client.query(`DELETE FROM kingdoms WHERE id = $1`, [kingdomId]);

    await client.query('COMMIT');

    if (req.io) {
      req.io.to(`campaign_${ownership.campaign_id}`).emit('kingdomDataChanged', {
        campaignId: ownership.campaign_id,
        kingdomId,
        deleted: true,
      });
    }

    res.json({ message: 'Kingdom deleted', kingdomId, playerId: Number(ownership.player_id) });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting kingdom:', error);
    res.status(500).json({ error: 'Failed to delete kingdom' });
  } finally {
    client.release();
  }
});

router.get('/fiefs/:id', authenticateToken, async (req, res) => {
  try {
    const fiefId = Number(req.params.id);
    if (!Number.isFinite(fiefId)) return res.status(400).json({ error: 'Invalid fief ID' });

    const fief = await getFiefContext(fiefId);
    if (!fief) return res.status(404).json({ error: 'Fief not found' });

    if (!canManageFief(req.user, fief)) {
      return res.status(403).json({ error: 'Not authorized to view this fief' });
    }

    const buildingsResult = await pool.query(
      `SELECT *
       FROM fief_buildings
       WHERE fief_id = $1
       ORDER BY is_complete ASC, COALESCE(queue_position, 999999) ASC, id ASC`,
      [fiefId]
    );

    // Repair legacy upgraded buildings that were completed but kept their base type.
    // This can happen for upgrades started before the server-side upgrade blueprint fix.
    for (const building of buildingsResult.rows) {
      if (!building?.is_complete) continue;

      const level = getNumber(building.level || 1);
      if (level < 2) continue;

      // Skip buildings already at an upgraded type — these were correctly set by the upgrade
      // PATCH route and must not be auto-advanced to the next tier on every page load.
      // UPGRADE_DESTINATION_TYPES covers every upgradedBuilding/tier3 value in the map,
      // including types like 'infirmary' that are also directly buildable.
      if (UPGRADE_DESTINATION_TYPES.has(String(building.building_type || ''))) continue;

      const upgradeInfo = BUILDING_UPGRADE_MAP[String(building.building_type || '')];
      if (!upgradeInfo) continue;

      const targetKey = level >= 3 && upgradeInfo.tier3
        ? String(upgradeInfo.tier3)
        : String(upgradeInfo.upgradedBuilding || '');
      if (!targetKey || targetKey === String(building.building_type || '')) continue;

      const targetBlueprint = BUILDING_CATALOG[targetKey];
      if (!targetBlueprint) continue;

      await pool.query(
        `UPDATE fief_buildings
         SET building_type = $2,
             name = $3,
             description = $4,
             resource_output = $5::jsonb
         WHERE id = $1`,
        [
          Number(building.id),
          targetKey,
          String(targetBlueprint.name || targetKey),
          String(targetBlueprint.description || ''),
          JSON.stringify(targetBlueprint.resourceOutput || {}),
        ]
      );

      building.building_type = targetKey;
      building.name = String(targetBlueprint.name || targetKey);
      building.description = String(targetBlueprint.description || '');
      building.resource_output = targetBlueprint.resourceOutput || {};
    }

    // Always sync description from the current catalog so updated text is reflected immediately
    for (const building of buildingsResult.rows) {
      const catalogEntry = BUILDING_CATALOG[String(building.building_type || '')];
      if (catalogEntry?.description) {
        building.description = String(catalogEntry.description);
      }
    }

    let calculatedStorageCapacity = calculateStorageCapacityFromBuildings(buildingsResult.rows);
    
    // Apply storage multiplier from storage research
    const completedResearchList = Array.isArray(fief.completed_research) ? fief.completed_research : [];
    if (completedResearchList.includes('tier3_storage')) {
      calculatedStorageCapacity = Math.floor(calculatedStorageCapacity * 2);
    } else if (completedResearchList.includes('tier2_storage')) {
      calculatedStorageCapacity = Math.floor(calculatedStorageCapacity * 1.5);
    }
    
    const currentStorageCapacity = Math.max(0, Number(fief.storage_capacity || 100));
    if (calculatedStorageCapacity !== currentStorageCapacity) {
      await pool.query(
        `UPDATE fiefs
         SET storage_capacity = $2
         WHERE id = $1`,
        [fiefId, calculatedStorageCapacity]
      );
      fief.storage_capacity = calculatedStorageCapacity;
    }

    let researchQueue = [];
    const completedResearch = new Set(Array.isArray(fief.completed_research) ? fief.completed_research : []);
    if (await tableExists('fief_research_queue')) {
      const rq = await pool.query(
        `SELECT *
         FROM fief_research_queue
         WHERE fief_id = $1
         ORDER BY COALESCE(queue_position, 999999) ASC, id ASC`,
        [fiefId]
      );
      researchQueue = rq.rows;
    }

    if (await tableExists('fief_research_levels')) {
      const rl = await pool.query(
        `SELECT building_type
         FROM fief_research_levels
         WHERE fief_id = $1`,
        [fiefId]
      );
      for (const row of rl.rows) {
        completedResearch.add(String(row.building_type));
      }
    }

    const activeOrQueuedResearch = new Set(
      researchQueue
        .filter((r) => r.status === 'active' || r.status === 'queued')
        .map((r) => String(r.research_id))
    );

    const availableResearch = Object.values(RESEARCH_CATALOG).map((entry) => ({
      ...entry,
      isCompleted: completedResearch.has(entry.id),
      isQueuedOrActive: activeOrQueuedResearch.has(entry.id),
    }));

    const completedBuildings = buildingsResult.rows.filter((b) => Boolean(b?.is_complete));
    const fiefTier = getNumber(fief.tier || 1);
    const storedForCostChecks = normalizeStoredResources(fief?.stored_resources);
    const availableBuildings = Object.values(BUILDING_CATALOG)
      .filter((entry) => !UPGRADE_ONLY_BUILDING_TYPES.has(String(entry.key || '')))
      .map((entry) => {
      if (fiefTier < Number(entry.tierRequired || 1)) {
        return {
          ...entry,
          isLocked: true,
          lockReason: `Requires fief tier ${entry.tierRequired}`,
        };
      }

      if (!hasPrerequisites(entry, completedBuildings)) {
        return {
          ...entry,
          isLocked: true,
          lockReason: 'Building prerequisites are not met',
        };
      }

      for (const [resource, neededRaw] of Object.entries(entry.cost || {})) {
        const needed = Math.max(0, Number(neededRaw || 0));
        const resourceKey = resource === 'iron' ? 'minerals' : resource;
        const available = Math.max(0, Number(storedForCostChecks[resourceKey] || 0));
        if (available < needed) {
          return {
            ...entry,
            isLocked: true,
            lockReason: `Insufficient ${resource}`,
          };
        }
      }

      return {
        ...entry,
        isLocked: false,
        lockReason: '',
      };
      });

    const availableUpgrades = completedBuildings
      .map((building) => {
        const upgradeInfo = BUILDING_UPGRADE_MAP[String(building.building_type || '')];
        if (!upgradeInfo) return null;
        const requiredResearch = String(upgradeInfo.researchRequired || '').trim();
        if (requiredResearch && !completedResearch.has(requiredResearch)) return null;

        const upgradeBuildingKey = upgradeInfo.upgradedBuilding;
        const blueprint = BUILDING_CATALOG[upgradeBuildingKey];
        if (!blueprint) return null;
        if (Number(blueprint.tierRequired || 1) > fiefTier) return null;

        const missing = [];
        for (const [resource, neededRaw] of Object.entries(blueprint.cost || {})) {
          const needed = Math.max(0, Number(neededRaw || 0));
          const resourceKey = resource === 'iron' ? 'minerals' : resource;
          const available = Math.max(0, Number(storedForCostChecks[resourceKey] || 0));
          if (available < needed) missing.push(resource);
        }

        return {
          buildingId: Number(building.id),
          currentType: String(building.building_type || ''),
          currentName: String(building.name || ''),
          targetKey: upgradeBuildingKey,
          targetName: String(blueprint.name || upgradeBuildingKey),
          researchRequired: requiredResearch,
          days: Number(blueprint.days || 0),
          cost: blueprint.cost || {},
          canUpgrade: missing.length === 0,
          reason: missing.length > 0 ? `Missing: ${missing.join(', ')}` : '',
        };
      })
      .filter(Boolean);

    const unlockedResources = (fief?.unlocked_resources && typeof fief.unlocked_resources === 'object')
      ? { ...fief.unlocked_resources }
      : {};

    const maxWorkers = (fief?.max_workers_per_resource && typeof fief.max_workers_per_resource === 'object')
      ? { ...fief.max_workers_per_resource }
      : {};
    const capAdjusted = applyBuildingBasedWorkerCaps(unlockedResources, maxWorkers, completedBuildings);
    const housingCapacity = calculateHousingCapacityFromBuildings(completedBuildings, Array.from(completedResearch));
    const prisonerCapacity = calculatePrisonerCapacityFromBuildings(buildingsResult.rows);

    res.json({
      fief: {
        ...withPopulationBreakdown(fief),
        housing_capacity: housingCapacity,
        prisoner_capacity: prisonerCapacity,
        stored_resources: normalizeStoredResources(fief?.stored_resources),
        worker_assignments: normalizeWorkerAssignments(fief?.worker_assignments),
        slave_worker_assignments: normalizeSlaveWorkerAssignments(fief?.slave_worker_assignments),
        unlocked_resources: capAdjusted.nextUnlocked,
        max_workers_per_resource: capAdjusted.nextMaxWorkers,
        vegetable_harvest_state: (fief?.vegetable_harvest_state && typeof fief.vegetable_harvest_state === 'object')
          ? fief.vegetable_harvest_state
          : { day_in_cycle: 0, accumulated_worker_days: 0 },
        location_modifiers: (fief?.location_modifiers && typeof fief.location_modifiers === 'object')
          ? fief.location_modifiers
          : {},
        buildings: buildingsResult.rows,
        researchQueue,
        availableResearch,
        availableBuildings,
        availableUpgrades,
      },
    });
  } catch (error) {
    console.error('Error loading fief details:', error);
    res.status(500).json({ error: 'Failed to load fief details' });
  }
});

router.patch('/fiefs/:id/workers', authenticateToken, async (req, res) => {
  try {
    const fiefId = Number(req.params.id);
    const assignments = req.body?.workerAssignments;

    if (!Number.isFinite(fiefId) || !assignments || typeof assignments !== 'object') {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const owned = await getFiefContext(fiefId);
    if (!owned) return res.status(404).json({ error: 'Fief not found' });

    if (!canManageFief(req.user, owned)) {
      return res.status(403).json({ error: 'Not authorized to update this fief' });
    }

    const maxByResource = (owned.max_workers_per_resource && typeof owned.max_workers_per_resource === 'object')
      ? owned.max_workers_per_resource
      : {};

    const normalized = {};
    let totalAssigned = 0;
    for (const [resource, value] of Object.entries(normalizeWorkerAssignments(assignments))) {
      const num = Math.max(0, Math.floor(Number(value) || 0));
      const maxForLane = Number(maxByResource[resource]);
      normalized[resource] = Number.isFinite(maxForLane) ? Math.min(num, Math.max(0, maxForLane)) : num;
      totalAssigned += normalized[resource];
    }

    const assignablePopulation = getAssignablePopulation(
      owned.population,
      owned.population_maturation_schedule,
      owned.sick_injured_population
    );
    if (totalAssigned > assignablePopulation) {
      return res.status(400).json({ error: `Assigned workers (${totalAssigned}) exceed assignable adult population (${assignablePopulation})` });
    }

    const updateResult = await pool.query(
      `UPDATE fiefs
       SET worker_assignments = $2::jsonb
       WHERE id = $1
       RETURNING id, worker_assignments, slave_worker_assignments, population, population_maturation_schedule, sick_injured_population, soldiers, prisoners, slaves`,
      [fiefId, JSON.stringify(normalized)]
    );

    if (req.io) {
      req.io.to(`campaign_${owned.campaign_id}`).emit('kingdomDataChanged', { campaignId: owned.campaign_id, fiefId });
    }

    res.json({ fief: withPopulationBreakdown(updateResult.rows[0]) });
  } catch (error) {
    console.error('Error updating worker assignments:', error);
    res.status(500).json({ error: 'Failed to update workers' });
  }
});

router.patch('/fiefs/:id/slave-workers', authenticateToken, async (req, res) => {
  try {
    const fiefId = Number(req.params.id);
    const assignments = req.body?.workerAssignments;

    if (!Number.isFinite(fiefId) || !assignments || typeof assignments !== 'object') {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const owned = await getFiefContext(fiefId);
    if (!owned) return res.status(404).json({ error: 'Fief not found' });

    if (!canManageFief(req.user, owned)) {
      return res.status(403).json({ error: 'Not authorized to update this fief' });
    }

    const maxByResource = (owned.max_workers_per_resource && typeof owned.max_workers_per_resource === 'object')
      ? owned.max_workers_per_resource
      : {};

    const normalized = {};
    let totalAssigned = 0;
    for (const [resource, value] of Object.entries(normalizeSlaveWorkerAssignments(assignments))) {
      const num = Math.max(0, Math.floor(Number(value) || 0));
      const maxForLane = Number(maxByResource[resource]);
      normalized[resource] = Number.isFinite(maxForLane) ? Math.min(num, Math.max(0, maxForLane)) : num;
      totalAssigned += normalized[resource];
    }

    const slavePool = Math.max(0, Number(owned.slaves || 0));
    if (totalAssigned > slavePool) {
      return res.status(400).json({ error: `Assigned slave workers (${totalAssigned}) exceed available slaves (${slavePool})` });
    }

    const updateResult = await pool.query(
      `UPDATE fiefs
       SET slave_worker_assignments = $2::jsonb
       WHERE id = $1
       RETURNING id, slave_worker_assignments, population, population_maturation_schedule, sick_injured_population, soldiers, prisoners, slaves`,
      [fiefId, JSON.stringify(normalized)]
    );

    if (req.io) {
      req.io.to(`campaign_${owned.campaign_id}`).emit('kingdomDataChanged', { campaignId: owned.campaign_id, fiefId });
    }

    res.json({
      fief: {
        ...withPopulationBreakdown(updateResult.rows[0]),
        slave_worker_assignments: normalizeSlaveWorkerAssignments(updateResult.rows[0]?.slave_worker_assignments),
      },
    });
  } catch (error) {
    console.error('Error updating slave worker assignments:', error);
    res.status(500).json({ error: 'Failed to update slave workers' });
  }
});

router.patch('/fiefs/:id/military/train', authenticateToken, async (req, res) => {
  try {
    const fiefId = Number(req.params.id);
    const amount = Math.max(0, Math.floor(Number(req.body?.amount) || 0));
    if (!Number.isFinite(fiefId) || amount <= 0) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const owned = await getFiefContext(fiefId);
    if (!owned) return res.status(404).json({ error: 'Fief not found' });
    if (!canManageFief(req.user, owned)) {
      return res.status(403).json({ error: 'Not authorized to manage this fief' });
    }

    const assignablePopulation = getAssignablePopulation(
      owned.population,
      owned.population_maturation_schedule,
      owned.sick_injured_population
    );
    const currentWorkers = normalizeWorkerAssignments(owned.worker_assignments);
    const assignedWorkers = Object.values(currentWorkers).reduce((sum, n) => sum + Math.max(0, Number(n) || 0), 0);
    const freeAdults = Math.max(0, assignablePopulation - assignedWorkers);

    if (amount > freeAdults) {
      return res.status(400).json({ error: `Cannot train ${amount}. Only ${freeAdults} assignable adults are unassigned.` });
    }

    const updateResult = await pool.query(
      `UPDATE fiefs
       SET soldiers = COALESCE(soldiers, 0) + $2
       WHERE id = $1
       RETURNING id, population, population_maturation_schedule, sick_injured_population, soldiers, prisoners, slaves, worker_assignments`,
      [fiefId, amount]
    );

    if (req.io) {
      req.io.to(`campaign_${owned.campaign_id}`).emit('kingdomDataChanged', { campaignId: owned.campaign_id, fiefId });
    }

    res.json({ fief: withPopulationBreakdown(updateResult.rows[0]) });
  } catch (error) {
    console.error('Error training soldiers:', error);
    res.status(500).json({ error: 'Failed to train soldiers' });
  }
});

router.patch('/fiefs/:id/prisoners/convert', authenticateToken, async (req, res) => {
  try {
    const fiefId = Number(req.params.id);
    const amount = Math.max(0, Math.floor(Number(req.body?.amount) || 0));
    if (!Number.isFinite(fiefId) || amount <= 0) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const owned = await getFiefContext(fiefId);
    if (!owned) return res.status(404).json({ error: 'Fief not found' });
    if (!canManageFief(req.user, owned)) {
      return res.status(403).json({ error: 'Not authorized to manage this fief' });
    }

    const availablePrisoners = Math.max(0, Number(owned.prisoners || 0));
    if (amount > availablePrisoners) {
      return res.status(400).json({ error: `Cannot convert ${amount}. Only ${availablePrisoners} prisoners available.` });
    }

    const updateResult = await pool.query(
      `UPDATE fiefs
       SET prisoners = GREATEST(0, COALESCE(prisoners, 0) - $2),
           slaves = COALESCE(slaves, 0) + $2
       WHERE id = $1
       RETURNING id, population, population_maturation_schedule, sick_injured_population, soldiers, prisoners, slaves, worker_assignments, slave_worker_assignments`,
      [fiefId, amount]
    );

    if (req.io) {
      req.io.to(`campaign_${owned.campaign_id}`).emit('kingdomDataChanged', { campaignId: owned.campaign_id, fiefId });
    }

    res.json({
      fief: {
        ...withPopulationBreakdown(updateResult.rows[0]),
        slave_worker_assignments: normalizeSlaveWorkerAssignments(updateResult.rows[0]?.slave_worker_assignments),
      },
    });
  } catch (error) {
    console.error('Error converting prisoners:', error);
    res.status(500).json({ error: 'Failed to convert prisoners' });
  }
});

// DM: adjust prisoner count independently (does not touch population)
router.patch('/fiefs/:id/prisoners/adjust', authenticateToken, async (req, res) => {
  try {
    if (!requireDM(req, res)) return;

    const fiefId = Number(req.params.id);
    const delta = Math.floor(Number(req.body?.delta) || 0);
    if (!Number.isFinite(fiefId) || delta === 0) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const owned = await getFiefContext(fiefId);
    if (!owned) return res.status(404).json({ error: 'Fief not found' });
    if (!canManageFief(req.user, owned)) return res.status(403).json({ error: 'Not authorized' });

    const updateResult = await pool.query(
      `UPDATE fiefs
       SET prisoners = GREATEST(0, COALESCE(prisoners, 0) + $2)
       WHERE id = $1
       RETURNING id, population, population_maturation_schedule, sick_injured_population, soldiers, prisoners, slaves, worker_assignments, slave_worker_assignments`,
      [fiefId, delta]
    );

    if (req.io) {
      req.io.to(`campaign_${owned.campaign_id}`).emit('kingdomDataChanged', { campaignId: owned.campaign_id, fiefId });
    }

    res.json({
      fief: {
        ...withPopulationBreakdown(updateResult.rows[0]),
        slave_worker_assignments: normalizeSlaveWorkerAssignments(updateResult.rows[0]?.slave_worker_assignments),
      },
    });
  } catch (error) {
    console.error('Error adjusting prisoners:', error);
    res.status(500).json({ error: 'Failed to adjust prisoners' });
  }
});

// Release slaves back to prisoners, clamping worker assignments
router.patch('/fiefs/:id/slaves/release', authenticateToken, async (req, res) => {
  try {
    const fiefId = Number(req.params.id);
    const amount = Math.max(0, Math.floor(Number(req.body?.amount) || 0));
    if (!Number.isFinite(fiefId) || amount <= 0) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const owned = await getFiefContext(fiefId);
    if (!owned) return res.status(404).json({ error: 'Fief not found' });
    if (!canManageFief(req.user, owned)) return res.status(403).json({ error: 'Not authorized' });

    const currentSlaves = Math.max(0, Number(owned.slaves || 0));
    if (amount > currentSlaves) {
      return res.status(400).json({ error: `Cannot release ${amount}. Only ${currentSlaves} slaves available.` });
    }

    const newSlaveCount = currentSlaves - amount;
    const clampedAssignments = clampSlaveAssignmentsToPool(owned.slave_worker_assignments, newSlaveCount);

    const updateResult = await pool.query(
      `UPDATE fiefs
       SET slaves = $2,
           prisoners = COALESCE(prisoners, 0) + $3,
           slave_worker_assignments = $4::jsonb
       WHERE id = $1
       RETURNING id, population, population_maturation_schedule, sick_injured_population, soldiers, prisoners, slaves, worker_assignments, slave_worker_assignments`,
      [fiefId, newSlaveCount, amount, JSON.stringify(clampedAssignments)]
    );

    if (req.io) {
      req.io.to(`campaign_${owned.campaign_id}`).emit('kingdomDataChanged', { campaignId: owned.campaign_id, fiefId });
    }

    res.json({
      fief: {
        ...withPopulationBreakdown(updateResult.rows[0]),
        slave_worker_assignments: normalizeSlaveWorkerAssignments(updateResult.rows[0]?.slave_worker_assignments),
      },
    });
  } catch (error) {
    console.error('Error releasing slaves:', error);
    res.status(500).json({ error: 'Failed to release slaves' });
  }
});

router.patch('/fiefs/:id/dm-adjust', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    if (!requireDM(req, res)) return;

    const fiefId = Number(req.params.id);
    const resourceUpdates = (req.body?.resourceUpdates && typeof req.body.resourceUpdates === 'object') ? req.body.resourceUpdates : {};
    const populationDeltaRaw = req.body?.populationDelta;

    if (!Number.isFinite(fiefId)) {
      return res.status(400).json({ error: 'Invalid fief id' });
    }

    const hasResourceUpdates = Object.keys(resourceUpdates).length > 0;
    const hasPopulationDelta = populationDeltaRaw !== undefined && populationDeltaRaw !== null;
    if (!hasResourceUpdates && !hasPopulationDelta) {
      return res.status(400).json({ error: 'No adjustment provided' });
    }

    await client.query('BEGIN');

    const result = await client.query(
      `SELECT f.*, k.player_id, k.campaign_id, c.dungeon_master_id
       FROM fiefs f
       JOIN kingdoms k ON k.id = f.kingdom_id
       JOIN campaigns c ON c.id = k.campaign_id
       WHERE f.id = $1
       FOR UPDATE`,
      [fiefId]
    );

    const fief = result.rows[0];
    if (!fief) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Fief not found' });
    }

    if (!canManageFief(req.user, fief)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not authorized for this fief' });
    }

    const nextStoredResources = (fief.stored_resources && typeof fief.stored_resources === 'object')
      ? { ...fief.stored_resources }
      : {};

    const allowedResourceKeys = new Set(['food', 'wood', 'stone', 'minerals', 'gold', 'faith', 'research', 'meat', 'vegetables', 'iron']);
    if (hasResourceUpdates) {
      for (const [rawKey, rawValue] of Object.entries(resourceUpdates)) {
        const key = String(rawKey || '').trim().toLowerCase();
        if (!allowedResourceKeys.has(key)) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Unsupported resource key: ${rawKey}` });
        }
        const targetKey = key === 'iron' ? 'minerals' : key;
        const amount = Math.max(0, Number(rawValue) || 0);
        nextStoredResources[targetKey] = amount;
      }
    }

    let nextPopulation = Math.max(0, Math.floor(Number(fief.population || 0)));
    let nextSchedule = normalizeMaturationSchedule(fief.population_maturation_schedule);
    let nextWorkers = normalizeWorkerAssignments(fief.worker_assignments);

    if (hasPopulationDelta) {
      const delta = Math.floor(Number(populationDeltaRaw) || 0);
      if (!Number.isFinite(delta) || delta === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'populationDelta must be a non-zero integer' });
      }
      nextPopulation = Math.max(0, nextPopulation + delta);
      nextSchedule = trimMaturationScheduleToPopulation(nextSchedule, nextPopulation);

      const assignable = getAssignablePopulation(nextPopulation, nextSchedule, fief.sick_injured_population);
      nextWorkers = clampWorkersToAssignablePopulation(
        nextWorkers,
        (fief.max_workers_per_resource && typeof fief.max_workers_per_resource === 'object') ? fief.max_workers_per_resource : {},
        assignable
      );
    }

    const updateResult = await client.query(
      `UPDATE fiefs
       SET stored_resources = $2::jsonb,
           population = $3,
           population_maturation_schedule = $4::jsonb,
           worker_assignments = $5::jsonb
       WHERE id = $1
       RETURNING *`,
      [
        fiefId,
        JSON.stringify(nextStoredResources),
        nextPopulation,
        JSON.stringify(nextSchedule),
        JSON.stringify(nextWorkers),
      ]
    );

    await client.query('COMMIT');

    if (req.io) {
      req.io.to(`campaign_${fief.campaign_id}`).emit('kingdomDataChanged', { campaignId: fief.campaign_id, fiefId });
    }

    res.json({
      fief: {
        ...withPopulationBreakdown(updateResult.rows[0]),
        stored_resources: normalizeStoredResources(updateResult.rows[0]?.stored_resources),
        worker_assignments: normalizeWorkerAssignments(updateResult.rows[0]?.worker_assignments),
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error applying DM fief adjustments:', error);
    res.status(500).json({ error: 'Failed to apply DM adjustment' });
  } finally {
    client.release();
  }
});

router.post('/fiefs/:id/buildings', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const fiefId = Number(req.params.id);
    const buildingType = String(req.body?.buildingType || '').trim();
    if (!Number.isFinite(fiefId) || !buildingType) {
      return res.status(400).json({ error: 'fief id and buildingType are required' });
    }

    const blueprint = BUILDING_CATALOG[buildingType];
    if (!blueprint) {
      return res.status(400).json({ error: 'Unknown building type' });
    }

    await client.query('BEGIN');
    const fiefResult = await client.query(
      `SELECT f.*, k.player_id, k.campaign_id, c.dungeon_master_id
       FROM fiefs f
       JOIN kingdoms k ON k.id = f.kingdom_id
       JOIN campaigns c ON c.id = k.campaign_id
       WHERE f.id = $1
       FOR UPDATE`,
      [fiefId]
    );
    const fief = fiefResult.rows[0];
    if (!fief) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Fief not found' });
    }

    if (!canManageFief(req.user, fief)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not authorized to build on this fief' });
    }

    const fiefTier = getNumber(fief.tier || 1);
    if (fiefTier < blueprint.tierRequired) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Requires fief tier ${blueprint.tierRequired}` });
    }

    const completedBuildings = await client.query(
      `SELECT building_type
       FROM fief_buildings
       WHERE fief_id = $1 AND is_complete = true`,
      [fiefId]
    );

    if (!hasPrerequisites(blueprint, completedBuildings.rows)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Building prerequisites are not met' });
    }

    const stored = normalizeStoredResources(fief.stored_resources);
    for (const [resource, needed] of Object.entries(blueprint.cost)) {
      const resourceKey = resource === 'iron' ? 'minerals' : resource;
      if ((stored[resourceKey] || 0) < needed) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Insufficient ${resource}` });
      }
    }

    for (const [resource, needed] of Object.entries(blueprint.cost)) {
      const resourceKey = resource === 'iron' ? 'minerals' : resource;
      stored[resourceKey] = (stored[resourceKey] || 0) - needed;
    }

    const queueData = await client.query(
      `SELECT COALESCE(MAX(queue_position), 0) AS max_pos
       FROM fief_buildings
       WHERE fief_id = $1 AND is_complete = false`,
      [fiefId]
    );
    const queuePosition = getNumber(queueData.rows[0]?.max_pos) + 1;

    const buildingInsert = await client.query(
      `INSERT INTO fief_buildings
       (fief_id, name, building_type, level, description, construction_days_required, days_remaining, is_complete, queue_position, resource_output, resource_cost)
       VALUES ($1, $2, $3, 1, $4, $5, $5, false, $6, $7::jsonb, $8::jsonb)
       RETURNING *`,
      [
        fiefId,
        blueprint.name,
        blueprint.key,
        `Tier ${blueprint.tierRequired} construction`,
        blueprint.days,
        queuePosition,
        JSON.stringify(blueprint.resourceOutput || {}),
        JSON.stringify(blueprint.cost || {}),
      ]
    );

    await client.query(
      `UPDATE fiefs
       SET stored_resources = $2::jsonb
       WHERE id = $1`,
      [fiefId, JSON.stringify(stored)]
    );

    await client.query('COMMIT');

    if (req.io) {
      req.io.to(`campaign_${fief.campaign_id}`).emit('kingdomDataChanged', { campaignId: fief.campaign_id, fiefId });
    }

    res.status(201).json({ building: buildingInsert.rows[0], stored_resources: stored });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error queueing building:', error);
    res.status(500).json({ error: 'Failed to queue building' });
  } finally {
    client.release();
  }
});

// Building upgrade endpoint
// Upgrades an existing building based on completed research
router.patch('/fiefs/:id/buildings/:buildingId/upgrade', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const fiefId = Number(req.params.id);
    const buildingId = Number(req.params.buildingId);
    if (!Number.isFinite(fiefId) || !Number.isFinite(buildingId)) {
      return res.status(400).json({ error: 'Invalid fief or building ID' });
    }

    await client.query('BEGIN');
    const fiefResult = await client.query(
      `SELECT f.*, k.player_id, k.campaign_id, c.dungeon_master_id
       FROM fiefs f
       JOIN kingdoms k ON k.id = f.kingdom_id
       JOIN campaigns c ON c.id = k.campaign_id
       WHERE f.id = $1
       FOR UPDATE`,
      [fiefId]
    );
    const fief = fiefResult.rows[0];
    if (!fief) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Fief not found' });
    }

    if (!canManageFief(req.user, fief)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not authorized to upgrade on this fief' });
    }

    const buildingResult = await client.query(
      `SELECT * FROM fief_buildings WHERE id = $1 AND fief_id = $2`,
      [buildingId, fiefId]
    );
    const building = buildingResult.rows[0];
    if (!building) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Building not found' });
    }

    if (building.is_complete === false) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Building must be completed before upgrading' });
    }

    // Determine the upgrade based on building type
    const upgradeInfo = BUILDING_UPGRADE_MAP[building.building_type];
    if (!upgradeInfo) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Building type cannot be upgraded' });
    }

    const completedResearchSet = new Set(Array.isArray(fief.completed_research) ? fief.completed_research : []);
    const levelsTableCheck = await client.query(`SELECT to_regclass('public.fief_research_levels') AS table_name`);
    if (levelsTableCheck.rows[0]?.table_name) {
      const completedLevels = await client.query(
        `SELECT building_type
         FROM fief_research_levels
         WHERE fief_id = $1`,
        [fiefId]
      );
      for (const row of completedLevels.rows) {
        completedResearchSet.add(String(row.building_type || ''));
      }
    }

    const requiredResearch = String(upgradeInfo.researchRequired || '').trim();
    if (requiredResearch && !completedResearchSet.has(requiredResearch)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Requires ${requiredResearch} research to be completed` });
    }

    // Get the upgrade building blueprint
    const upgradeBuildingKey = upgradeInfo.upgradedBuilding;
    const upgradeBlueprintTemp = BUILDING_CATALOG[upgradeBuildingKey];
    if (!upgradeBlueprintTemp) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Upgrade blueprint not found' });
    }

    if (Number(upgradeBlueprintTemp.tierRequired || 1) > Number(fief.tier || 1)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Requires fief tier ${upgradeBlueprintTemp.tierRequired} to upgrade` });
    }

    // Check resources
    const stored = normalizeStoredResources(fief.stored_resources);
    for (const [resource, needed] of Object.entries(upgradeBlueprintTemp.cost)) {
      const resourceKey = resource === 'iron' ? 'minerals' : resource;
      if ((stored[resourceKey] || 0) < needed) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Insufficient ${resource}` });
      }
    }

    // Deduct resources
    for (const [resource, needed] of Object.entries(upgradeBlueprintTemp.cost)) {
      const resourceKey = resource === 'iron' ? 'minerals' : resource;
      stored[resourceKey] = (stored[resourceKey] || 0) - needed;
    }

    // Create upgrade in queue (mark as upgrade, not new build)
    const updateResult = await client.query(
      `UPDATE fief_buildings
       SET construction_days_required = $1,
           days_remaining = $1,
           is_complete = false,
           queue_position = COALESCE((SELECT MAX(queue_position) + 1 FROM fief_buildings WHERE fief_id = $4 AND is_complete = false), 1),
           resource_cost = $2::jsonb,
           level = level + 1,
           building_type = $5,
           name = $6,
           description = $7,
           resource_output = $8::jsonb
       WHERE id = $3 AND fief_id = $4
       RETURNING *`,
      [
        upgradeBlueprintTemp.days,
        JSON.stringify(upgradeBlueprintTemp.cost || {}),
        buildingId,
        fiefId,
        String(upgradeBlueprintTemp.key || upgradeBuildingKey),
        String(upgradeBlueprintTemp.name || upgradeBuildingKey),
        String(upgradeBlueprintTemp.description || ''),
        JSON.stringify(upgradeBlueprintTemp.resourceOutput || {}),
      ]
    );

    await client.query(
      `UPDATE fiefs SET stored_resources = $2::jsonb WHERE id = $1`,
      [fiefId, JSON.stringify(stored)]
    );

    await client.query('COMMIT');

    if (req.io) {
      req.io.to(`campaign_${fief.campaign_id}`).emit('kingdomDataChanged', { campaignId: fief.campaign_id, fiefId });
    }

    res.json({ building: updateResult.rows[0], stored_resources: stored });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error upgrading building:', error);
    res.status(500).json({ error: 'Failed to upgrade building' });
  } finally {
    client.release();
  }
});

router.post('/fiefs/:id/research/start', authenticateToken, async (req, res) => {
  try {
    const fiefId = Number(req.params.id);
    const researchId = String(req.body?.researchId || '').trim();
    if (!Number.isFinite(fiefId) || !researchId) {
      return res.status(400).json({ error: 'fief id and researchId are required' });
    }

    if (!(await tableExists('fief_research_queue'))) {
      return res.status(400).json({ error: 'Research system is not available yet' });
    }
    const researchConfig = getResearchConfig(researchId);
    if (!researchConfig) {
      return res.status(400).json({ error: 'Unknown research id' });
    }

    const fief = await getFiefContext(fiefId);
    if (!fief) return res.status(404).json({ error: 'Fief not found' });
    if (!canManageFief(req.user, fief)) return res.status(403).json({ error: 'Not authorized to research for this fief' });

    if (getNumber(fief.tier || 1) < getNumber(researchConfig.tierRequired || 1)) {
      return res.status(400).json({ error: `Research requires fief tier ${researchConfig.tierRequired}` });
    }

    const hasResearchLab = await pool.query(
      `SELECT 1 FROM fief_buildings WHERE fief_id = $1 AND is_complete = true AND building_type = 'research_lab' LIMIT 1`,
      [fiefId]
    );
    if (hasResearchLab.rows.length === 0) {
      return res.status(400).json({ error: 'Research Lab is required before starting research' });
    }

    if (await tableExists('fief_research_levels')) {
      const completed = await pool.query(
        `SELECT 1
         FROM fief_research_levels
         WHERE fief_id = $1 AND building_type = $2
         LIMIT 1`,
        [fiefId, researchId]
      );
      if (completed.rows.length > 0) {
        return res.status(400).json({ error: 'This research is already completed' });
      }
    }

    const existingQueued = await pool.query(
      `SELECT 1
       FROM fief_research_queue
       WHERE fief_id = $1 AND research_id = $2 AND status IN ('queued', 'active')
       LIMIT 1`,
      [fiefId, researchId]
    );
    if (existingQueued.rows.length > 0) {
      return res.status(400).json({ error: 'This research is already in your queue' });
    }

    const prereqs = Array.isArray(researchConfig.prerequisites) ? researchConfig.prerequisites : [];
    if (prereqs.length > 0 && (await tableExists('fief_research_levels'))) {
      const prereqCheck = await pool.query(
        `SELECT building_type
         FROM fief_research_levels
         WHERE fief_id = $1 AND building_type = ANY($2::text[])`,
        [fiefId, prereqs]
      );
      const completedSet = new Set(prereqCheck.rows.map((r) => String(r.building_type)));
      const missing = prereqs.filter((p) => !completedSet.has(String(p)));
      if (missing.length > 0) {
        return res.status(400).json({ error: `Missing research prerequisite(s): ${missing.join(', ')}` });
      }
    }

    const queueResult = await pool.query(
      `SELECT COALESCE(MAX(queue_position), 0) AS max_pos
       FROM fief_research_queue
       WHERE fief_id = $1 AND status IN ('queued', 'active')`,
      [fiefId]
    );
    const queuePosition = getNumber(queueResult.rows[0]?.max_pos) + 1;

    const campDayResult = await pool.query(`SELECT COALESCE(current_day, 1) AS current_day FROM campaigns WHERE id = $1`, [fief.campaign_id]);
    const currentDay = getNumber(campDayResult.rows[0]?.current_day || 1);

    const insertResult = await pool.query(
      `INSERT INTO fief_research_queue
       (fief_id, research_id, status, queue_position, campaign_day_started)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [fiefId, researchId, queuePosition === 1 ? 'active' : 'queued', queuePosition, currentDay]
    );

    if (req.io) {
      req.io.to(`campaign_${fief.campaign_id}`).emit('kingdomDataChanged', { campaignId: fief.campaign_id, fiefId });
    }

    res.status(201).json({ research: insertResult.rows[0] });
  } catch (error) {
    console.error('Error starting research:', error);
    res.status(500).json({ error: 'Failed to start research' });
  }
});

router.post('/fiefs/:id/upgrade-tier', authenticateToken, async (req, res) => {
  try {
    const fiefId = Number(req.params.id);
    if (!Number.isFinite(fiefId)) return res.status(400).json({ error: 'Invalid fief ID' });

    const hasUpgradeDays = await pool.query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_name = 'fiefs' AND column_name = 'tier_upgrade_days_remaining'`
    );
    if (hasUpgradeDays.rows.length === 0) {
      return res.status(400).json({ error: 'Tier upgrade timer is not available yet' });
    }

    const fief = await getFiefContext(fiefId);
    if (!fief) return res.status(404).json({ error: 'Fief not found' });
    if (!canManageFief(req.user, fief)) return res.status(403).json({ error: 'Not authorized to upgrade this fief' });

    if (getNumber(fief.tier) >= 2) {
      return res.status(400).json({ error: 'Tier 2 is already reached for this phase' });
    }
    if (getNumber(fief.tier_upgrade_days_remaining) > 0) {
      return res.status(400).json({ error: `Tier upgrade already in progress (${fief.tier_upgrade_days_remaining} day(s) remaining)` });
    }

    const storedResources = (fief.stored_resources || {});
    const woodRequired = 200;
    const woodAvailable = getNumber(storedResources.wood || 0);

    if (woodAvailable < woodRequired) {
      return res.status(400).json({ error: `Not enough wood. Required: ${woodRequired}, Available: ${woodAvailable}` });
    }

    const updatedResources = { ...storedResources, wood: woodAvailable - woodRequired };

    const updateResult = await pool.query(
      `UPDATE fiefs
       SET tier_upgrade_days_remaining = 14,
           stored_resources = $1::jsonb
       WHERE id = $2
       RETURNING id, tier, tier_upgrade_days_remaining`,
      [JSON.stringify(updatedResources), fiefId]
    );

    if (req.io) {
      req.io.to(`campaign_${fief.campaign_id}`).emit('kingdomDataChanged', { campaignId: fief.campaign_id, fiefId });
    }

    res.json({ fief: updateResult.rows[0] });
  } catch (error) {
    console.error('Error starting tier upgrade:', error);
    res.status(500).json({ error: 'Failed to start tier upgrade' });
  }
});

router.post('/fiefs/:id/upgrade-tier-3', authenticateToken, async (req, res) => {
  try {
    const fiefId = Number(req.params.id);
    if (!Number.isFinite(fiefId)) return res.status(400).json({ error: 'Invalid fief ID' });

    const fief = await getFiefContext(fiefId);
    if (!fief) return res.status(404).json({ error: 'Fief not found' });
    if (!canManageFief(req.user, fief)) return res.status(403).json({ error: 'Not authorized to upgrade this fief' });

    if (getNumber(fief.tier) < 2) {
      return res.status(400).json({ error: 'Must reach Tier 2 before upgrading to Tier 3' });
    }
    if (getNumber(fief.tier) >= 3) {
      return res.status(400).json({ error: 'Tier 3 is already reached' });
    }
    if (getNumber(fief.tier_upgrade_days_remaining_3 || 0) > 0) {
      return res.status(400).json({ error: `Tier upgrade already in progress (${fief.tier_upgrade_days_remaining_3} day(s) remaining)` });
    }

    const storedResources = (fief.stored_resources || {});
    const woodRequired = 300;
    const stoneRequired = 100;
    const ironRequired = 50;
    
    const woodAvailable = getNumber(storedResources.wood || 0);
    const stoneAvailable = getNumber(storedResources.stone || 0);
    const mineralsAvailable = getNumber(storedResources.minerals || 0);

    if (woodAvailable < woodRequired) {
      return res.status(400).json({ error: `Not enough wood. Required: ${woodRequired}, Available: ${woodAvailable}` });
    }
    if (stoneAvailable < stoneRequired) {
      return res.status(400).json({ error: `Not enough stone. Required: ${stoneRequired}, Available: ${stoneAvailable}` });
    }
    if (mineralsAvailable < ironRequired) {
      return res.status(400).json({ error: `Not enough iron. Required: ${ironRequired}, Available: ${mineralsAvailable}` });
    }

    const updatedResources = {
      ...storedResources,
      wood: woodAvailable - woodRequired,
      stone: stoneAvailable - stoneRequired,
      minerals: mineralsAvailable - ironRequired,
    };

    const updateResult = await pool.query(
      `UPDATE fiefs
       SET tier_upgrade_days_remaining_3 = 20,
           stored_resources = $1::jsonb
       WHERE id = $2
       RETURNING id, tier, tier_upgrade_days_remaining_3`,
      [JSON.stringify(updatedResources), fiefId]
    );

    if (req.io) {
      req.io.to(`campaign_${fief.campaign_id}`).emit('kingdomDataChanged', { campaignId: fief.campaign_id, fiefId });
    }

    res.json({ fief: updateResult.rows[0] });
  } catch (error) {
    console.error('Error starting tier 3 upgrade:', error);
    res.status(500).json({ error: 'Failed to start tier 3 upgrade' });
  }
});

// ─── Create New Fief ─────────────────────────────────────────────────────────
router.post('/:kingdomId/fiefs', authenticateToken, async (req, res) => {
  try {
    const kingdomId = Number(req.params.kingdomId);
    if (!Number.isFinite(kingdomId)) return res.status(400).json({ error: 'Invalid kingdom ID' });

    // Verify requester owns this kingdom
    const ownerCheck = await pool.query(
      `SELECT k.id, k.campaign_id, k.player_id FROM kingdoms k WHERE k.id = $1`,
      [kingdomId]
    );
    if (!ownerCheck.rows.length) return res.status(404).json({ error: 'Kingdom not found' });
    const kingdom = ownerCheck.rows[0];
    if (Number(kingdom.player_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'You do not own this kingdom' });
    }

    const { name, population, resources } = req.body;

    // Validate name
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Fief name is required' });
    }

    // Validate population
    const pop = Math.floor(Number(population));
    if (!Number.isFinite(pop) || pop < 10) {
      return res.status(400).json({ error: 'Population must be at least 10' });
    }

    // Validate resources
    const sentFood = Math.floor(Number(resources?.food ?? 0));
    const sentWood = Math.floor(Number(resources?.wood ?? 0));
    const sentStone = Math.floor(Number(resources?.stone ?? 0));
    const sentMinerals = Math.floor(Number(resources?.minerals ?? 0));
    if (sentFood < 40) return res.status(400).json({ error: 'Must send at least 40 food' });
    if (sentWood < 57) return res.status(400).json({ error: 'Must send at least 57 wood (32 for tents + 25 for fief)' });
    if (sentStone < 0 || sentMinerals < 0) return res.status(400).json({ error: 'Resources cannot be negative' });
    const totalSent = sentFood + sentWood + sentStone + sentMinerals;
    if (totalSent > 100) return res.status(400).json({ error: 'Total resources sent cannot exceed 100' });

    // Find capital fief to deduct from
    const capitalResult = await pool.query(
      `SELECT id, population, stored_resources FROM fiefs WHERE kingdom_id = $1 AND is_capital = true LIMIT 1`,
      [kingdomId]
    );
    if (!capitalResult.rows.length) return res.status(400).json({ error: 'No capital fief found' });
    const capital = capitalResult.rows[0];

    const capitalPop = Math.floor(Number(capital.population || 0));
    if (capitalPop - pop < 10) {
      return res.status(400).json({ error: `Capital must keep at least 10 population (has ${capitalPop}, sending ${pop})` });
    }

    const stored = capital.stored_resources || {};
    const capFood = Math.floor(Number(stored.food || 0));
    const capWood = Math.floor(Number(stored.wood || 0));
    const capStone = Math.floor(Number(stored.stone || 0));
    const capMinerals = Math.floor(Number(stored.minerals || 0));
    if (capFood < sentFood) return res.status(400).json({ error: `Capital only has ${capFood} food` });
    if (capWood < sentWood) return res.status(400).json({ error: `Capital only has ${capWood} wood` });
    if (capStone < sentStone) return res.status(400).json({ error: `Capital only has ${capStone} stone` });
    if (capMinerals < sentMinerals) return res.status(400).json({ error: `Capital only has ${capMinerals} minerals` });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Deduct from capital
      const newCapitalResources = {
        ...stored,
        food: capFood - sentFood,
        wood: capWood - sentWood,
        stone: capStone - sentStone,
        minerals: capMinerals - sentMinerals,
      };
      await client.query(
        `UPDATE fiefs SET population = $2, stored_resources = $3::jsonb WHERE id = $1`,
        [capital.id, capitalPop - pop, JSON.stringify(newCapitalResources)]
      );

      // New fief stored resources (32 wood consumed by 4 tents)
      const newFiefResources = {
        food: sentFood,
        wood: sentWood - 32,
        stone: sentStone,
        minerals: sentMinerals,
        faith: 0,
        research: 0,
      };

      // Insert new fief
      const fiefResult = await client.query(
        `INSERT INTO fiefs (kingdom_id, name, tier, population, is_capital, travel_days_remaining)
         VALUES ($1, $2, 1, $3, false, 0)
         RETURNING id`,
        [kingdomId, name.trim(), pop]
      );
      const newFiefId = Number(fiefResult.rows[0].id);

      // Check which columns exist
      const colCheck = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'fiefs' AND column_name = ANY($1::text[])`,
        [['storage_capacity', 'stored_resources', 'worker_assignments', 'unlocked_resources', 'max_workers_per_resource', 'location_modifiers']]
      );
      const cols = new Set(colCheck.rows.map((r) => r.column_name));

      if (cols.has('storage_capacity')) {
        await client.query(`UPDATE fiefs SET storage_capacity = 100 WHERE id = $1`, [newFiefId]);
      }
      if (cols.has('stored_resources')) {
        await client.query(
          `UPDATE fiefs SET stored_resources = $2::jsonb WHERE id = $1`,
          [newFiefId, JSON.stringify(newFiefResources)]
        );
      }
      if (cols.has('worker_assignments')) {
        await client.query(
          `UPDATE fiefs SET worker_assignments = '{"meat":0,"vegetables":0,"wood":0,"stone":0,"iron":0,"research":0,"faith":0,"building":0}'::jsonb WHERE id = $1`,
          [newFiefId]
        );
      }
      if (cols.has('unlocked_resources')) {
        await client.query(
          `UPDATE fiefs SET unlocked_resources = '{"meat":false,"vegetables":false,"wood":true,"stone":false,"iron":false,"research":false,"faith":false,"building":true}'::jsonb WHERE id = $1`,
          [newFiefId]
        );
      }
      if (cols.has('max_workers_per_resource')) {
        await client.query(
          `UPDATE fiefs SET max_workers_per_resource = '{"meat":10,"vegetables":10,"wood":10,"stone":10,"iron":10,"research":10,"faith":10,"building":10}'::jsonb WHERE id = $1`,
          [newFiefId]
        );
      }
      if (cols.has('location_modifiers')) {
        await client.query(
          `UPDATE fiefs SET location_modifiers = '{}'::jsonb WHERE id = $1`,
          [newFiefId]
        );
      }

      // Insert 4 completed housing (Tent) buildings
      const queueCol = await client.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = 'fief_buildings' AND column_name = 'queue_position'`
      );
      const hasQueuePosition = queueCol.rows.length > 0;

      for (let i = 0; i < 4; i++) {
        if (hasQueuePosition) {
          await client.query(
            `INSERT INTO fief_buildings (fief_id, name, building_type, level, description, construction_days_required, days_remaining, is_complete, resource_output, resource_cost, built_at, queue_position)
             VALUES ($1, 'Tent', 'housing', 1, 'Basic shelter', 0, 0, true, '{}'::jsonb, '{}'::jsonb, NOW(), NULL)`,
            [newFiefId]
          );
        } else {
          await client.query(
            `INSERT INTO fief_buildings (fief_id, name, building_type, level, description, construction_days_required, days_remaining, is_complete, resource_output, resource_cost, built_at)
             VALUES ($1, 'Tent', 'housing', 1, 'Basic shelter', 0, 0, true, '{}'::jsonb, '{}'::jsonb, NOW())`,
            [newFiefId]
          );
        }
      }

      await client.query('COMMIT');

      // Emit fiefCreated so DM gets the modifier/travel modal
      if (req.io) {
        req.io.to(`campaign_${kingdom.campaign_id}`).emit('fiefCreated', {
          campaignId: kingdom.campaign_id,
          kingdomId,
          newFiefId,
        });
        req.io.to(`campaign_${kingdom.campaign_id}`).emit('kingdomDataChanged', { campaignId: kingdom.campaign_id });
      }

      res.json({ fiefId: newFiefId, message: 'Fief created successfully' });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error creating fief:', error);
    res.status(500).json({ error: 'Failed to create fief' });
  }
});

// ─── DM: Set Fief Location Modifiers + Travel Days ───────────────────────────
router.patch('/fiefs/:id/location-modifiers', authenticateToken, async (req, res) => {
  try {
    if (!requireDM(req, res)) return;

    const fiefId = Number(req.params.id);
    if (!Number.isFinite(fiefId)) return res.status(400).json({ error: 'Invalid fief ID' });

    const locationModifiers = sanitizeLocationModifiers(req.body.locationModifiers);
    const travelDays = Math.max(0, Math.floor(Number(req.body.travelDays ?? 0)));
    if (!Number.isFinite(travelDays)) return res.status(400).json({ error: 'Invalid travelDays' });

    // Check travel_days_remaining column exists
    const colCheck = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'fiefs' AND column_name = 'travel_days_remaining'`
    );
    const hasTravelDays = colCheck.rows.length > 0;

    let result;
    if (hasTravelDays) {
      result = await pool.query(
        `UPDATE fiefs SET location_modifiers = $2::jsonb, travel_days_remaining = $3 WHERE id = $1 RETURNING id, kingdom_id`,
        [fiefId, JSON.stringify(locationModifiers), travelDays]
      );
    } else {
      result = await pool.query(
        `UPDATE fiefs SET location_modifiers = $2::jsonb WHERE id = $1 RETURNING id, kingdom_id`,
        [fiefId, JSON.stringify(locationModifiers)]
      );
    }

    if (!result.rows.length) return res.status(404).json({ error: 'Fief not found' });

    // Get campaign ID via kingdom
    const campaignResult = await pool.query(
      `SELECT campaign_id FROM kingdoms WHERE id = $1`,
      [result.rows[0].kingdom_id]
    );
    const campaignId = campaignResult.rows[0]?.campaign_id;

    if (req.io && campaignId) {
      req.io.to(`campaign_${campaignId}`).emit('kingdomDataChanged', { campaignId });
    }

    res.json({ fiefId, locationModifiers, travelDays });
  } catch (error) {
    console.error('Error setting fief location modifiers:', error);
    res.status(500).json({ error: 'Failed to set fief location modifiers' });
  }
});

module.exports = router;
