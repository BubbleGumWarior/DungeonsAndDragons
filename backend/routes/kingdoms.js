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
    description: 'Unlocks the meat worker lane with a cap of +20 hunters. Passively produces +1 meat/day. Each assigned hunter adds +1.5 meat/day.',
    tierRequired: 1,
    cost: { wood: 14 },
    days: 5,
    resourceOutput: { meat: 1 },
    prerequisites: [],
  },
  farm: {
    key: 'farm',
    name: 'Vegetable Patch',
    description: 'Unlocks the vegetable lane with +20 farmer capacity. Farming now runs as 4 days assignment, 6 days growth, and 4 days harvest collection.',
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
    description: 'Raises the hunter worker cap by +20. Passively produces +1 meat/day. Hunters in this building add +1.73 meat/day each (up from +1.5 at Hunters Cabin).',
    tierRequired: 2,
    cost: { wood: 18, stone: 10 },
    days: 3,
    resourceOutput: { meat: 1 },
    prerequisites: [{ type: 'hunters_guild', minCount: 1 }],
  },
  irrigated_farm: {
    key: 'irrigated_farm',
    name: 'Irrigated Fields',
    description: 'Raises farmer capacity by +20. During harvest days, farmers in this building collect at 1.15x rate (up from 1x at Vegetable Patch).',
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
    description: 'Basic fortifications that protect your settlement against raids. Each building of this type covers a total distance of 15 meters.',
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
    description: 'Raises the hunter worker cap by +20. Passively produces +1 meat/day. Hunters in this building add +1.95 meat/day each (up from +1.5 at Hunters Cabin, +30% over base).',
    tierRequired: 3,
    cost: { wood: 24, stone: 16, iron: 8 },
    days: 4,
    resourceOutput: { meat: 1 },
    prerequisites: [{ type: 'hunting_lodge', minCount: 1 }],
  },
  farm_advanced: {
    key: 'farm_advanced',
    name: 'Premium Farmland',
    description: 'Raises farmer capacity by +20. During harvest days, farmers collect at 1.30x rate (up from 1.0x at Vegetable Patch). Best vegetable throughput per building.',
    tierRequired: 3,
    cost: { wood: 20, stone: 14, iron: 6 },
    days: 3,
    resourceOutput: { vegetables: 3 },
    prerequisites: [{ type: 'irrigated_farm', minCount: 1 }],
  },
  storage_advanced: {
    key: 'storage_advanced',
    name: 'Advanced Warehouse',
    description: 'Adds +700 storage capacity.',
    tierRequired: 7,
    cost: { wood: 50, stone: 40, iron: 16 },
    days: 7,
    resourceOutput: {},
    prerequisites: [{ type: 'central_storehouse', minCount: 1 }],
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

Object.assign(BUILDING_CATALOG, {
  // ── Guard Post chain (Watchman → Guard → Shield Guard → Royal Guard) ──────
  guard_post: {
    key: 'guard_post', name: 'Guard Post',
    description: 'Basic sentry training post for local watch and defense duty.',
    tierRequired: 3, cost: { wood: 20, stone: 12, iron: 4 }, days: 4, resourceOutput: {},
    prerequisites: [{ type: 'militia_camp', minCount: 1 }],
  },
  guard_barracks: {
    key: 'guard_barracks', name: 'Guard Barracks',
    description: 'Standing watch barracks for disciplined guard formations.',
    tierRequired: 4, cost: { wood: 26, stone: 18, iron: 8 }, days: 5, resourceOutput: {},
    prerequisites: [{ type: 'guard_post', minCount: 1 }],
  },
  shield_hall: {
    key: 'shield_hall', name: 'Shield Hall',
    description: 'Shieldcraft and formation drills for veteran guard units.',
    tierRequired: 5, cost: { wood: 32, stone: 24, iron: 12 }, days: 6, resourceOutput: {},
    prerequisites: [{ type: 'guard_barracks', minCount: 1 }],
  },
  royal_guard_citadel: {
    key: 'royal_guard_citadel', name: 'Royal Guard Citadel',
    description: 'Elite guard command citadel for the realm\'s finest sentries.',
    tierRequired: 6, cost: { wood: 40, stone: 30, iron: 16 }, days: 7, resourceOutput: {},
    prerequisites: [{ type: 'shield_hall', minCount: 1 }],
  },
  blacksmith: {
    key: 'blacksmith', name: 'Blacksmith',
    description: 'Dedicated bladesmithing support for heavier guard weaponry.',
    tierRequired: 3, cost: { wood: 16, stone: 12, iron: 12 }, days: 4, resourceOutput: {},
    prerequisites: [{ type: 'smithy', minCount: 1 }],
  },

  // ── Thieves Guild chain (Street Informant → Infiltrator) + branches ───────
  thieves_guild: {
    key: 'thieves_guild', name: 'Thieves\' Guild',
    description: 'Underground network for informants and covert recruitment.',
    tierRequired: 3, cost: { wood: 20, stone: 12, iron: 4 }, days: 4, resourceOutput: {},
    prerequisites: [{ type: 'militia_camp', minCount: 1 }],
  },
  thieves_den: {
    key: 'thieves_den', name: 'Thieves\' Den',
    description: 'Hidden operations base for trained infiltrators.',
    tierRequired: 4, cost: { wood: 26, stone: 18, iron: 8 }, days: 5, resourceOutput: {},
    prerequisites: [{ type: 'thieves_guild', minCount: 1 }],
  },
  scout_lodge: {
    key: 'scout_lodge', name: 'Scout Lodge',
    description: 'Reconnaissance training grounds for long-range scouting.',
    tierRequired: 5, cost: { wood: 32, stone: 24, iron: 12 }, days: 6, resourceOutput: {},
    prerequisites: [{ type: 'thieves_den', minCount: 1 }],
  },
  master_scout_lodge: {
    key: 'master_scout_lodge', name: 'Master Scout Lodge',
    description: 'Advanced scouting doctrine for elite reconnaissance units.',
    tierRequired: 6, cost: { wood: 40, stone: 30, iron: 16 }, days: 7, resourceOutput: {},
    prerequisites: [{ type: 'scout_lodge', minCount: 1 }],
  },
  spy_network: {
    key: 'spy_network', name: 'Spy Network',
    description: 'Covert intelligence network for infiltration operations.',
    tierRequired: 5, cost: { wood: 32, stone: 24, iron: 12 }, days: 6, resourceOutput: {},
    prerequisites: [{ type: 'thieves_den', minCount: 1 }],
  },
  master_spy_network: {
    key: 'master_spy_network', name: 'Master Spy Network',
    description: 'Elite intelligence tradecraft for master-level spies.',
    tierRequired: 6, cost: { wood: 40, stone: 30, iron: 16 }, days: 7, resourceOutput: {},
    prerequisites: [{ type: 'spy_network', minCount: 1 }],
  },
  assassin_den: {
    key: 'assassin_den', name: 'Assassin\'s Den',
    description: 'Secretive training ground for lethal covert operatives.',
    tierRequired: 5, cost: { wood: 34, stone: 26, iron: 16 }, days: 6, resourceOutput: {},
    prerequisites: [{ type: 'thieves_den', minCount: 1 }],
  },
  high_assassin_den: {
    key: 'high_assassin_den', name: 'High Assassin\'s Den',
    description: 'Refined shadow tradecraft for master assassins.',
    tierRequired: 6, cost: { wood: 42, stone: 34, iron: 22 }, days: 7, resourceOutput: {},
    prerequisites: [{ type: 'assassin_den', minCount: 1 }],
  },
  shadow_order: {
    key: 'shadow_order', name: 'Shadow Order',
    description: 'Secret society support required to train the deadliest operatives.',
    tierRequired: 5, cost: { wood: 30, stone: 22, iron: 14 }, days: 6, resourceOutput: {},
    prerequisites: [{ type: 'thieves_den', minCount: 1 }],
  },

  // ── Standalone support buildings for hybrid unit branches ─────────────────
  workshop: {
    key: 'workshop', name: 'Workshop',
    description: 'Mechanical fabrication support for crossbow and siege crews.',
    tierRequired: 4, cost: { wood: 24, stone: 16, iron: 10 }, days: 5, resourceOutput: {},
    prerequisites: [{ type: 'archer_range', minCount: 1 }],
  },
  foundry: {
    key: 'foundry', name: 'Foundry',
    description: 'Heavy metal casting support for bombard-grade siege engines.',
    tierRequired: 5, cost: { wood: 30, stone: 26, iron: 20 }, days: 6, resourceOutput: {},
    prerequisites: [{ type: 'war_engine_forge', minCount: 1 }],
  },
});

Object.assign(BUILDING_CATALOG, {
  // ── Housing tiers 3-10 (matches BUILDING_TIER_MATRIX.md) ──────────────────
  reinforced_lodge: {
    key: 'reinforced_lodge', name: 'Reinforced Lodge',
    description: 'Adds +12 population capacity per building (requires Tier 3 Housing research). Stacks with other housing.',
    tierRequired: 3, cost: { wood: 22, stone: 14, iron: 6 }, days: 4, resourceOutput: {},
    prerequisites: [{ type: 'wood_lodge', minCount: 1 }],
  },
  stone_lodge: {
    key: 'stone_lodge', name: 'Stone Lodge',
    description: 'Adds +16 population capacity per building. Stacks with other housing.',
    tierRequired: 4, cost: { wood: 28, stone: 20, iron: 10 }, days: 5, resourceOutput: {},
    prerequisites: [{ type: 'reinforced_lodge', minCount: 1 }],
  },
  longhouse_block: {
    key: 'longhouse_block', name: 'Longhouse Block',
    description: 'Adds +20 population capacity per building. Stacks with other housing.',
    tierRequired: 5, cost: { wood: 34, stone: 26, iron: 14 }, days: 6, resourceOutput: {},
    prerequisites: [{ type: 'stone_lodge', minCount: 1 }],
  },
  manor_house: {
    key: 'manor_house', name: 'Manor House',
    description: 'Adds +24 population capacity per building. Stacks with other housing.',
    tierRequired: 6, cost: { wood: 40, stone: 32, iron: 18 }, days: 7, resourceOutput: {},
    prerequisites: [{ type: 'longhouse_block', minCount: 1 }],
  },
  townhouse_row: {
    key: 'townhouse_row', name: 'Townhouse Row',
    description: 'Adds +28 population capacity per building. Stacks with other housing.',
    tierRequired: 7, cost: { wood: 46, stone: 38, iron: 22 }, days: 8, resourceOutput: {},
    prerequisites: [{ type: 'manor_house', minCount: 1 }],
  },
  urban_residence: {
    key: 'urban_residence', name: 'Urban Residence',
    description: 'Adds +32 population capacity per building. Stacks with other housing.',
    tierRequired: 8, cost: { wood: 52, stone: 44, iron: 26 }, days: 9, resourceOutput: {},
    prerequisites: [{ type: 'townhouse_row', minCount: 1 }],
  },
  noble_residence: {
    key: 'noble_residence', name: 'Noble Residence',
    description: 'Adds +36 population capacity per building. Stacks with other housing.',
    tierRequired: 9, cost: { wood: 58, stone: 50, iron: 30 }, days: 9, resourceOutput: {},
    prerequisites: [{ type: 'urban_residence', minCount: 1 }],
  },
  royal_estate: {
    key: 'royal_estate', name: 'Royal Estate',
    description: 'Adds +40 population capacity per building — the highest housing tier. Stacks with other housing.',
    tierRequired: 10, cost: { wood: 64, stone: 56, iron: 34 }, days: 10, resourceOutput: {},
    prerequisites: [{ type: 'noble_residence', minCount: 1 }],
  },

  // ── Storage tiers 3-8 (matches BUILDING_TIER_MATRIX.md) ────────────────────
  advanced_storage_tent: {
    key: 'advanced_storage_tent', name: 'Advanced Storage Tent',
    description: 'Adds +300 storage capacity.',
    tierRequired: 3, cost: { wood: 26, stone: 16 }, days: 3, resourceOutput: {},
    prerequisites: [{ type: 'storage_shack', minCount: 1 }],
  },
  storehouse: {
    key: 'storehouse', name: 'Storehouse',
    description: 'Adds +400 storage capacity.',
    tierRequired: 4, cost: { wood: 32, stone: 22, iron: 4 }, days: 4, resourceOutput: {},
    prerequisites: [{ type: 'advanced_storage_tent', minCount: 1 }],
  },
  reinforced_storehouse: {
    key: 'reinforced_storehouse', name: 'Reinforced Storehouse',
    description: 'Adds +500 storage capacity.',
    tierRequired: 5, cost: { wood: 38, stone: 28, iron: 8 }, days: 5, resourceOutput: {},
    prerequisites: [{ type: 'storehouse', minCount: 1 }],
  },
  central_storehouse: {
    key: 'central_storehouse', name: 'Central Storehouse',
    description: 'Adds +600 storage capacity.',
    tierRequired: 6, cost: { wood: 44, stone: 34, iron: 12 }, days: 6, resourceOutput: {},
    prerequisites: [{ type: 'reinforced_storehouse', minCount: 1 }],
  },
  vaulted_warehouse: {
    key: 'vaulted_warehouse', name: 'Vaulted Warehouse',
    description: 'Adds +800 storage capacity — the highest single-building storage bonus available.',
    tierRequired: 8, cost: { wood: 56, stone: 46, iron: 20 }, days: 8, resourceOutput: {},
    prerequisites: [{ type: 'storage_advanced', minCount: 1 }],
  },

  // ── Hunter tiers 4-8 (matches BUILDING_TIER_MATRIX.md) ─────────────────────
  tracker_lodge: {
    key: 'tracker_lodge', name: 'Tracker Lodge',
    description: 'Raises the hunter worker cap by +20. Passively produces +1 meat/day. Hunters here add +2.15 meat/day each.',
    tierRequired: 4, cost: { wood: 30, stone: 22, iron: 12 }, days: 5, resourceOutput: { meat: 1 },
    prerequisites: [{ type: 'hunters_lodge_advanced', minCount: 1 }],
  },
  ranger_hall: {
    key: 'ranger_hall', name: 'Ranger Hall',
    description: 'Raises the hunter worker cap by +20. Passively produces +2 meat/day. Hunters here add +2.35 meat/day each.',
    tierRequired: 5, cost: { wood: 36, stone: 28, iron: 16 }, days: 6, resourceOutput: { meat: 2 },
    prerequisites: [{ type: 'tracker_lodge', minCount: 1 }],
  },
  beastmaster_hall: {
    key: 'beastmaster_hall', name: 'Beastmaster Hall',
    description: 'Raises the hunter worker cap by +20. Passively produces +2 meat/day. Hunters here add +2.55 meat/day each.',
    tierRequired: 6, cost: { wood: 42, stone: 34, iron: 20 }, days: 7, resourceOutput: { meat: 2 },
    prerequisites: [{ type: 'ranger_hall', minCount: 1 }],
  },
  warden_lodge: {
    key: 'warden_lodge', name: 'Warden Lodge',
    description: 'Raises the hunter worker cap by +20. Passively produces +3 meat/day. Hunters here add +2.75 meat/day each.',
    tierRequired: 7, cost: { wood: 48, stone: 40, iron: 24 }, days: 8, resourceOutput: { meat: 3 },
    prerequisites: [{ type: 'beastmaster_hall', minCount: 1 }],
  },
  great_hunters_keep: {
    key: 'great_hunters_keep', name: "Great Hunter's Keep",
    description: 'Raises the hunter worker cap by +20. Passively produces +3 meat/day. Hunters here add +2.95 meat/day each — the best hunting throughput available.',
    tierRequired: 8, cost: { wood: 56, stone: 46, iron: 28 }, days: 9, resourceOutput: { meat: 3 },
    prerequisites: [{ type: 'warden_lodge', minCount: 1 }],
  },

  // ── Vegetable tiers 4-8 (matches BUILDING_TIER_MATRIX.md) ──────────────────
  terrace_fields: {
    key: 'terrace_fields', name: 'Terrace Fields',
    description: 'Raises farmer capacity by +20. During harvest days, farmers here collect at 1.45x rate.',
    tierRequired: 4, cost: { wood: 26, stone: 18, iron: 8 }, days: 4, resourceOutput: { vegetables: 4 },
    prerequisites: [{ type: 'farm_advanced', minCount: 1 }],
  },
  orchard_farms: {
    key: 'orchard_farms', name: 'Orchard Farms',
    description: 'Raises farmer capacity by +20. During harvest days, farmers here collect at 1.60x rate.',
    tierRequired: 5, cost: { wood: 32, stone: 24, iron: 12 }, days: 5, resourceOutput: { vegetables: 5 },
    prerequisites: [{ type: 'terrace_fields', minCount: 1 }],
  },
  fertile_estates: {
    key: 'fertile_estates', name: 'Fertile Estates',
    description: 'Raises farmer capacity by +20. During harvest days, farmers here collect at 1.75x rate.',
    tierRequired: 6, cost: { wood: 38, stone: 30, iron: 16 }, days: 6, resourceOutput: { vegetables: 6 },
    prerequisites: [{ type: 'orchard_farms', minCount: 1 }],
  },
  greenhouse_complex: {
    key: 'greenhouse_complex', name: 'Greenhouse Complex',
    description: 'Raises farmer capacity by +20. During harvest days, farmers here collect at 1.90x rate.',
    tierRequired: 7, cost: { wood: 44, stone: 36, iron: 20 }, days: 7, resourceOutput: { vegetables: 7 },
    prerequisites: [{ type: 'fertile_estates', minCount: 1 }],
  },
  hydroponic_conservatory: {
    key: 'hydroponic_conservatory', name: 'Hydroponic Conservatory',
    description: 'Raises farmer capacity by +20. During harvest days, farmers here collect at 2.05x rate — the best vegetable throughput available.',
    tierRequired: 8, cost: { wood: 52, stone: 42, iron: 24 }, days: 8, resourceOutput: { vegetables: 8 },
    prerequisites: [{ type: 'greenhouse_complex', minCount: 1 }],
  },

  // ── Quarry tiers 4-10 (matches BUILDING_TIER_MATRIX.md) ────────────────────
  reinforced_quarry: {
    key: 'reinforced_quarry', name: 'Reinforced Quarry',
    description: 'Raises the stone worker cap by +20. Passively produces +2 stone/day.',
    tierRequired: 4, cost: { wood: 32, stone: 24, iron: 12 }, days: 5, resourceOutput: { stone: 2 },
    prerequisites: [{ type: 'quarry_advanced', minCount: 1 }],
  },
  deepstone_quarry: {
    key: 'deepstone_quarry', name: 'Deepstone Quarry',
    description: 'Raises the stone worker cap by +20. Passively produces +3 stone/day.',
    tierRequired: 5, cost: { wood: 38, stone: 30, iron: 16 }, days: 6, resourceOutput: { stone: 3 },
    prerequisites: [{ type: 'reinforced_quarry', minCount: 1 }],
  },
  heavy_quarry_works: {
    key: 'heavy_quarry_works', name: 'Heavy Quarry Works',
    description: 'Raises the stone worker cap by +20. Passively produces +3 stone/day.',
    tierRequired: 6, cost: { wood: 44, stone: 36, iron: 20 }, days: 7, resourceOutput: { stone: 3 },
    prerequisites: [{ type: 'deepstone_quarry', minCount: 1 }],
  },
  industrial_quarry: {
    key: 'industrial_quarry', name: 'Industrial Quarry',
    description: 'Raises the stone worker cap by +20. Passively produces +4 stone/day.',
    tierRequired: 7, cost: { wood: 50, stone: 42, iron: 24 }, days: 8, resourceOutput: { stone: 4 },
    prerequisites: [{ type: 'heavy_quarry_works', minCount: 1 }],
  },
  grand_quarry_complex: {
    key: 'grand_quarry_complex', name: 'Grand Quarry Complex',
    description: 'Raises the stone worker cap by +20. Passively produces +4 stone/day.',
    tierRequired: 8, cost: { wood: 56, stone: 48, iron: 28 }, days: 9, resourceOutput: { stone: 4 },
    prerequisites: [{ type: 'industrial_quarry', minCount: 1 }],
  },
  earthsplit_quarry: {
    key: 'earthsplit_quarry', name: 'Earthsplit Quarry',
    description: 'Raises the stone worker cap by +20. Passively produces +5 stone/day.',
    tierRequired: 9, cost: { wood: 62, stone: 54, iron: 32 }, days: 10, resourceOutput: { stone: 5 },
    prerequisites: [{ type: 'grand_quarry_complex', minCount: 1 }],
  },
  titan_quarry: {
    key: 'titan_quarry', name: 'Titan Quarry',
    description: 'Raises the stone worker cap by +20. Passively produces +5 stone/day — the best stone throughput available.',
    tierRequired: 10, cost: { wood: 70, stone: 60, iron: 38 }, days: 11, resourceOutput: { stone: 5 },
    prerequisites: [{ type: 'earthsplit_quarry', minCount: 1 }],
  },

  // ── Mine tiers 4-10 (matches BUILDING_TIER_MATRIX.md) ──────────────────────
  reinforced_mine: {
    key: 'reinforced_mine', name: 'Reinforced Mine',
    description: 'Raises the iron/minerals worker cap by +20. Passively produces +2 minerals/day.',
    tierRequired: 4, cost: { wood: 36, stone: 30, iron: 16 }, days: 5, resourceOutput: { minerals: 2 },
    prerequisites: [{ type: 'mine_advanced', minCount: 1 }],
  },
  crystal_mine: {
    key: 'crystal_mine', name: 'Crystal Mine',
    description: 'Raises the iron/minerals worker cap by +20. Passively produces +3 minerals/day.',
    tierRequired: 5, cost: { wood: 42, stone: 36, iron: 20 }, days: 6, resourceOutput: { minerals: 3 },
    prerequisites: [{ type: 'reinforced_mine', minCount: 1 }],
  },
  industrial_mine: {
    key: 'industrial_mine', name: 'Industrial Mine',
    description: 'Raises the iron/minerals worker cap by +20. Passively produces +3 minerals/day.',
    tierRequired: 6, cost: { wood: 48, stone: 42, iron: 24 }, days: 7, resourceOutput: { minerals: 3 },
    prerequisites: [{ type: 'crystal_mine', minCount: 1 }],
  },
  great_foundry_mine: {
    key: 'great_foundry_mine', name: 'Great Foundry Mine',
    description: 'Raises the iron/minerals worker cap by +20. Passively produces +4 minerals/day.',
    tierRequired: 7, cost: { wood: 54, stone: 48, iron: 28 }, days: 8, resourceOutput: { minerals: 4 },
    prerequisites: [{ type: 'industrial_mine', minCount: 1 }],
  },
  abyssal_mine: {
    key: 'abyssal_mine', name: 'Abyssal Mine',
    description: 'Raises the iron/minerals worker cap by +20. Passively produces +4 minerals/day.',
    tierRequired: 8, cost: { wood: 60, stone: 54, iron: 32 }, days: 9, resourceOutput: { minerals: 4 },
    prerequisites: [{ type: 'great_foundry_mine', minCount: 1 }],
  },
  mythril_mine: {
    key: 'mythril_mine', name: 'Mythril Mine',
    description: 'Raises the iron/minerals worker cap by +20. Passively produces +5 minerals/day.',
    tierRequired: 9, cost: { wood: 66, stone: 60, iron: 36 }, days: 10, resourceOutput: { minerals: 5 },
    prerequisites: [{ type: 'abyssal_mine', minCount: 1 }],
  },
  primordial_core_mine: {
    key: 'primordial_core_mine', name: 'Primordial Core Mine',
    description: 'Raises the iron/minerals worker cap by +20. Passively produces +5 minerals/day — the best mineral throughput available.',
    tierRequired: 10, cost: { wood: 74, stone: 66, iron: 42 }, days: 11, resourceOutput: { minerals: 5 },
    prerequisites: [{ type: 'mythril_mine', minCount: 1 }],
  },

  // ── Research Lab tiers 4-10 (matches BUILDING_TIER_MATRIX.md) ──────────────
  applied_sciences_lab: {
    key: 'applied_sciences_lab', name: 'Applied Sciences Lab',
    description: 'Raises the research worker cap by +20. Passively generates +2 research/day.',
    tierRequired: 4, cost: { wood: 36, stone: 32, iron: 18 }, days: 5, resourceOutput: { research: 2 },
    prerequisites: [{ type: 'research_lab_advanced', minCount: 1 }],
  },
  innovation_institute: {
    key: 'innovation_institute', name: 'Innovation Institute',
    description: 'Raises the research worker cap by +20. Passively generates +3 research/day.',
    tierRequired: 5, cost: { wood: 42, stone: 38, iron: 22 }, days: 6, resourceOutput: { research: 3 },
    prerequisites: [{ type: 'applied_sciences_lab', minCount: 1 }],
  },
  arcane_research_institute: {
    key: 'arcane_research_institute', name: 'Arcane Research Institute',
    description: 'Raises the research worker cap by +20. Passively generates +3 research/day.',
    tierRequired: 6, cost: { wood: 48, stone: 44, iron: 26 }, days: 7, resourceOutput: { research: 3 },
    prerequisites: [{ type: 'innovation_institute', minCount: 1 }],
  },
  grand_academy_of_sciences: {
    key: 'grand_academy_of_sciences', name: 'Grand Academy of Sciences',
    description: 'Raises the research worker cap by +20. Passively generates +4 research/day.',
    tierRequired: 7, cost: { wood: 54, stone: 50, iron: 30 }, days: 8, resourceOutput: { research: 4 },
    prerequisites: [{ type: 'arcane_research_institute', minCount: 1 }],
  },
  experimental_nexus: {
    key: 'experimental_nexus', name: 'Experimental Nexus',
    description: 'Raises the research worker cap by +20. Passively generates +4 research/day.',
    tierRequired: 8, cost: { wood: 60, stone: 56, iron: 34 }, days: 9, resourceOutput: { research: 4 },
    prerequisites: [{ type: 'grand_academy_of_sciences', minCount: 1 }],
  },
  transcendent_research_complex: {
    key: 'transcendent_research_complex', name: 'Transcendent Research Complex',
    description: 'Raises the research worker cap by +20. Passively generates +5 research/day.',
    tierRequired: 9, cost: { wood: 66, stone: 62, iron: 38 }, days: 10, resourceOutput: { research: 5 },
    prerequisites: [{ type: 'experimental_nexus', minCount: 1 }],
  },
  omniscience_institute: {
    key: 'omniscience_institute', name: 'Omniscience Institute',
    description: 'Raises the research worker cap by +20. Passively generates +5 research/day — the best research throughput available.',
    tierRequired: 10, cost: { wood: 74, stone: 68, iron: 44 }, days: 11, resourceOutput: { research: 5 },
    prerequisites: [{ type: 'transcendent_research_complex', minCount: 1 }],
  },

  // ── Granary tiers 3-10 (matches BUILDING_TIER_MATRIX.md) ───────────────────
  reinforced_granary: {
    key: 'reinforced_granary', name: 'Reinforced Granary',
    description: 'Adds +250 storage capacity and raises the vegetable worker cap by +20.',
    tierRequired: 3, cost: { wood: 28, stone: 18 }, days: 4, resourceOutput: {},
    prerequisites: [{ type: 'granary', minCount: 1 }],
  },
  cold_cellar_granary: {
    key: 'cold_cellar_granary', name: 'Cold-Cellar Granary',
    description: 'Adds +300 storage capacity and raises the vegetable worker cap by +20.',
    tierRequired: 4, cost: { wood: 34, stone: 24, iron: 6 }, days: 5, resourceOutput: {},
    prerequisites: [{ type: 'reinforced_granary', minCount: 1 }],
  },
  regional_granary: {
    key: 'regional_granary', name: 'Regional Granary',
    description: 'Adds +350 storage capacity and raises the vegetable worker cap by +20.',
    tierRequired: 5, cost: { wood: 40, stone: 30, iron: 10 }, days: 6, resourceOutput: {},
    prerequisites: [{ type: 'cold_cellar_granary', minCount: 1 }],
  },
  central_food_reserve: {
    key: 'central_food_reserve', name: 'Central Food Reserve',
    description: 'Adds +400 storage capacity and raises the vegetable worker cap by +20.',
    tierRequired: 6, cost: { wood: 46, stone: 36, iron: 14 }, days: 7, resourceOutput: {},
    prerequisites: [{ type: 'regional_granary', minCount: 1 }],
  },
  preservation_complex: {
    key: 'preservation_complex', name: 'Preservation Complex',
    description: 'Adds +450 storage capacity and raises the vegetable worker cap by +20.',
    tierRequired: 7, cost: { wood: 52, stone: 42, iron: 18 }, days: 8, resourceOutput: {},
    prerequisites: [{ type: 'central_food_reserve', minCount: 1 }],
  },
  nutrient_reserve_hall: {
    key: 'nutrient_reserve_hall', name: 'Nutrient Reserve Hall',
    description: 'Adds +500 storage capacity and raises the vegetable worker cap by +20.',
    tierRequired: 8, cost: { wood: 58, stone: 48, iron: 22 }, days: 9, resourceOutput: {},
    prerequisites: [{ type: 'preservation_complex', minCount: 1 }],
  },
  strategic_food_vault: {
    key: 'strategic_food_vault', name: 'Strategic Food Vault',
    description: 'Adds +550 storage capacity and raises the vegetable worker cap by +20.',
    tierRequired: 9, cost: { wood: 64, stone: 54, iron: 26 }, days: 9, resourceOutput: {},
    prerequisites: [{ type: 'nutrient_reserve_hall', minCount: 1 }],
  },
  eternal_harvest_vault: {
    key: 'eternal_harvest_vault', name: 'Eternal Harvest Vault',
    description: 'Adds +600 storage capacity and raises the vegetable worker cap by +20 — the best food reserve available.',
    tierRequired: 10, cost: { wood: 70, stone: 60, iron: 30 }, days: 10, resourceOutput: {},
    prerequisites: [{ type: 'strategic_food_vault', minCount: 1 }],
  },

  // ── Lumber Mill tiers 3-7 (matches BUILDING_TIER_MATRIX.md) ────────────────
  timber_mill: {
    key: 'timber_mill', name: 'Timber Mill',
    description: 'Raises the wood worker cap by +20. Passively produces +2 wood/day.',
    tierRequired: 3, cost: { wood: 26, stone: 12 }, days: 5, resourceOutput: { wood: 2 },
    prerequisites: [{ type: 'lumber_mill', minCount: 1 }],
  },
  advanced_timber_mill: {
    key: 'advanced_timber_mill', name: 'Advanced Timber Mill',
    description: 'Raises the wood worker cap by +20. Passively produces +2 wood/day.',
    tierRequired: 4, cost: { wood: 32, stone: 18, iron: 6 }, days: 5, resourceOutput: { wood: 2 },
    prerequisites: [{ type: 'timber_mill', minCount: 1 }],
  },
  sawmill_complex: {
    key: 'sawmill_complex', name: 'Sawmill Complex',
    description: 'Raises the wood worker cap by +20. Passively produces +3 wood/day.',
    tierRequired: 5, cost: { wood: 38, stone: 24, iron: 10 }, days: 6, resourceOutput: { wood: 3 },
    prerequisites: [{ type: 'advanced_timber_mill', minCount: 1 }],
  },
  industrial_sawmill: {
    key: 'industrial_sawmill', name: 'Industrial Sawmill',
    description: 'Raises the wood worker cap by +20. Passively produces +3 wood/day.',
    tierRequired: 6, cost: { wood: 44, stone: 30, iron: 14 }, days: 7, resourceOutput: { wood: 3 },
    prerequisites: [{ type: 'sawmill_complex', minCount: 1 }],
  },
  great_lumber_works: {
    key: 'great_lumber_works', name: 'Great Lumber Works',
    description: 'Raises the wood worker cap by +20. Passively produces +4 wood/day — the best wood throughput available.',
    tierRequired: 7, cost: { wood: 50, stone: 36, iron: 18 }, days: 8, resourceOutput: { wood: 4 },
    prerequisites: [{ type: 'industrial_sawmill', minCount: 1 }],
  },

  // ── Faith Temple tiers 3-10 (matches BUILDING_TIER_MATRIX.md) ──────────────
  great_temple: {
    key: 'great_temple', name: 'Great Temple',
    description: 'Raises the faith worker cap by +20. Passively produces +1 faith/day.',
    tierRequired: 3, cost: { wood: 24, stone: 26, iron: 8 }, days: 5, resourceOutput: { faith: 1 },
    prerequisites: [{ type: 'faith_temple', minCount: 1 }],
  },
  sanctified_basilica: {
    key: 'sanctified_basilica', name: 'Sanctified Basilica',
    description: 'Raises the faith worker cap by +20. Passively produces +2 faith/day.',
    tierRequired: 4, cost: { wood: 30, stone: 32, iron: 12 }, days: 6, resourceOutput: { faith: 2 },
    prerequisites: [{ type: 'great_temple', minCount: 1 }],
  },
  pilgrim_cathedral: {
    key: 'pilgrim_cathedral', name: 'Pilgrim Cathedral',
    description: 'Raises the faith worker cap by +20. Passively produces +2 faith/day.',
    tierRequired: 5, cost: { wood: 36, stone: 38, iron: 16 }, days: 7, resourceOutput: { faith: 2 },
    prerequisites: [{ type: 'sanctified_basilica', minCount: 1 }],
  },
  divine_sanctuary: {
    key: 'divine_sanctuary', name: 'Divine Sanctuary',
    description: 'Raises the faith worker cap by +20. Passively produces +3 faith/day.',
    tierRequired: 6, cost: { wood: 42, stone: 44, iron: 20 }, days: 8, resourceOutput: { faith: 3 },
    prerequisites: [{ type: 'pilgrim_cathedral', minCount: 1 }],
  },
  celestial_cathedral: {
    key: 'celestial_cathedral', name: 'Celestial Cathedral',
    description: 'Raises the faith worker cap by +20. Passively produces +3 faith/day.',
    tierRequired: 7, cost: { wood: 48, stone: 50, iron: 24 }, days: 9, resourceOutput: { faith: 3 },
    prerequisites: [{ type: 'divine_sanctuary', minCount: 1 }],
  },
  high_sacred_citadel: {
    key: 'high_sacred_citadel', name: 'High Sacred Citadel',
    description: 'Raises the faith worker cap by +20. Passively produces +4 faith/day.',
    tierRequired: 8, cost: { wood: 54, stone: 56, iron: 28 }, days: 9, resourceOutput: { faith: 4 },
    prerequisites: [{ type: 'celestial_cathedral', minCount: 1 }],
  },
  eternal_shrine_complex: {
    key: 'eternal_shrine_complex', name: 'Eternal Shrine Complex',
    description: 'Raises the faith worker cap by +20. Passively produces +4 faith/day.',
    tierRequired: 9, cost: { wood: 60, stone: 62, iron: 32 }, days: 10, resourceOutput: { faith: 4 },
    prerequisites: [{ type: 'high_sacred_citadel', minCount: 1 }],
  },
  pantheon_spire: {
    key: 'pantheon_spire', name: 'Pantheon Spire',
    description: 'Raises the faith worker cap by +20. Passively produces +5 faith/day — the best faith throughput available.',
    tierRequired: 10, cost: { wood: 68, stone: 70, iron: 38 }, days: 11, resourceOutput: { faith: 5 },
    prerequisites: [{ type: 'eternal_shrine_complex', minCount: 1 }],
  },

  // ── Builder's Hut tiers 4-8 (matches BUILDING_TIER_MATRIX.md) ──────────────
  masons_workshop: {
    key: 'masons_workshop', name: "Mason's Workshop",
    description: "Passively adds +6 to the construction lane each day. Stacks with other Builder's Hut chain buildings.",
    tierRequired: 4, cost: { wood: 26, stone: 22, iron: 10 }, days: 4, resourceOutput: {},
    prerequisites: [{ type: 'builders_hut', minCount: 1 }],
  },
  engineers_lodge: {
    key: 'engineers_lodge', name: "Engineer's Lodge",
    description: "Passively adds +9 to the construction lane each day. Stacks with other Builder's Hut chain buildings.",
    tierRequired: 5, cost: { wood: 32, stone: 28, iron: 14 }, days: 5, resourceOutput: {},
    prerequisites: [{ type: 'masons_workshop', minCount: 1 }],
  },
  construction_guildhall: {
    key: 'construction_guildhall', name: 'Construction Guildhall',
    description: "Passively adds +12 to the construction lane each day. Stacks with other Builder's Hut chain buildings.",
    tierRequired: 6, cost: { wood: 38, stone: 34, iron: 18 }, days: 6, resourceOutput: {},
    prerequisites: [{ type: 'engineers_lodge', minCount: 1 }],
  },
  master_builder_hall: {
    key: 'master_builder_hall', name: 'Master Builder Hall',
    description: "Passively adds +15 to the construction lane each day. Stacks with other Builder's Hut chain buildings.",
    tierRequired: 7, cost: { wood: 44, stone: 40, iron: 22 }, days: 7, resourceOutput: {},
    prerequisites: [{ type: 'construction_guildhall', minCount: 1 }],
  },
  grand_architect_hall: {
    key: 'grand_architect_hall', name: 'Grand Architect Hall',
    description: "Passively adds +18 to the construction lane each day — the best building speed bonus available.",
    tierRequired: 8, cost: { wood: 50, stone: 46, iron: 26 }, days: 8, resourceOutput: {},
    prerequisites: [{ type: 'master_builder_hall', minCount: 1 }],
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
  wood_lodge: {
    researchRequired: 'tier3_housing',
    upgradedBuilding: 'reinforced_lodge',
    tier3: 'reinforced_lodge',
  },
  storage: {
    researchRequired: 'tier2_storage',
    upgradedBuilding: 'storage_shack',
    tier3: 'advanced_storage_tent',
  },
  storage_shack: {
    researchRequired: 'tier3_storage',
    upgradedBuilding: 'advanced_storage_tent',
    tier3: 'advanced_storage_tent',
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

  guard_post: { researchRequired: null, upgradedBuilding: 'guard_barracks', tier3: 'guard_barracks' },
  guard_barracks: { researchRequired: null, upgradedBuilding: 'shield_hall', tier3: 'shield_hall' },
  shield_hall: { researchRequired: null, upgradedBuilding: 'royal_guard_citadel', tier3: 'royal_guard_citadel' },

  thieves_guild: { researchRequired: null, upgradedBuilding: 'thieves_den', tier3: 'thieves_den' },
  scout_lodge: { researchRequired: null, upgradedBuilding: 'master_scout_lodge', tier3: 'master_scout_lodge' },
  spy_network: { researchRequired: null, upgradedBuilding: 'master_spy_network', tier3: 'master_spy_network' },
  assassin_den: { researchRequired: null, upgradedBuilding: 'high_assassin_den', tier3: 'high_assassin_den' },

  reinforced_lodge: { researchRequired: null, upgradedBuilding: 'stone_lodge', tier3: 'stone_lodge' },
  stone_lodge: { researchRequired: null, upgradedBuilding: 'longhouse_block', tier3: 'longhouse_block' },
  longhouse_block: { researchRequired: null, upgradedBuilding: 'manor_house', tier3: 'manor_house' },
  manor_house: { researchRequired: null, upgradedBuilding: 'townhouse_row', tier3: 'townhouse_row' },
  townhouse_row: { researchRequired: null, upgradedBuilding: 'urban_residence', tier3: 'urban_residence' },
  urban_residence: { researchRequired: null, upgradedBuilding: 'noble_residence', tier3: 'noble_residence' },
  noble_residence: { researchRequired: null, upgradedBuilding: 'royal_estate', tier3: 'royal_estate' },

  advanced_storage_tent: { researchRequired: null, upgradedBuilding: 'storehouse', tier3: 'storehouse' },
  storehouse: { researchRequired: null, upgradedBuilding: 'reinforced_storehouse', tier3: 'reinforced_storehouse' },
  reinforced_storehouse: { researchRequired: null, upgradedBuilding: 'central_storehouse', tier3: 'central_storehouse' },
  central_storehouse: { researchRequired: null, upgradedBuilding: 'storage_advanced', tier3: 'storage_advanced' },
  storage_advanced: { researchRequired: null, upgradedBuilding: 'vaulted_warehouse', tier3: 'vaulted_warehouse' },

  hunters_lodge_advanced: { researchRequired: null, upgradedBuilding: 'tracker_lodge', tier3: 'tracker_lodge' },
  tracker_lodge: { researchRequired: null, upgradedBuilding: 'ranger_hall', tier3: 'ranger_hall' },
  ranger_hall: { researchRequired: null, upgradedBuilding: 'beastmaster_hall', tier3: 'beastmaster_hall' },
  beastmaster_hall: { researchRequired: null, upgradedBuilding: 'warden_lodge', tier3: 'warden_lodge' },
  warden_lodge: { researchRequired: null, upgradedBuilding: 'great_hunters_keep', tier3: 'great_hunters_keep' },

  farm_advanced: { researchRequired: null, upgradedBuilding: 'terrace_fields', tier3: 'terrace_fields' },
  terrace_fields: { researchRequired: null, upgradedBuilding: 'orchard_farms', tier3: 'orchard_farms' },
  orchard_farms: { researchRequired: null, upgradedBuilding: 'fertile_estates', tier3: 'fertile_estates' },
  fertile_estates: { researchRequired: null, upgradedBuilding: 'greenhouse_complex', tier3: 'greenhouse_complex' },
  greenhouse_complex: { researchRequired: null, upgradedBuilding: 'hydroponic_conservatory', tier3: 'hydroponic_conservatory' },

  quarry_advanced: { researchRequired: null, upgradedBuilding: 'reinforced_quarry', tier3: 'reinforced_quarry' },
  reinforced_quarry: { researchRequired: null, upgradedBuilding: 'deepstone_quarry', tier3: 'deepstone_quarry' },
  deepstone_quarry: { researchRequired: null, upgradedBuilding: 'heavy_quarry_works', tier3: 'heavy_quarry_works' },
  heavy_quarry_works: { researchRequired: null, upgradedBuilding: 'industrial_quarry', tier3: 'industrial_quarry' },
  industrial_quarry: { researchRequired: null, upgradedBuilding: 'grand_quarry_complex', tier3: 'grand_quarry_complex' },
  grand_quarry_complex: { researchRequired: null, upgradedBuilding: 'earthsplit_quarry', tier3: 'earthsplit_quarry' },
  earthsplit_quarry: { researchRequired: null, upgradedBuilding: 'titan_quarry', tier3: 'titan_quarry' },

  mine_advanced: { researchRequired: null, upgradedBuilding: 'reinforced_mine', tier3: 'reinforced_mine' },
  reinforced_mine: { researchRequired: null, upgradedBuilding: 'crystal_mine', tier3: 'crystal_mine' },
  crystal_mine: { researchRequired: null, upgradedBuilding: 'industrial_mine', tier3: 'industrial_mine' },
  industrial_mine: { researchRequired: null, upgradedBuilding: 'great_foundry_mine', tier3: 'great_foundry_mine' },
  great_foundry_mine: { researchRequired: null, upgradedBuilding: 'abyssal_mine', tier3: 'abyssal_mine' },
  abyssal_mine: { researchRequired: null, upgradedBuilding: 'mythril_mine', tier3: 'mythril_mine' },
  mythril_mine: { researchRequired: null, upgradedBuilding: 'primordial_core_mine', tier3: 'primordial_core_mine' },

  research_lab_advanced: { researchRequired: null, upgradedBuilding: 'applied_sciences_lab', tier3: 'applied_sciences_lab' },
  applied_sciences_lab: { researchRequired: null, upgradedBuilding: 'innovation_institute', tier3: 'innovation_institute' },
  innovation_institute: { researchRequired: null, upgradedBuilding: 'arcane_research_institute', tier3: 'arcane_research_institute' },
  arcane_research_institute: { researchRequired: null, upgradedBuilding: 'grand_academy_of_sciences', tier3: 'grand_academy_of_sciences' },
  grand_academy_of_sciences: { researchRequired: null, upgradedBuilding: 'experimental_nexus', tier3: 'experimental_nexus' },
  experimental_nexus: { researchRequired: null, upgradedBuilding: 'transcendent_research_complex', tier3: 'transcendent_research_complex' },
  transcendent_research_complex: { researchRequired: null, upgradedBuilding: 'omniscience_institute', tier3: 'omniscience_institute' },

  granary: { researchRequired: null, upgradedBuilding: 'reinforced_granary', tier3: 'reinforced_granary' },
  reinforced_granary: { researchRequired: null, upgradedBuilding: 'cold_cellar_granary', tier3: 'cold_cellar_granary' },
  cold_cellar_granary: { researchRequired: null, upgradedBuilding: 'regional_granary', tier3: 'regional_granary' },
  regional_granary: { researchRequired: null, upgradedBuilding: 'central_food_reserve', tier3: 'central_food_reserve' },
  central_food_reserve: { researchRequired: null, upgradedBuilding: 'preservation_complex', tier3: 'preservation_complex' },
  preservation_complex: { researchRequired: null, upgradedBuilding: 'nutrient_reserve_hall', tier3: 'nutrient_reserve_hall' },
  nutrient_reserve_hall: { researchRequired: null, upgradedBuilding: 'strategic_food_vault', tier3: 'strategic_food_vault' },
  strategic_food_vault: { researchRequired: null, upgradedBuilding: 'eternal_harvest_vault', tier3: 'eternal_harvest_vault' },

  lumber_mill: { researchRequired: null, upgradedBuilding: 'timber_mill', tier3: 'timber_mill' },
  timber_mill: { researchRequired: null, upgradedBuilding: 'advanced_timber_mill', tier3: 'advanced_timber_mill' },
  advanced_timber_mill: { researchRequired: null, upgradedBuilding: 'sawmill_complex', tier3: 'sawmill_complex' },
  sawmill_complex: { researchRequired: null, upgradedBuilding: 'industrial_sawmill', tier3: 'industrial_sawmill' },
  industrial_sawmill: { researchRequired: null, upgradedBuilding: 'great_lumber_works', tier3: 'great_lumber_works' },

  faith_temple: { researchRequired: null, upgradedBuilding: 'great_temple', tier3: 'great_temple' },
  great_temple: { researchRequired: null, upgradedBuilding: 'sanctified_basilica', tier3: 'sanctified_basilica' },
  sanctified_basilica: { researchRequired: null, upgradedBuilding: 'pilgrim_cathedral', tier3: 'pilgrim_cathedral' },
  pilgrim_cathedral: { researchRequired: null, upgradedBuilding: 'divine_sanctuary', tier3: 'divine_sanctuary' },
  divine_sanctuary: { researchRequired: null, upgradedBuilding: 'celestial_cathedral', tier3: 'celestial_cathedral' },
  celestial_cathedral: { researchRequired: null, upgradedBuilding: 'high_sacred_citadel', tier3: 'high_sacred_citadel' },
  high_sacred_citadel: { researchRequired: null, upgradedBuilding: 'eternal_shrine_complex', tier3: 'eternal_shrine_complex' },
  eternal_shrine_complex: { researchRequired: null, upgradedBuilding: 'pantheon_spire', tier3: 'pantheon_spire' },

  builders_hut: { researchRequired: null, upgradedBuilding: 'masons_workshop', tier3: 'masons_workshop' },
  masons_workshop: { researchRequired: null, upgradedBuilding: 'engineers_lodge', tier3: 'engineers_lodge' },
  engineers_lodge: { researchRequired: null, upgradedBuilding: 'construction_guildhall', tier3: 'construction_guildhall' },
  construction_guildhall: { researchRequired: null, upgradedBuilding: 'master_builder_hall', tier3: 'master_builder_hall' },
  master_builder_hall: { researchRequired: null, upgradedBuilding: 'grand_architect_hall', tier3: 'grand_architect_hall' },
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
  'reinforced_lodge', 'stone_lodge', 'longhouse_block', 'manor_house', 'townhouse_row', 'urban_residence', 'noble_residence', 'royal_estate',
  'advanced_storage_tent', 'storehouse', 'reinforced_storehouse', 'central_storehouse', 'vaulted_warehouse',
  'tracker_lodge', 'ranger_hall', 'beastmaster_hall', 'warden_lodge', 'great_hunters_keep',
  'terrace_fields', 'orchard_farms', 'fertile_estates', 'greenhouse_complex', 'hydroponic_conservatory',
  'reinforced_quarry', 'deepstone_quarry', 'heavy_quarry_works', 'industrial_quarry', 'grand_quarry_complex', 'earthsplit_quarry', 'titan_quarry',
  'reinforced_mine', 'crystal_mine', 'industrial_mine', 'great_foundry_mine', 'abyssal_mine', 'mythril_mine', 'primordial_core_mine',
  'applied_sciences_lab', 'innovation_institute', 'arcane_research_institute', 'grand_academy_of_sciences', 'experimental_nexus', 'transcendent_research_complex', 'omniscience_institute',
  'reinforced_granary', 'cold_cellar_granary', 'regional_granary', 'central_food_reserve', 'preservation_complex', 'nutrient_reserve_hall', 'strategic_food_vault', 'eternal_harvest_vault',
  'timber_mill', 'advanced_timber_mill', 'sawmill_complex', 'industrial_sawmill', 'great_lumber_works',
  'great_temple', 'sanctified_basilica', 'pilgrim_cathedral', 'divine_sanctuary', 'celestial_cathedral', 'high_sacred_citadel', 'eternal_shrine_complex', 'pantheon_spire',
  'masons_workshop', 'engineers_lodge', 'construction_guildhall', 'master_builder_hall', 'grand_architect_hall',
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
  delete out.research;
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
  wood: ['lumber_mill', 'timber_mill', 'advanced_timber_mill', 'sawmill_complex', 'industrial_sawmill', 'great_lumber_works'],
  meat: ['hunters_guild', 'hunting_lodge', 'hunters_lodge_advanced', 'tracker_lodge', 'ranger_hall', 'beastmaster_hall', 'warden_lodge', 'great_hunters_keep'],
  vegetables: ['farm', 'irrigated_farm', 'granary', 'farm_advanced', 'terrace_fields', 'orchard_farms', 'fertile_estates', 'greenhouse_complex', 'hydroponic_conservatory', 'reinforced_granary', 'cold_cellar_granary', 'regional_granary', 'central_food_reserve', 'preservation_complex', 'nutrient_reserve_hall', 'strategic_food_vault', 'eternal_harvest_vault'],
  stone: ['quarry', 'quarry_advanced', 'reinforced_quarry', 'deepstone_quarry', 'heavy_quarry_works', 'industrial_quarry', 'grand_quarry_complex', 'earthsplit_quarry', 'titan_quarry'],
  iron: ['mine', 'mine_advanced', 'reinforced_mine', 'crystal_mine', 'industrial_mine', 'great_foundry_mine', 'abyssal_mine', 'mythril_mine', 'primordial_core_mine'],
  gold: ['trade_post', 'market_hall', 'merchant_exchange', 'grand_bazaar', 'great_market', 'trade_consortium', 'royal_exchange', 'imperial_trade_forum'],
  research: ['research_lab', 'research_lab_advanced', 'applied_sciences_lab', 'innovation_institute', 'arcane_research_institute', 'grand_academy_of_sciences', 'experimental_nexus', 'transcendent_research_complex', 'omniscience_institute'],
  faith: ['faith_temple', 'great_temple', 'sanctified_basilica', 'pilgrim_cathedral', 'divine_sanctuary', 'celestial_cathedral', 'high_sacred_citadel', 'eternal_shrine_complex', 'pantheon_spire'],
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

const STORAGE_CAPACITY_BONUS_BY_TYPE = {
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

const getStorageCapacityBonusForBuilding = (buildingType) => {
  const key = String(buildingType || '');
  return STORAGE_CAPACITY_BONUS_BY_TYPE[key] || 0;
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

const HOUSING_CAPACITY_BY_TYPE = {
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

const calculateHousingCapacityFromBuildings = (buildings) => {
  let total = 0;
  for (const building of (buildings || [])) {
    if (!building?.is_complete) continue;
    const type = String(building.building_type || '');
    total += HOUSING_CAPACITY_BY_TYPE[type] || 0;
  }
  return total;
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

const MILITIA_UNIT_TYPE = 'Militia';

// ─── Unit training lines ────────────────────────────────────────────────────
// Each line is tied to a real building upgrade chain (buildings mutate the same
// row in-place on upgrade, so at any time a fief has at most one building_type
// from a given chain marked is_complete). Training via /military/train ALWAYS
// produces the tier-1 unit of a line — you can't skip straight to a higher
// tier. Getting a higher tier requires upgrading an already-trained unit via
// /military/upgrade, which is only unlocked once the matching building tier
// has been completed, and takes its own (longer) training duration.
const MILITIA_LINE_BUILDINGS = [
  'militia_camp',
  'militia_barracks',
  'veteran_barracks',
  'elite_garrison',
  'war_garrison',
  'legion_garrison',
  'imperial_muster_hall',
];
const ARCHER_LINE_BUILDINGS = ['archer_range', 'bowyer_hall', 'master_fletcher_range', 'elite_fletching_hall', 'royal_marksman_range'];
const CAVALRY_LINE_BUILDINGS = ['stables', 'war_stables', 'royal_stables', 'elite_stables', 'royal_cavalry_stables'];
const SWORDSMEN_LINE_BUILDINGS = ['swordsmith_hall', 'blade_hall', 'champion_forge', 'veteran_bladesmith_hall', 'royal_blade_forge'];
const SPEARMEN_LINE_BUILDINGS = ['spear_drill_yard', 'pike_yard', 'formation_citadel', 'shieldwall_hall', 'phalanx_command'];
const SIEGE_LINE_BUILDINGS = ['siege_engine_workshop', 'siege_foundry', 'war_engine_forge', 'advanced_siege_workshop', 'imperial_siege_hall'];
const GUARD_LINE_BUILDINGS = ['guard_post', 'guard_barracks', 'shield_hall', 'royal_guard_citadel'];
const COVERT_LINE_BUILDINGS = ['thieves_guild', 'thieves_den'];
// Hybrid lines: each tier here is an array of building types, ALL of which must be completed to unlock it.
// These mirror unitTemplates.js's parallel branches (e.g. Horse Archer needs both an Archer Range and Stables).
const HORSE_ARCHER_LINE_BUILDINGS = [['archer_range', 'stables'], ['bowyer_hall', 'war_stables']];
const SHOCK_CAVALRY_LINE_BUILDINGS = [['spear_drill_yard', 'stables'], ['pike_yard', 'war_stables']];
const RECRUIT_LINE_BUILDINGS = ['militia_camp', 'militia_barracks'];
const TWO_HANDED_SWORD_LINE_BUILDINGS = [['militia_barracks', 'armory'], ['veteran_barracks', 'armory']];
const CROSSBOW_LINE_BUILDINGS = [['archer_range', 'workshop'], ['bowyer_hall', 'workshop']];
const LANCER_LINE_BUILDINGS = [['stables', 'armory'], ['war_stables', 'armory']];
const AXEMAN_LINE_BUILDINGS = [['shield_hall', 'blacksmith'], ['royal_guard_citadel', 'blacksmith']];
const SCOUT_LINE_BUILDINGS = [['thieves_den', 'scout_lodge'], ['thieves_den', 'master_scout_lodge']];
const SPY_LINE_BUILDINGS = [['thieves_den', 'spy_network'], ['thieves_den', 'master_spy_network']];
const ASSASSIN_LINE_BUILDINGS = [['thieves_den', 'assassin_den', 'shadow_order'], ['thieves_den', 'high_assassin_den', 'shadow_order']];
const SIEGE_APPRENTICE_LINE_BUILDINGS = ['siege_foundry'];
const BALLISTA_LINE_BUILDINGS = ['war_engine_forge', 'advanced_siege_workshop'];
const CATAPULT_LINE_BUILDINGS = ['war_engine_forge', 'advanced_siege_workshop'];
const SIEGE_TOWER_LINE_BUILDINGS = ['advanced_siege_workshop'];
const BOMBARD_LINE_BUILDINGS = [['war_engine_forge', 'foundry'], ['advanced_siege_workshop', 'foundry']];

const UNIT_LINES = {
  Militia: {
    buildingChain: MILITIA_LINE_BUILDINGS,
    tiers: [
      { unitType: 'Militia', baseDays: 10 },
    ],
  },
  Archer: {
    buildingChain: ARCHER_LINE_BUILDINGS,
    tiers: [
      { unitType: 'Skirmisher', baseDays: 5 },
      { unitType: 'Ranger', baseDays: 10 },
      { unitType: 'Archer', baseDays: 20 },
      { unitType: 'Longbowman', baseDays: 40 },
    ],
  },
  Cavalry: {
    buildingChain: CAVALRY_LINE_BUILDINGS,
    tiers: [
      { unitType: 'Squire', baseDays: 7 },
      { unitType: 'Man-at-Arms', baseDays: 14 },
      { unitType: 'Heavy Cavalry', baseDays: 28 },
      { unitType: 'Knight', baseDays: 56 },
    ],
  },
  Swordsmen: {
    buildingChain: SWORDSMEN_LINE_BUILDINGS,
    tiers: [
      { unitType: 'Swordsman', baseDays: 8 },
      { unitType: 'Veteran Swordsman', baseDays: 16 },
      { unitType: 'Blade Champion', baseDays: 32 },
      { unitType: 'Royal Blademaster', baseDays: 64 },
    ],
  },
  Spearmen: {
    buildingChain: SPEARMEN_LINE_BUILDINGS,
    tiers: [
      { unitType: 'Spearman', baseDays: 8 },
      { unitType: 'Pikeman', baseDays: 16 },
      { unitType: 'Phalanx Guard', baseDays: 32 },
      { unitType: 'Shieldwall Champion', baseDays: 64 },
    ],
  },
  Siege: {
    buildingChain: SIEGE_LINE_BUILDINGS,
    tiers: [
      { unitType: 'Siege Laborer', baseDays: 10 },
      { unitType: 'Siege Engineer', baseDays: 20 },
      { unitType: 'Siege Master', baseDays: 40 },
      { unitType: 'Grand Siegemaster', baseDays: 80 },
    ],
  },
  Guard: {
    buildingChain: GUARD_LINE_BUILDINGS,
    tiers: [
      { unitType: 'Watchman', baseDays: 4 },
      { unitType: 'Guard', baseDays: 8 },
      { unitType: 'Shield Guard', baseDays: 16 },
      { unitType: 'Royal Guard', baseDays: 32 },
    ],
  },
  Covert: {
    buildingChain: COVERT_LINE_BUILDINGS,
    tiers: [
      { unitType: 'Street Informant', baseDays: 6 },
      { unitType: 'Infiltrator', baseDays: 12 },
    ],
  },
  'Horse Archer': {
    buildingChain: HORSE_ARCHER_LINE_BUILDINGS,
    tiers: [
      { unitType: 'Mounted Archer', baseDays: 20 },
      { unitType: 'Horse Archer', baseDays: 40 },
    ],
  },
  'Shock Cavalry': {
    buildingChain: SHOCK_CAVALRY_LINE_BUILDINGS,
    tiers: [
      { unitType: 'Spearman Cavalry', baseDays: 14 },
      { unitType: 'Shock Cavalry', baseDays: 28 },
    ],
  },
  Recruit: {
    buildingChain: RECRUIT_LINE_BUILDINGS,
    tiers: [
      { unitType: 'Recruit', baseDays: 3 },
      { unitType: 'Soldier', baseDays: 6 },
    ],
  },
  'Two-Handed Swordsman': {
    buildingChain: TWO_HANDED_SWORD_LINE_BUILDINGS,
    tiers: [
      { unitType: 'Two-Handed Swordsman', baseDays: 12 },
      { unitType: 'Greatsword Master', baseDays: 24 },
    ],
  },
  Crossbowman: {
    buildingChain: CROSSBOW_LINE_BUILDINGS,
    tiers: [
      { unitType: 'Crossbowman', baseDays: 20 },
      { unitType: 'Arbalest', baseDays: 40 },
    ],
  },
  Lancer: {
    buildingChain: LANCER_LINE_BUILDINGS,
    tiers: [
      { unitType: 'Lancer', baseDays: 28 },
      { unitType: 'Royal Lancer', baseDays: 56 },
    ],
  },
  Axeman: {
    buildingChain: AXEMAN_LINE_BUILDINGS,
    tiers: [
      { unitType: 'Axeman', baseDays: 16 },
      { unitType: 'Battle Axeman', baseDays: 32 },
    ],
  },
  Scout: {
    buildingChain: SCOUT_LINE_BUILDINGS,
    tiers: [
      { unitType: 'Scout', baseDays: 24 },
      { unitType: 'Master Scout', baseDays: 48 },
    ],
  },
  Spy: {
    buildingChain: SPY_LINE_BUILDINGS,
    tiers: [
      { unitType: 'Spy', baseDays: 24 },
      { unitType: 'Master Spy', baseDays: 48 },
    ],
  },
  Assassin: {
    buildingChain: ASSASSIN_LINE_BUILDINGS,
    tiers: [
      { unitType: 'Assassin', baseDays: 24 },
      { unitType: 'Shadow Assassin', baseDays: 48 },
    ],
  },
  'Siege Apprentice': {
    buildingChain: SIEGE_APPRENTICE_LINE_BUILDINGS,
    tiers: [
      { unitType: 'Siege Apprentice', baseDays: 10 },
    ],
  },
  Ballista: {
    buildingChain: BALLISTA_LINE_BUILDINGS,
    tiers: [
      { unitType: 'Ballista Crew', baseDays: 20 },
      { unitType: 'Heavy Ballista', baseDays: 40 },
    ],
  },
  Catapult: {
    buildingChain: CATAPULT_LINE_BUILDINGS,
    tiers: [
      { unitType: 'Catapult Crew', baseDays: 20 },
      { unitType: 'Trebuchet Crew', baseDays: 40 },
    ],
  },
  'Siege Tower': {
    buildingChain: SIEGE_TOWER_LINE_BUILDINGS,
    tiers: [
      { unitType: 'Siege Tower Operator', baseDays: 40 },
    ],
  },
  Bombard: {
    buildingChain: BOMBARD_LINE_BUILDINGS,
    tiers: [
      { unitType: 'Bombard Crew', baseDays: 20 },
      { unitType: 'Grand Bombard', baseDays: 40 },
    ],
  },
};


// Reverse lookup: unitType -> { lineKey, tierIndex }
const UNIT_TYPE_LOOKUP = {};
for (const [lineKey, line] of Object.entries(UNIT_LINES)) {
  line.tiers.forEach((tierDef, tierIndex) => {
    UNIT_TYPE_LOOKUP[tierDef.unitType] = { lineKey, tierIndex };
  });
}

// A building-chain entry is normally a single building type, but some unit tiers (e.g. a
// future "Horse Archer" needing both an archer range AND a stable) require more than one
// building at once — represent those as an array of types, all of which must be completed.
const getRequiredBuildingsForTier = (buildingChain, tierIndex) => {
  const raw = buildingChain[tierIndex];
  const types = Array.isArray(raw) ? raw : [raw];
  return types.filter(Boolean);
};

const isTierBuildingRequirementMet = (buildingChain, tierIndex, completedBuildings) => {
  const types = getRequiredBuildingsForTier(buildingChain, tierIndex);
  if (types.length === 0) return false;
  return types.every((type) => (completedBuildings || []).some((b) => String(b?.building_type || '') === type));
};

// Human-readable label for whatever building(s) a tier requires, e.g. "Pike Yard" or "Pike Yard + War Stables".
const getRequiredBuildingsLabel = (buildingChain, tierIndex) => {
  const types = getRequiredBuildingsForTier(buildingChain, tierIndex);
  if (types.length === 0) return null;
  return types.map((type) => BUILDING_CATALOG[type]?.name || type).join(' + ');
};

// Highest index within a building chain that the fief currently has completed (-1 if none).
const getCompletedLineTierIndex = (buildingChain, completedBuildings) => {
  let highest = -1;
  for (let i = 0; i < buildingChain.length; i += 1) {
    if (isTierBuildingRequirementMet(buildingChain, i, completedBuildings)) highest = i;
  }
  return highest;
};

const getUnitLineInfo = (unitType) => {
  const info = UNIT_TYPE_LOOKUP[String(unitType || '')];
  if (!info) return null;
  const line = UNIT_LINES[info.lineKey];
  if (!line) return null;
  return { lineKey: info.lineKey, tierIndex: info.tierIndex, line, tierDef: line.tiers[info.tierIndex] };
};

// Full troop progression tree (all lines/tiers) annotated with this fief's building-unlock status.
// Used by the frontend "View Troop Progression" panel and the DM's flat unit-adjustment list.
const getUnitProgressionView = (completedBuildings) => {
  return Object.entries(UNIT_LINES).map(([lineKey, line]) => {
    const completedTierIndex = getCompletedLineTierIndex(line.buildingChain, completedBuildings);
    const tiers = line.tiers.map((tierDef, tierIndex) => {
      const requiredBuildings = getRequiredBuildingsForTier(line.buildingChain, tierIndex).map((type) => ({
        building_type: type,
        building_name: BUILDING_CATALOG[type]?.name || type,
        completed: (completedBuildings || []).some((b) => String(b?.building_type || '') === type),
      }));
      return {
        tier_index: tierIndex,
        unit_type: tierDef.unitType,
        base_days: tierDef.baseDays,
        required_buildings: requiredBuildings,
        unlocked: completedTierIndex >= tierIndex,
      };
    });
    return { line_key: lineKey, tiers };
  });
};

// Tier-1 unit types unlocked for direct training given a fief's completed buildings.
const getTrainableUnitTypesForFief = (completedBuildings) => {
  const out = [];
  for (const [lineKey, line] of Object.entries(UNIT_LINES)) {
    const completedTierIndex = getCompletedLineTierIndex(line.buildingChain, completedBuildings);
    if (completedTierIndex >= 0) out.push(line.tiers[0].unitType);
  }
  return out;
};

// For each unit type currently held in reserves, describe whether it can be upgraded to the next tier.
const getUpgradableEntriesForFief = (reserves, completedBuildings) => {
  const out = [];
  for (const [unitType, count] of Object.entries(reserves || {})) {
    if (Math.max(0, Number(count || 0)) <= 0) continue;
    const info = getUnitLineInfo(unitType);
    if (!info) continue;
    const nextTierIndex = info.tierIndex + 1;
    const nextTierDef = info.line.tiers[nextTierIndex];
    if (!nextTierDef) continue;
    const completedTierIndex = getCompletedLineTierIndex(info.line.buildingChain, completedBuildings);
    out.push({
      unit_type: unitType,
      next_unit_type: nextTierDef.unitType,
      next_base_days: nextTierDef.baseDays,
      required_building_type: getRequiredBuildingsLabel(info.line.buildingChain, nextTierIndex),
      unlocked: completedTierIndex >= nextTierIndex,
      available: Math.max(0, Number(count || 0)),
    });
  }
  return out;
};

const DEFENSIVE_GUARD_CAPACITY = {
  palisades: 5,
  fortified_palisades: 8,
  wooden_ramparts: 12,
  stone_walls: 16,
  reinforced_walls: 21,
  fortified_walls: 27,
  bastion_walls: 34,
  citadel_walls: 42,
  fortress_walls: 51,
  watchtower: 4,
  signal_tower: 6,
  sentinel_tower: 8,
  border_tower: 10,
  high_watch: 13,
  beacon_tower: 16,
  watch_bastion: 20,
  prison: 2,
  dungeon: 4,
  black_cells: 6,
  deep_prison: 8,
  high_security_prison: 10,
  iron_keep: 12,
  shadow_vault: 14,
};

const DEFENSIVE_GUARD_BUILDING_TYPES = new Set(Object.keys(DEFENSIVE_GUARD_CAPACITY));

const normalizeUnitReserves = (raw) => {
  const source = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  const result = {};
  for (const [key, value] of Object.entries(source)) {
    const unitType = String(key || '').trim();
    if (!unitType) continue;
    result[unitType] = Math.max(0, Math.floor(Number(value) || 0));
  }
  return result;
};

const getTotalAssignedGuards = (raw) => {
  const normalized = normalizeUnitReserves(raw);
  return Object.values(normalized).reduce((sum, value) => sum + Math.max(0, Number(value || 0)), 0);
};

const getTrainingSpeedReductionPct = (legendaryBonuses) => {
  const raw = Number((legendaryBonuses || {}).unit_training_speed_reduction_pct || 0);
  if (!Number.isFinite(raw)) return 0;
  // Negative values are intentional debuffs and slow training instead of speeding it up.
  return Math.min(90, raw);
};

const getBaseTrainingDaysForUnit = (unitType) => {
  const info = getUnitLineInfo(unitType);
  if (!info) return null;
  return Math.max(1, Math.floor(Number(info.tierDef.baseDays || 1)));
};

const getEffectiveTrainingDaysForUnit = (unitType, legendaryBonuses) => {
  const base = getBaseTrainingDaysForUnit(unitType);
  if (!base) return null;
  const reductionPct = getTrainingSpeedReductionPct(legendaryBonuses);
  const reduced = base * (1 - (reductionPct / 100));
  return Math.max(1, Math.ceil(reduced));
};

// Only tier-1 units of an unlocked line can be trained directly. Higher tiers must be reached via upgrade.
const isUnitUnlockedForFief = (unitType, completedBuildings) => {
  const info = getUnitLineInfo(unitType);
  if (!info) return false;
  if (info.tierIndex !== 0) return false;
  return getCompletedLineTierIndex(info.line.buildingChain, completedBuildings) >= 0;
};

// Determine if a reserve unit can be upgraded to its line's next tier, and what that entails.
const getUpgradeInfoForUnit = (unitType, completedBuildings) => {
  const info = getUnitLineInfo(unitType);
  if (!info) return null;
  const nextTierIndex = info.tierIndex + 1;
  const nextTierDef = info.line.tiers[nextTierIndex];
  if (!nextTierDef) return null;
  const completedTierIndex = getCompletedLineTierIndex(info.line.buildingChain, completedBuildings);
  return {
    lineKey: info.lineKey,
    nextUnitType: nextTierDef.unitType,
    nextBaseDays: nextTierDef.baseDays,
    requiredBuildingType: getRequiredBuildingsLabel(info.line.buildingChain, nextTierIndex),
    unlocked: completedTierIndex >= nextTierIndex,
  };
};

const getLegendaryBonusesForFief = async (fiefId) => {
  let legendaryBonuses = {};
  const legendaryTableCheck = await pool.query(
    `SELECT to_regclass('public.kingdom_legendary_assignments') AS assignments,
            to_regclass('public.kingdom_legendary_characters') AS characters`
  );
  const canUseLegendary = Boolean(
    legendaryTableCheck.rows[0]?.assignments &&
    legendaryTableCheck.rows[0]?.characters
  );
  if (!canUseLegendary) return legendaryBonuses;

  const legendaryRows = await pool.query(
    `SELECT lc.bonuses
     FROM kingdom_legendary_assignments la
     JOIN kingdom_legendary_characters lc ON lc.id = la.legendary_id
     WHERE la.fief_id = $1
       AND lc.is_active = true`,
    [fiefId]
  );

  for (const row of legendaryRows.rows) {
    const bonuses = (row?.bonuses && typeof row.bonuses === 'object') ? row.bonuses : {};
    for (const [key, raw] of Object.entries(bonuses)) {
      const value = Number(raw || 0);
      if (!Number.isFinite(value) || value === 0) continue;
      legendaryBonuses[key] = Number(legendaryBonuses[key] || 0) + value;
    }
  }
  return legendaryBonuses;
};

const getCampaignCurrentDay = async (campaignId) => {
  const dayResult = await pool.query(
    `SELECT COALESCE(current_day, 1) AS current_day FROM campaigns WHERE id = $1`,
    [campaignId]
  );
  return Math.max(1, Math.floor(Number(dayResult.rows[0]?.current_day || 1)));
};

const getFiefTrainingQueue = async (fiefId, currentDay) => {
  const tableResult = await pool.query(`SELECT to_regclass('public.fief_training') AS name`);
  if (!tableResult.rows[0]?.name) return [];

  const queueResult = await pool.query(
    `SELECT id,
            unit_type,
            source_unit_type,
            status,
            training_days_required,
            days_remaining,
            started_day,
            complete_day,
            created_at
     FROM fief_training
     WHERE fief_id = $1
       AND status IN ('training', 'ready')
     ORDER BY status ASC, complete_day ASC NULLS LAST, id ASC`,
    [fiefId]
  );

  return queueResult.rows.map((row) => {
    const completeDay = row.complete_day == null ? null : Math.max(0, Number(row.complete_day));
    const daysRemaining = completeDay == null
      ? Math.max(0, Number(row.days_remaining || 0))
      : Math.max(0, completeDay - currentDay);
    return {
      id: Number(row.id),
      unit_type: String(row.unit_type || ''),
      source_unit_type: row.source_unit_type ? String(row.source_unit_type) : null,
      status: String(row.status || 'training'),
      training_days_required: Math.max(0, Number(row.training_days_required || 0)),
      days_remaining: daysRemaining,
      started_day: row.started_day == null ? null : Number(row.started_day),
      complete_day: completeDay,
      created_at: row.created_at,
    };
  });
};

const buildGuardAssignmentsView = (buildings) => {
  const groups = new Map();
  for (const building of (buildings || [])) {
    if (!building?.is_complete) continue;
    const type = String(building.building_type || '');
    const cap = Number(DEFENSIVE_GUARD_CAPACITY[type] || 0);
    if (cap <= 0) continue;

    if (!groups.has(type)) {
      groups.set(type, {
        building_type: type,
        building_name: String(building.name || type),
        capacity: 0,
        assigned_by_type: {},
        building_ids: [],
      });
    }
    const group = groups.get(type);
    group.capacity += cap;
    group.building_ids.push(Number(building.id));

    const assignedByType = normalizeUnitReserves(building.assigned_guards_by_type);
    for (const [unitType, count] of Object.entries(assignedByType)) {
      group.assigned_by_type[unitType] = Math.max(0, Number(group.assigned_by_type[unitType] || 0)) + Math.max(0, Number(count || 0));
    }
  }

  return Array.from(groups.values()).map((group) => ({
    building_type: group.building_type,
    building_name: group.building_name,
    capacity: group.capacity,
    assigned_total: getTotalAssignedGuards(group.assigned_by_type),
    assigned_by_type: group.assigned_by_type,
    building_ids: group.building_ids,
  }));
};

// Removes `amount` of `unitType` from a fief: pulls from free reserves first, then — if that isn't
// enough — pulls the rest from whatever's currently assigned as guards on defensive buildings, so a
// DM "Remove" always actually removes units even when the whole stack is on garrison duty.
const removeUnitsFromReservesAndGuards = async (client, fiefId, reserves, unitType, amount) => {
  const available = Math.max(0, Number(reserves[unitType] || 0));
  const fromReserves = Math.min(available, amount);
  reserves[unitType] = available - fromReserves;
  let remaining = amount - fromReserves;
  if (remaining <= 0) return;

  const buildingsResult = await client.query(
    `SELECT id, assigned_guards_by_type
     FROM fief_buildings
     WHERE fief_id = $1 AND is_complete = true
     ORDER BY id ASC
     FOR UPDATE`,
    [fiefId]
  );
  for (const row of buildingsResult.rows) {
    if (remaining <= 0) break;
    const assignedByType = normalizeUnitReserves(row.assigned_guards_by_type);
    const rowHas = Math.max(0, Number(assignedByType[unitType] || 0));
    if (rowHas <= 0) continue;
    const take = Math.min(remaining, rowHas);
    assignedByType[unitType] = rowHas - take;
    if (assignedByType[unitType] <= 0) delete assignedByType[unitType];
    remaining -= take;
    await client.query(
      `UPDATE fief_buildings SET assigned_guards_by_type = $2::jsonb WHERE id = $1`,
      [row.id, JSON.stringify(assignedByType)]
    );
  }
  // If remaining > 0 here, fewer than `amount` of this unit existed in total (reserves + guards) — clamps to what's available.
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
  const fief = result.rows[0] || null;
  if (!fief) return null;

  // Attach co-owner player IDs so canManageFief can check them synchronously
  try {
    const coOwners = await pool.query(
      `SELECT player_id FROM kingdom_co_owners WHERE kingdom_id = $1`,
      [fief.kingdom_id]
    );
    fief.co_owner_ids = coOwners.rows.map((r) => Number(r.player_id));
  } catch (_) {
    fief.co_owner_ids = [];
  }

  return fief;
};

const canManageFief = (user, fief) => {
  if (!user || !fief) return false;
  if (user.role === 'Dungeon Master') {
    return Number(fief.dungeon_master_id) === Number(user.id);
  }
  if (Number(fief.player_id) === Number(user.id)) return true;
  if (Array.isArray(fief.co_owner_ids) && fief.co_owner_ids.includes(Number(user.id))) return true;
  return false;
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

const toPositiveInt = (value) => {
  const n = Math.floor(Number(value) || 0);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
};

const normalizeResourceDeltaMap = (source) => {
  const raw = (source && typeof source === 'object' && !Array.isArray(source)) ? source : {};
  const result = {};
  for (const [key, value] of Object.entries(raw)) {
    const normalizedKey = String(key || '').trim().toLowerCase();
    if (!normalizedKey) continue;
    if (!['wood', 'stone', 'minerals', 'food', 'gold', 'faith', 'research', 'meat', 'vegetables', 'iron'].includes(normalizedKey)) continue;
    const targetKey = normalizedKey === 'iron' ? 'minerals' : normalizedKey;
    const amount = Number(value || 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    result[targetKey] = (Number(result[targetKey] || 0) + amount);
  }
  return result;
};

const getKingdomContext = async (kingdomId) => {
  const result = await pool.query(
    `SELECT k.*, c.dungeon_master_id
     FROM kingdoms k
     JOIN campaigns c ON c.id = k.campaign_id
     WHERE k.id = $1`,
    [kingdomId]
  );
  const kingdom = result.rows[0] || null;
  if (!kingdom) return null;

  try {
    const coOwners = await pool.query(
      `SELECT player_id FROM kingdom_co_owners WHERE kingdom_id = $1`,
      [kingdomId]
    );
    kingdom.co_owner_ids = coOwners.rows.map((r) => Number(r.player_id));
  } catch (_) {
    kingdom.co_owner_ids = [];
  }

  return kingdom;
};

const canManageKingdom = (user, kingdom) => {
  if (!user || !kingdom) return false;
  if (user.role === 'Dungeon Master') {
    return Number(kingdom.dungeon_master_id) === Number(user.id);
  }
  if (Number(kingdom.player_id) === Number(user.id)) return true;
  if (Array.isArray(kingdom.co_owner_ids) && kingdom.co_owner_ids.includes(Number(user.id))) return true;
  return false;
};

const LEGENDARY_BONUS_KEYS = [
  'wood_bonus_pct',
  'stone_bonus_pct',
  'iron_bonus_pct',
  'meat_bonus_pct',
  'vegetables_bonus_pct',
  'gold_bonus_pct',
  'research_bonus_pct',
  'faith_bonus_pct',
  'building_bonus_pct',
  'population_growth_bonus_pct',
  'food_consumption_reduction_pct',
  'unit_training_speed_reduction_pct',
];

const sanitizeLegendaryBonuses = (raw) => {
  const result = {};
  const source = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  for (const key of LEGENDARY_BONUS_KEYS) {
    const value = Number(source[key] || 0);
    if (!Number.isFinite(value)) continue;
    if (value !== 0) result[key] = value;
  }
  return result;
};

const getKingdomHighestTier = async (kingdomId) => {
  const result = await pool.query(
    `SELECT COALESCE(MAX(tier), 0) AS max_tier FROM fiefs WHERE kingdom_id = $1`,
    [kingdomId]
  );
  return Math.max(0, Number(result.rows[0]?.max_tier || 0));
};

const getLegendarySlotsPerFief = (highestTier) => {
  return Math.max(0, Math.floor(Number(highestTier || 0)) - 2);
};

const TRADE_CAP_BUILDINGS = new Set([
  'trade_post',
  'market_hall',
  'merchant_exchange',
  'grand_bazaar',
  'great_market',
  'trade_consortium',
  'royal_exchange',
  'imperial_trade_forum',
]);

const getTradeDepotCapacity = async (kingdomId) => {
  const result = await pool.query(
    `SELECT COUNT(*) AS c
     FROM fief_buildings fb
     JOIN fiefs f ON f.id = fb.fief_id
     WHERE f.kingdom_id = $1
       AND fb.is_complete = true
       AND fb.building_type = ANY($2::text[])`,
    [kingdomId, Array.from(TRADE_CAP_BUILDINGS)]
  );
  const count = Math.max(0, Number(result.rows[0]?.c || 0));
  return count * 100;
};

const getOrCreateTradeDepot = async (kingdomId) => {
  await pool.query(
    `INSERT INTO kingdom_trade_depots (kingdom_id)
     VALUES ($1)
     ON CONFLICT (kingdom_id) DO NOTHING`,
    [kingdomId]
  );

  const result = await pool.query(
    `SELECT kingdom_id,
            COALESCE(resources, '{}'::jsonb) AS resources,
            COALESCE(population, 0) AS population,
            COALESCE(slaves, 0) AS slaves,
            COALESCE(desired_resource_text, '') AS desired_resource_text
     FROM kingdom_trade_depots
     WHERE kingdom_id = $1`,
    [kingdomId]
  );
  return result.rows[0];
};

const toDepotViewModel = async (depotRow, kingdomId) => {
  const resources = normalizeStoredResources(depotRow?.resources);
  const population = Math.max(0, Number(depotRow?.population || 0));
  const slaves = Math.max(0, Number(depotRow?.slaves || 0));
  const capacityMax = await getTradeDepotCapacity(kingdomId);
  const capacityUsed = Object.values(resources).reduce((sum, value) => sum + Math.max(0, Number(value || 0)), 0)
    + population
    + slaves;

  return {
    kingdom_id: Number(kingdomId),
    resources,
    population,
    slaves,
    desired_resource_text: String(depotRow?.desired_resource_text || ''),
    capacity_used: Math.max(0, Number(capacityUsed || 0)),
    capacity_max: Math.max(0, Number(capacityMax || 0)),
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

// Returns the set of all building types that satisfy a prerequisite for `baseType`:
// the base type itself plus every upgraded version of it in the chain.
const getUpgradeChainFrom = (baseType) => {
  const result = new Set();
  let current = String(baseType || '');
  while (current) {
    result.add(current);
    const next = BUILDING_UPGRADE_MAP[current]?.upgradedBuilding;
    if (!next || result.has(next)) break;
    current = next;
  }
  return result;
};

// All building types that count as "a Tier 1 building" for anyTier1Completed checks,
// including every upgraded form of each Tier 1 building line so upgrading doesn't lose the count.
const TIER1_CHAIN_BUILDING_TYPES = new Set(
  Array.from(TIER1_BUILDING_TYPES).flatMap((type) => Array.from(getUpgradeChainFrom(type)))
);

// Count how many completed buildings satisfy a prerequisite type (including higher-tier upgrades).
const countSatisfying = (requiredType, byTypeCount) => {
  const chain = getUpgradeChainFrom(requiredType);
  let total = 0;
  for (const type of chain) {
    total += byTypeCount[type] || 0;
  }
  return total;
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
      const count = completedBuildings.filter((b) => TIER1_CHAIN_BUILDING_TYPES.has(String(b.building_type || ''))).length;
      if (count < req.anyTier1Completed) return false;
      continue;
    }

    if (req.type) {
      const have = countSatisfying(req.type, byTypeCount);
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
      : Number(ownership.player_id) === Number(req.user.id) ||
        await pool.query(`SELECT 1 FROM kingdom_co_owners WHERE kingdom_id = $1 AND player_id = $2`, [kingdomId, req.user.id]).then(r => r.rows.length > 0).catch(() => false);

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

// ── Co-owner routes ──────────────────────────────────────────────────────────

router.post('/:id/co-owners', authenticateToken, async (req, res) => {
  try {
    if (!requireDM(req, res)) return;

    const kingdomId = Number(req.params.id);
    const playerId = Number(req.body.playerId);

    if (!Number.isFinite(kingdomId) || !Number.isFinite(playerId)) {
      return res.status(400).json({ error: 'Invalid kingdomId or playerId' });
    }

    // Verify kingdom exists and get campaign_id
    const kResult = await pool.query(
      `SELECT k.id, k.player_id, k.campaign_id, c.dungeon_master_id
       FROM kingdoms k
       JOIN campaigns c ON c.id = k.campaign_id
       WHERE k.id = $1`,
      [kingdomId]
    );
    const kingdom = kResult.rows[0];
    if (!kingdom) return res.status(404).json({ error: 'Kingdom not found' });
    if (Number(kingdom.dungeon_master_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Can't add the primary owner as a co-owner
    if (Number(kingdom.player_id) === playerId) {
      return res.status(400).json({ error: 'Player is already the primary owner of this kingdom' });
    }

    // Verify the player exists
    const userResult = await pool.query(`SELECT id, username FROM users WHERE id = $1`, [playerId]);
    if (!userResult.rows[0]) return res.status(404).json({ error: 'Player not found' });

    await pool.query(
      `INSERT INTO kingdom_co_owners (kingdom_id, player_id)
       VALUES ($1, $2)
       ON CONFLICT (kingdom_id, player_id) DO NOTHING`,
      [kingdomId, playerId]
    );

    if (req.io) {
      req.io.to(`campaign_${kingdom.campaign_id}`).emit('kingdomDataChanged', { campaignId: kingdom.campaign_id });
    }

    res.status(201).json({ message: 'Co-owner added', player_id: playerId, player_username: userResult.rows[0].username });
  } catch (error) {
    console.error('Error adding co-owner:', error);
    res.status(500).json({ error: 'Failed to add co-owner' });
  }
});

router.delete('/:id/co-owners/:playerId', authenticateToken, async (req, res) => {
  try {
    if (!requireDM(req, res)) return;

    const kingdomId = Number(req.params.id);
    const playerId = Number(req.params.playerId);

    if (!Number.isFinite(kingdomId) || !Number.isFinite(playerId)) {
      return res.status(400).json({ error: 'Invalid kingdomId or playerId' });
    }

    const kResult = await pool.query(
      `SELECT k.campaign_id, c.dungeon_master_id
       FROM kingdoms k
       JOIN campaigns c ON c.id = k.campaign_id
       WHERE k.id = $1`,
      [kingdomId]
    );
    const kingdom = kResult.rows[0];
    if (!kingdom) return res.status(404).json({ error: 'Kingdom not found' });
    if (Number(kingdom.dungeon_master_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await pool.query(
      `DELETE FROM kingdom_co_owners WHERE kingdom_id = $1 AND player_id = $2`,
      [kingdomId, playerId]
    );

    if (req.io) {
      req.io.to(`campaign_${kingdom.campaign_id}`).emit('kingdomDataChanged', { campaignId: kingdom.campaign_id });
    }

    res.json({ message: 'Co-owner removed', playerId });
  } catch (error) {
    console.error('Error removing co-owner:', error);
    res.status(500).json({ error: 'Failed to remove co-owner' });
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
        const prereqList = Array.isArray(entry.prerequisites) ? entry.prerequisites : [];
        const byTypeCount = {};
        for (const b of completedBuildings) {
          const t = String(b.building_type || '');
          byTypeCount[t] = (byTypeCount[t] || 0) + 1;
        }
        const missing = [];
        for (const req of prereqList) {
          if (req.anyTier1Completed) {
            const count = completedBuildings.filter((b) => TIER1_CHAIN_BUILDING_TYPES.has(String(b.building_type || ''))).length;
            if (count < req.anyTier1Completed) {
              missing.push(`${req.anyTier1Completed} Tier 1 building${req.anyTier1Completed > 1 ? 's' : ''}`);
            }
            continue;
          }
          if (req.type) {
            const have = countSatisfying(req.type, byTypeCount);
            const need = req.minCount || 1;
            if (have < need) {
              const blueprintName = BUILDING_CATALOG[req.type]?.name || req.type;
              missing.push(need > 1 ? `${need}× ${blueprintName}` : blueprintName);
            }
          }
        }
        const prereqMsg = missing.length > 0
          ? `Requires: ${missing.join(', ')}`
          : 'Building prerequisites are not met';
        return {
          ...entry,
          isLocked: true,
          lockReason: prereqMsg,
        };
      }

      const insufficientResources = [];
      for (const [resource, neededRaw] of Object.entries(entry.cost || {})) {
        const needed = Math.max(0, Number(neededRaw || 0));
        const resourceKey = resource === 'iron' ? 'minerals' : resource;
        const available = Math.max(0, Number(storedForCostChecks[resourceKey] || 0));
        if (available < needed) {
          insufficientResources.push(resource);
        }
      }
      if (insufficientResources.length > 0) {
        return {
          ...entry,
          isLocked: true,
          lockReason: `Insufficient ${insufficientResources.join(', ')}`,
        };
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
    const rawVegetableState = (fief?.vegetable_harvest_state && typeof fief.vegetable_harvest_state === 'object')
      ? fief.vegetable_harvest_state
      : { phase: 'assigning', day_in_phase: 0, locked_workers: 0, day_in_cycle: 0, accumulated_worker_days: 0 };
    const vegetablePhase = String(rawVegetableState.phase || '').toLowerCase();
    const currentVegetableWorkers = Math.max(0, Math.floor(Number((fief?.worker_assignments || {}).vegetables || 0)));
    const lockedVegetableWorkers = Math.max(0, Math.floor(Number(rawVegetableState.locked_workers || 0)));
    const effectiveVegetablePhase = (vegetablePhase && vegetablePhase !== 'assigning' && lockedVegetableWorkers <= 0)
      ? 'assigning'
      : (vegetablePhase || 'assigning');
    if (effectiveVegetablePhase === 'growing') {
      capAdjusted.nextMaxWorkers.vegetables = 0;
    }
    const housingCapacity = calculateHousingCapacityFromBuildings(completedBuildings);
    const prisonerCapacity = calculatePrisonerCapacityFromBuildings(buildingsResult.rows);
    const legendaryBonuses = await getLegendaryBonusesForFief(fiefId);
    const currentCampaignDay = await getCampaignCurrentDay(fief.campaign_id);
    const trainingQueue = await getFiefTrainingQueue(fiefId, currentCampaignDay);
    const guardAssignments = buildGuardAssignmentsView(buildingsResult.rows);
    const trainableUnitTypes = getTrainableUnitTypesForFief(completedBuildings);
    const upgradableUnits = getUpgradableEntriesForFief(normalizeUnitReserves(fief?.unit_reserves), completedBuildings);

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
        vegetable_harvest_state: {
          ...rawVegetableState,
          phase: effectiveVegetablePhase,
          ...(effectiveVegetablePhase === 'assigning' && lockedVegetableWorkers <= 0
            ? { day_in_phase: 0, day_in_cycle: 0, locked_workers: 0, accumulated_worker_days: 0 }
            : {}),
        },
        location_modifiers: (fief?.location_modifiers && typeof fief.location_modifiers === 'object')
          ? fief.location_modifiers
          : {},
        legendary_bonuses: legendaryBonuses,
        unit_reserves: normalizeUnitReserves(fief?.unit_reserves),
        training_queue: trainingQueue,
        guard_assignments: guardAssignments,
        trainable_unit_types: trainableUnitTypes,
        upgradable_units: upgradableUnits,
        unit_progression: getUnitProgressionView(completedBuildings),
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

    const normalizedInput = normalizeWorkerAssignments(assignments);
    const rawVegetableState = (owned.vegetable_harvest_state && typeof owned.vegetable_harvest_state === 'object')
      ? owned.vegetable_harvest_state
      : { phase: 'assigning', day_in_phase: 0, locked_workers: 0, day_in_cycle: 0, accumulated_worker_days: 0 };
    const vegetablePhase = String(rawVegetableState.phase || '').toLowerCase();
    const currentVegetableWorkers = Math.max(0, Math.floor(Number((owned.worker_assignments || {}).vegetables || 0)));
    const lockedVegetableWorkers = Math.max(0, Math.floor(Number(rawVegetableState.locked_workers || 0)));
    const effectiveVegetablePhase = (vegetablePhase && vegetablePhase !== 'assigning' && lockedVegetableWorkers <= 0)
      ? 'assigning'
      : (vegetablePhase || 'assigning');
    const isVegetableLaneLocked = effectiveVegetablePhase !== 'assigning';
    if (isVegetableLaneLocked) {
      const requestedVegetableWorkers = Math.max(0, Math.floor(Number(normalizedInput.vegetables || 0)));
      if (requestedVegetableWorkers !== currentVegetableWorkers) {
        return res.status(400).json({ error: 'Vegetable workers are locked for the current farming phase and cannot be changed yet' });
      }
    }

    const normalized = {};
    let totalAssigned = 0;
    for (const [resource, value] of Object.entries(normalizedInput)) {
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
  const client = await pool.connect();
  try {
    const fiefId = Number(req.params.id);
    const amount = Math.max(0, Math.floor(Number(req.body?.amount) || 0));
    const requestedUnitType = String(req.body?.unitType || MILITIA_UNIT_TYPE).trim();
    const unitType = requestedUnitType || MILITIA_UNIT_TYPE;

    if (!Number.isFinite(fiefId) || amount <= 0) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const owned = await getFiefContext(fiefId);
    if (!owned) return res.status(404).json({ error: 'Fief not found' });
    if (!canManageFief(req.user, owned)) {
      return res.status(403).json({ error: 'Not authorized to manage this fief' });
    }

    const buildingsResult = await client.query(
      `SELECT building_type, level, is_complete
       FROM fief_buildings
       WHERE fief_id = $1`,
      [fiefId]
    );
    const completedBuildings = buildingsResult.rows.filter((b) => Boolean(b.is_complete));
    if (!isUnitUnlockedForFief(unitType, completedBuildings)) {
      return res.status(400).json({ error: `${unitType} is not unlocked by this fief's completed buildings.` });
    }

    const legendaryBonuses = await getLegendaryBonusesForFief(fiefId);
    const effectiveDays = getEffectiveTrainingDaysForUnit(unitType, legendaryBonuses);
    if (!effectiveDays) {
      return res.status(400).json({ error: `Unknown or unsupported unit type: ${unitType}` });
    }

    await client.query('BEGIN');

    const lockResult = await client.query(
      `SELECT population,
              population_maturation_schedule,
              sick_injured_population,
              worker_assignments,
              unit_reserves,
              COALESCE(soldiers, 0) AS soldiers
       FROM fiefs
       WHERE id = $1
       FOR UPDATE`,
      [fiefId]
    );

    const locked = lockResult.rows[0];
    if (!locked) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Fief not found' });
    }

    const assignablePopulation = getAssignablePopulation(
      locked.population,
      locked.population_maturation_schedule,
      locked.sick_injured_population
    );
    const currentWorkers = normalizeWorkerAssignments(locked.worker_assignments);
    const assignedWorkers = Object.values(currentWorkers).reduce((sum, n) => sum + Math.max(0, Number(n) || 0), 0);
    const freeAdults = Math.max(0, assignablePopulation - assignedWorkers);

    if (amount > freeAdults) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Cannot train ${amount}. Only ${freeAdults} assignable adults are unassigned.` });
    }

    const currentDay = await getCampaignCurrentDay(owned.campaign_id);

    for (let i = 0; i < amount; i += 1) {
      await client.query(
        `INSERT INTO fief_training
           (fief_id, unit_type, source_unit_type, count, training_days_required, days_remaining, status, started_day, complete_day, resource_cost, tier)
         VALUES
           ($1, $2, NULL, 1, $3, $3, 'training', $4, $5, '{}'::jsonb, 1)`,
        [
          fiefId,
          unitType,
          effectiveDays,
          currentDay,
          currentDay + effectiveDays,
        ]
      );
    }

    await client.query(
      `UPDATE fiefs
       SET population = GREATEST(0, COALESCE(population, 0) - $2)
       WHERE id = $1`,
      [fiefId, amount]
    );

    await client.query('COMMIT');

    if (req.io) {
      req.io.to(`campaign_${owned.campaign_id}`).emit('kingdomDataChanged', { campaignId: owned.campaign_id, fiefId });
    }

    const refreshed = await getFiefContext(fiefId);
    const currentCampaignDay = await getCampaignCurrentDay(owned.campaign_id);
    const trainingQueue = await getFiefTrainingQueue(fiefId, currentCampaignDay);
    res.json({
      fief: {
        ...withPopulationBreakdown(refreshed),
        unit_reserves: normalizeUnitReserves(refreshed?.unit_reserves),
        training_queue: trainingQueue,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error training soldiers:', error);
    res.status(500).json({ error: 'Failed to train soldiers' });
  } finally {
    client.release();
  }
});

router.get('/fiefs/:id/military/training', authenticateToken, async (req, res) => {
  try {
    const fiefId = Number(req.params.id);
    if (!Number.isFinite(fiefId)) return res.status(400).json({ error: 'Invalid fief ID' });

    const owned = await getFiefContext(fiefId);
    if (!owned) return res.status(404).json({ error: 'Fief not found' });
    if (!canManageFief(req.user, owned)) return res.status(403).json({ error: 'Not authorized' });

    const currentDay = await getCampaignCurrentDay(owned.campaign_id);
    const queue = await getFiefTrainingQueue(fiefId, currentDay);
    res.json({ queue, current_day: currentDay });
  } catch (error) {
    console.error('Error fetching military training queue:', error);
    res.status(500).json({ error: 'Failed to fetch training queue' });
  }
});

router.post('/fiefs/:id/military/collect', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const fiefId = Number(req.params.id);
    if (!Number.isFinite(fiefId)) return res.status(400).json({ error: 'Invalid fief ID' });

    const owned = await getFiefContext(fiefId);
    if (!owned) return res.status(404).json({ error: 'Fief not found' });
    if (!canManageFief(req.user, owned)) return res.status(403).json({ error: 'Not authorized' });

    const currentDay = await getCampaignCurrentDay(owned.campaign_id);

    await client.query('BEGIN');

    const readyRowsResult = await client.query(
      `SELECT id, unit_type
       FROM fief_training
       WHERE fief_id = $1
         AND status IN ('training', 'ready')
         AND COALESCE(complete_day, 0) <= $2
       FOR UPDATE`,
      [fiefId, currentDay]
    );

    const readyRows = readyRowsResult.rows;
    if (readyRows.length > 0) {
      const reservesLock = await client.query(
        `SELECT unit_reserves, soldiers
         FROM fiefs
         WHERE id = $1
         FOR UPDATE`,
        [fiefId]
      );

      const currentReserves = normalizeUnitReserves(reservesLock.rows[0]?.unit_reserves);
      for (const row of readyRows) {
        const unitType = String(row.unit_type || MILITIA_UNIT_TYPE);
        currentReserves[unitType] = Math.max(0, Number(currentReserves[unitType] || 0)) + 1;
      }

      const militiaCount = Math.max(0, Number(currentReserves[MILITIA_UNIT_TYPE] || 0));

      await client.query(
        `UPDATE fiefs
         SET unit_reserves = $2::jsonb,
             soldiers = $3
         WHERE id = $1`,
        [fiefId, JSON.stringify(currentReserves), militiaCount]
      );

      await client.query(
        `UPDATE fief_training
         SET status = 'collected',
             days_remaining = 0
         WHERE id = ANY($1::int[])`,
        [readyRows.map((r) => Number(r.id))]
      );
    }

    await client.query('COMMIT');

    if (req.io) {
      req.io.to(`campaign_${owned.campaign_id}`).emit('kingdomDataChanged', { campaignId: owned.campaign_id, fiefId });
    }

    const refreshed = await getFiefContext(fiefId);
    const queue = await getFiefTrainingQueue(fiefId, currentDay);
    res.json({
      collected: readyRows.length,
      fief: {
        ...withPopulationBreakdown(refreshed),
        unit_reserves: normalizeUnitReserves(refreshed?.unit_reserves),
        training_queue: queue,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error collecting trained units:', error);
    res.status(500).json({ error: 'Failed to collect trained units' });
  } finally {
    client.release();
  }
});

router.post('/fiefs/:id/military/upgrade', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const fiefId = Number(req.params.id);
    const fromUnitType = String(req.body?.fromUnitType || req.body?.toUnitType || '').trim();
    const amount = Math.max(0, Math.floor(Number(req.body?.amount) || 0));

    if (!Number.isFinite(fiefId) || !fromUnitType || amount <= 0) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const owned = await getFiefContext(fiefId);
    if (!owned) return res.status(404).json({ error: 'Fief not found' });
    if (!canManageFief(req.user, owned)) return res.status(403).json({ error: 'Not authorized' });

    const buildingsResult = await client.query(
      `SELECT building_type, level, is_complete
       FROM fief_buildings
       WHERE fief_id = $1`,
      [fiefId]
    );
    const completedBuildings = buildingsResult.rows.filter((b) => Boolean(b.is_complete));

    const upgradeInfo = getUpgradeInfoForUnit(fromUnitType, completedBuildings);
    if (!upgradeInfo) {
      return res.status(400).json({ error: `${fromUnitType} has no further upgrade available.` });
    }
    if (!upgradeInfo.unlocked) {
      return res.status(400).json({ error: `Requires the ${upgradeInfo.requiredBuildingType} building to upgrade ${fromUnitType} into ${upgradeInfo.nextUnitType}.` });
    }

    const toUnitType = upgradeInfo.nextUnitType;
    const legendaryBonuses = await getLegendaryBonusesForFief(fiefId);
    const effectiveDays = getEffectiveTrainingDaysForUnit(toUnitType, legendaryBonuses);
    if (!effectiveDays) {
      return res.status(400).json({ error: `Unknown or unsupported unit type: ${toUnitType}` });
    }

    await client.query('BEGIN');

    const lockResult = await client.query(
      `SELECT unit_reserves
       FROM fiefs
       WHERE id = $1
       FOR UPDATE`,
      [fiefId]
    );
    const reserves = normalizeUnitReserves(lockResult.rows[0]?.unit_reserves);
    const availableSource = Math.max(0, Number(reserves[fromUnitType] || 0));
    if (amount > availableSource) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Cannot upgrade ${amount}. Only ${availableSource} ${fromUnitType} available.` });
    }

    reserves[fromUnitType] = availableSource - amount;

    const currentDay = await getCampaignCurrentDay(owned.campaign_id);
    for (let i = 0; i < amount; i += 1) {
      await client.query(
        `INSERT INTO fief_training
           (fief_id, unit_type, source_unit_type, count, training_days_required, days_remaining, status, started_day, complete_day, resource_cost, tier)
         VALUES
           ($1, $2, $3, 1, $4, $4, 'training', $5, $6, '{}'::jsonb, 1)`,
        [
          fiefId,
          toUnitType,
          fromUnitType,
          effectiveDays,
          currentDay,
          currentDay + effectiveDays,
        ]
      );
    }

    await client.query(
      `UPDATE fiefs
       SET unit_reserves = $2::jsonb,
           soldiers = $3
       WHERE id = $1`,
      [
        fiefId,
        JSON.stringify(reserves),
        Math.max(0, Number(reserves[MILITIA_UNIT_TYPE] || 0)),
      ]
    );

    await client.query('COMMIT');

    if (req.io) {
      req.io.to(`campaign_${owned.campaign_id}`).emit('kingdomDataChanged', { campaignId: owned.campaign_id, fiefId });
    }

    const refreshed = await getFiefContext(fiefId);
    const queue = await getFiefTrainingQueue(fiefId, currentDay);
    res.json({
      fief: {
        ...withPopulationBreakdown(refreshed),
        unit_reserves: normalizeUnitReserves(refreshed?.unit_reserves),
        training_queue: queue,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error upgrading militia units:', error);
    res.status(500).json({ error: 'Failed to upgrade militia units' });
  } finally {
    client.release();
  }
});

router.patch('/fiefs/:id/military/units/adjust', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    if (!requireDM(req, res)) return;

    const fiefId = Number(req.params.id);
    const unitType = String(req.body?.unitType || '').trim();
    const delta = Math.floor(Number(req.body?.delta) || 0);
    if (!Number.isFinite(fiefId) || !unitType || delta === 0) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const owned = await getFiefContext(fiefId);
    if (!owned) return res.status(404).json({ error: 'Fief not found' });
    if (!canManageFief(req.user, owned)) return res.status(403).json({ error: 'Not authorized' });

    await client.query('BEGIN');

    const lockResult = await client.query(
      `SELECT unit_reserves
       FROM fiefs
       WHERE id = $1
       FOR UPDATE`,
      [fiefId]
    );
    const reserves = normalizeUnitReserves(lockResult.rows[0]?.unit_reserves);
    if (delta > 0) {
      reserves[unitType] = Math.max(0, Number(reserves[unitType] || 0)) + delta;
    } else {
      await removeUnitsFromReservesAndGuards(client, fiefId, reserves, unitType, Math.abs(delta));
    }

    await client.query(
      `UPDATE fiefs
       SET unit_reserves = $2::jsonb,
           soldiers = $3
       WHERE id = $1`,
      [fiefId, JSON.stringify(reserves), Math.max(0, Number(reserves[MILITIA_UNIT_TYPE] || 0))]
    );

    await client.query('COMMIT');

    if (req.io) {
      req.io.to(`campaign_${owned.campaign_id}`).emit('kingdomDataChanged', { campaignId: owned.campaign_id, fiefId });
    }

    const refreshedBuildings = await pool.query(
      `SELECT * FROM fief_buildings WHERE fief_id = $1 ORDER BY id ASC`,
      [fiefId]
    );
    const refreshed = await getFiefContext(fiefId);
    res.json({
      fief: {
        ...withPopulationBreakdown(refreshed),
        unit_reserves: normalizeUnitReserves(refreshed?.unit_reserves),
        guard_assignments: buildGuardAssignmentsView(refreshedBuildings.rows),
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error adjusting unit reserves:', error);
    res.status(500).json({ error: 'Failed to adjust unit reserves' });
  } finally {
    client.release();
  }
});

router.patch('/fiefs/:id/military/units/adjust-batch', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    if (!requireDM(req, res)) return;

    const fiefId = Number(req.params.id);
    const rawAdjustments = (req.body?.adjustments && typeof req.body.adjustments === 'object') ? req.body.adjustments : {};
    const entries = Object.entries(rawAdjustments)
      .map(([unitType, delta]) => [String(unitType || '').trim(), Math.floor(Number(delta) || 0)])
      .filter(([unitType, delta]) => unitType && delta !== 0);

    if (!Number.isFinite(fiefId) || entries.length === 0) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const owned = await getFiefContext(fiefId);
    if (!owned) return res.status(404).json({ error: 'Fief not found' });
    if (!canManageFief(req.user, owned)) return res.status(403).json({ error: 'Not authorized' });

    await client.query('BEGIN');

    const lockResult = await client.query(
      `SELECT unit_reserves
       FROM fiefs
       WHERE id = $1
       FOR UPDATE`,
      [fiefId]
    );
    const reserves = normalizeUnitReserves(lockResult.rows[0]?.unit_reserves);
    for (const [unitType, delta] of entries) {
      if (delta > 0) {
        reserves[unitType] = Math.max(0, Number(reserves[unitType] || 0)) + delta;
      } else {
        await removeUnitsFromReservesAndGuards(client, fiefId, reserves, unitType, Math.abs(delta));
      }
    }

    await client.query(
      `UPDATE fiefs
       SET unit_reserves = $2::jsonb,
           soldiers = $3
       WHERE id = $1`,
      [fiefId, JSON.stringify(reserves), Math.max(0, Number(reserves[MILITIA_UNIT_TYPE] || 0))]
    );

    await client.query('COMMIT');

    if (req.io) {
      req.io.to(`campaign_${owned.campaign_id}`).emit('kingdomDataChanged', { campaignId: owned.campaign_id, fiefId });
    }

    const refreshedBuildings = await pool.query(
      `SELECT * FROM fief_buildings WHERE fief_id = $1 ORDER BY id ASC`,
      [fiefId]
    );
    const refreshed = await getFiefContext(fiefId);
    res.json({
      fief: {
        ...withPopulationBreakdown(refreshed),
        unit_reserves: normalizeUnitReserves(refreshed?.unit_reserves),
        guard_assignments: buildGuardAssignmentsView(refreshedBuildings.rows),
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error batch-adjusting unit reserves:', error);
    res.status(500).json({ error: 'Failed to adjust unit reserves' });
  } finally {
    client.release();
  }
});

router.patch('/fiefs/:id/buildings/guards', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const fiefId = Number(req.params.id);
    const buildingType = String(req.body?.buildingType || '').trim();
    const unitType = String(req.body?.unitType || '').trim();
    const delta = Math.floor(Number(req.body?.delta) || 0);

    if (!Number.isFinite(fiefId) || !buildingType || !unitType || delta === 0) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const owned = await getFiefContext(fiefId);
    if (!owned) return res.status(404).json({ error: 'Fief not found' });
    if (!canManageFief(req.user, owned)) return res.status(403).json({ error: 'Not authorized' });

    const capacityPerBuilding = Number(DEFENSIVE_GUARD_CAPACITY[buildingType] || 0);
    if (!DEFENSIVE_GUARD_BUILDING_TYPES.has(buildingType) || capacityPerBuilding <= 0) {
      return res.status(400).json({ error: 'This building type cannot receive guard assignments.' });
    }

    await client.query('BEGIN');

    const buildingsResult = await client.query(
      `SELECT id, name, building_type, is_complete, assigned_guards_by_type
       FROM fief_buildings
       WHERE fief_id = $1 AND building_type = $2 AND is_complete = true
       ORDER BY id ASC
       FOR UPDATE`,
      [fiefId, buildingType]
    );
    const rows = buildingsResult.rows;
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'No completed buildings of this type found for this fief' });
    }

    const rowStates = rows.map((row) => ({
      id: Number(row.id),
      assignedByType: normalizeUnitReserves(row.assigned_guards_by_type),
    }));
    const totalCapacity = capacityPerBuilding * rows.length;
    const totalAssigned = rowStates.reduce((sum, r) => sum + getTotalAssignedGuards(r.assignedByType), 0);

    const lockFief = await client.query(
      `SELECT unit_reserves
       FROM fiefs
       WHERE id = $1
       FOR UPDATE`,
      [fiefId]
    );
    const reserves = normalizeUnitReserves(lockFief.rows[0]?.unit_reserves);

    if (delta > 0) {
      const remainingCapacity = Math.max(0, totalCapacity - totalAssigned);
      if (delta > remainingCapacity) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Cannot assign ${delta}. Capacity ${totalCapacity}, currently assigned ${totalAssigned}.` });
      }
      const available = Math.max(0, Number(reserves[unitType] || 0));
      if (delta > available) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Cannot assign ${delta}. Only ${available} ${unitType} available in reserves.` });
      }

      let remaining = delta;
      for (const rowState of rowStates) {
        if (remaining <= 0) break;
        const rowAssignedTotal = getTotalAssignedGuards(rowState.assignedByType);
        const room = Math.max(0, capacityPerBuilding - rowAssignedTotal);
        const take = Math.min(remaining, room);
        if (take <= 0) continue;
        rowState.assignedByType[unitType] = Math.max(0, Number(rowState.assignedByType[unitType] || 0)) + take;
        remaining -= take;
        await client.query(
          `UPDATE fief_buildings SET assigned_guards_by_type = $2::jsonb WHERE id = $1`,
          [rowState.id, JSON.stringify(rowState.assignedByType)]
        );
      }

      reserves[unitType] = available - delta;
    } else {
      const removeAmount = Math.abs(delta);
      const currentAssignedOfType = rowStates.reduce((sum, r) => sum + Math.max(0, Number(r.assignedByType[unitType] || 0)), 0);
      if (removeAmount > currentAssignedOfType) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Cannot unassign ${removeAmount}. Only ${currentAssignedOfType} ${unitType} assigned.` });
      }

      let remaining = removeAmount;
      for (const rowState of rowStates) {
        if (remaining <= 0) break;
        const rowHas = Math.max(0, Number(rowState.assignedByType[unitType] || 0));
        const take = Math.min(remaining, rowHas);
        if (take <= 0) continue;
        rowState.assignedByType[unitType] = rowHas - take;
        if (rowState.assignedByType[unitType] <= 0) delete rowState.assignedByType[unitType];
        remaining -= take;
        await client.query(
          `UPDATE fief_buildings SET assigned_guards_by_type = $2::jsonb WHERE id = $1`,
          [rowState.id, JSON.stringify(rowState.assignedByType)]
        );
      }

      reserves[unitType] = Math.max(0, Number(reserves[unitType] || 0)) + removeAmount;
    }

    await client.query(
      `UPDATE fiefs
       SET unit_reserves = $2::jsonb,
           soldiers = $3
       WHERE id = $1`,
      [fiefId, JSON.stringify(reserves), Math.max(0, Number(reserves[MILITIA_UNIT_TYPE] || 0))]
    );

    await client.query('COMMIT');

    if (req.io) {
      req.io.to(`campaign_${owned.campaign_id}`).emit('kingdomDataChanged', { campaignId: owned.campaign_id, fiefId });
    }

    const refreshedBuildings = await pool.query(
      `SELECT * FROM fief_buildings WHERE fief_id = $1 ORDER BY id ASC`,
      [fiefId]
    );
    const refreshed = await getFiefContext(fiefId);
    res.json({
      fief: {
        ...withPopulationBreakdown(refreshed),
        unit_reserves: normalizeUnitReserves(refreshed?.unit_reserves),
        guard_assignments: buildGuardAssignmentsView(refreshedBuildings.rows),
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating guard assignments:', error);
    res.status(500).json({ error: 'Failed to update guard assignments' });
  } finally {
    client.release();
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

    // Verify requester owns or co-owns this kingdom
    const ownerCheck = await pool.query(
      `SELECT k.id, k.campaign_id, k.player_id FROM kingdoms k WHERE k.id = $1`,
      [kingdomId]
    );
    if (!ownerCheck.rows.length) return res.status(404).json({ error: 'Kingdom not found' });
    const kingdom = ownerCheck.rows[0];

    let isCoOwner = false;
    try {
      const coCheck = await pool.query(
        `SELECT 1 FROM kingdom_co_owners WHERE kingdom_id = $1 AND player_id = $2`,
        [kingdomId, req.user.id]
      );
      isCoOwner = coCheck.rows.length > 0;
    } catch (_) {}

    if (Number(kingdom.player_id) !== Number(req.user.id) && !isCoOwner) {
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

// ─── DM: Give Birth (immediately add one child to maturation schedule) ────────
router.post('/fiefs/:id/give-birth', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    if (!requireDM(req, res)) return;

    const fiefId = Number(req.params.id);
    if (!Number.isFinite(fiefId)) return res.status(400).json({ error: 'Invalid fief ID' });

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

    const campDayResult = await client.query(
      `SELECT COALESCE(current_day, 1) AS current_day FROM campaigns WHERE id = $1`,
      [fief.campaign_id]
    );
    const currentDay = Math.max(1, Math.floor(Number(campDayResult.rows[0]?.current_day || 1)));
    const MATURITY_DAYS = 15 * 365;
    const maturityDay = currentDay + MATURITY_DAYS;

    const nextSchedule = normalizeMaturationSchedule(fief.population_maturation_schedule);
    const key = String(maturityDay);
    nextSchedule[key] = (nextSchedule[key] || 0) + 1;

    const nextPopulation = Math.max(0, Math.floor(Number(fief.population || 0))) + 1;

    const updateResult = await client.query(
      `UPDATE fiefs
       SET population = $2,
           population_maturation_schedule = $3::jsonb
       WHERE id = $1
       RETURNING *`,
      [fiefId, nextPopulation, JSON.stringify(nextSchedule)]
    );

    await client.query('COMMIT');

    const io = req.app.get('io') || req.io;
    const userSocketMap = req.app.get('userSocketMap');

    if (io) {
      io.to(`campaign_${fief.campaign_id}`).emit('kingdomDataChanged', { campaignId: fief.campaign_id, fiefId });

      // Notify the kingdom owner with a toast
      const fiefNameResult = await pool.query(`SELECT name FROM fiefs WHERE id = $1`, [fiefId]);
      const fiefName = fiefNameResult.rows[0]?.name || null;
      const ownerSocketId = userSocketMap ? userSocketMap.get(Number(fief.player_id)) : null;
      const toastPayload = { campaignId: fief.campaign_id, type: 'birth', fiefName };
      if (ownerSocketId) {
        io.to(ownerSocketId).emit('kingdomProgressToast', toastPayload);
      } else {
        io.to(`campaign_${fief.campaign_id}`).emit('kingdomProgressToast', toastPayload);
      }
    }

    res.json({ fief: withPopulationBreakdown(updateResult.rows[0]) });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error giving birth:', error);
    res.status(500).json({ error: 'Failed to give birth' });
  } finally {
    client.release();
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

const PRAYER_DEFINITIONS = [
  {
    key: 'harvest_rite',
    name: 'Harvest Rite',
    description: 'Call for abundance, generating immediate food reserves in your target fief.',
    minTier: 3,
    baseFaithCost: 20,
    buildEffects: (highestTier) => ({
      food: 40 + (Math.max(0, highestTier - 3) * 20),
    }),
    apply: async ({ client, targetFiefId, highestTier }) => {
      const bonusFood = 40 + (Math.max(0, highestTier - 3) * 20);
      await client.query(
        `UPDATE fiefs
         SET stored_resources = COALESCE(stored_resources, '{}'::jsonb) || jsonb_build_object(
           'food', GREATEST(0, COALESCE((stored_resources->>'food')::float, 0) + $2)
         )
         WHERE id = $1`,
        [targetFiefId, bonusFood]
      );
    },
  },
  {
    key: 'founders_blessing',
    name: 'Founder\'s Blessing',
    description: 'Grant a direct population increase to a fief to accelerate growth.',
    minTier: 3,
    baseFaithCost: 30,
    buildEffects: (highestTier) => ({
      population: 1 + Math.floor(Math.max(0, highestTier - 3) / 2),
    }),
    apply: async ({ client, targetFiefId, highestTier }) => {
      const delta = 1 + Math.floor(Math.max(0, highestTier - 3) / 2);
      await client.query(
        `UPDATE fiefs
         SET population = GREATEST(0, COALESCE(population, 0) + $2)
         WHERE id = $1`,
        [targetFiefId, delta]
      );
    },
  },
  {
    key: 'artisans_favor',
    name: 'Artisan\'s Favor',
    description: 'Invoke craft and labor blessings to inject wood, stone, and minerals.',
    minTier: 4,
    baseFaithCost: 45,
    buildEffects: (highestTier) => {
      const scale = 1 + (Math.max(0, highestTier - 4) * 0.5);
      return {
        wood: Math.floor(30 * scale),
        stone: Math.floor(20 * scale),
        minerals: Math.floor(10 * scale),
      };
    },
    apply: async ({ client, targetFiefId, highestTier }) => {
      const scale = 1 + (Math.max(0, highestTier - 4) * 0.5);
      const wood = Math.floor(30 * scale);
      const stone = Math.floor(20 * scale);
      const minerals = Math.floor(10 * scale);
      await client.query(
        `UPDATE fiefs
         SET stored_resources = COALESCE(stored_resources, '{}'::jsonb)
           || jsonb_build_object(
             'wood', GREATEST(0, COALESCE((stored_resources->>'wood')::float, 0) + $2),
             'stone', GREATEST(0, COALESCE((stored_resources->>'stone')::float, 0) + $3),
             'minerals', GREATEST(0, COALESCE((stored_resources->>'minerals')::float, 0) + $4)
           )
         WHERE id = $1`,
        [targetFiefId, wood, stone, minerals]
      );
    },
  },
  {
    key: 'miners_hymn',
    name: 'Miner\'s Hymn',
    description: 'Bless quarries and mines, yielding a surge of minerals and gold.',
    minTier: 4,
    baseFaithCost: 50,
    buildEffects: (highestTier) => {
      const scale = 1 + (Math.max(0, highestTier - 4) * 0.5);
      return {
        minerals: Math.floor(35 * scale),
        gold: Math.floor(16 * scale),
      };
    },
    apply: async ({ client, targetFiefId, highestTier }) => {
      const scale = 1 + (Math.max(0, highestTier - 4) * 0.5);
      const minerals = Math.floor(35 * scale);
      const gold = Math.floor(16 * scale);
      await client.query(
        `UPDATE fiefs
         SET stored_resources = COALESCE(stored_resources, '{}'::jsonb)
           || jsonb_build_object(
             'minerals', GREATEST(0, COALESCE((stored_resources->>'minerals')::float, 0) + $2),
             'gold', GREATEST(0, COALESCE((stored_resources->>'gold')::float, 0) + $3)
           )
         WHERE id = $1`,
        [targetFiefId, minerals, gold]
      );
    },
  },
  {
    key: 'scholar_communion',
    name: 'Scholar Communion',
    description: 'Guide sages in their studies, granting immediate research progress reserves.',
    minTier: 4,
    baseFaithCost: 42,
    buildEffects: (highestTier) => ({
      research: 16 + (Math.max(0, highestTier - 4) * 8),
    }),
    apply: async ({ client, targetFiefId, highestTier }) => {
      const research = 16 + (Math.max(0, highestTier - 4) * 8);
      await client.query(
        `UPDATE fiefs
         SET stored_resources = COALESCE(stored_resources, '{}'::jsonb)
           || jsonb_build_object(
             'research', GREATEST(0, COALESCE((stored_resources->>'research')::float, 0) + $2)
           )
         WHERE id = $1`,
        [targetFiefId, research]
      );
    },
  },
  {
    key: 'restoration_litany',
    name: 'Restoration Litany',
    description: 'Heals the sick and injured, returning laborers to the active population pool.',
    minTier: 3,
    baseFaithCost: 34,
    buildEffects: (highestTier) => ({
      sick_injured_recovered: 2 + Math.max(0, highestTier - 3),
    }),
    apply: async ({ client, targetFiefId, highestTier }) => {
      const recover = 2 + Math.max(0, highestTier - 3);
      await client.query(
        `UPDATE fiefs
         SET sick_injured_population = GREATEST(0, COALESCE(sick_injured_population, 0) - $2)
         WHERE id = $1`,
        [targetFiefId, recover]
      );
    },
  },
  {
    key: 'mustering_anthem',
    name: 'Mustering Anthem',
    description: 'Rally and train civilians into armed defenders instantly.',
    minTier: 4,
    baseFaithCost: 48,
    buildEffects: (highestTier) => ({
      soldiers: 2 + Math.floor(Math.max(0, highestTier - 4) * 1.5),
    }),
    apply: async ({ client, targetFiefId, highestTier }) => {
      const recruit = 2 + Math.floor(Math.max(0, highestTier - 4) * 1.5);
      await client.query(
        `UPDATE fiefs
         SET population = GREATEST(0, COALESCE(population, 0) - LEAST(COALESCE(population, 0), $2)),
             soldiers = GREATEST(0, COALESCE(soldiers, 0) + LEAST(COALESCE(population, 0), $2))
         WHERE id = $1`,
        [targetFiefId, recruit]
      );
    },
  },
  {
    key: 'chains_to_ploughshares',
    name: 'Chains to Ploughshares',
    description: 'Converts captured prisoners into willing settlers for the target fief.',
    minTier: 4,
    baseFaithCost: 40,
    buildEffects: (highestTier) => ({
      prisoners_converted_to_population: 2 + Math.floor(Math.max(0, highestTier - 4) * 1.5),
    }),
    apply: async ({ client, targetFiefId, highestTier }) => {
      const convert = 2 + Math.floor(Math.max(0, highestTier - 4) * 1.5);
      await client.query(
        `UPDATE fiefs
         SET prisoners = GREATEST(0, COALESCE(prisoners, 0) - LEAST(COALESCE(prisoners, 0), $2)),
             population = GREATEST(0, COALESCE(population, 0) + LEAST(COALESCE(prisoners, 0), $2))
         WHERE id = $1`,
        [targetFiefId, convert]
      );
    },
  },
  {
    key: 'edict_of_emancipation',
    name: 'Edict of Emancipation',
    description: 'Frees a portion of slave labor into citizen population.',
    minTier: 5,
    baseFaithCost: 60,
    buildEffects: (highestTier) => ({
      slaves_freed_to_population: 3 + Math.floor(Math.max(0, highestTier - 5) * 2),
    }),
    apply: async ({ client, targetFiefId, highestTier }) => {
      const free = 3 + Math.floor(Math.max(0, highestTier - 5) * 2);
      await client.query(
        `UPDATE fiefs
         SET slaves = GREATEST(0, COALESCE(slaves, 0) - LEAST(COALESCE(slaves, 0), $2)),
             population = GREATEST(0, COALESCE(population, 0) + LEAST(COALESCE(slaves, 0), $2))
         WHERE id = $1`,
        [targetFiefId, free]
      );
    },
  },
  {
    key: 'tithe_of_plenty',
    name: 'Tithe of Plenty',
    description: 'A broad blessing that grants food, faith, and a modest gold windfall.',
    minTier: 5,
    baseFaithCost: 66,
    buildEffects: (highestTier) => {
      const scale = 1 + (Math.max(0, highestTier - 5) * 0.4);
      return {
        food: Math.floor(60 * scale),
        faith: Math.floor(14 * scale),
        gold: Math.floor(14 * scale),
      };
    },
    apply: async ({ client, targetFiefId, highestTier }) => {
      const scale = 1 + (Math.max(0, highestTier - 5) * 0.4);
      const food = Math.floor(60 * scale);
      const faith = Math.floor(14 * scale);
      const gold = Math.floor(14 * scale);
      await client.query(
        `UPDATE fiefs
         SET stored_resources = COALESCE(stored_resources, '{}'::jsonb)
           || jsonb_build_object(
             'food', GREATEST(0, COALESCE((stored_resources->>'food')::float, 0) + $2),
             'faith', GREATEST(0, COALESCE((stored_resources->>'faith')::float, 0) + $3),
             'gold', GREATEST(0, COALESCE((stored_resources->>'gold')::float, 0) + $4)
           )
         WHERE id = $1`,
        [targetFiefId, food, faith, gold]
      );
    },
  },
  {
    key: 'imperial_levy',
    name: 'Imperial Levy',
    description: 'Sanctions emergency extraction from subjects to rapidly fill the treasury.',
    minTier: 6,
    baseFaithCost: 72,
    buildEffects: (highestTier) => ({
      gold: 80 + (Math.max(0, highestTier - 6) * 25),
      population: -1,
    }),
    apply: async ({ client, targetFiefId, highestTier }) => {
      const gold = 80 + (Math.max(0, highestTier - 6) * 25);
      await client.query(
        `UPDATE fiefs
         SET stored_resources = COALESCE(stored_resources, '{}'::jsonb)
           || jsonb_build_object(
             'gold', GREATEST(0, COALESCE((stored_resources->>'gold')::float, 0) + $2)
           ),
             population = GREATEST(0, COALESCE(population, 0) - 1)
         WHERE id = $1`,
        [targetFiefId, gold]
      );
    },
  },
  {
    key: 'grace_of_the_hearth',
    name: 'Grace of the Hearth',
    description: 'Stimulates household growth with food stores and faster family expansion.',
    minTier: 5,
    baseFaithCost: 58,
    buildEffects: (highestTier) => ({
      food: 36 + (Math.max(0, highestTier - 5) * 14),
      population: 1 + Math.floor(Math.max(0, highestTier - 5) / 2),
    }),
    apply: async ({ client, targetFiefId, highestTier }) => {
      const food = 36 + (Math.max(0, highestTier - 5) * 14);
      const population = 1 + Math.floor(Math.max(0, highestTier - 5) / 2);
      await client.query(
        `UPDATE fiefs
         SET stored_resources = COALESCE(stored_resources, '{}'::jsonb)
           || jsonb_build_object(
             'food', GREATEST(0, COALESCE((stored_resources->>'food')::float, 0) + $2)
           ),
             population = GREATEST(0, COALESCE(population, 0) + $3)
         WHERE id = $1`,
        [targetFiefId, food, population]
      );
    },
  },
];

const buildPrayerPresentation = (highestTier) => {
  const tier = Math.max(0, Number(highestTier || 0));
  return PRAYER_DEFINITIONS
    .filter((p) => tier >= p.minTier)
    .map((p) => {
      const scaleFactor = 1 + (Math.max(0, tier - p.minTier) * 0.2);
      return {
        key: p.key,
        name: p.name,
        description: p.description,
        minTier: p.minTier,
        faithCost: Math.ceil(p.baseFaithCost * scaleFactor),
        effects: p.buildEffects(tier),
      };
    });
};

const sumKingdomPooledFaith = async (kingdomId) => {
  const result = await pool.query(
    `SELECT COALESCE((stored_resources->>'faith')::float, 0) AS faith
     FROM fiefs
     WHERE kingdom_id = $1
     ORDER BY COALESCE((stored_resources->>'faith')::float, 0) DESC, id ASC`,
    [kingdomId]
  );
  return result.rows.reduce((sum, row) => sum + Math.max(0, Number(row.faith || 0)), 0);
};

const spendKingdomFaith = async (client, kingdomId, amount) => {
  let remaining = Math.max(0, Number(amount || 0));
  if (remaining <= 0) return;

  const result = await client.query(
    `SELECT id, COALESCE(stored_resources, '{}'::jsonb) AS stored_resources,
            COALESCE((stored_resources->>'faith')::float, 0) AS faith
     FROM fiefs
     WHERE kingdom_id = $1
     ORDER BY COALESCE((stored_resources->>'faith')::float, 0) DESC, id ASC
     FOR UPDATE`,
    [kingdomId]
  );

  for (const row of result.rows) {
    if (remaining <= 0) break;
    const currentFaith = Math.max(0, Number(row.faith || 0));
    if (currentFaith <= 0) continue;
    const spend = Math.min(currentFaith, remaining);
    remaining -= spend;
    await client.query(
      `UPDATE fiefs
       SET stored_resources = COALESCE(stored_resources, '{}'::jsonb)
         || jsonb_build_object('faith', GREATEST(0, COALESCE((stored_resources->>'faith')::float, 0) - $2))
       WHERE id = $1`,
      [Number(row.id), spend]
    );
  }

  if (remaining > 0) {
    throw new Error('Not enough pooled faith');
  }
};

const getKingdomPrimaryFiefId = async (kingdomId) => {
  const result = await pool.query(
    `SELECT id
     FROM fiefs
     WHERE kingdom_id = $1
     ORDER BY is_capital DESC, id ASC
     LIMIT 1`,
    [kingdomId]
  );
  return result.rows[0] ? Number(result.rows[0].id) : null;
};

const ensureTargetFiefInKingdom = async (kingdomId, fiefId) => {
  if (!Number.isFinite(Number(fiefId))) return null;
  const result = await pool.query(
    `SELECT id FROM fiefs WHERE id = $1 AND kingdom_id = $2 LIMIT 1`,
    [Number(fiefId), Number(kingdomId)]
  );
  return result.rows[0] ? Number(result.rows[0].id) : null;
};

router.get('/:id/legendary-characters', authenticateToken, async (req, res) => {
  try {
    const kingdomId = Number(req.params.id);
    if (!Number.isFinite(kingdomId)) return res.status(400).json({ error: 'Invalid kingdom ID' });

    const kingdom = await getKingdomContext(kingdomId);
    if (!kingdom) return res.status(404).json({ error: 'Kingdom not found' });
    if (!canManageKingdom(req.user, kingdom)) return res.status(403).json({ error: 'Not authorized' });

    const highestTier = await getKingdomHighestTier(kingdomId);
    const slotsPerFief = getLegendarySlotsPerFief(highestTier);

    const result = await pool.query(
      `SELECT lc.*,
              la.fief_id AS assigned_fief_id,
              la.assigned_at AS assigned_at
       FROM kingdom_legendary_characters lc
       LEFT JOIN kingdom_legendary_assignments la ON la.legendary_id = lc.id
       WHERE lc.kingdom_id = $1
       ORDER BY lc.created_at ASC`,
      [kingdomId]
    );

    const characters = result.rows.map((row) => ({
      ...row,
      bonuses: (row.bonuses && typeof row.bonuses === 'object') ? row.bonuses : {},
      assigned_fief_id: row.assigned_fief_id == null ? null : Number(row.assigned_fief_id),
    }));

    res.json({ characters, slotsPerFief, highestTier });
  } catch (error) {
    console.error('Error loading legendary characters:', error);
    res.status(500).json({ error: 'Failed to load legendary characters' });
  }
});

router.post('/:id/legendary-characters', authenticateToken, async (req, res) => {
  try {
    if (!requireDM(req, res)) return;

    const kingdomId = Number(req.params.id);
    const name = String(req.body?.name || '').trim();
    const description = String(req.body?.description || '').trim();
    const bonuses = sanitizeLegendaryBonuses(req.body?.bonuses);

    if (!Number.isFinite(kingdomId) || !name) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const kingdom = await getKingdomContext(kingdomId);
    if (!kingdom) return res.status(404).json({ error: 'Kingdom not found' });
    if (Number(kingdom.dungeon_master_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const result = await pool.query(
      `INSERT INTO kingdom_legendary_characters (kingdom_id, name, description, bonuses, created_by)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       RETURNING *`,
      [kingdomId, name, description, JSON.stringify(bonuses), req.user.id]
    );

    if (req.io) {
      req.io.to(`campaign_${kingdom.campaign_id}`).emit('kingdomDataChanged', { campaignId: kingdom.campaign_id, kingdomId });
    }

    res.status(201).json({ character: result.rows[0] });
  } catch (error) {
    console.error('Error creating legendary character:', error);
    res.status(500).json({ error: 'Failed to create legendary character' });
  }
});

router.post('/fiefs/:id/legendary-assignments', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const fiefId = Number(req.params.id);
    const legendaryId = Number(req.body?.legendaryId);
    if (!Number.isFinite(fiefId) || !Number.isFinite(legendaryId)) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    await client.query('BEGIN');

    const fiefResult = await client.query(
      `SELECT f.id, f.kingdom_id, k.campaign_id, k.player_id, c.dungeon_master_id
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

    const kingdom = await getKingdomContext(Number(fief.kingdom_id));
    if (!canManageKingdom(req.user, kingdom)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not authorized' });
    }

    const legendaryResult = await client.query(
      `SELECT id, kingdom_id
       FROM kingdom_legendary_characters
       WHERE id = $1 AND is_active = true
       FOR UPDATE`,
      [legendaryId]
    );
    const legendary = legendaryResult.rows[0];
    if (!legendary) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Legendary character not found' });
    }
    if (Number(legendary.kingdom_id) !== Number(fief.kingdom_id)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Legendary character belongs to a different kingdom' });
    }

    const highestTier = await getKingdomHighestTier(Number(fief.kingdom_id));
    const slotsPerFief = getLegendarySlotsPerFief(highestTier);
    if (slotsPerFief <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Kingdom has no legendary slots yet' });
    }

    const existingAssignment = await client.query(
      `SELECT fief_id
       FROM kingdom_legendary_assignments
       WHERE legendary_id = $1
       LIMIT 1`,
      [legendaryId]
    );
    const currentlyAssignedFiefId = Number(existingAssignment.rows[0]?.fief_id || 0);
    if (currentlyAssignedFiefId === Number(fiefId)) {
      await client.query(
        `UPDATE kingdom_legendary_assignments
         SET assigned_by = $2,
             assigned_at = NOW()
         WHERE legendary_id = $1`,
        [legendaryId, req.user.id]
      );
      await client.query('COMMIT');

      if (req.io) {
        req.io.to(`campaign_${fief.campaign_id}`).emit('kingdomDataChanged', { campaignId: fief.campaign_id, fiefId });
      }

      return res.json({ message: 'Legendary character assignment refreshed' });
    }

    const slotCount = await client.query(
      `SELECT COUNT(*) AS c
       FROM kingdom_legendary_assignments
       WHERE fief_id = $1`,
      [fiefId]
    );
    const currentSlots = Number(slotCount.rows[0]?.c || 0);
    if (currentSlots >= slotsPerFief) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Fief has reached its legendary slot cap (${slotsPerFief})` });
    }

    await client.query(
      `INSERT INTO kingdom_legendary_assignments (legendary_id, fief_id, assigned_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (legendary_id)
       DO UPDATE SET fief_id = EXCLUDED.fief_id,
                     assigned_by = EXCLUDED.assigned_by,
                     assigned_at = NOW()`,
      [legendaryId, fiefId, req.user.id]
    );

    await client.query('COMMIT');

    if (req.io) {
      req.io.to(`campaign_${fief.campaign_id}`).emit('kingdomDataChanged', { campaignId: fief.campaign_id, fiefId });
    }

    res.json({ message: 'Legendary character assigned' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error assigning legendary character:', error);
    res.status(500).json({ error: 'Failed to assign legendary character' });
  } finally {
    client.release();
  }
});

router.delete('/fiefs/:id/legendary-assignments/:legendaryId', authenticateToken, async (req, res) => {
  try {
    const fiefId = Number(req.params.id);
    const legendaryId = Number(req.params.legendaryId);
    if (!Number.isFinite(fiefId) || !Number.isFinite(legendaryId)) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const fiefResult = await pool.query(
      `SELECT f.id, f.kingdom_id, k.campaign_id, k.player_id, c.dungeon_master_id
       FROM fiefs f
       JOIN kingdoms k ON k.id = f.kingdom_id
       JOIN campaigns c ON c.id = k.campaign_id
       WHERE f.id = $1`,
      [fiefId]
    );
    const fief = fiefResult.rows[0];
    if (!fief) return res.status(404).json({ error: 'Fief not found' });

    const kingdom = await getKingdomContext(Number(fief.kingdom_id));
    if (!canManageKingdom(req.user, kingdom)) return res.status(403).json({ error: 'Not authorized' });

    await pool.query(
      `DELETE FROM kingdom_legendary_assignments
       WHERE fief_id = $1 AND legendary_id = $2`,
      [fiefId, legendaryId]
    );

    if (req.io) {
      req.io.to(`campaign_${fief.campaign_id}`).emit('kingdomDataChanged', { campaignId: fief.campaign_id, fiefId });
    }

    res.json({ message: 'Legendary character unassigned' });
  } catch (error) {
    console.error('Error unassigning legendary character:', error);
    res.status(500).json({ error: 'Failed to unassign legendary character' });
  }
});

router.get('/:id/prayers', authenticateToken, async (req, res) => {
  try {
    const kingdomId = Number(req.params.id);
    if (!Number.isFinite(kingdomId)) return res.status(400).json({ error: 'Invalid kingdom ID' });

    const kingdom = await getKingdomContext(kingdomId);
    if (!kingdom) return res.status(404).json({ error: 'Kingdom not found' });
    if (!canManageKingdom(req.user, kingdom)) return res.status(403).json({ error: 'Not authorized' });

    const highestTier = await getKingdomHighestTier(kingdomId);
    const pooledFaith = await sumKingdomPooledFaith(kingdomId);
    const prayers = buildPrayerPresentation(highestTier);
    res.json({ prayers, pooledFaith, highestTier });
  } catch (error) {
    console.error('Error loading prayers:', error);
    res.status(500).json({ error: 'Failed to load prayers' });
  }
});

router.post('/:id/prayers/:prayerKey/cast', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const kingdomId = Number(req.params.id);
    const prayerKey = String(req.params.prayerKey || '').trim();
    if (!Number.isFinite(kingdomId) || !prayerKey) return res.status(400).json({ error: 'Invalid payload' });

    const kingdom = await getKingdomContext(kingdomId);
    if (!kingdom) return res.status(404).json({ error: 'Kingdom not found' });
    if (!canManageKingdom(req.user, kingdom)) return res.status(403).json({ error: 'Not authorized' });

    const highestTier = await getKingdomHighestTier(kingdomId);
    const prayers = buildPrayerPresentation(highestTier);
    const prayer = prayers.find((p) => p.key === prayerKey);
    if (!prayer) return res.status(400).json({ error: 'Prayer not available at current tier' });

    const basePrayer = PRAYER_DEFINITIONS.find((p) => p.key === prayer.key);
    if (!basePrayer) return res.status(400).json({ error: 'Unknown prayer' });

    const pooledFaith = await sumKingdomPooledFaith(kingdomId);
    if (pooledFaith < prayer.faithCost) {
      return res.status(400).json({ error: `Not enough pooled faith (${pooledFaith.toFixed(1)} / ${prayer.faithCost})` });
    }

    const requestedTarget = req.body?.targetFiefId == null ? null : Number(req.body.targetFiefId);
    let targetFiefId = await ensureTargetFiefInKingdom(kingdomId, requestedTarget);
    if (!targetFiefId) {
      targetFiefId = await getKingdomPrimaryFiefId(kingdomId);
    }
    if (!targetFiefId) return res.status(400).json({ error: 'No target fief available for prayer effect' });

    await client.query('BEGIN');
    await spendKingdomFaith(client, kingdomId, prayer.faithCost);
    await basePrayer.apply({ client, targetFiefId, highestTier });

    await client.query(
      `INSERT INTO kingdom_prayer_casts (kingdom_id, prayer_key, cast_by, target_fief_id, faith_spent, payload)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [kingdomId, prayerKey, req.user.id, targetFiefId, prayer.faithCost, JSON.stringify(prayer.effects || {})]
    );

    await client.query('COMMIT');

    const remainingFaith = await sumKingdomPooledFaith(kingdomId);
    if (req.io) {
      req.io.to(`campaign_${kingdom.campaign_id}`).emit('kingdomDataChanged', { campaignId: kingdom.campaign_id, kingdomId });
    }

    res.json({ message: `${prayer.name} cast successfully`, pooledFaith: remainingFaith });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error casting prayer:', error);
    res.status(500).json({ error: error.message || 'Failed to cast prayer' });
  } finally {
    client.release();
  }
});

router.get('/:id/trade-depot', authenticateToken, async (req, res) => {
  try {
    const kingdomId = Number(req.params.id);
    if (!Number.isFinite(kingdomId)) return res.status(400).json({ error: 'Invalid kingdom ID' });

    const kingdom = await getKingdomContext(kingdomId);
    if (!kingdom) return res.status(404).json({ error: 'Kingdom not found' });
    if (!canManageKingdom(req.user, kingdom)) return res.status(403).json({ error: 'Not authorized' });

    const depot = await getOrCreateTradeDepot(kingdomId);
    res.json({ depot: await toDepotViewModel(depot, kingdomId) });
  } catch (error) {
    console.error('Error loading trade depot:', error);
    res.status(500).json({ error: 'Failed to load trade depot' });
  }
});

router.patch('/:id/trade-depot/desired', authenticateToken, async (req, res) => {
  try {
    const kingdomId = Number(req.params.id);
    const desiredText = String(req.body?.desiredText || '').trim();
    if (!Number.isFinite(kingdomId)) return res.status(400).json({ error: 'Invalid kingdom ID' });

    const kingdom = await getKingdomContext(kingdomId);
    if (!kingdom) return res.status(404).json({ error: 'Kingdom not found' });
    if (!canManageKingdom(req.user, kingdom)) return res.status(403).json({ error: 'Not authorized' });

    await pool.query(
      `INSERT INTO kingdom_trade_depots (kingdom_id, desired_resource_text)
       VALUES ($1, $2)
       ON CONFLICT (kingdom_id)
       DO UPDATE SET desired_resource_text = EXCLUDED.desired_resource_text,
                     updated_at = NOW()`,
      [kingdomId, desiredText]
    );

    const depot = await getOrCreateTradeDepot(kingdomId);
    if (req.io) {
      req.io.to(`campaign_${kingdom.campaign_id}`).emit('kingdomDataChanged', { campaignId: kingdom.campaign_id, kingdomId });
    }
    res.json({ depot: await toDepotViewModel(depot, kingdomId) });
  } catch (error) {
    console.error('Error updating desired resource text:', error);
    res.status(500).json({ error: 'Failed to update desired resource text' });
  }
});

router.post('/:id/trade-depot/deposit', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const kingdomId = Number(req.params.id);
    const fiefId = Number(req.body?.fiefId);
    const resources = normalizeResourceDeltaMap(req.body?.resources);
    const population = toPositiveInt(req.body?.population);
    const slaves = toPositiveInt(req.body?.slaves);
    const totalDelta = Object.values(resources).reduce((sum, v) => sum + Number(v || 0), 0) + population + slaves;

    if (!Number.isFinite(kingdomId) || !Number.isFinite(fiefId) || totalDelta <= 0) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const kingdom = await getKingdomContext(kingdomId);
    if (!kingdom) return res.status(404).json({ error: 'Kingdom not found' });
    if (!canManageKingdom(req.user, kingdom)) return res.status(403).json({ error: 'Not authorized' });

    await client.query('BEGIN');

    const fiefResult = await client.query(
      `SELECT id,
              kingdom_id,
              population,
              slaves,
              COALESCE(stored_resources, '{}'::jsonb) AS stored_resources,
              COALESCE(worker_assignments, '{}'::jsonb) AS worker_assignments,
              COALESCE(slave_worker_assignments, '{}'::jsonb) AS slave_worker_assignments,
              COALESCE(max_workers_per_resource, '{}'::jsonb) AS max_workers_per_resource,
              COALESCE(population_maturation_schedule, '{}'::jsonb) AS population_maturation_schedule,
              COALESCE(sick_injured_population, 0) AS sick_injured_population
       FROM fiefs
       WHERE id = $1
       FOR UPDATE`,
      [fiefId]
    );
    const fief = fiefResult.rows[0];
    if (!fief || Number(fief.kingdom_id) !== kingdomId) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Fief not found in kingdom' });
    }

    const currentResources = normalizeStoredResources(fief.stored_resources);
    for (const [key, value] of Object.entries(resources)) {
      const available = Math.max(0, Number(currentResources[key] || 0));
      if (available < Number(value || 0)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Not enough ${key} in selected fief` });
      }
    }
    const currentPopulation = Math.max(0, Number(fief.population || 0));
    const schedule = normalizeMaturationSchedule(fief.population_maturation_schedule || {});
    const sickInjured = Math.max(0, Number(fief.sick_injured_population || 0));
    const assignablePopulation = getAssignablePopulation(currentPopulation, schedule, sickInjured);
    if (assignablePopulation < population) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Not enough assignable population in selected fief' });
    }
    const currentSlaves = Math.max(0, Number(fief.slaves || 0));
    if (currentSlaves < slaves) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Not enough slaves in selected fief' });
    }

    const depotRow = await getOrCreateTradeDepot(kingdomId);
    const capacityMax = await getTradeDepotCapacity(kingdomId);
    const depotResources = normalizeStoredResources(depotRow.resources);
    const currentUsed = Object.values(depotResources).reduce((sum, v) => sum + Math.max(0, Number(v || 0)), 0)
      + Math.max(0, Number(depotRow.population || 0))
      + Math.max(0, Number(depotRow.slaves || 0));

    if ((currentUsed + totalDelta) > capacityMax) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Trade depot capacity exceeded (${currentUsed + totalDelta} / ${capacityMax})` });
    }

    for (const [key, value] of Object.entries(resources)) {
      currentResources[key] = Math.max(0, Number(currentResources[key] || 0) - Number(value || 0));
      depotResources[key] = Math.max(0, Number(depotResources[key] || 0) + Number(value || 0));
    }

    const nextPopulation = Math.max(0, currentPopulation - population);
    const nextWorkerAssignments = clampWorkersToAssignablePopulation(
      normalizeWorkerAssignments(fief.worker_assignments),
      fief.max_workers_per_resource || {},
      getAssignablePopulation(nextPopulation, schedule, sickInjured)
    );

    const nextSlaves = Math.max(0, currentSlaves - slaves);
    const nextSlaveAssignments = clampSlaveAssignmentsToPool(
      normalizeSlaveWorkerAssignments(fief.slave_worker_assignments),
      nextSlaves
    );

    await client.query(
      `UPDATE fiefs
       SET stored_resources = $2::jsonb,
           population = GREATEST(0, COALESCE(population, 0) - $3),
           slaves = GREATEST(0, COALESCE(slaves, 0) - $4),
           worker_assignments = $5::jsonb,
           slave_worker_assignments = $6::jsonb
       WHERE id = $1`,
      [
        fiefId,
        JSON.stringify(currentResources),
        population,
        slaves,
        JSON.stringify(nextWorkerAssignments),
        JSON.stringify(nextSlaveAssignments),
      ]
    );

    await client.query(
      `UPDATE kingdom_trade_depots
       SET resources = $2::jsonb,
           population = GREATEST(0, COALESCE(population, 0) + $3),
           slaves = GREATEST(0, COALESCE(slaves, 0) + $4),
           updated_at = NOW()
       WHERE kingdom_id = $1`,
      [kingdomId, JSON.stringify(depotResources), population, slaves]
    );

    await client.query('COMMIT');

    const updatedDepot = await getOrCreateTradeDepot(kingdomId);
    if (req.io) {
      req.io.to(`campaign_${kingdom.campaign_id}`).emit('kingdomDataChanged', { campaignId: kingdom.campaign_id, kingdomId, fiefId });
    }
    res.json({ depot: await toDepotViewModel(updatedDepot, kingdomId) });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error depositing to trade depot:', error);
    res.status(500).json({ error: 'Failed to deposit to trade depot' });
  } finally {
    client.release();
  }
});

router.post('/:id/trade-depot/withdraw', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const kingdomId = Number(req.params.id);
    const fiefId = Number(req.body?.fiefId);
    const resources = normalizeResourceDeltaMap(req.body?.resources);
    const population = toPositiveInt(req.body?.population);
    const slaves = toPositiveInt(req.body?.slaves);
    const totalDelta = Object.values(resources).reduce((sum, v) => sum + Number(v || 0), 0) + population + slaves;

    if (!Number.isFinite(kingdomId) || !Number.isFinite(fiefId) || totalDelta <= 0) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const kingdom = await getKingdomContext(kingdomId);
    if (!kingdom) return res.status(404).json({ error: 'Kingdom not found' });
    if (!canManageKingdom(req.user, kingdom)) return res.status(403).json({ error: 'Not authorized' });

    await client.query('BEGIN');

    const fiefResult = await client.query(
      `SELECT id, kingdom_id, COALESCE(stored_resources, '{}'::jsonb) AS stored_resources
       FROM fiefs
       WHERE id = $1
       FOR UPDATE`,
      [fiefId]
    );
    const fief = fiefResult.rows[0];
    if (!fief || Number(fief.kingdom_id) !== kingdomId) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Fief not found in kingdom' });
    }

    const depotResult = await client.query(
      `SELECT resources, population, slaves
       FROM kingdom_trade_depots
       WHERE kingdom_id = $1
       FOR UPDATE`,
      [kingdomId]
    );
    const depot = depotResult.rows[0] || { resources: {}, population: 0, slaves: 0 };

    const depotResources = normalizeStoredResources(depot.resources);
    for (const [key, value] of Object.entries(resources)) {
      const available = Math.max(0, Number(depotResources[key] || 0));
      if (available < Number(value || 0)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Not enough ${key} in trade depot` });
      }
    }
    if (Math.max(0, Number(depot.population || 0)) < population) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Not enough population in trade depot' });
    }
    if (Math.max(0, Number(depot.slaves || 0)) < slaves) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Not enough slaves in trade depot' });
    }

    const fiefResources = normalizeStoredResources(fief.stored_resources);
    for (const [key, value] of Object.entries(resources)) {
      depotResources[key] = Math.max(0, Number(depotResources[key] || 0) - Number(value || 0));
      fiefResources[key] = Math.max(0, Number(fiefResources[key] || 0) + Number(value || 0));
    }

    await client.query(
      `UPDATE fiefs
       SET stored_resources = $2::jsonb,
           population = GREATEST(0, COALESCE(population, 0) + $3),
           slaves = GREATEST(0, COALESCE(slaves, 0) + $4)
       WHERE id = $1`,
      [fiefId, JSON.stringify(fiefResources), population, slaves]
    );

    await client.query(
      `UPDATE kingdom_trade_depots
       SET resources = $2::jsonb,
           population = GREATEST(0, COALESCE(population, 0) - $3),
           slaves = GREATEST(0, COALESCE(slaves, 0) - $4),
           updated_at = NOW()
       WHERE kingdom_id = $1`,
      [kingdomId, JSON.stringify(depotResources), population, slaves]
    );

    await client.query('COMMIT');

    const updatedDepot = await getOrCreateTradeDepot(kingdomId);
    if (req.io) {
      req.io.to(`campaign_${kingdom.campaign_id}`).emit('kingdomDataChanged', { campaignId: kingdom.campaign_id, kingdomId, fiefId });
    }
    res.json({ depot: await toDepotViewModel(updatedDepot, kingdomId) });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error withdrawing from trade depot:', error);
    res.status(500).json({ error: 'Failed to withdraw from trade depot' });
  } finally {
    client.release();
  }
});

router.post('/:id/trade-depot/accept', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    if (!requireDM(req, res)) return;

    const kingdomId = Number(req.params.id);
    const takeAll = Boolean(req.body?.takeAll);
    const requestedResources = normalizeResourceDeltaMap(req.body?.resources);
    const requestedPopulation = toPositiveInt(req.body?.population);
    const requestedSlaves = toPositiveInt(req.body?.slaves);

    if (!Number.isFinite(kingdomId)) return res.status(400).json({ error: 'Invalid kingdom ID' });

    const kingdom = await getKingdomContext(kingdomId);
    if (!kingdom) return res.status(404).json({ error: 'Kingdom not found' });
    if (Number(kingdom.dungeon_master_id) !== Number(req.user.id)) return res.status(403).json({ error: 'Not authorized' });

    await client.query('BEGIN');

    const depotResult = await client.query(
      `SELECT resources, population, slaves
       FROM kingdom_trade_depots
       WHERE kingdom_id = $1
       FOR UPDATE`,
      [kingdomId]
    );
    const depot = depotResult.rows[0];
    if (!depot) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Trade depot not found' });
    }

    const currentResources = normalizeStoredResources(depot.resources);
    const nextResources = { ...currentResources };
    let nextPopulation = Math.max(0, Number(depot.population || 0));
    let nextSlaves = Math.max(0, Number(depot.slaves || 0));

    if (takeAll) {
      for (const key of Object.keys(nextResources)) {
        nextResources[key] = 0;
      }
      nextPopulation = 0;
      nextSlaves = 0;
    } else {
      const anyChange = Object.keys(requestedResources).length > 0 || requestedPopulation > 0 || requestedSlaves > 0;
      if (!anyChange) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'No trade amounts provided' });
      }

      for (const [key, value] of Object.entries(requestedResources)) {
        const available = Math.max(0, Number(nextResources[key] || 0));
        if (available < Number(value || 0)) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Not enough ${key} in depot` });
        }
        nextResources[key] = available - Number(value || 0);
      }

      if (nextPopulation < requestedPopulation) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Not enough population in depot' });
      }
      if (nextSlaves < requestedSlaves) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Not enough slaves in depot' });
      }

      nextPopulation -= requestedPopulation;
      nextSlaves -= requestedSlaves;
    }

    await client.query(
      `UPDATE kingdom_trade_depots
       SET resources = $2::jsonb,
           population = $3,
           slaves = $4,
           updated_at = NOW()
       WHERE kingdom_id = $1`,
      [kingdomId, JSON.stringify(nextResources), nextPopulation, nextSlaves]
    );

    await client.query(
      `INSERT INTO kingdom_trade_depot_events (kingdom_id, actor_id, action, payload)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [
        kingdomId,
        req.user.id,
        takeAll ? 'accept_all' : 'accept_partial',
        JSON.stringify({ resources: requestedResources, population: requestedPopulation, slaves: requestedSlaves }),
      ]
    );

    await client.query('COMMIT');

    const updatedDepot = await getOrCreateTradeDepot(kingdomId);
    if (req.io) {
      req.io.to(`campaign_${kingdom.campaign_id}`).emit('kingdomDataChanged', { campaignId: kingdom.campaign_id, kingdomId });
    }

    res.json({
      message: takeAll ? 'Trade taken (all)' : 'Trade taken (partial)',
      depot: await toDepotViewModel(updatedDepot, kingdomId),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error accepting trade:', error);
    res.status(500).json({ error: 'Failed to accept trade' });
  } finally {
    client.release();
  }
});

module.exports = router;
