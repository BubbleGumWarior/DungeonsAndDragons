const RESEARCH_CATALOG = {
  // ── Tier 2 Research (4 items) ──────────────────────────────────────────────
  tier2_housing: {
    id: 'tier2_housing',
    name: 'Tier 2 Housing',
    description: 'Upgrade housing to support more population per building (Tents 4 → Wooden Lodges 8).',
    pointsRequired: 100,
    tierRequired: 2,
    prerequisites: [],
  },
  tier2_storage: {
    id: 'tier2_storage',
    name: 'Tier 2 Storage',
    description: 'Enhance storage capacity multiplier across all storage buildings (×1.5).',
    pointsRequired: 120,
    tierRequired: 2,
    prerequisites: [],
  },
  tier2_hunter: {
    id: 'tier2_hunter',
    name: 'Tier 2 Hunter Cabin',
    description: 'Improve hunting techniques for +15% meat production per worker.',
    pointsRequired: 110,
    tierRequired: 2,
    prerequisites: [],
  },
  tier2_vegetable: {
    id: 'tier2_vegetable',
    name: 'Tier 2 Vegetable Patch',
    description: 'Develop farming methods for +15% vegetable production per worker.',
    pointsRequired: 110,
    tierRequired: 2,
    prerequisites: [],
  },

  // ── Tier 3 Research (7 items) ──────────────────────────────────────────────
  tier3_housing: {
    id: 'tier3_housing',
    name: 'Tier 3 Housing',
    description: 'Unlock Reinforced Lodges (Tier 3 housing structures, +12 pop each). Upgrade your Wooden Lodges to build them.',
    pointsRequired: 150,
    tierRequired: 3,
    prerequisites: ['tier2_housing'],
  },
  tier3_hunter: {
    id: 'tier3_hunter',
    name: 'Tier 3 Hunter Cabin',
    description: 'Unlock Grand Hunting Lodge with elite hunting practices (+15% bonus stacks).',
    pointsRequired: 140,
    tierRequired: 3,
    prerequisites: ['tier2_hunter'],
  },
  tier3_vegetable: {
    id: 'tier3_vegetable',
    name: 'Tier 3 Vegetable Patch',
    description: 'Unlock Premium Farmland with advanced agricultural technology (+15% bonus stacks).',
    pointsRequired: 140,
    tierRequired: 3,
    prerequisites: ['tier2_vegetable'],
  },
  tier3_storage: {
    id: 'tier3_storage',
    name: 'Tier 3 Storage',
    description: 'Unlock Advanced Warehouse with superior preservation (×1.5 multiplier stacks).',
    pointsRequired: 130,
    tierRequired: 3,
    prerequisites: ['tier2_storage'],
  },
  tier2_quarry: {
    id: 'tier2_quarry',
    name: 'Tier 2 Quarry',
    description: 'Unlock Advanced Quarry for accelerated stone extraction.',
    pointsRequired: 130,
    tierRequired: 3,
    prerequisites: [],
  },
  tier2_mine: {
    id: 'tier2_mine',
    name: 'Tier 2 Mine Shaft',
    description: 'Unlock Deep Mine for premium mineral extraction.',
    pointsRequired: 140,
    tierRequired: 3,
    prerequisites: [],
  },
  tier2_research_lab: {
    id: 'tier2_research_lab',
    name: 'Tier 2 Research Lab',
    description: 'Unlock Advanced Research Lab for accelerated technological progress.',
    pointsRequired: 150,
    tierRequired: 3,
    prerequisites: [],
  },

  // ── New Building Chain Research (17 chains × 2 tiers each) ──────────────────

  // Trade Post
  tier1_trade_post: {
    id: 'tier1_trade_post',
    name: 'Tier 1 Trade Post',
    description: 'Expand the Trade Post into a Market Hall with formalized commerce and improved tax yields.',
    pointsRequired: 120,
    tierRequired: 3,
    prerequisites: [],
  },
  tier2_trade_post: {
    id: 'tier2_trade_post',
    name: 'Tier 2 Trade Post',
    description: 'Upgrade the Market Hall into a Merchant Exchange with guild-backed trade contracts and improved market velocity.',
    pointsRequired: 150,
    tierRequired: 3,
    prerequisites: ['tier1_trade_post'],
  },

  // Smithy
  tier1_smithy: {
    id: 'tier1_smithy',
    name: 'Tier 1 Smithy',
    description: 'Upgrade the Smithy into a Forge with hardened production methods for higher-quality equipment.',
    pointsRequired: 120,
    tierRequired: 3,
    prerequisites: [],
  },
  tier2_smithy: {
    id: 'tier2_smithy',
    name: 'Tier 2 Smithy',
    description: 'Upgrade the Forge into a Master Smithy where craftsmen significantly improve output quality and consistency.',
    pointsRequired: 150,
    tierRequired: 3,
    prerequisites: ['tier1_smithy'],
  },

  // Watchtower
  tier1_watchtower: {
    id: 'tier1_watchtower',
    name: 'Tier 1 Watchtower',
    description: 'Upgrade the Watchtower into a Signal Tower with extended sight lines and relay systems.',
    pointsRequired: 110,
    tierRequired: 3,
    prerequisites: [],
  },
  tier2_watchtower: {
    id: 'tier2_watchtower',
    name: 'Tier 2 Watchtower',
    description: 'Upgrade the Signal Tower into a Sentinel Tower with permanent sentry staffing and expanded early warning coverage.',
    pointsRequired: 140,
    tierRequired: 3,
    prerequisites: ['tier1_watchtower'],
  },

  // Walls and Fortifications
  tier1_palisades: {
    id: 'tier1_palisades',
    name: 'Tier 1 Palisades',
    description: 'Upgrade Palisades into Fortified Palisades with improved structural durability.',
    pointsRequired: 110,
    tierRequired: 3,
    prerequisites: [],
  },
  tier2_palisades: {
    id: 'tier2_palisades',
    name: 'Tier 2 Palisades',
    description: 'Upgrade Fortified Palisades into Wooden Ramparts with raised fighting positions and stronger perimeter control.',
    pointsRequired: 140,
    tierRequired: 3,
    prerequisites: ['tier1_palisades'],
  },

  // Hospital and Infirmary
  tier1_infirmary: {
    id: 'tier1_infirmary',
    name: 'Tier 1 Infirmary',
    description: 'Upgrade the Infirmary into a Field Hospital with forward triage and battle casualty treatment.',
    pointsRequired: 110,
    tierRequired: 3,
    prerequisites: [],
  },
  tier2_infirmary: {
    id: 'tier2_infirmary',
    name: 'Tier 2 Infirmary',
    description: 'Upgrade the Field Hospital into a Grand Infirmary with expanded recovery wards and treatment throughput.',
    pointsRequired: 140,
    tierRequired: 3,
    prerequisites: ['tier1_infirmary'],
  },

  // Embassy
  tier1_embassy: {
    id: 'tier1_embassy',
    name: 'Tier 1 Embassy',
    description: 'Expand the Embassy into a Council Hall with formal governance and envoy capabilities.',
    pointsRequired: 110,
    tierRequired: 3,
    prerequisites: [],
  },
  tier2_embassy: {
    id: 'tier2_embassy',
    name: 'Tier 2 Embassy',
    description: 'Upgrade the Council Hall into a Diplomatic Office with permanent diplomatic staff and improved alliance reliability.',
    pointsRequired: 140,
    tierRequired: 3,
    prerequisites: ['tier1_embassy'],
  },

  // Logistics Depot
  tier1_logistics_depot: {
    id: 'tier1_logistics_depot',
    name: 'Tier 1 Logistics Depot',
    description: 'Upgrade the Logistics Depot into a Supply Depot with improved stock movement and distribution.',
    pointsRequired: 120,
    tierRequired: 3,
    prerequisites: [],
  },
  tier2_logistics_depot: {
    id: 'tier2_logistics_depot',
    name: 'Tier 2 Logistics Depot',
    description: 'Upgrade the Supply Depot into Roadworks reducing transport friction across all production lanes.',
    pointsRequired: 150,
    tierRequired: 3,
    prerequisites: ['tier1_logistics_depot'],
  },

  // Prison
  tier1_prison: {
    id: 'tier1_prison',
    name: 'Tier 1 Prison',
    description: 'Upgrade the Prison into a Dungeon with stronger confinement standards.',
    pointsRequired: 110,
    tierRequired: 3,
    prerequisites: [],
  },
  tier2_prison: {
    id: 'tier2_prison',
    name: 'Tier 2 Prison',
    description: 'Upgrade the Dungeon into Black Cells with high-control isolation blocks for dangerous detainees.',
    pointsRequired: 140,
    tierRequired: 3,
    prerequisites: ['tier1_prison'],
  },

  // Militia Camp
  tier1_militia_camp: {
    id: 'tier1_militia_camp',
    name: 'Tier 1 Militia Camp',
    description: 'Upgrade the Militia Camp into Militia Barracks with structured housing and drill routines.',
    pointsRequired: 110,
    tierRequired: 3,
    prerequisites: [],
  },
  tier2_militia_camp: {
    id: 'tier2_militia_camp',
    name: 'Tier 2 Militia Camp',
    description: 'Upgrade Militia Barracks into Veteran Barracks with veteran-led training for stronger defenders.',
    pointsRequired: 140,
    tierRequired: 3,
    prerequisites: ['tier1_militia_camp'],
  },

  // Stables
  tier1_stables: {
    id: 'tier1_stables',
    name: 'Tier 1 Stables',
    description: 'Upgrade Stables into War Stables with battle-ready mounts and heavy cavalry support.',
    pointsRequired: 110,
    tierRequired: 3,
    prerequisites: [],
  },
  tier2_stables: {
    id: 'tier2_stables',
    name: 'Tier 2 Stables',
    description: 'Upgrade War Stables into Royal Stables with elite cavalry breeding and command rider training.',
    pointsRequired: 140,
    tierRequired: 3,
    prerequisites: ['tier1_stables'],
  },

  // Archer Range
  tier1_archer_range: {
    id: 'tier1_archer_range',
    name: 'Tier 1 Archer Range',
    description: 'Upgrade the Archer Range into a Bowyer Hall with professional bowcraft and tactical drills.',
    pointsRequired: 110,
    tierRequired: 3,
    prerequisites: [],
  },
  tier2_archer_range: {
    id: 'tier2_archer_range',
    name: 'Tier 2 Archer Range',
    description: 'Upgrade the Bowyer Hall into a Master Fletcher Range with advanced arrowcraft and marksmanship training.',
    pointsRequired: 140,
    tierRequired: 3,
    prerequisites: ['tier1_archer_range'],
  },

  // Swordsmith Hall
  tier1_swordsmith_hall: {
    id: 'tier1_swordsmith_hall',
    name: 'Tier 1 Swordsmith Hall',
    description: 'Upgrade the Swordsmith Hall into a Blade Hall with expanded melee equipment and advanced blade drills.',
    pointsRequired: 120,
    tierRequired: 3,
    prerequisites: [],
  },
  tier2_swordsmith_hall: {
    id: 'tier2_swordsmith_hall',
    name: 'Tier 2 Swordsmith Hall',
    description: 'Upgrade the Blade Hall into a Champion Forge with champion-grade forging for frontline elites.',
    pointsRequired: 150,
    tierRequired: 3,
    prerequisites: ['tier1_swordsmith_hall'],
  },

  // Spear Drill Yard
  tier1_spear_drill_yard: {
    id: 'tier1_spear_drill_yard',
    name: 'Tier 1 Spear Drill Yard',
    description: 'Upgrade the Spear Drill Yard into a Pike Yard with improved anti-cavalry formation drills.',
    pointsRequired: 110,
    tierRequired: 3,
    prerequisites: [],
  },
  tier2_spear_drill_yard: {
    id: 'tier2_spear_drill_yard',
    name: 'Tier 2 Spear Drill Yard',
    description: 'Upgrade the Pike Yard into a Formation Citadel with command-grade discipline for defensive lines.',
    pointsRequired: 140,
    tierRequired: 3,
    prerequisites: ['tier1_spear_drill_yard'],
  },

  // Armory
  tier1_armory: {
    id: 'tier1_armory',
    name: 'Tier 1 Armory',
    description: 'Expand the Armory into an Expanded Armory with larger arms stock and improved upkeep.',
    pointsRequired: 110,
    tierRequired: 3,
    prerequisites: [],
  },
  tier2_armory: {
    id: 'tier2_armory',
    name: 'Tier 2 Armory',
    description: 'Upgrade the Expanded Armory into a Royal Armory with royal-issued standards boosting equipment quality.',
    pointsRequired: 140,
    tierRequired: 3,
    prerequisites: ['tier1_armory'],
  },

  // Drill Yard
  tier1_drill_yard: {
    id: 'tier1_drill_yard',
    name: 'Tier 1 Drill Yard',
    description: 'Upgrade the Drill Yard into Training Grounds with expanded military readiness infrastructure.',
    pointsRequired: 110,
    tierRequired: 3,
    prerequisites: [],
  },
  tier2_drill_yard: {
    id: 'tier2_drill_yard',
    name: 'Tier 2 Drill Yard',
    description: 'Upgrade Training Grounds into Elite Drill Grounds with advanced tactical training for veteran performance.',
    pointsRequired: 140,
    tierRequired: 3,
    prerequisites: ['tier1_drill_yard'],
  },

  // Command Post
  tier1_command_post: {
    id: 'tier1_command_post',
    name: 'Tier 1 Command Post',
    description: 'Upgrade the Command Post into a War Room with operational planning and campaign coordination.',
    pointsRequired: 110,
    tierRequired: 3,
    prerequisites: [],
  },
  tier2_command_post: {
    id: 'tier2_command_post',
    name: 'Tier 2 Command Post',
    description: 'Upgrade the War Room into a Strategic Command for higher-order military coordination and readiness management.',
    pointsRequired: 140,
    tierRequired: 3,
    prerequisites: ['tier1_command_post'],
  },

  // Siege Engine Workshop
  tier1_siege_engine_workshop: {
    id: 'tier1_siege_engine_workshop',
    name: 'Tier 1 Siege Engine Workshop',
    description: 'Upgrade the Siege Engine Workshop into a Siege Foundry with stronger frames and engine reliability.',
    pointsRequired: 120,
    tierRequired: 3,
    prerequisites: [],
  },
  tier2_siege_engine_workshop: {
    id: 'tier2_siege_engine_workshop',
    name: 'Tier 2 Siege Engine Workshop',
    description: 'Upgrade the Siege Foundry into a War Engine Forge with advanced siege metallurgy for stronger engine quality.',
    pointsRequired: 150,
    tierRequired: 3,
    prerequisites: ['tier1_siege_engine_workshop'],
  },

  // ── Tier 3+ Research (remaining upgrade steps for all new chains) ──────────

  // Trade Post (tier3–tier7)
  tier3_trade_post: {
    id: 'tier3_trade_post',
    name: 'Tier 3 Trade Post',
    description: 'Upgrade the Merchant Exchange into a Grand Bazaar attracting caravans, brokers, and long-distance traders.',
    pointsRequired: 160,
    tierRequired: 4,
    prerequisites: ['tier2_trade_post'],
  },
  tier4_trade_post: {
    id: 'tier4_trade_post',
    name: 'Tier 4 Trade Post',
    description: 'Upgrade the Grand Bazaar into a Great Market with regulated civic stalls and premium tax yields.',
    pointsRequired: 180,
    tierRequired: 5,
    prerequisites: ['tier3_trade_post'],
  },
  tier5_trade_post: {
    id: 'tier5_trade_post',
    name: 'Tier 5 Trade Post',
    description: 'Upgrade the Great Market into a Trade Consortium with merchant houses consolidating routes and financing.',
    pointsRequired: 200,
    tierRequired: 6,
    prerequisites: ['tier4_trade_post'],
  },
  tier6_trade_post: {
    id: 'tier6_trade_post',
    name: 'Tier 6 Trade Post',
    description: 'Upgrade the Trade Consortium into a Royal Exchange with state-chartered tariffs and superior market confidence.',
    pointsRequired: 220,
    tierRequired: 7,
    prerequisites: ['tier5_trade_post'],
  },
  tier7_trade_post: {
    id: 'tier7_trade_post',
    name: 'Tier 7 Trade Post',
    description: 'Upgrade the Royal Exchange into an Imperial Trade Forum with empire-scale trade governance.',
    pointsRequired: 240,
    tierRequired: 8,
    prerequisites: ['tier6_trade_post'],
  },

  // Smithy (tier3–tier6)
  tier3_smithy: {
    id: 'tier3_smithy',
    name: 'Tier 3 Smithy',
    description: 'Upgrade the Master Smithy into a Royal Forge with royal contracts standardising superior arms and armor.',
    pointsRequired: 160,
    tierRequired: 4,
    prerequisites: ['tier2_smithy'],
  },
  tier4_smithy: {
    id: 'tier4_smithy',
    name: 'Tier 4 Smithy',
    description: 'Upgrade the Royal Forge into a Grand Forge with heavy industrial furnaces for mass production and advanced alloys.',
    pointsRequired: 180,
    tierRequired: 5,
    prerequisites: ['tier3_smithy'],
  },
  tier5_smithy: {
    id: 'tier5_smithy',
    name: 'Tier 5 Smithy',
    description: 'Upgrade the Grand Forge into a War Smithy for dedicated wartime manufacture of elite offensive and defensive gear.',
    pointsRequired: 200,
    tierRequired: 6,
    prerequisites: ['tier4_smithy'],
  },
  tier6_smithy: {
    id: 'tier6_smithy',
    name: 'Tier 6 Smithy',
    description: 'Upgrade the War Smithy into an Imperial Forge with top-tier military metallurgy and strategic arms output.',
    pointsRequired: 220,
    tierRequired: 7,
    prerequisites: ['tier5_smithy'],
  },

  // Watchtower (tier3–tier6)
  tier3_watchtower: {
    id: 'tier3_watchtower',
    name: 'Tier 3 Watchtower',
    description: 'Upgrade the Sentinel Tower into a Border Tower for frontier surveillance of high-risk perimeter zones.',
    pointsRequired: 160,
    tierRequired: 4,
    prerequisites: ['tier2_watchtower'],
  },
  tier4_watchtower: {
    id: 'tier4_watchtower',
    name: 'Tier 4 Watchtower',
    description: 'Upgrade the Border Tower into a High Watch with elevated defensive coverage and broad-range threat detection.',
    pointsRequired: 180,
    tierRequired: 5,
    prerequisites: ['tier3_watchtower'],
  },
  tier5_watchtower: {
    id: 'tier5_watchtower',
    name: 'Tier 5 Watchtower',
    description: 'Upgrade the High Watch into a Beacon Tower with long-range relay systems coordinating fast regional alerts.',
    pointsRequired: 200,
    tierRequired: 6,
    prerequisites: ['tier4_watchtower'],
  },
  tier6_watchtower: {
    id: 'tier6_watchtower',
    name: 'Tier 6 Watchtower',
    description: 'Upgrade the Beacon Tower into a Watch Bastion, a fortified strategic lookout anchoring the defensive network.',
    pointsRequired: 220,
    tierRequired: 7,
    prerequisites: ['tier5_watchtower'],
  },

  // Walls and Fortifications (tier3–tier8)
  tier3_palisades: {
    id: 'tier3_palisades',
    name: 'Tier 3 Palisades',
    description: 'Upgrade Wooden Ramparts into Stone Walls with permanent stone fortifications and substantial defense gains.',
    pointsRequired: 160,
    tierRequired: 4,
    prerequisites: ['tier2_palisades'],
  },
  tier4_palisades: {
    id: 'tier4_palisades',
    name: 'Tier 4 Palisades',
    description: 'Upgrade Stone Walls into Reinforced Walls with layered segments designed for prolonged siege resistance.',
    pointsRequired: 180,
    tierRequired: 5,
    prerequisites: ['tier3_palisades'],
  },
  tier5_palisades: {
    id: 'tier5_palisades',
    name: 'Tier 5 Palisades',
    description: 'Upgrade Reinforced Walls into Fortified Walls with expanded defensive architecture and stronger gate protections.',
    pointsRequired: 200,
    tierRequired: 6,
    prerequisites: ['tier4_palisades'],
  },
  tier6_palisades: {
    id: 'tier6_palisades',
    name: 'Tier 6 Palisades',
    description: 'Upgrade Fortified Walls into Bastion Walls with bastion design improving crossfire coverage and defensive depth.',
    pointsRequired: 220,
    tierRequired: 7,
    prerequisites: ['tier5_palisades'],
  },
  tier7_palisades: {
    id: 'tier7_palisades',
    name: 'Tier 7 Palisades',
    description: 'Upgrade Bastion Walls into Citadel Walls with citadel-grade construction delivering high-end fortress survivability.',
    pointsRequired: 240,
    tierRequired: 8,
    prerequisites: ['tier6_palisades'],
  },
  tier8_palisades: {
    id: 'tier8_palisades',
    name: 'Tier 8 Palisades',
    description: 'Upgrade Citadel Walls into Fortress Walls, the peak fortification standard for maximal settlement defense.',
    pointsRequired: 260,
    tierRequired: 9,
    prerequisites: ['tier7_palisades'],
  },

  // Hospital and Infirmary (tier3–tier6)
  tier3_infirmary: {
    id: 'tier3_infirmary',
    name: 'Tier 3 Infirmary',
    description: 'Upgrade the Grand Infirmary into a Healing Hall with improved diagnostics and treatment infrastructure.',
    pointsRequired: 160,
    tierRequired: 4,
    prerequisites: ['tier2_infirmary'],
  },
  tier4_infirmary: {
    id: 'tier4_infirmary',
    name: 'Tier 4 Infirmary',
    description: 'Upgrade the Healing Hall into a Restorative Ward for long-term care and faster workforce recovery.',
    pointsRequired: 180,
    tierRequired: 5,
    prerequisites: ['tier3_infirmary'],
  },
  tier5_infirmary: {
    id: 'tier5_infirmary',
    name: 'Tier 5 Infirmary',
    description: 'Upgrade the Restorative Ward into a Sanctified Clinic with hybrid spiritual and medical care.',
    pointsRequired: 200,
    tierRequired: 6,
    prerequisites: ['tier4_infirmary'],
  },
  tier6_infirmary: {
    id: 'tier6_infirmary',
    name: 'Tier 6 Infirmary',
    description: 'Upgrade the Sanctified Clinic into a Royal Medical Hall, the top-tier medical institution for kingdom-scale health.',
    pointsRequired: 220,
    tierRequired: 7,
    prerequisites: ['tier5_infirmary'],
  },

  // Embassy (tier3–tier6)
  tier3_embassy: {
    id: 'tier3_embassy',
    name: 'Tier 3 Embassy',
    description: 'Upgrade the Diplomatic Office into a Royal Embassy with royal diplomatic prestige and expanded regional influence.',
    pointsRequired: 160,
    tierRequired: 4,
    prerequisites: ['tier2_embassy'],
  },
  tier4_embassy: {
    id: 'tier4_embassy',
    name: 'Tier 4 Embassy',
    description: 'Upgrade the Royal Embassy into a Grand Embassy with expanded envoy capacity for multi-state diplomatic campaigns.',
    pointsRequired: 180,
    tierRequired: 5,
    prerequisites: ['tier3_embassy'],
  },
  tier5_embassy: {
    id: 'tier5_embassy',
    name: 'Tier 5 Embassy',
    description: 'Upgrade the Grand Embassy into a Treaty Hall with dedicated treaty negotiation and ratification infrastructure.',
    pointsRequired: 200,
    tierRequired: 6,
    prerequisites: ['tier4_embassy'],
  },
  tier6_embassy: {
    id: 'tier6_embassy',
    name: 'Tier 6 Embassy',
    description: 'Upgrade the Treaty Hall into a Foreign Affairs Hall, a high-level diplomatic command center for international policy.',
    pointsRequired: 220,
    tierRequired: 7,
    prerequisites: ['tier5_embassy'],
  },

  // Logistics Depot (tier3–tier6)
  tier3_logistics_depot: {
    id: 'tier3_logistics_depot',
    name: 'Tier 3 Logistics Depot',
    description: 'Upgrade Roadworks into a Quartermaster Depot with professional logistics management and improved throughput reliability.',
    pointsRequired: 160,
    tierRequired: 4,
    prerequisites: ['tier2_logistics_depot'],
  },
  tier4_logistics_depot: {
    id: 'tier4_logistics_depot',
    name: 'Tier 4 Logistics Depot',
    description: 'Upgrade the Quartermaster Depot into a Supply Network with integrated depots maximising city-wide gathering.',
    pointsRequired: 180,
    tierRequired: 5,
    prerequisites: ['tier3_logistics_depot'],
  },
  tier5_logistics_depot: {
    id: 'tier5_logistics_depot',
    name: 'Tier 5 Logistics Depot',
    description: 'Upgrade the Supply Network into an Imperial Logistics Hub with large-scale command accelerating every production lane.',
    pointsRequired: 200,
    tierRequired: 6,
    prerequisites: ['tier4_logistics_depot'],
  },
  tier6_logistics_depot: {
    id: 'tier6_logistics_depot',
    name: 'Tier 6 Logistics Depot',
    description: 'Upgrade the Imperial Logistics Hub into a Trade Route Office for final-stage logistics efficiency and route optimisation.',
    pointsRequired: 220,
    tierRequired: 7,
    prerequisites: ['tier5_logistics_depot'],
  },

  // Prison (tier3–tier6)
  tier3_prison: {
    id: 'tier3_prison',
    name: 'Tier 3 Prison',
    description: 'Upgrade Black Cells into a Deep Prison with layered subterranean containment for long-term high-risk detention.',
    pointsRequired: 160,
    tierRequired: 4,
    prerequisites: ['tier2_prison'],
  },
  tier4_prison: {
    id: 'tier4_prison',
    name: 'Tier 4 Prison',
    description: 'Upgrade the Deep Prison into a High Security Prison with a fortified incarceration complex and advanced oversight.',
    pointsRequired: 180,
    tierRequired: 5,
    prerequisites: ['tier3_prison'],
  },
  tier5_prison: {
    id: 'tier5_prison',
    name: 'Tier 5 Prison',
    description: 'Upgrade the High Security Prison into an Iron Keep, a heavy confinement fortress for maximal prisoner control.',
    pointsRequired: 200,
    tierRequired: 6,
    prerequisites: ['tier4_prison'],
  },
  tier6_prison: {
    id: 'tier6_prison',
    name: 'Tier 6 Prison',
    description: 'Upgrade the Iron Keep into a Shadow Vault, the final-tier detention architecture for covert and strategic prisoners.',
    pointsRequired: 220,
    tierRequired: 7,
    prerequisites: ['tier5_prison'],
  },

  // Militia Camp (tier3–tier6)
  tier3_militia_camp: {
    id: 'tier3_militia_camp',
    name: 'Tier 3 Militia Camp',
    description: 'Upgrade Veteran Barracks into an Elite Garrison with a professional defense corps and superior discipline.',
    pointsRequired: 160,
    tierRequired: 4,
    prerequisites: ['tier2_militia_camp'],
  },
  tier4_militia_camp: {
    id: 'tier4_militia_camp',
    name: 'Tier 4 Militia Camp',
    description: 'Upgrade the Elite Garrison into a War Garrison with operational wartime barracks for sustained deployments.',
    pointsRequired: 180,
    tierRequired: 5,
    prerequisites: ['tier3_militia_camp'],
  },
  tier5_militia_camp: {
    id: 'tier5_militia_camp',
    name: 'Tier 5 Militia Camp',
    description: 'Upgrade the War Garrison into a Legion Garrison with large-scale formation and command housing for veteran units.',
    pointsRequired: 200,
    tierRequired: 6,
    prerequisites: ['tier4_militia_camp'],
  },
  tier6_militia_camp: {
    id: 'tier6_militia_camp',
    name: 'Tier 6 Militia Camp',
    description: 'Upgrade the Legion Garrison into an Imperial Muster Hall, the final-tier troop mustering center with strategic mobilisation capacity.',
    pointsRequired: 220,
    tierRequired: 7,
    prerequisites: ['tier5_militia_camp'],
  },

  // Stables (tier3–tier4)
  tier3_stables: {
    id: 'tier3_stables',
    name: 'Tier 3 Stables',
    description: 'Upgrade Royal Stables into Elite Stables with higher-quality mounts and improved cavalry tactical readiness.',
    pointsRequired: 160,
    tierRequired: 4,
    prerequisites: ['tier2_stables'],
  },
  tier4_stables: {
    id: 'tier4_stables',
    name: 'Tier 4 Stables',
    description: 'Upgrade Elite Stables into Royal Cavalry Stables, the top-tier cavalry infrastructure for charge power and mobility.',
    pointsRequired: 180,
    tierRequired: 5,
    prerequisites: ['tier3_stables'],
  },

  // Archer Range (tier3–tier4)
  tier3_archer_range: {
    id: 'tier3_archer_range',
    name: 'Tier 3 Archer Range',
    description: 'Upgrade the Master Fletcher Range into an Elite Fletching Hall with refined fletching and disciplined volley drills.',
    pointsRequired: 160,
    tierRequired: 4,
    prerequisites: ['tier2_archer_range'],
  },
  tier4_archer_range: {
    id: 'tier4_archer_range',
    name: 'Tier 4 Archer Range',
    description: 'Upgrade the Elite Fletching Hall into a Royal Marksman Range, the top-tier marksman training grounds.',
    pointsRequired: 180,
    tierRequired: 5,
    prerequisites: ['tier3_archer_range'],
  },

  // Swordsmith Hall (tier3–tier4)
  tier3_swordsmith_hall: {
    id: 'tier3_swordsmith_hall',
    name: 'Tier 3 Swordsmith Hall',
    description: 'Upgrade the Champion Forge into a Veteran Bladesmith Hall with veteran smith coordination and battle-ready kit quality.',
    pointsRequired: 160,
    tierRequired: 4,
    prerequisites: ['tier2_swordsmith_hall'],
  },
  tier4_swordsmith_hall: {
    id: 'tier4_swordsmith_hall',
    name: 'Tier 4 Swordsmith Hall',
    description: 'Upgrade the Veteran Bladesmith Hall into a Royal Blade Forge, the royal-grade production line for top-tier melee forces.',
    pointsRequired: 180,
    tierRequired: 5,
    prerequisites: ['tier3_swordsmith_hall'],
  },

  // Spear Drill Yard (tier3–tier4)
  tier3_spear_drill_yard: {
    id: 'tier3_spear_drill_yard',
    name: 'Tier 3 Spear Drill Yard',
    description: 'Upgrade the Formation Citadel into a Shieldwall Hall with advanced shieldwall doctrine and anti-charge battlefield control.',
    pointsRequired: 160,
    tierRequired: 4,
    prerequisites: ['tier2_spear_drill_yard'],
  },
  tier4_spear_drill_yard: {
    id: 'tier4_spear_drill_yard',
    name: 'Tier 4 Spear Drill Yard',
    description: 'Upgrade the Shieldwall Hall into a Phalanx Command, the elite anti-cavalry command center for high-discipline formations.',
    pointsRequired: 180,
    tierRequired: 5,
    prerequisites: ['tier3_spear_drill_yard'],
  },

  // Armory (tier3–tier4)
  tier3_armory: {
    id: 'tier3_armory',
    name: 'Tier 3 Armory',
    description: 'Upgrade the Royal Armory into a Grand Armory with large arsenal logistics for high-volume unit support.',
    pointsRequired: 160,
    tierRequired: 4,
    prerequisites: ['tier2_armory'],
  },
  tier4_armory: {
    id: 'tier4_armory',
    name: 'Tier 4 Armory',
    description: 'Upgrade the Grand Armory into a War Arsenal, the final-tier military supply complex for campaign-scale deployment.',
    pointsRequired: 180,
    tierRequired: 5,
    prerequisites: ['tier3_armory'],
  },

  // Drill Yard (tier3–tier4)
  tier3_drill_yard: {
    id: 'tier3_drill_yard',
    name: 'Tier 3 Drill Yard',
    description: 'Upgrade Elite Drill Grounds into Veteran Training Grounds with specialised programs for advanced battlefield roles.',
    pointsRequired: 160,
    tierRequired: 4,
    prerequisites: ['tier2_drill_yard'],
  },
  tier4_drill_yard: {
    id: 'tier4_drill_yard',
    name: 'Tier 4 Drill Yard',
    description: 'Upgrade Veteran Training Grounds into a War College, the strategic military academy for top-tier doctrine and training speed.',
    pointsRequired: 180,
    tierRequired: 5,
    prerequisites: ['tier3_drill_yard'],
  },

  // Command Post (tier3–tier4)
  tier3_command_post: {
    id: 'tier3_command_post',
    name: 'Tier 3 Command Post',
    description: 'Upgrade Strategic Command into an Advanced Command Center with improved logistics for large-scale force deployment.',
    pointsRequired: 160,
    tierRequired: 4,
    prerequisites: ['tier2_command_post'],
  },
  tier4_command_post: {
    id: 'tier4_command_post',
    name: 'Tier 4 Command Post',
    description: 'Upgrade the Advanced Command Center into a High Command Citadel, the final-tier military command complex for strategic dominance.',
    pointsRequired: 180,
    tierRequired: 5,
    prerequisites: ['tier3_command_post'],
  },

  // Siege Engine Workshop (tier3–tier4)
  tier3_siege_engine_workshop: {
    id: 'tier3_siege_engine_workshop',
    name: 'Tier 3 Siege Engine Workshop',
    description: 'Upgrade the War Engine Forge into an Advanced Siege Workshop with high-throughput siege engineering and assembly systems.',
    pointsRequired: 160,
    tierRequired: 4,
    prerequisites: ['tier2_siege_engine_workshop'],
  },
  tier4_siege_engine_workshop: {
    id: 'tier4_siege_engine_workshop',
    name: 'Tier 4 Siege Engine Workshop',
    description: 'Upgrade the Advanced Siege Workshop into an Imperial Siege Hall, the top-tier siege doctrine and production control center.',
    pointsRequired: 180,
    tierRequired: 5,
    prerequisites: ['tier3_siege_engine_workshop'],
  },
};

function getResearchConfig(researchId) {
  if (!researchId) return null;
  return RESEARCH_CATALOG[String(researchId)] || null;
}

// Exponential cost scaling — each tierRequired step roughly doubles/triples cost
// so that tier 9 research costs ~15,000 points.
const RESEARCH_TIER_COSTS = {
  2: 200,
  3: 600,
  4: 1500,
  5: 3000,
  6: 5500,
  7: 8500,
  8: 12000,
  9: 15000,
};
Object.values(RESEARCH_CATALOG).forEach((entry) => {
  const scaled = RESEARCH_TIER_COSTS[entry.tierRequired];
  if (scaled !== undefined) entry.pointsRequired = scaled;
});

module.exports = {
  RESEARCH_CATALOG,
  getResearchConfig,
};
