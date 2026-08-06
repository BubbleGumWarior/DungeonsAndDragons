import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import {
  campaignAPI,
  kingdomAPI,
  KingdomSummary,
  KingdomFief,
  KingdomCoOwner,
  LegendaryCharacter,
  PrayerDefinition,
  KingdomTradeDepot,
} from '../../services/api';

interface Player {
  id: number;
  username: string;
}

interface Character {
  id: number;
  name: string;
  player_id: number;
}

interface Props {
  campaignId: number;
  players: Player[];
  characters: Character[];
  isDungeonMaster: boolean;
  userId?: number;
  socket: any;
}

type ManagementMode = 'fief' | 'kingdom';

const WORKER_STEP_OPTIONS = [1, 5, 10, 50, 100] as const;
const POPULATION_MATURITY_DAYS = 15 * 365;
const VEGETABLE_ASSIGNMENT_DAYS = 4;
const VEGETABLE_GROWTH_DAYS = 6;
const VEGETABLE_HARVEST_DAYS = 4;
const VEGETABLE_HARVEST_PER_WORKER_PER_DAY = 9.375;
// 4 harvest days at 9.375/day ~= 25 days of baseline meat yield (1.5/day).
// const MEAT_PER_WORKER_PER_DAY = 1.5; // base rate (T1), kept for reference — embedded in MEAT_BUILDING_CHAIN

// Must stay in sync with Campaign.MEAT_BUILDING_CHAIN / VEG_BUILDING_CHAIN on the backend.
const MEAT_BUILDING_CHAIN: { type: string; rate: number; capacity: number }[] = [
  { type: 'great_hunters_keep',     rate: 2.95, capacity: 20 },
  { type: 'warden_lodge',           rate: 2.75, capacity: 20 },
  { type: 'beastmaster_hall',       rate: 2.55, capacity: 20 },
  { type: 'ranger_hall',            rate: 2.35, capacity: 20 },
  { type: 'tracker_lodge',          rate: 2.15, capacity: 20 },
  { type: 'hunters_lodge_advanced', rate: 1.95, capacity: 20 },
  { type: 'hunting_lodge',          rate: 1.73, capacity: 20 },
  { type: 'hunters_guild',          rate: 1.5,  capacity: 20 },
];
const VEG_BUILDING_CHAIN: { type: string; rate: number; capacity: number }[] = [
  { type: 'hydroponic_conservatory', rate: 4.10, capacity: 20 },
  { type: 'greenhouse_complex',      rate: 3.80, capacity: 20 },
  { type: 'fertile_estates',         rate: 3.50, capacity: 20 },
  { type: 'orchard_farms',           rate: 3.20, capacity: 20 },
  { type: 'terrace_fields',          rate: 2.90, capacity: 20 },
  { type: 'farm_advanced',  rate: 2.60, capacity: 20 },
  { type: 'irrigated_farm', rate: 2.30, capacity: 20 },
  { type: 'farm',           rate: 2.0,  capacity: 20 },
  { type: 'granary',        rate: 2.0,  capacity: 20 },
];
// Distribute workers into highest-tier building slots first.
// For meat chains, returns total meat/day from workers.
// For veg chains, returns effective worker-days (multiplied by tier rate).
const computeTieredWorkerOutput = (
  totalWorkers: number,
  completedBuildings: any[],
  chain: { type: string; rate: number; capacity: number }[],
): number => {
  const countByType: Record<string, number> = {};
  for (const b of completedBuildings) {
    const t = String(b?.building_type || '');
    countByType[t] = (countByType[t] || 0) + 1;
  }
  let remaining = Math.max(0, totalWorkers);
  let total = 0;
  for (const { type, rate, capacity } of chain) {
    if (remaining <= 0) break;
    const count = countByType[type] || 0;
    if (count === 0) continue;
    const slots = count * capacity;
    const assigned = Math.min(remaining, slots);
    total += assigned * rate;
    remaining -= assigned;
  }
  if (remaining > 0) {
    total += remaining * (chain[chain.length - 1]?.rate ?? 1);
  }
  return total;
};
const getTierWorkerYieldMultiplier = (tier?: number) => {
  const normalizedTier = Math.max(1, Math.floor(Number(tier || 1)));
  return 1 + ((normalizedTier - 1) * 0.1);
};

const getFoodConsumptionRateForTier = (tier?: number) => (Number(tier || 1) <= 1 ? 0.7 : 1);

// Tier 4+ fiefs owe gold upkeep: 1 gold per 10 population, 1 gold per Militia
// in reserve, 2 gold per any other reserve unit type. Mirrors the backend's
// Campaign.getDailyGoldConsumption exactly.
const getDailyGoldConsumption = (population: number, unitReserves: Record<string, number> | undefined, tier?: number) => {
  const numericTier = Math.max(1, Math.floor(Number(tier || 1)));
  if (numericTier < 4) return 0;
  const pop = Math.max(0, Number(population || 0));
  const reserves = (unitReserves && typeof unitReserves === 'object') ? unitReserves : {};
  let militiaCount = 0;
  let otherSoldierCount = 0;
  for (const [unitType, countRaw] of Object.entries(reserves)) {
    const count = Math.max(0, Number(countRaw) || 0);
    if (count <= 0) continue;
    if (unitType === 'Militia') militiaCount += count;
    else otherSoldierCount += count;
  }
  return (pop / 10) + (militiaCount * 1) + (otherSoldierCount * 2);
};

// ── Tier 5+ civic stability (unrest) ────────────────────────────────────────
// Mirrors the backend's Campaign.STABILITY_CAPACITY_BY_TYPE / getUnrestTarget /
// getUnrestProductionPenaltyPct / getUnrestRevoltChance exactly.
const STABILITY_CAPACITY_BY_TYPE: Record<string, number> = {
  guard_post: 20,
  guard_barracks: 40,
  shield_hall: 70,
  faith_temple: 15,
  great_temple: 25,
  sanctified_basilica: 35,
  pilgrim_cathedral: 45,
  divine_sanctuary: 55,
  celestial_cathedral: 65,
  high_sacred_citadel: 75,
  eternal_shrine_complex: 85,
  pantheon_spire: 95,
  council_hall: 35,
  diplomatic_office: 60,
};
const UNREST_BASELINE_POPULATION_PER_TIER = 40;
const UNREST_STABILITY_POPULATION_PER_CAPACITY_POINT = 2;
const UNREST_PENALTY_FLOOR = 30;
const UNREST_MAX_PRODUCTION_PENALTY_PCT = 50;
const UNREST_REVOLT_FLOOR = 70;
const UNREST_MAX_REVOLT_CHANCE = 0.25;

const getStabilityCapacity = (completedBuildings: any[]) => {
  let capacity = 0;
  for (const b of (completedBuildings || [])) {
    capacity += STABILITY_CAPACITY_BY_TYPE[String(b?.building_type || '')] || 0;
  }
  return capacity;
};

const getUnrestSupportedPopulation = (stabilityCapacity: number, tier?: number) => {
  const numericTier = Math.max(1, Math.floor(Number(tier || 1)));
  return (numericTier * UNREST_BASELINE_POPULATION_PER_TIER) + (Math.max(0, stabilityCapacity) * UNREST_STABILITY_POPULATION_PER_CAPACITY_POINT);
};

const getUnrestTarget = (population: number, stabilityCapacity: number, tier?: number) => {
  const numericTier = Math.max(1, Math.floor(Number(tier || 1)));
  if (numericTier < 5) return 0;
  const pop = Math.max(0, Number(population || 0));
  const supported = getUnrestSupportedPopulation(stabilityCapacity, numericTier);
  if (pop <= supported) return 0;
  const overRatio = (pop - supported) / Math.max(1, supported);
  return Math.min(100, overRatio * 100);
};

const getUnrestProductionPenaltyPct = (unrest: number) => {
  const u = Math.max(0, Math.min(100, Number(unrest || 0)));
  if (u <= UNREST_PENALTY_FLOOR) return 0;
  const span = 100 - UNREST_PENALTY_FLOOR;
  return Math.min(UNREST_MAX_PRODUCTION_PENALTY_PCT, ((u - UNREST_PENALTY_FLOOR) / span) * UNREST_MAX_PRODUCTION_PENALTY_PCT);
};

const getUnrestRevoltChance = (unrest: number) => {
  const u = Math.max(0, Math.min(100, Number(unrest || 0)));
  if (u < UNREST_REVOLT_FLOOR) return 0;
  const span = 100 - UNREST_REVOLT_FLOOR;
  return Math.min(UNREST_MAX_REVOLT_CHANCE, ((u - UNREST_REVOLT_FLOOR) / span) * UNREST_MAX_REVOLT_CHANCE);
};

const getResearchWorkerYieldMultiplier = (completedResearch: string[] | undefined, lane: 'meat' | 'vegetables') => {
  const done = new Set((completedResearch || []).map((r) => String(r)));
  if (lane === 'meat') {
    let bonus = 0;
    if (done.has('tier2_hunter')) bonus += 0.15;
    if (done.has('tier3_hunter')) bonus += 0.15;
    return 1 + bonus;
  }
  let bonus = 0;
  if (done.has('tier2_vegetable')) bonus += 0.15;
  if (done.has('tier3_vegetable')) bonus += 0.15;
  return 1 + bonus;
};

const RESOURCE_COLORS: Record<string, { text: string; border: string; background: string }> = {
  wood: { text: '#d6bc9a', border: 'rgba(180,136,90,0.45)', background: 'rgba(92,58,34,0.35)' },
  stone: { text: '#cbd5e1', border: 'rgba(148,163,184,0.45)', background: 'rgba(51,65,85,0.35)' },
  minerals: { text: '#fca5a5', border: 'rgba(239,68,68,0.45)', background: 'rgba(127,29,29,0.25)' },
  iron: { text: '#fca5a5', border: 'rgba(239,68,68,0.45)', background: 'rgba(127,29,29,0.25)' },
  vegetables: { text: '#86efac', border: 'rgba(34,197,94,0.45)', background: 'rgba(20,83,45,0.3)' },
  meat: { text: '#fdba74', border: 'rgba(249,115,22,0.45)', background: 'rgba(124,45,18,0.28)' },
  faith: { text: '#c4b5fd', border: 'rgba(139,92,246,0.45)', background: 'rgba(76,29,149,0.25)' },
  research: { text: '#93c5fd', border: 'rgba(59,130,246,0.45)', background: 'rgba(30,58,138,0.28)' },
  gold: { text: '#fde047', border: 'rgba(var(--theme-accent-rgb),0.45)', background: 'rgba(113,63,18,0.28)' },
};

const RESOURCE_ICONS: Record<string, string> = {
  food: '🍲',
  wood: '🌳',
  stone: '🪨',
  minerals: '⛏️',
  iron: '⛓️',
  research: '📘',
  faith: '✨',
  gold: '🪙',
  meat: '🥩',
  vegetables: '🥕',
  building: '🏗️',
};

const LEGENDARY_BONUS_LABELS: Record<string, string> = {
  wood_bonus_pct: 'Wood',
  stone_bonus_pct: 'Stone',
  iron_bonus_pct: 'Iron',
  meat_bonus_pct: 'Meat',
  vegetables_bonus_pct: 'Vegetables',
  gold_bonus_pct: 'Gold',
  research_bonus_pct: 'Research',
  faith_bonus_pct: 'Faith',
  building_bonus_pct: 'Building',
  population_growth_bonus_pct: 'Population Growth',
  food_consumption_reduction_pct: 'Food Use Reduction',
  unit_training_speed_reduction_pct: 'Unit Training Speed',
};

const formatLegendaryBonus = (key: string, value: number) => {
  const label = LEGENDARY_BONUS_LABELS[key] || key;
  const numValue = Number(value || 0);
  // Reduction-style stats are inverted: a positive value reduces (shown as "-"), negative worsens (shown as "+").
  const isReduction = key === 'food_consumption_reduction_pct' || key === 'unit_training_speed_reduction_pct';
  const sign = isReduction ? (numValue >= 0 ? '-' : '+') : (numValue >= 0 ? '+' : '-');
  return `${label}: ${sign}${Math.abs(numValue).toFixed(2)}%`;
};

const PRAYER_EFFECT_LABELS: Record<string, string> = {
  food: 'Food',
  wood: 'Wood',
  stone: 'Stone',
  minerals: 'Minerals',
  gold: 'Gold',
  faith: 'Faith',
  research: 'Research',
  population: 'Population',
  soldiers: 'Soldiers',
  sick_injured_recovered: 'Recovered Sick/Injured',
  prisoners_converted_to_population: 'Prisoners Converted',
  slaves_freed_to_population: 'Slaves Freed',
};

const formatPrayerEffectValue = (key: string, value: number) => {
  const label = PRAYER_EFFECT_LABELS[key] || key;
  const numeric = Number(value || 0);
  const sign = numeric >= 0 ? '+' : '';
  return `${label}: ${sign}${numeric.toFixed(0)}`;
};

const formatResourceLabel = (key: string) => {
  const normalized = String(key || '').toLowerCase();
  return PRAYER_EFFECT_LABELS[normalized] || normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const LOGISTICS_BUILDING_TYPES = new Set([
  'logistics_depot',
  'roadworks',
  'supply_depot',
  'quartermaster_depot',
  'supply_network',
  'imperial_logistics_hub',
  'trade_route_office',
]);

const RESEARCH_BUILDING_CHAIN = ['research_lab', 'research_lab_advanced', 'applied_sciences_lab', 'innovation_institute', 'arcane_research_institute', 'grand_academy_of_sciences', 'experimental_nexus', 'transcendent_research_complex', 'omniscience_institute'];

const BUILD_TABS = ['all', 'food', 'wood', 'stone', 'research', 'faith', 'storage', 'military', 'defense', 'trade', 'civic'] as const;
type BuildTabId = typeof BUILD_TABS[number];

const RESOURCE_CANONICAL_ORDER = ['building', 'wood', 'iron', 'stone', 'vegetables', 'meat', 'gold', 'research', 'faith'];
const SLAVE_RESOURCE_CANONICAL_ORDER = ['building', 'wood', 'iron', 'stone'];

const sortByCanonicalOrder = (keys: string[], order: string[]) =>
  [...keys].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

const BUILD_TAB_LABELS: Record<BuildTabId, string> = {
  all: 'All',
  food: 'Food',
  wood: 'Wood',
  stone: 'Stone & Mining',
  research: 'Research',
  faith: 'Faith',
  storage: 'Storage & Housing',
  military: 'Military',
  defense: 'Defense',
  trade: 'Trade & Logistics',
  civic: 'Civic',
};

const BUILD_TAB_COLORS: Record<BuildTabId, { text: string; border: string; background: string }> = {
  all:      { text: '#e2e8f0', border: 'rgba(148,163,184,0.4)',   background: 'rgba(30,41,59,0.35)' },
  food:     { text: '#86efac', border: 'rgba(34,197,94,0.45)',    background: 'rgba(20,83,45,0.3)' },
  wood:     { text: '#d6bc9a', border: 'rgba(180,136,90,0.45)',   background: 'rgba(92,58,34,0.35)' },
  stone:    { text: '#cbd5e1', border: 'rgba(148,163,184,0.45)',  background: 'rgba(51,65,85,0.35)' },
  research: { text: '#93c5fd', border: 'rgba(59,130,246,0.45)',   background: 'rgba(30,58,138,0.28)' },
  faith:    { text: '#c4b5fd', border: 'rgba(139,92,246,0.45)',   background: 'rgba(76,29,149,0.25)' },
  storage:  { text: '#fde68a', border: 'rgba(234,179,8,0.45)',    background: 'rgba(113,63,18,0.28)' },
  military: { text: '#fca5a5', border: 'rgba(239,68,68,0.45)',    background: 'rgba(127,29,29,0.28)' },
  defense:  { text: '#94a3b8', border: 'rgba(100,116,139,0.45)',  background: 'rgba(30,41,59,0.35)' },
  trade:    { text: '#6ee7b7', border: 'rgba(16,185,129,0.45)',   background: 'rgba(6,78,59,0.28)' },
  civic:    { text: 'var(--text-gold)', border: 'rgba(var(--theme-accent-rgb),0.4)', background: 'rgba(120,53,15,0.28)' },
};

const getBuildingCategory = (building: any): BuildTabId => {
  const key = String(building?.key || building?.building_type || '').trim();
  // Food
  if (['farm', 'irrigated_farm', 'farm_advanced', 'terrace_fields', 'orchard_farms', 'fertile_estates', 'greenhouse_complex', 'hydroponic_conservatory', 'hunters_guild', 'hunting_lodge', 'hunters_lodge_advanced', 'tracker_lodge', 'ranger_hall', 'beastmaster_hall', 'warden_lodge', 'great_hunters_keep'].includes(key)) return 'food';
  // Wood
  if (['lumber_mill', 'timber_mill', 'advanced_timber_mill', 'sawmill_complex', 'industrial_sawmill', 'great_lumber_works'].includes(key)) return 'wood';
  // Stone & Mining (includes smithy/forge chain)
  if (['quarry', 'quarry_advanced', 'reinforced_quarry', 'deepstone_quarry', 'heavy_quarry_works', 'industrial_quarry', 'grand_quarry_complex', 'earthsplit_quarry', 'titan_quarry', 'mine', 'mine_advanced', 'reinforced_mine', 'crystal_mine', 'industrial_mine', 'great_foundry_mine', 'abyssal_mine', 'mythril_mine', 'primordial_core_mine', 'smithy', 'forge', 'master_smithy', 'royal_forge', 'grand_forge', 'war_smithy', 'imperial_forge'].includes(key)) return 'stone';
  // Research
  if (RESEARCH_BUILDING_CHAIN.includes(key)) return 'research';
  // Faith
  if (['faith_temple', 'great_temple', 'sanctified_basilica', 'pilgrim_cathedral', 'divine_sanctuary', 'celestial_cathedral', 'high_sacred_citadel', 'eternal_shrine_complex', 'pantheon_spire'].includes(key)) return 'faith';
  // Storage & Housing
  if (['housing', 'wood_lodge', 'reinforced_lodge', 'stone_lodge', 'longhouse_block', 'manor_house', 'townhouse_row', 'urban_residence', 'noble_residence', 'royal_estate', 'storage', 'storage_shack', 'advanced_storage_tent', 'storehouse', 'reinforced_storehouse', 'central_storehouse', 'storage_advanced', 'vaulted_warehouse', 'granary', 'reinforced_granary', 'cold_cellar_granary', 'regional_granary', 'central_food_reserve', 'preservation_complex', 'nutrient_reserve_hall', 'strategic_food_vault', 'eternal_harvest_vault', 'builders_hut', 'masons_workshop', 'engineers_lodge', 'construction_guildhall', 'master_builder_hall', 'grand_architect_hall'].includes(key)) return 'storage';
  // Military
  if (['militia_camp', 'militia_barracks', 'veteran_barracks', 'elite_garrison', 'war_garrison', 'legion_garrison', 'imperial_muster_hall',
       'stables', 'war_stables', 'royal_stables', 'elite_stables', 'royal_cavalry_stables',
       'archer_range', 'bowyer_hall', 'master_fletcher_range', 'elite_fletching_hall', 'royal_marksman_range',
       'swordsmith_hall', 'blade_hall', 'champion_forge', 'veteran_bladesmith_hall', 'royal_blade_forge',
       'spear_drill_yard', 'pike_yard', 'formation_citadel', 'shieldwall_hall', 'phalanx_command',
       'armory', 'expanded_armory', 'royal_armory', 'grand_armory', 'war_arsenal',
       'drill_yard', 'training_grounds', 'elite_drill_grounds', 'veteran_training_grounds', 'war_college',
       'command_post', 'war_room', 'strategic_command', 'advanced_command_center', 'high_command_citadel',
       'siege_engine_workshop', 'siege_foundry', 'war_engine_forge', 'advanced_siege_workshop', 'imperial_siege_hall',
  ].includes(key)) return 'military';
  // Defense
  if (['watchtower', 'signal_tower', 'sentinel_tower', 'border_tower', 'high_watch', 'beacon_tower', 'watch_bastion',
       'palisades', 'fortified_palisades', 'wooden_ramparts', 'stone_walls', 'reinforced_walls', 'fortified_walls', 'bastion_walls', 'citadel_walls', 'fortress_walls',
       'prison', 'dungeon', 'black_cells', 'deep_prison', 'high_security_prison', 'iron_keep', 'shadow_vault',
  ].includes(key)) return 'defense';
  // Trade & Logistics
  if (['trade_post', 'market_hall', 'merchant_exchange', 'grand_bazaar', 'great_market', 'trade_consortium', 'royal_exchange', 'imperial_trade_forum',
       'logistics_depot', 'supply_depot', 'roadworks', 'quartermaster_depot', 'supply_network', 'imperial_logistics_hub', 'trade_route_office',
  ].includes(key)) return 'trade';
  // Civic (diplomacy, welfare)
  return 'civic';
};

const RESEARCH_TABS = ['all', 'economy', 'military', 'civic'] as const;
type ResearchTabId = typeof RESEARCH_TABS[number];

const RESEARCH_TAB_LABELS: Record<ResearchTabId, string> = {
  all: 'All',
  economy: 'Economy',
  military: 'Military',
  civic: 'Civic',
};

const RESEARCH_TAB_COLORS: Record<ResearchTabId, { text: string; border: string; background: string }> = {
  all:      { text: '#e2e8f0', border: 'rgba(148,163,184,0.4)',   background: 'rgba(30,41,59,0.35)' },
  economy:  { text: '#86efac', border: 'rgba(34,197,94,0.45)',    background: 'rgba(20,83,45,0.3)' },
  military: { text: '#fca5a5', border: 'rgba(239,68,68,0.45)',    background: 'rgba(127,29,29,0.3)' },
  civic:    { text: 'var(--text-gold)', border: 'rgba(var(--theme-accent-rgb),0.4)', background: 'rgba(120,53,15,0.28)' },
};

const getResearchCategory = (research: any): ResearchTabId => {
  const id = String(research?.id || '');
  if (/_hunter$|_vegetable$|_quarry$|_mine$|_research_lab$/.test(id)) return 'economy';
  if (/_militia_camp$|_stables$|_archer_range$|_swordsmith_hall$|_spear_drill_yard$|_armory$|_drill_yard$|_command_post$|_siege_engine_workshop$|_smithy$|_palisades$|_watchtower$/.test(id)) return 'military';
  return 'civic';
};

const getDayOfYear = (day: number): number => {
  return ((day - 1) % 365) + 1;
};

const getSeasonForDay = (day: number): string => {
  const dayOfYear = getDayOfYear(day);
  if (dayOfYear >= 60 && dayOfYear <= 151) return 'Spring';
  if (dayOfYear >= 152 && dayOfYear <= 243) return 'Summer';
  if (dayOfYear >= 244 && dayOfYear <= 334) return 'Autumn';
  return 'Winter';
};

const getSeasonEffects = (season: string): Record<string, number> => {
  const seasonalEffects: Record<string, Record<string, number>> = {
    Spring: { vegetables: 0.2, meat: 0.05, wood: 0.05 },
    Summer: { vegetables: 0.3, meat: 0.1, wood: -0.05 },
    Autumn: { wood: 0.2, stone: 0.1 },
    Winter: { vegetables: -0.4, wood: -0.1, meat: -0.15, faith: 0.15 },
  };
  return seasonalEffects[season] || {};
};

const formatResearchLabel = (value: string | number | null | undefined): string => {
  const raw = String(value || '').trim();
  if (!raw) return 'None';

  return raw
    .replace(/_/g, ' ')
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-zA-Z])/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const KingdomTab: React.FC<Props> = ({
  campaignId,
  players,
  characters,
  isDungeonMaster,
  userId,
  socket,
}) => {
  const [loading, setLoading] = useState(true);
  const [kingdoms, setKingdoms] = useState<KingdomSummary[]>([]);
  const [selectedFiefId, setSelectedFiefId] = useState<number | null>(null);
  // Keep a ref in sync so socket handlers always read the latest value without needing re-registration
  const [fiefDetails, setFiefDetails] = useState<KingdomFief | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{ id: number; message: string; tone: 'error' | 'success' | 'info' }[]>([]);
  const toastIdRef = React.useRef(0);
  const pushToast = React.useCallback((message: string, tone: 'error' | 'success' | 'info' = 'error') => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, message, tone }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const [showGrantModal, setShowGrantModal] = useState(false);
  const [showChildrenModal, setShowChildrenModal] = useState(false);
  const [showBuildModal, setShowBuildModal] = useState(false);
  const [showBuildQueueModal, setShowBuildQueueModal] = useState(false);
  const [buildQueueOrder, setBuildQueueOrder] = useState<number[]>([]);
  const [draggedQueueBuildingId, setDraggedQueueBuildingId] = useState<number | null>(null);
  const [showResearchModal, setShowResearchModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showConversionModal, setShowConversionModal] = useState(false);
  const [conversionInput, setConversionInput] = useState('1');
  const [releaseInput, setReleaseInput] = useState('1');
  const [selectedUpgradeBuildingId, setSelectedUpgradeBuildingId] = useState<number | null>(null);
  const [buildTab, setBuildTab] = useState<BuildTabId>('all');
  const [researchTab, setResearchTab] = useState<ResearchTabId>('all');
  const [selectedGrantPlayerIds, setSelectedGrantPlayerIds] = useState<number[]>([]);
  const [grantLocationModifiers, setGrantLocationModifiers] = useState<Record<string, number>>({});

  // ── Co-owner state ─────────────────────────────────────────────────────────
  const [coOwnerTargetKingdomId, setCoOwnerTargetKingdomId] = useState<number | null>(null);
  const [coOwnerSelectedPlayerId, setCoOwnerSelectedPlayerId] = useState<number | ''>('');

  // ── Create New Fief state ──────────────────────────────────────────────────
  const [showCreateFiefModal, setShowCreateFiefModal] = useState(false);
  const [createFiefKingdomId, setCreateFiefKingdomId] = useState<number | null>(null);
  const [newFiefName, setNewFiefName] = useState('');
  const [newFiefPop, setNewFiefPop] = useState(10);
  const [newFiefResources, setNewFiefResources] = useState({ food: 40, wood: 57, stone: 0, minerals: 0 });

  // ── DM post-creation modifiers + travel modal state ───────────────────────
  const [showFiefModifiersModal, setShowFiefModifiersModal] = useState(false);
  const [pendingFiefModifierId, setPendingFiefModifierId] = useState<number | null>(null);
  const [pendingFiefModifiers, setPendingFiefModifiers] = useState<Record<string, number>>({});
  const [pendingTravelDays, setPendingTravelDays] = useState(0);
  const [currentCampaignDay, setCurrentCampaignDay] = useState<number | null>(null);
  const [currentSeason, setCurrentSeason] = useState<'Spring' | 'Summer' | 'Autumn' | 'Winter' | null>(null);
  const [currentSeasonEffects, setCurrentSeasonEffects] = useState<Record<string, number>>({});
  const [hoveredBuilding, setHoveredBuilding] = useState<{ building: any; x: number; y: number } | null>(null);
  const selectedFiefIdRef = React.useRef<number | null>(null);

  const [managementMode, setManagementMode] = useState<ManagementMode>('fief');
  const [kingdomManagementLoading, setKingdomManagementLoading] = useState(false);
  const [legendaryCharacters, setLegendaryCharacters] = useState<LegendaryCharacter[]>([]);
  const [legendarySlotsPerFief, setLegendarySlotsPerFief] = useState(0);
  const [prayers, setPrayers] = useState<PrayerDefinition[]>([]);
  const [pooledFaith, setPooledFaith] = useState(0);
  const [tradeDepot, setTradeDepot] = useState<KingdomTradeDepot | null>(null);
  const [showLegendaryCreateModal, setShowLegendaryCreateModal] = useState(false);
  const [legendaryForm, setLegendaryForm] = useState({
    name: '',
    description: '',
    wood_bonus_pct: 0,
    stone_bonus_pct: 0,
    iron_bonus_pct: 0,
    meat_bonus_pct: 0,
    vegetables_bonus_pct: 0,
    gold_bonus_pct: 0,
    research_bonus_pct: 0,
    faith_bonus_pct: 0,
    building_bonus_pct: 0,
    population_growth_bonus_pct: 0,
    food_consumption_reduction_pct: 0,
    unit_training_speed_reduction_pct: 0,
  });
  const [selectedTrainUnitType, setSelectedTrainUnitType] = useState('Militia');
  const [trainUnitsAmount, setTrainUnitsAmount] = useState('1');
  const [upgradeAmountByUnit, setUpgradeAmountByUnit] = useState<Record<string, string>>({});
  const [dmUnitAdjustAmounts, setDmUnitAdjustAmounts] = useState<Record<string, string>>({});
  const [showProgressionModal, setShowProgressionModal] = useState(false);
  const [legendaryAssignFief, setLegendaryAssignFief] = useState<Record<number, number>>({});
  const [prayerTargetFiefId, setPrayerTargetFiefId] = useState<number | null>(null);
  const [tradeSourceFiefId, setTradeSourceFiefId] = useState<number | null>(null);
  const [tradeResourceKey, setTradeResourceKey] = useState('wood');
  const [tradeResourceAmount, setTradeResourceAmount] = useState('0');
  const [tradePopulationAmount, setTradePopulationAmount] = useState('0');
  const [tradeSlavesAmount, setTradeSlavesAmount] = useState('0');
  const [tradeDesiredText, setTradeDesiredText] = useState('');

  const fetchKingdoms = useCallback(async () => {
    try {
      const result = await kingdomAPI.getCampaignKingdoms(campaignId);
      setKingdoms(result.kingdoms || []);
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Failed to load kingdoms');
    }
  }, [campaignId, pushToast]);

  const fetchFief = useCallback(async (fiefId: number) => {
    const numericFiefId = Number(fiefId);
    if (!Number.isFinite(numericFiefId)) return;
    try {
      const result = await kingdomAPI.getFief(numericFiefId);
      setFiefDetails(result.fief);
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Failed to load fief details');
    }
  }, [pushToast]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      await Promise.all([
        fetchKingdoms(),
        campaignAPI.getCurrentDay(campaignId)
          .then((dayInfo) => {
            if (!mounted) return;
            setCurrentCampaignDay(Math.max(1, Number(dayInfo?.current_day || 1)));
            setCurrentSeason((dayInfo?.season || null) as ('Spring' | 'Summer' | 'Autumn' | 'Winter' | null));
            setCurrentSeasonEffects((dayInfo?.season_effects && typeof dayInfo.season_effects === 'object') ? dayInfo.season_effects : {});
          })
          .catch(() => {
            if (!mounted) return;
            setCurrentCampaignDay(null);
            setCurrentSeason(null);
            setCurrentSeasonEffects({});
          }),
      ]);
      if (mounted) setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [campaignId, fetchKingdoms]);

  // Keep ref in sync with state so socket handlers always use the latest fief id
  useEffect(() => {
    selectedFiefIdRef.current = selectedFiefId;
  }, [selectedFiefId]);

  useEffect(() => {
    if (!socket) return;

    const onDataChanged = (data: { campaignId: number }) => {
      if (Number(data?.campaignId) !== Number(campaignId)) return;
      fetchKingdoms();
      const currentFiefId = selectedFiefIdRef.current;
      if (currentFiefId) fetchFief(currentFiefId);
    };

    const onDayAdvanced = (data: { campaignId: number | string }) => {
      if (Number(data?.campaignId) !== Number(campaignId)) return;
      fetchKingdoms();
      const currentFiefId = selectedFiefIdRef.current;
      if (currentFiefId) fetchFief(currentFiefId);
      campaignAPI.getCurrentDay(campaignId)
        .then((dayInfo) => {
          setCurrentCampaignDay(Math.max(1, Number(dayInfo?.current_day || 1)));
          setCurrentSeason((dayInfo?.season || null) as ('Spring' | 'Summer' | 'Autumn' | 'Winter' | null));
          setCurrentSeasonEffects((dayInfo?.season_effects && typeof dayInfo.season_effects === 'object') ? dayInfo.season_effects : {});
        })
        .catch(() => {});
    };

    socket.on('kingdomDataChanged', onDataChanged);
    socket.on('dayAdvanced', onDayAdvanced);

    const onFiefCreated = (data: { campaignId: number; kingdomId: number; newFiefId: number }) => {
      if (Number(data?.campaignId) !== Number(campaignId)) return;
      fetchKingdoms();
      if (isDungeonMaster) {
        setPendingFiefModifierId(data.newFiefId);
        setPendingFiefModifiers({});
        setPendingTravelDays(0);
        setShowFiefModifiersModal(true);
      }
    };
    socket.on('fiefCreated', onFiefCreated);

    return () => {
      socket.off('kingdomDataChanged', onDataChanged);
      socket.off('dayAdvanced', onDayAdvanced);
      socket.off('fiefCreated', onFiefCreated);
    };
  }, [socket, campaignId, fetchKingdoms, fetchFief, isDungeonMaster]);

  const myKingdom = useMemo(() => {
    if (isDungeonMaster) return null;
    return kingdoms.find(
      (k) =>
        Number(k.player_id) === Number(userId) ||
        (k.co_owners || []).some((co) => Number(co.player_id) === Number(userId))
    ) || null;
  }, [kingdoms, isDungeonMaster, userId]);

  const visibleKingdoms = useMemo(
    () => (isDungeonMaster ? kingdoms : (myKingdom ? [myKingdom] : [])),
    [isDungeonMaster, kingdoms, myKingdom]
  );

  const visibleFiefs = useMemo(
    () => visibleKingdoms.flatMap((k) => k.fiefs || []),
    [visibleKingdoms]
  );

  const selectedKingdom = useMemo(() => {
    if (!visibleKingdoms.length) return null;
    if (selectedFiefId) {
      const withSelectedFief = visibleKingdoms.find((k) => (k.fiefs || []).some((f) => Number(f.id) === Number(selectedFiefId)));
      if (withSelectedFief) return withSelectedFief;
    }
    return visibleKingdoms[0] || null;
  }, [visibleKingdoms, selectedFiefId]);

  const selectedKingdomHighestTier = useMemo(() => {
    if (!selectedKingdom) return 0;
    return (selectedKingdom.fiefs || []).reduce((max, f) => Math.max(max, Number(f.tier || 0)), 0);
  }, [selectedKingdom]);

  const canUseKingdomManagement = selectedKingdomHighestTier >= 3;

  useEffect(() => {
    if (!canUseKingdomManagement && managementMode !== 'fief') {
      setManagementMode('fief');
    }
  }, [canUseKingdomManagement, managementMode]);

  // Keep the build-queue drag order in sync with the server's queue_position ordering
  // whenever fief data refreshes (skipped mid-drag so a reorder isn't stomped).
  useEffect(() => {
    if (draggedQueueBuildingId != null) return;
    const inProgress = (fiefDetails?.buildings || [])
      .filter((b: any) => !b.is_complete)
      .sort((a: any, b: any) => {
        const ap = a.queue_position == null ? Number.MAX_SAFE_INTEGER : Number(a.queue_position);
        const bp = b.queue_position == null ? Number.MAX_SAFE_INTEGER : Number(b.queue_position);
        return ap === bp ? Number(a.id) - Number(b.id) : ap - bp;
      })
      .map((b: any) => Number(b.id));
    setBuildQueueOrder(inProgress);
  }, [fiefDetails?.buildings, draggedQueueBuildingId]);

  useEffect(() => {
    if (!selectedKingdom) return;
    if (prayerTargetFiefId == null) {
      const fallback = (selectedKingdom.fiefs || [])[0];
      if (fallback) setPrayerTargetFiefId(Number(fallback.id));
    }
    if (tradeSourceFiefId == null) {
      const fallback = (selectedKingdom.fiefs || []).find((f) => f.is_capital) || (selectedKingdom.fiefs || [])[0];
      if (fallback) setTradeSourceFiefId(Number(fallback.id));
    }
  }, [selectedKingdom, prayerTargetFiefId, tradeSourceFiefId]);

  // selectedKingdom is a derived object re-created on every kingdoms refetch (which happens on any
  // player's kingdomDataChanged/dayAdvanced broadcast, not just changes to this kingdom). Depending
  // on the object itself would re-run this fetch — and flash the loading placeholder — on every one
  // of those unrelated events, so key off the stable id instead.
  const selectedKingdomId = selectedKingdom?.id ?? null;

  const fetchKingdomManagementData = useCallback(async () => {
    if (!selectedKingdomId || !canUseKingdomManagement) return;
    setKingdomManagementLoading(true);
    try {
      const [legendaryRes, prayersRes, depotRes] = await Promise.all([
        kingdomAPI.getLegendaryCharacters(Number(selectedKingdomId)),
        kingdomAPI.getPrayers(Number(selectedKingdomId)),
        kingdomAPI.getTradeDepot(Number(selectedKingdomId)),
      ]);
      setLegendaryCharacters(legendaryRes.characters || []);
      setLegendarySlotsPerFief(Math.max(0, Number(legendaryRes.slotsPerFief || 0)));
      setPrayers(prayersRes.prayers || []);
      setPooledFaith(Math.max(0, Number(prayersRes.pooledFaith || 0)));
      setTradeDepot(depotRes.depot || null);
      setTradeDesiredText(String(depotRes.depot?.desired_resource_text || ''));
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Failed to load kingdom management data');
    } finally {
      setKingdomManagementLoading(false);
    }
  }, [selectedKingdomId, canUseKingdomManagement, pushToast]);

  useEffect(() => {
    if (managementMode !== 'kingdom') return;
    fetchKingdomManagementData();
  }, [managementMode, fetchKingdomManagementData]);

  useEffect(() => {
    if (!visibleKingdoms.length) {
      setSelectedFiefId(null);
      setFiefDetails(null);
      return;
    }

    if (!visibleFiefs.length) {
      setSelectedFiefId(null);
      setFiefDetails(null);
      return;
    }

    const hasSelected = selectedFiefId && visibleFiefs.some((f) => Number(f.id) === Number(selectedFiefId));
    const defaultFief = hasSelected ? visibleFiefs.find((f) => Number(f.id) === Number(selectedFiefId)) : visibleFiefs[0];
    if (!defaultFief) return;

    if (!hasSelected) {
      setSelectedFiefId(Number(defaultFief.id));
    }

    if (Number(fiefDetails?.id) !== Number(defaultFief.id)) {
      fetchFief(Number(defaultFief.id));
    }
  }, [visibleKingdoms, visibleFiefs, selectedFiefId, fiefDetails?.id, fetchFief]);

  const hasKingdomByPlayer = useMemo(() => {
    const map = new Set<number>();
    for (const k of kingdoms) map.add(Number(k.player_id));
    return map;
  }, [kingdoms]);

  const playersById = useMemo(() => {
    const map = new Map<number, Player>();
    for (const p of players || []) {
      const id = Number(p.id);
      if (Number.isFinite(id)) map.set(id, p);
    }
    return map;
  }, [players]);

  const buildOptions = useMemo(() => {
    const currentTier = Number(fiefDetails?.tier || 1);
    return (fiefDetails?.availableBuildings || [])
      .filter((b: any) => Number(b?.tierRequired || 1) <= currentTier)
      .map((b: any) => ({
      ...b,
      __category: getBuildingCategory(b),
    }));
  }, [fiefDetails?.availableBuildings, fiefDetails?.tier]);

  const filteredBuildOptions = useMemo(() => {
    if (buildTab === 'all') return buildOptions;
    return buildOptions.filter((b: any) => b.__category === buildTab);
  }, [buildOptions, buildTab]);

  const grantRows = useMemo(() => {
    const rows: Array<{
      playerId: number | null;
      characterName: string;
      username: string;
      alreadyHasKingdom: boolean;
      canGrant: boolean;
      reason?: string;
    }> = [];
    const seen = new Set<string>();
    const seenPlayers = new Set<number>();

    for (const c of characters || []) {
      const playerId = Number(c.player_id);
      const characterName = String(c.name || '').trim();
      if (!characterName) continue;

      const hasValidPlayer = Number.isFinite(playerId) && playerId > 0;
      const safePlayerId = hasValidPlayer ? playerId : null;
      const player = hasValidPlayer ? playersById.get(playerId) : null;
      const username = player?.username || (hasValidPlayer ? `player_${playerId}` : 'unlinked-player');
      const alreadyHasKingdom = hasValidPlayer ? hasKingdomByPlayer.has(playerId) : false;
      const canGrant = Boolean(hasValidPlayer && !alreadyHasKingdom);

      let reason = '';
      if (!hasValidPlayer) reason = 'No linked player account';
      if (alreadyHasKingdom) reason = 'Already has a kingdom';

      const key = `${safePlayerId ?? 'none'}:${characterName.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (hasValidPlayer) seenPlayers.add(playerId);

      rows.push({
        playerId: safePlayerId,
        characterName,
        username,
        alreadyHasKingdom,
        canGrant,
        reason,
      });
    }

    // Include players that do not currently have a character row in the list.
    for (const p of players || []) {
      const playerId = Number(p.id);
      if (!Number.isFinite(playerId)) continue;
      if (seenPlayers.has(playerId)) continue;

      const alreadyHasKingdom = hasKingdomByPlayer.has(playerId);
      const canGrant = !alreadyHasKingdom;

      rows.push({
        playerId,
        characterName: String(p.username || `Player ${playerId}`),
        username: String(p.username || `player_${playerId}`),
        alreadyHasKingdom,
        canGrant,
        reason: alreadyHasKingdom ? 'Already has a kingdom' : '',
      });
    }

    rows.sort((a, b) => a.characterName.localeCompare(b.characterName));
    return rows;
  }, [characters, players, playersById, hasKingdomByPlayer]);

  const handleGrant = async () => {
    if (selectedGrantPlayerIds.length === 0) return;
    setBusy('grant');
    try {
      const nonZeroMods = Object.fromEntries(
        Object.entries(grantLocationModifiers).filter(([, v]) => v !== 0)
      );
      await kingdomAPI.grantKingdoms(
        campaignId,
        selectedGrantPlayerIds,
        Object.keys(nonZeroMods).length > 0 ? nonZeroMods : undefined
      );
      setShowGrantModal(false);
      setSelectedGrantPlayerIds([]);
      setGrantLocationModifiers({});
      await fetchKingdoms();
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Failed to grant kingdoms');
    } finally {
      setBusy(null);
    }
  };

  const handleDeleteKingdom = async (kingdomId: number, kingdomName?: string | null) => {
    if (!isDungeonMaster) return;
    const label = kingdomName && kingdomName.trim().length > 0 ? kingdomName : `Kingdom #${kingdomId}`;
    if (!window.confirm(`Delete ${label}? This will remove its fiefs and cannot be undone.`)) return;

    setBusy(`delete-${kingdomId}`);
    try {
      await kingdomAPI.deleteKingdom(kingdomId);
      if (selectedFiefId && kingdoms.some((k) => Number(k.id) === Number(kingdomId) && (k.fiefs || []).some((f) => Number(f.id) === Number(selectedFiefId)))) {
        setSelectedFiefId(null);
        setFiefDetails(null);
      }
      await fetchKingdoms();
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Failed to delete kingdom');
    } finally {
      setBusy(null);
    }
  };

  const handleAddCoOwner = async () => {
    if (!isDungeonMaster || !coOwnerTargetKingdomId || !coOwnerSelectedPlayerId) return;
    setBusy(`co-owner-add-${coOwnerTargetKingdomId}`);
    try {
      await kingdomAPI.addCoOwner(coOwnerTargetKingdomId, Number(coOwnerSelectedPlayerId));
      setCoOwnerTargetKingdomId(null);
      setCoOwnerSelectedPlayerId('');
      await fetchKingdoms();
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Failed to add co-owner');
    } finally {
      setBusy(null);
    }
  };

  const handleRemoveCoOwner = async (kingdomId: number, playerId: number) => {
    if (!isDungeonMaster) return;
    setBusy(`co-owner-remove-${kingdomId}-${playerId}`);
    try {
      await kingdomAPI.removeCoOwner(kingdomId, playerId);
      await fetchKingdoms();
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Failed to remove co-owner');
    } finally {
      setBusy(null);
    }
  };

  const handleCreateFief = async () => {
    if (!createFiefKingdomId) return;
    setBusy('create-fief');
    try {
      await kingdomAPI.createFief(createFiefKingdomId, newFiefName, newFiefPop, newFiefResources);
      setShowCreateFiefModal(false);
      setNewFiefName('');
      setNewFiefPop(10);
      setNewFiefResources({ food: 40, wood: 57, stone: 0, minerals: 0 });
      setCreateFiefKingdomId(null);
      await fetchKingdoms();
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Failed to create fief');
    } finally {
      setBusy(null);
    }
  };

  const handleSaveFiefModifiers = async () => {
    if (!pendingFiefModifierId) return;
    setBusy('fief-modifiers');
    try {
      await kingdomAPI.setFiefLocationModifiers(pendingFiefModifierId, {
        locationModifiers: pendingFiefModifiers,
        travelDays: pendingTravelDays,
      });
      setShowFiefModifiersModal(false);
      setPendingFiefModifierId(null);
      setPendingFiefModifiers({});
      setPendingTravelDays(0);
      await fetchKingdoms();
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Failed to save fief modifiers');
    } finally {
      setBusy(null);
    }
  };

  const resourceRows = useMemo(() => {
    if (!fiefDetails) return [] as Array<{ key: string; assigned: number; max: number }>;
    const assignments = (fiefDetails.worker_assignments || {}) as Record<string, number>;
    const unlocked = (fiefDetails.unlocked_resources || {}) as Record<string, boolean>;
    const maxMap = (fiefDetails.max_workers_per_resource || {}) as Record<string, number>;

    const rawKeys = Object.keys(assignments).length
      ? Object.keys(assignments)
      : RESOURCE_CANONICAL_ORDER;
    const keys = sortByCanonicalOrder(rawKeys, RESOURCE_CANONICAL_ORDER);

    // Resources that require an explicit unlock (building must be built before the lane is visible).
    // These start as undefined in older fiefs, so we can't rely on !== false — require === true.
    const REQUIRE_EXPLICIT_UNLOCK = new Set(['meat', 'gold']);
    return keys
      .filter((k) => (REQUIRE_EXPLICIT_UNLOCK.has(k) ? unlocked[k] === true : unlocked[k] !== false))
      .map((k) => ({ key: k, assigned: Math.max(0, Number(assignments[k] || 0)), max: Math.max(0, Number(maxMap[k] || 10)) }));
  }, [fiefDetails]);

  const slaveResourceRows = useMemo(() => {
    if (!fiefDetails) return [] as Array<{ key: string; assigned: number; max: number }>;
    const assignments = (fiefDetails.slave_worker_assignments || {}) as Record<string, number>;
    const unlocked = (fiefDetails.unlocked_resources || {}) as Record<string, boolean>;
    const maxMap = (fiefDetails.max_workers_per_resource || {}) as Record<string, number>;
    const rawKeys = Object.keys(assignments).length
      ? Object.keys(assignments)
      : SLAVE_RESOURCE_CANONICAL_ORDER;
    const keys = sortByCanonicalOrder(rawKeys, SLAVE_RESOURCE_CANONICAL_ORDER);

    const REQUIRE_EXPLICIT_UNLOCK = new Set(['meat', 'gold']);
    return keys
      .filter((k) => (REQUIRE_EXPLICIT_UNLOCK.has(k) ? unlocked[k] === true : unlocked[k] !== false))
      .map((k) => ({ key: k, assigned: Math.max(0, Number(assignments[k] || 0)), max: Math.max(0, Number(maxMap[k] || 10)) }));
  }, [fiefDetails]);

  const totalAssigned = resourceRows.reduce((sum, r) => sum + r.assigned, 0);
  const totalSlaveAssigned = slaveResourceRows.reduce((sum, r) => sum + r.assigned, 0);
  const totalPopulation = Math.max(0, Number(fiefDetails?.population || 0));
  const sickInjuredPopulation = Math.max(0, Number(fiefDetails?.sick_injured_population || 0));
  const soldiers = Math.max(0, Number(fiefDetails?.soldiers || 0));
  const prisoners = Math.max(0, Number(fiefDetails?.prisoners || 0));
  const slaves = Math.max(0, Number(fiefDetails?.slaves || 0));
  const assignablePopulation = Math.max(
    0,
    Number(
      fiefDetails?.assignable_population ??
      Math.max(0, totalPopulation - Number(fiefDetails?.underage_population || 0) - sickInjuredPopulation)
    )
  );
  const underagePopulation = Math.max(
    0,
    Number(fiefDetails?.underage_population ?? Math.max(0, totalPopulation - assignablePopulation))
  );
  const storedResources = (fiefDetails?.stored_resources || {}) as Record<string, number>;
  const storedFood = Math.max(
    0,
    Number(storedResources.food || 0) + Number(storedResources.meat || 0) + Number(storedResources.vegetables || 0)
  );
  const directFoodReductionPct = Number((fiefDetails?.legendary_bonuses || {}).food_consumption_reduction_pct || 0);
  const directFoodConsumptionMultiplier = Math.max(0, 1 - (directFoodReductionPct / 100));
  const baseDailyFoodConsumption = totalPopulation * getFoodConsumptionRateForTier(Number(fiefDetails?.tier || 1))
    + (slaves + prisoners) * 0.5;
  const dailyFoodConsumption = Math.max(0, baseDailyFoodConsumption * directFoodConsumptionMultiplier);
  const foodDaysLeftIfNoProduction = dailyFoodConsumption > 0 ? (storedFood / dailyFoodConsumption) : Number.POSITIVE_INFINITY;
  const unassignedAdults = Math.max(0, assignablePopulation - totalAssigned);

  // ── Tier 4+ gold upkeep ─────────────────────────────────────────────────
  const unitReserves = (fiefDetails?.unit_reserves || {}) as Record<string, number>;
  const militiaReserveCount = Math.max(0, Math.floor(Number(unitReserves.Militia || 0)));
  const otherSoldierReserveCount = Object.entries(unitReserves).reduce((sum, [unitType, count]) => {
    if (unitType === 'Militia') return sum;
    return sum + Math.max(0, Math.floor(Number(count || 0)));
  }, 0);
  const storedGold = Math.max(0, Number(storedResources.gold || 0));
  const dailyGoldConsumption = getDailyGoldConsumption(totalPopulation, unitReserves, Number(fiefDetails?.tier || 1));
  const goldDaysLeftIfNoProduction = dailyGoldConsumption > 0 ? (storedGold / dailyGoldConsumption) : Number.POSITIVE_INFINITY;

  // ── Tier 5+ civic stability (unrest) ────────────────────────────────────
  const currentUnrest = Math.max(0, Math.min(100, Number(fiefDetails?.unrest || 0)));
  const stabilityCapacity = useMemo(
    () => getStabilityCapacity((fiefDetails?.buildings || []).filter((b: any) => Boolean(b?.is_complete))),
    [fiefDetails?.buildings]
  );
  const unrestSupportedPopulation = getUnrestSupportedPopulation(stabilityCapacity, Number(fiefDetails?.tier || 1));
  const unrestTarget = getUnrestTarget(totalPopulation, stabilityCapacity, Number(fiefDetails?.tier || 1));
  const unrestProductionPenaltyPct = getUnrestProductionPenaltyPct(currentUnrest);
  const unrestRevoltChancePct = getUnrestRevoltChance(currentUnrest) * 100;

  const housingCapacity = useMemo(() => {
    if (fiefDetails?.housing_capacity != null) return Math.max(0, Number(fiefDetails.housing_capacity));
    // Fallback: compute from buildings if API field not present
    const completedBuildings = (fiefDetails?.buildings || []).filter((b: any) => Boolean(b?.is_complete));
    const completedResearch: string[] = fiefDetails?.completed_research || [];
    const HOUSING_CAPACITY_BY_TYPE: Record<string, number> = {
      housing: 4, wood_lodge: 8, reinforced_lodge: 12, stone_lodge: 16, longhouse_block: 20,
      manor_house: 24, townhouse_row: 28, urban_residence: 32, noble_residence: 36, royal_estate: 40,
    };
    void completedResearch;
    return completedBuildings.reduce((sum: number, b: any) => {
      const t = String(b?.building_type || '');
      return sum + (HOUSING_CAPACITY_BY_TYPE[t] || 0);
    }, 0);
  }, [fiefDetails?.housing_capacity, fiefDetails?.buildings, fiefDetails?.completed_research]);
  const hasPrisonInfrastructure = Boolean(
    (fiefDetails?.buildings || []).some((b: any) => Boolean(b?.is_complete) && [
      'prison', 'dungeon', 'black_cells', 'deep_prison', 'high_security_prison', 'iron_keep', 'shadow_vault',
    ].includes(String(b?.building_type)))
  );

  const PRISON_CAPS_BY_TYPE: Record<string, number> = useMemo(() => ({
    prison: 20, dungeon: 40, black_cells: 60, deep_prison: 80,
    high_security_prison: 100, iron_keep: 120, shadow_vault: 140,
  }), []);
  const prisonerCapacity = useMemo(() => {
    if (fiefDetails?.prisoner_capacity != null) return Math.max(0, Number(fiefDetails.prisoner_capacity));
    return (fiefDetails?.buildings || [])
      .filter((b: any) => Boolean(b?.is_complete))
      .reduce((sum: number, b: any) => sum + (PRISON_CAPS_BY_TYPE[String(b?.building_type || '')] || 0), 0);
  }, [fiefDetails?.prisoner_capacity, fiefDetails?.buildings, PRISON_CAPS_BY_TYPE]);
  const hasMilitiaBuilding = Boolean(
    (fiefDetails?.trainable_unit_types || []).length > 0 || Object.keys(fiefDetails?.unit_reserves || {}).length > 0
  );

  const maturationSchedule = useMemo(() => {
    const source = (fiefDetails?.population_maturation_schedule && typeof fiefDetails.population_maturation_schedule === 'object')
      ? fiefDetails.population_maturation_schedule
      : {};
    const normalized: Record<string, number> = {};
    for (const [dayRaw, countRaw] of Object.entries(source)) {
      const day = Math.floor(Number(dayRaw));
      const count = Math.max(0, Math.floor(Number(countRaw) || 0));
      if (Number.isFinite(day) && day > 0 && count > 0) {
        normalized[String(day)] = count;
      }
    }
    return normalized;
  }, [fiefDetails?.population_maturation_schedule]);

  const nextMaturityDays = useMemo(() => {
    if (!currentCampaignDay) return null;
    const maturityDays = Object.keys(maturationSchedule)
      .map((k) => Math.floor(Number(k)))
      .filter((n) => Number.isFinite(n) && n >= currentCampaignDay)
      .sort((a, b) => a - b);
    if (maturityDays.length === 0) return null;
    return Math.max(0, maturityDays[0] - currentCampaignDay);
  }, [maturationSchedule, currentCampaignDay]);

  const childrenByAgeYears = useMemo(() => {
    if (!currentCampaignDay) return [] as Array<{ ageYears: number; count: number }>;
    const grouped = new Map<number, number>();

    for (const [maturityDayRaw, countRaw] of Object.entries(maturationSchedule)) {
      const maturityDay = Math.floor(Number(maturityDayRaw));
      const count = Math.max(0, Math.floor(Number(countRaw) || 0));
      if (!Number.isFinite(maturityDay) || count <= 0) continue;

      const daysUntilMature = Math.max(0, maturityDay - currentCampaignDay);
      const ageDays = Math.max(0, POPULATION_MATURITY_DAYS - daysUntilMature);
      const ageYears = Math.min(14, Math.max(0, Math.floor(ageDays / 365)));
      grouped.set(ageYears, (grouped.get(ageYears) || 0) + count);
    }

    return Array.from(grouped.entries())
      .map(([ageYears, count]) => ({ ageYears, count }))
      .sort((a, b) => a.ageYears - b.ageYears);
  }, [maturationSchedule, currentCampaignDay]);

  const fiefLegendaryBonuses = useMemo(() => {
    const direct = (fiefDetails?.legendary_bonuses && typeof fiefDetails.legendary_bonuses === 'object')
      ? fiefDetails.legendary_bonuses as Record<string, number>
      : null;
    if (direct) {
      const normalized: Record<string, number> = {};
      for (const [key, raw] of Object.entries(direct)) {
        const value = Number(raw || 0);
        if (!Number.isFinite(value) || value === 0) continue;
        normalized[key] = value;
      }
      return normalized;
    }

    const totals: Record<string, number> = {};
    const currentFiefId = Number(fiefDetails?.id || 0);
    if (!currentFiefId) return totals;

    for (const item of (legendaryCharacters || [])) {
      if (Number(item.assigned_fief_id || 0) !== currentFiefId) continue;
      const bonuses = (item.bonuses && typeof item.bonuses === 'object') ? item.bonuses : {};
      for (const [key, raw] of Object.entries(bonuses)) {
        const value = Number(raw || 0);
        if (!Number.isFinite(value) || value === 0) continue;
        totals[key] = (Number(totals[key] || 0) + value);
      }
    }

    return totals;
  }, [fiefDetails?.id, fiefDetails?.legendary_bonuses, legendaryCharacters]);

  const productionByLane = useMemo(() => {
    const output: Record<string, number> = {
      meat: 0,
      vegetables: 0,
      wood: 0,
      stone: 0,
      iron: 0,
      gold: 0,
      research: 0,
      faith: 0,
      building: 0,
    };
    if (!fiefDetails) {
      return {
        output,
        foodBreakdown: { vegetables: 0, meat: 0, total: 0, consumption: 0, net: 0 },
      };
    }

    const assignments = (fiefDetails.worker_assignments || {}) as Record<string, number>;
    const slaveAssignments = (fiefDetails.slave_worker_assignments || {}) as Record<string, number>;
    const completedBuildings = (fiefDetails.buildings || []).filter((b: any) => Boolean(b.is_complete));
    const completedResearch = ((fiefDetails.completed_research || []) as string[]).map((r) => String(r));
    const tierWorkerYieldMultiplier = getTierWorkerYieldMultiplier(Number(fiefDetails.tier || 1));
    const hunterResearchMultiplier = getResearchWorkerYieldMultiplier(completedResearch, 'meat');
    const vegetableResearchMultiplier = getResearchWorkerYieldMultiplier(completedResearch, 'vegetables');
    const seasonEffects = (currentSeasonEffects && typeof currentSeasonEffects === 'object') ? currentSeasonEffects : {};
    const logisticsLevel = completedBuildings.filter((b: any) => LOGISTICS_BUILDING_TYPES.has(String(b?.building_type || ''))).length;
    const logisticsBonus = Math.max(0, logisticsLevel) * 0.05;
    const locationMods = (fiefDetails.location_modifiers && typeof fiefDetails.location_modifiers === 'object')
      ? fiefDetails.location_modifiers as Record<string, number>
      : {};
    const LOGISTICS_MOD_KEYS = new Set(['meat', 'vegetables', 'wood', 'stone', 'iron', 'gold', 'research', 'faith']);
    // All modifiers (seasonal + logistics + location) are summed then applied as a single multiplier
    const applyAllModifiers = (resourceKey: string, amount: number) => {
      const seasonKey = resourceKey === 'iron' ? 'minerals' : resourceKey;
      const seasonMod = Number((seasonEffects as Record<string, number>)[seasonKey] || 0);
      const locationMod = Number(locationMods[resourceKey] || 0);
      const logMod = LOGISTICS_MOD_KEYS.has(resourceKey) ? logisticsBonus : 0;
      const totalMod = seasonMod + locationMod + logMod;
      if (totalMod === 0) return amount;
      return Math.max(0, amount * (1 + totalMod));
    };

    const LEGENDARY_BONUS_KEY_BY_RESOURCE: Record<string, string> = {
      wood: 'wood_bonus_pct',
      stone: 'stone_bonus_pct',
      iron: 'iron_bonus_pct',
      meat: 'meat_bonus_pct',
      vegetables: 'vegetables_bonus_pct',
      gold: 'gold_bonus_pct',
      research: 'research_bonus_pct',
      faith: 'faith_bonus_pct',
      building: 'building_bonus_pct',
    };

    const applyLegendaryBonus = (resourceKey: string, amount: number) => {
      const bonusKey = LEGENDARY_BONUS_KEY_BY_RESOURCE[resourceKey];
      if (!bonusKey) return amount;
      const pct = Number(fiefLegendaryBonuses[bonusKey] || 0);
      if (!Number.isFinite(pct) || pct === 0) return amount;
      return Math.max(0, amount * (1 + (pct / 100)));
    };

    const workersMeat = Math.max(0, Number(assignments.meat || 0)) + Math.max(0, Number(assignments.food || 0));
    const workersVegetables = Math.max(0, Number(assignments.vegetables || 0));
    const workersWood = Math.max(0, Number(assignments.wood || 0));
    const workersStone = Math.max(0, Number(assignments.stone || 0));
    const workersIron = Math.max(0, Number(assignments.iron || 0));
    const workersMinerals = Math.max(0, Number(assignments.minerals || 0));
    const workersGold = Math.max(0, Number(assignments.gold || 0));
    const workersResearch = Math.max(0, Number(assignments.research || 0));
    const workersFaith = Math.max(0, Number(assignments.faith || 0));

    const slaveMeat = Math.max(0, Number(slaveAssignments.meat || 0));
    const slaveWood = Math.max(0, Number(slaveAssignments.wood || 0));
    const slaveStone = Math.max(0, Number(slaveAssignments.stone || 0));
    const slaveIron = Math.max(0, Number(slaveAssignments.iron || 0));
    const slaveGold = Math.max(0, Number(slaveAssignments.gold || 0));
    const slaveBuilding = Math.max(0, Number(slaveAssignments.building || 0));

    // Use server-tracked vegetable phase state to show accurate cycle behavior.
    const harvestState = (fiefDetails?.vegetable_harvest_state || {
      phase: 'assigning',
      day_in_phase: 0,
      locked_workers: 0,
      day_in_cycle: 0,
      accumulated_worker_days: 0,
    }) as { phase?: string; day_in_phase?: number; locked_workers?: number; day_in_cycle?: number; accumulated_worker_days?: number };
    const vegetablePhase = String(harvestState.phase || 'assigning').toLowerCase();
    const vegetableDayInPhase = Math.max(0, Number(harvestState.day_in_phase || 0));
    const lockedVegetableWorkers = Math.max(0, Number(harvestState.locked_workers || 0));
    const activeHarvestWorkers = vegetablePhase === 'harvesting' ? lockedVegetableWorkers : 0;

    const effectiveHarvestWorkers = computeTieredWorkerOutput(activeHarvestWorkers, completedBuildings, VEG_BUILDING_CHAIN);
    const vegetablesFromWorkers = effectiveHarvestWorkers
      * tierWorkerYieldMultiplier
      * vegetableResearchMultiplier
      * VEGETABLE_HARVEST_PER_WORKER_PER_DAY;

    let daysLeftInCycle = 0;
    if (vegetablePhase === 'assigning') {
      daysLeftInCycle = Math.max(0, (VEGETABLE_ASSIGNMENT_DAYS - vegetableDayInPhase) + VEGETABLE_GROWTH_DAYS);
    } else if (vegetablePhase === 'growing') {
      daysLeftInCycle = Math.max(0, VEGETABLE_GROWTH_DAYS - vegetableDayInPhase);
    }
    const nextDayIsHarvest = daysLeftInCycle <= 1;

    const projectedWorkerBase = vegetablePhase === 'harvesting'
      ? (vegetablesFromWorkers * Math.max(0, VEGETABLE_HARVEST_DAYS - vegetableDayInPhase))
      : (
          computeTieredWorkerOutput(
            vegetablePhase === 'assigning' ? workersVegetables : lockedVegetableWorkers,
            completedBuildings,
            VEG_BUILDING_CHAIN
          )
          * tierWorkerYieldMultiplier
          * vegetableResearchMultiplier
          * VEGETABLE_HARVEST_PER_WORKER_PER_DAY
          * VEGETABLE_HARVEST_DAYS
        );
    const projectedVegetableYield = applyAllModifiers('vegetables', projectedWorkerBase);

    let vegetables = vegetablesFromWorkers;
    let meat = computeTieredWorkerOutput(workersMeat + slaveMeat, completedBuildings, MEAT_BUILDING_CHAIN) * tierWorkerYieldMultiplier * hunterResearchMultiplier;
    output.wood += (workersWood + slaveWood) * tierWorkerYieldMultiplier;
    output.stone += (workersStone + slaveStone) * tierWorkerYieldMultiplier;
    output.iron += (workersIron + slaveIron + (workersMinerals * 0.5)) * tierWorkerYieldMultiplier;
    output.gold += (workersGold + slaveGold) * tierWorkerYieldMultiplier;
    output.research += workersResearch;
    output.faith += (workersFaith * 0.5) * tierWorkerYieldMultiplier;
    const buildersHutCount = completedBuildings.filter((b: any) => String(b?.building_type || '') === 'builders_hut').length;
    output.building += Math.max(0, Number(assignments.building || 0)) + slaveBuilding + (buildersHutCount * 3);

    for (const building of completedBuildings) {
      const buildingOutput = (building?.resource_output && typeof building.resource_output === 'object')
        ? building.resource_output
        : {};
      for (const [resource, raw] of Object.entries(buildingOutput)) {
        const amount = Math.max(0, Number(raw || 0));
        if (resource === 'vegetables') {
          if (vegetablePhase === 'harvesting') vegetables += amount;
        }
        else if (resource === 'meat') meat += amount;
        else if (resource === 'food') vegetables += amount;
        else if (resource === 'wood') output.wood += amount;
        else if (resource === 'stone') output.stone += amount;
        else if (resource === 'minerals' || resource === 'iron') output.iron += amount;
        else if (resource === 'research') output.research += amount;
        else if (resource === 'faith') output.faith += amount;
        else if (resource === 'gold') output.gold += amount;
      }
    }

    output.vegetables = applyLegendaryBonus('vegetables', applyAllModifiers('vegetables', vegetables));
    output.meat = applyLegendaryBonus('meat', applyAllModifiers('meat', meat));
    output.wood = applyLegendaryBonus('wood', applyAllModifiers('wood', output.wood));
    output.stone = applyLegendaryBonus('stone', applyAllModifiers('stone', output.stone));
    output.iron = applyLegendaryBonus('iron', applyAllModifiers('iron', output.iron));
    output.gold = applyLegendaryBonus('gold', applyAllModifiers('gold', output.gold));
    output.faith = applyLegendaryBonus('faith', applyAllModifiers('faith', output.faith));
    output.research = applyLegendaryBonus('research', applyAllModifiers('research', output.research));
    output.building = applyLegendaryBonus('building', applyAllModifiers('building', output.building));

    const foodTotal = output.vegetables + output.meat;
    const foodConsumptionReductionPct = Number(fiefLegendaryBonuses.food_consumption_reduction_pct || 0);
    const consumptionMultiplier = Math.max(0, 1 - (foodConsumptionReductionPct / 100));
    const consumption = (
      totalPopulation * getFoodConsumptionRateForTier(Number(fiefDetails?.tier || 1))
      + (slaves + prisoners) * 0.5
    ) * consumptionMultiplier;
    const net = foodTotal - consumption;

    return {
      output,
      foodBreakdown: {
        vegetables,
        meat,
        total: foodTotal,
        consumption,
        net,
        nextDayIsHarvest,
        projectedVegetableYield,
        daysLeftInCycle,
        vegetablePhase,
        logisticsLevel,
      },
    };
  }, [fiefDetails, totalPopulation, currentSeasonEffects, slaves, prisoners, fiefLegendaryBonuses]);

  const researchQueue = useMemo(() => {
    return [...(fiefDetails?.researchQueue || [])].sort((a, b) => {
      const ap = a.queue_position == null ? Number.MAX_SAFE_INTEGER : Number(a.queue_position);
      const bp = b.queue_position == null ? Number.MAX_SAFE_INTEGER : Number(b.queue_position);
      return ap === bp ? Number(a.id) - Number(b.id) : ap - bp;
    });
  }, [fiefDetails]);

  const upgradeByBuildingId = useMemo(() => {
    const map = new Map<number, any>();
    for (const upgrade of (fiefDetails?.availableUpgrades || [])) {
      map.set(Number(upgrade.buildingId), upgrade);
    }
    return map;
  }, [fiefDetails?.availableUpgrades]);

  // Maps a unit type (e.g. "Longbowman") to its progression line key (e.g. "Archer") for grouping panels.
  const unitTypeToLine = useMemo(() => {
    const map = new Map<string, string>();
    for (const line of (fiefDetails?.unit_progression || [])) {
      for (const tier of (line.tiers || [])) {
        map.set(tier.unit_type, line.line_key);
      }
    }
    return map;
  }, [fiefDetails?.unit_progression]);

  // Splits unit_progression into "primary" single-building lines and "hybrid" lines whose tiers
  // require more than one building (e.g. Horse Archer, Lancer) — hybrids are rendered as a branch
  // row under every primary line whose building chain they draw from, instead of their own panel.
  const progressionRenderModel = useMemo(() => {
    const lines = fiefDetails?.unit_progression || [];
    const isHybrid = (line: typeof lines[number]) => line.tiers.some((t) => t.required_buildings.length > 1);
    const primaryLines = lines.filter((l) => !isHybrid(l));
    const hybridLines = lines.filter(isHybrid);

    const buildingOwnerLine = new Map<string, string>();
    for (const line of primaryLines) {
      for (const tier of line.tiers) {
        for (const rb of tier.required_buildings) {
          buildingOwnerLine.set(rb.building_type, line.line_key);
        }
      }
    }

    const branchesByParent = new Map<string, typeof hybridLines>();
    for (const hybrid of hybridLines) {
      const parentKeys = new Set<string>();
      for (const tier of hybrid.tiers) {
        for (const rb of tier.required_buildings) {
          const owner = buildingOwnerLine.get(rb.building_type);
          if (owner) parentKeys.add(owner);
        }
      }
      for (const parentKey of parentKeys) {
        if (!branchesByParent.has(parentKey)) branchesByParent.set(parentKey, []);
        branchesByParent.get(parentKey)!.push(hybrid);
      }
    }

    // Reference column count for right-aligning branches, taken from the longest primary line rather
    // than the specific parent — so a branch attached to a short base (e.g. Covert's 2-tier Street
    // Informant/Infiltrator) still lands in its true tier-3/4 columns instead of overlapping columns 0-1.
    const maxPrimaryTierCount = primaryLines.reduce((max, l) => Math.max(max, l.tiers.length), 0);

    return { primaryLines, branchesByParent, maxPrimaryTierCount };
  }, [fiefDetails?.unit_progression]);

  const hasCompletedResearchLab = useMemo(
    () => (fiefDetails?.buildings || []).some((b: any) => Boolean(b?.is_complete) && RESEARCH_BUILDING_CHAIN.includes(String(b?.building_type))),
    [fiefDetails?.buildings]
  );

  const formatSigned = (value: number) => (value >= 0 ? `+${value.toFixed(1)}` : value.toFixed(1));

  const submitWorkers = async (next: Record<string, number>) => {
    if (!fiefDetails) return;
    setBusy('workers');
    try {
      const result = await kingdomAPI.updateWorkers(Number(fiefDetails.id), next);
      setFiefDetails((prev) => (prev ? { ...prev, worker_assignments: result.fief.worker_assignments || next } : prev));
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Failed to update workers');
      await fetchFief(Number(fiefDetails.id));
    } finally {
      setBusy(null);
    }
  };

  const adjustWorkers = async (resource: string, delta: number) => {
    if (!fiefDetails) return;
    const current = { ...((fiefDetails.worker_assignments || {}) as Record<string, number>) };
    const maxMap = (fiefDetails.max_workers_per_resource || {}) as Record<string, number>;
    const laneMax = Math.max(0, Number(maxMap[resource] || 10));
    const before = Math.max(0, Number(current[resource] || 0));

    const otherAssigned = Object.entries(current)
      .filter(([k]) => k !== resource)
      .reduce((sum, [, v]) => sum + Math.max(0, Number(v || 0)), 0);

    let target = before + delta;
    target = Math.max(0, Math.min(laneMax, target));
    target = Math.min(target, Math.max(0, assignablePopulation - otherAssigned));
    if (target === before) return;

    current[resource] = target;
    await submitWorkers(current);
  };

  const submitSlaveWorkers = async (next: Record<string, number>) => {
    if (!fiefDetails) return;
    setBusy('slave-workers');
    try {
      const result = await kingdomAPI.updateSlaveWorkers(Number(fiefDetails.id), next);
      setFiefDetails((prev) => (
        prev
          ? {
              ...prev,
              slave_worker_assignments: result.fief.slave_worker_assignments || next,
              slaves: result.fief.slaves,
            }
          : prev
      ));
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Failed to update slave workers');
      await fetchFief(Number(fiefDetails.id));
    } finally {
      setBusy(null);
    }
  };

  const adjustSlaveWorkers = async (resource: string, delta: number) => {
    if (!fiefDetails) return;
    const current = { ...((fiefDetails.slave_worker_assignments || {}) as Record<string, number>) };
    const maxMap = (fiefDetails.max_workers_per_resource || {}) as Record<string, number>;
    const laneMax = Math.max(0, Number(maxMap[resource] || 10));
    const before = Math.max(0, Number(current[resource] || 0));

    const otherAssigned = Object.entries(current)
      .filter(([k]) => k !== resource)
      .reduce((sum, [, v]) => sum + Math.max(0, Number(v || 0)), 0);

    const slavePool = Math.max(0, Number(fiefDetails.slaves || 0));
    let target = before + delta;
    target = Math.max(0, Math.min(laneMax, target));
    target = Math.min(target, Math.max(0, slavePool - otherAssigned));
    if (target === before) return;

    current[resource] = target;
    await submitSlaveWorkers(current);
  };

  const unassignAllCitizenWorkers = async () => {
    if (!fiefDetails) return;
    const current = { ...((fiefDetails.worker_assignments || {}) as Record<string, number>) };
    const phase = String((fiefDetails.vegetable_harvest_state as any)?.phase || 'assigning').toLowerCase();
    const canClearVegetables = phase === 'assigning';

    let changed = false;
    const next: Record<string, number> = { ...current };
    for (const key of Object.keys(next)) {
      if (key === 'vegetables' && !canClearVegetables) continue;
      if (Math.max(0, Number(next[key] || 0)) > 0) {
        next[key] = 0;
        changed = true;
      }
    }

    if (!changed) {
      pushToast(canClearVegetables ? 'No citizen workers are currently assigned.' : 'No removable citizen workers are currently assigned.', 'info');
      return;
    }

    await submitWorkers(next);
    if (!canClearVegetables && Math.max(0, Number(current.vegetables || 0)) > 0) {
      pushToast('Cleared all available citizen lanes. Vegetable workers stay locked until assignment phase.', 'success');
    }
  };

  const unassignAllSlaveWorkers = async () => {
    if (!fiefDetails) return;
    const current = { ...((fiefDetails.slave_worker_assignments || {}) as Record<string, number>) };
    const next: Record<string, number> = {};
    let changed = false;

    for (const key of Object.keys(current)) {
      const value = Math.max(0, Number(current[key] || 0));
      next[key] = 0;
      if (value > 0) changed = true;
    }

    if (!changed) {
      pushToast('No slave workers are currently assigned.');
      return;
    }

    await submitSlaveWorkers(next);
  };

  useEffect(() => {
    const trainable = fiefDetails?.trainable_unit_types || [];
    if (trainable.length > 0 && !trainable.includes(selectedTrainUnitType)) {
      setSelectedTrainUnitType(trainable[0]);
    }
  }, [fiefDetails?.trainable_unit_types, selectedTrainUnitType]);

  const trainSoldiers = async () => {
    if (!fiefDetails) return;
    const amount = Math.max(0, Math.floor(Number(trainUnitsAmount) || 0));
    if (amount <= 0) {
      pushToast('Enter a positive whole number.');
      return;
    }

    const unitType = String(selectedTrainUnitType || 'Militia').trim();
    if (!unitType) {
      pushToast('Select a unit type to train.');
      return;
    }

    setBusy('train-soldiers');
    try {
      await kingdomAPI.trainUnits(Number(fiefDetails.id), unitType, amount);
      await fetchFief(Number(fiefDetails.id));
      setTrainUnitsAmount('1');
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Failed to queue unit training');
    } finally {
      setBusy(null);
    }
  };

  const collectTrainedUnits = async () => {
    if (!fiefDetails) return;
    setBusy('collect-units');
    try {
      const result = await kingdomAPI.collectTrainedUnits(Number(fiefDetails.id));
      if (Number(result?.collected || 0) > 0) {
        pushToast(`Collected ${Number(result.collected)} trained units.`, 'success');
      } else {
        pushToast('No completed units to collect yet.', 'info');
      }
      await fetchFief(Number(fiefDetails.id));
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Failed to collect trained units');
    } finally {
      setBusy(null);
    }
  };

  const upgradeMilitiaUnits = async (fromUnitType: string, amount: number, toUnitType?: string) => {
    if (!fiefDetails) return;
    if (amount <= 0) {
      pushToast('Enter a positive whole number.');
      return;
    }
    if (!fromUnitType) {
      pushToast('Choose a unit to upgrade.');
      return;
    }

    setBusy(`upgrade-units-${fromUnitType}-${toUnitType || ''}`);
    try {
      await kingdomAPI.upgradeUnit(Number(fiefDetails.id), fromUnitType, amount, toUnitType);
      await fetchFief(Number(fiefDetails.id));
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Failed to queue unit upgrade');
    } finally {
      setBusy(null);
    }
  };

  // Applies every non-zero unit amount entered in the DM Unit Controls panel in a single request.
  // direction flips the sign of every entered amount (magnitudes are entered as positive numbers).
  const dmAddUnitsBatch = async (direction: 1 | -1) => {
    if (!fiefDetails || !isDungeonMaster) return;
    const adjustments: Record<string, number> = {};
    for (const [unitType, raw] of Object.entries(dmUnitAdjustAmounts)) {
      const delta = Math.floor(Math.abs(Number(raw) || 0)) * direction;
      if (delta !== 0) adjustments[unitType] = delta;
    }
    if (Object.keys(adjustments).length === 0) {
      pushToast('Enter at least one non-zero amount.');
      return;
    }

    setBusy('dm-adjust-units');
    try {
      await kingdomAPI.adjustUnitReservesBatch(Number(fiefDetails.id), adjustments);
      await fetchFief(Number(fiefDetails.id));
      await fetchKingdoms();
      setDmUnitAdjustAmounts({});
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Failed to adjust units');
    } finally {
      setBusy(null);
    }
  };

  const adjustBuildingGuardsDirect = async (buildingType: string, unitType: string, delta: number) => {
    if (!fiefDetails) return;
    const normalizedType = String(unitType || '').trim();
    if (!normalizedType || delta === 0) return;

    setBusy(`guards-${buildingType}`);
    try {
      await kingdomAPI.adjustBuildingGuards(Number(fiefDetails.id), buildingType, normalizedType, delta);
      await fetchFief(Number(fiefDetails.id));
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Failed to update guard assignment');
    } finally {
      setBusy(null);
    }
  };

  const executeConversion = async () => {
    if (!fiefDetails) return;
    const amount = Math.max(0, Math.floor(Number(conversionInput) || 0));
    if (amount <= 0) { pushToast('Enter a positive whole number.'); return; }
    setBusy('convert-prisoners');
    try {
      await kingdomAPI.convertPrisoners(Number(fiefDetails.id), amount);
      await fetchFief(Number(fiefDetails.id));
      setConversionInput('1');
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Failed to convert prisoners');
    } finally {
      setBusy(null);
    }
  };

  const executeRelease = async () => {
    if (!fiefDetails) return;
    const amount = Math.max(0, Math.floor(Number(releaseInput) || 0));
    if (amount <= 0) { pushToast('Enter a positive whole number.'); return; }
    setBusy('release-slaves');
    try {
      await kingdomAPI.releaseSlaves(Number(fiefDetails.id), amount);
      await fetchFief(Number(fiefDetails.id));
      setReleaseInput('1');
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Failed to release slaves');
    } finally {
      setBusy(null);
    }
  };

  const dmAdjustPrisoners = async (direction: 1 | -1) => {
    if (!fiefDetails || !isDungeonMaster) return;
    const label = direction > 0 ? 'add' : 'remove';
    const input = window.prompt(`How many prisoners to ${label}?`, '1');
    if (input == null) return;
    const amount = Math.floor(Number(input));
    if (!Number.isFinite(amount) || amount <= 0) { pushToast('Enter a valid positive whole number.'); return; }
    setBusy('dm-adjust');
    try {
      await kingdomAPI.adjustPrisoners(Number(fiefDetails.id), direction * amount);
      await fetchFief(Number(fiefDetails.id));
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Failed to adjust prisoners');
    } finally {
      setBusy(null);
    }
  };

  const queueBuilding = async (buildingType: string) => {
    if (!fiefDetails) return;
    setBusy(`build-${buildingType}`);
    try {
      await kingdomAPI.queueBuilding(Number(fiefDetails.id), buildingType);
      setShowBuildModal(false);
      await fetchFief(Number(fiefDetails.id));
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Failed to queue building');
    } finally {
      setBusy(null);
    }
  };

  const cancelQueuedBuilding = async (buildingId: number, isUpgrade: boolean) => {
    if (!fiefDetails) return;
    const confirmMsg = isUpgrade
      ? 'Cancel this upgrade? It will revert to its pre-upgrade form. Resources already spent are not refunded.'
      : 'Cancel this build? The building will be destroyed. Resources already spent are not refunded.';
    if (!window.confirm(confirmMsg)) return;
    setBusy(`cancel-building-${buildingId}`);
    try {
      await kingdomAPI.cancelBuilding(Number(fiefDetails.id), buildingId);
      await fetchFief(Number(fiefDetails.id));
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Failed to cancel build');
    } finally {
      setBusy(null);
    }
  };

  const commitBuildQueueReorder = async (order: number[]) => {
    if (!fiefDetails) return;
    setBuildQueueOrder(order);
    try {
      await kingdomAPI.reorderBuildQueue(Number(fiefDetails.id), order);
      await fetchFief(Number(fiefDetails.id));
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Failed to reorder build queue');
      await fetchFief(Number(fiefDetails.id));
    }
  };

  const getStoredAmountForCostResource = (resource: string) => {
    const stored = (fiefDetails?.stored_resources || {}) as Record<string, number>;
    const key = resource === 'iron' ? 'minerals' : resource;
    return Math.max(0, Number(stored[key] || 0));
  };

  const startResearch = async (researchId: string) => {
    if (!fiefDetails) return;
    setBusy(`research-${researchId}`);
    try {
      await kingdomAPI.startResearch(Number(fiefDetails.id), researchId);
      await fetchFief(Number(fiefDetails.id));
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Failed to start research');
    } finally {
      setBusy(null);
    }
  };

  const startTierUpgrade = async () => {
    if (!fiefDetails) return;
    setBusy('upgrade');
    try {
      await kingdomAPI.startTierUpgrade(Number(fiefDetails.id));
      await fetchFief(Number(fiefDetails.id));
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Failed to start tier upgrade');
    } finally {
      setBusy(null);
    }
  };

  const startTier3Upgrade = async () => {
    if (!fiefDetails) return;
    setBusy('upgrade-tier3');
    try {
      await kingdomAPI.startTier3Upgrade(Number(fiefDetails.id));
      await fetchFief(Number(fiefDetails.id));
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Failed to start tier 3 upgrade');
    } finally {
      setBusy(null);
    }
  };

  const startTier4Upgrade = async () => {
    if (!fiefDetails) return;
    setBusy('upgrade-tier4');
    try {
      await kingdomAPI.startTier4Upgrade(Number(fiefDetails.id));
      await fetchFief(Number(fiefDetails.id));
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Failed to start tier 4 upgrade');
    } finally {
      setBusy(null);
    }
  };

  const startTier5Upgrade = async () => {
    if (!fiefDetails) return;
    setBusy('upgrade-tier5');
    try {
      await kingdomAPI.startTier5Upgrade(Number(fiefDetails.id));
      await fetchFief(Number(fiefDetails.id));
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Failed to start tier 5 upgrade');
    } finally {
      setBusy(null);
    }
  };

  const upgradeBuilding = async (buildingId: number) => {
    if (!fiefDetails) return;
    setBusy(`upgrade-building-${buildingId}`);
    try {
      await kingdomAPI.upgradeBuilding(Number(fiefDetails.id), Number(buildingId));
      await fetchFief(Number(fiefDetails.id));
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Failed to upgrade building');
    } finally {
      setBusy(null);
    }
  };

  const dmSetResourceAmount = async (resourceKey: string, currentAmount: number) => {
    if (!fiefDetails || !isDungeonMaster) return;

    const input = window.prompt(`Set ${resourceKey} amount`, String(Number(currentAmount || 0).toFixed(1)));
    if (input == null) return;

    const parsed = Number(input);
    if (!Number.isFinite(parsed) || parsed < 0) {
      pushToast('Please enter a valid non-negative number.');
      return;
    }

    setBusy('dm-adjust');
    try {
      await kingdomAPI.dmAdjustFief(Number(fiefDetails.id), {
        resourceUpdates: { [resourceKey]: parsed },
      });
      await fetchFief(Number(fiefDetails.id));
      await fetchKingdoms();
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Failed to update resource amount');
    } finally {
      setBusy(null);
    }
  };

  const handleGiveBirth = async () => {
    if (!fiefDetails || !isDungeonMaster) return;
    setBusy('give-birth');
    try {
      await kingdomAPI.giveBirth(Number(fiefDetails.id));
      await fetchFief(Number(fiefDetails.id));
      await fetchKingdoms();
      pushToast('A child was born!', 'success');
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Failed to give birth');
    } finally {
      setBusy(null);
    }
  };

  const dmAdjustPopulation = async (direction: 1 | -1) => {
    if (!fiefDetails || !isDungeonMaster) return;

    const actionLabel = direction > 0 ? 'increase' : 'decrease';
    const input = window.prompt(`How much should population ${actionLabel}?`, '1');
    if (input == null) return;

    const amount = Math.floor(Number(input));
    if (!Number.isFinite(amount) || amount <= 0) {
      pushToast('Please enter a valid positive whole number.');
      return;
    }

    setBusy('dm-adjust');
    try {
      await kingdomAPI.dmAdjustFief(Number(fiefDetails.id), {
        populationDelta: direction * amount,
      });
      await fetchFief(Number(fiefDetails.id));
      await fetchKingdoms();
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Failed to update population');
    } finally {
      setBusy(null);
    }
  };

  const fiefLegendaryCount = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const item of (legendaryCharacters || [])) {
      const fid = Number(item.assigned_fief_id || 0);
      if (!Number.isFinite(fid) || fid <= 0) continue;
      counts[fid] = (counts[fid] || 0) + 1;
    }
    return counts;
  }, [legendaryCharacters]);

  const legendaryByFief = useMemo(() => {
    const map: Record<number, LegendaryCharacter[]> = {};
    for (const item of (legendaryCharacters || [])) {
      const fid = Number(item.assigned_fief_id || 0);
      if (!Number.isFinite(fid) || fid <= 0) continue;
      if (!map[fid]) map[fid] = [];
      map[fid].push(item);
    }
    Object.values(map).forEach((arr) => arr.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))));
    return map;
  }, [legendaryCharacters]);

  const tradeResourceEntries = useMemo(() => {
    const entries = Object.entries(tradeDepot?.resources || {})
      .filter(([, v]) => Number(v || 0) > 0)
      .sort(([a], [b]) => a.localeCompare(b));
    return entries;
  }, [tradeDepot]);

  const createLegendaryCharacter = async () => {
    if (!selectedKingdom || !isDungeonMaster) return;
    if (!legendaryForm.name.trim()) {
      pushToast('Legendary character name is required');
      return;
    }

    setBusy('legendary-create');
    try {
      const payload = {
        name: legendaryForm.name.trim(),
        description: legendaryForm.description.trim(),
        bonuses: {
          wood_bonus_pct: Number(legendaryForm.wood_bonus_pct || 0),
          stone_bonus_pct: Number(legendaryForm.stone_bonus_pct || 0),
          iron_bonus_pct: Number(legendaryForm.iron_bonus_pct || 0),
          meat_bonus_pct: Number(legendaryForm.meat_bonus_pct || 0),
          vegetables_bonus_pct: Number(legendaryForm.vegetables_bonus_pct || 0),
          gold_bonus_pct: Number(legendaryForm.gold_bonus_pct || 0),
          research_bonus_pct: Number(legendaryForm.research_bonus_pct || 0),
          faith_bonus_pct: Number(legendaryForm.faith_bonus_pct || 0),
          building_bonus_pct: Number(legendaryForm.building_bonus_pct || 0),
          population_growth_bonus_pct: Number(legendaryForm.population_growth_bonus_pct || 0),
          food_consumption_reduction_pct: Number(legendaryForm.food_consumption_reduction_pct || 0),
          unit_training_speed_reduction_pct: Number(legendaryForm.unit_training_speed_reduction_pct || 0),
        },
      };

      await kingdomAPI.createLegendaryCharacter(Number(selectedKingdom.id), payload);
      setShowLegendaryCreateModal(false);
      setLegendaryForm({
        name: '',
        description: '',
        wood_bonus_pct: 0,
        stone_bonus_pct: 0,
        iron_bonus_pct: 0,
        meat_bonus_pct: 0,
        vegetables_bonus_pct: 0,
        gold_bonus_pct: 0,
        research_bonus_pct: 0,
        faith_bonus_pct: 0,
        building_bonus_pct: 0,
        population_growth_bonus_pct: 0,
        food_consumption_reduction_pct: 0,
        unit_training_speed_reduction_pct: 0,
      });
      await fetchKingdomManagementData();
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Failed to create legendary character');
    } finally {
      setBusy(null);
    }
  };

  const assignLegendary = async (legendaryId: number, fiefId: number) => {
    setBusy(`legendary-assign-${legendaryId}`);
    try {
      await kingdomAPI.assignLegendaryCharacter(fiefId, legendaryId);
      await fetchKingdomManagementData();
      await fetchKingdoms();
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Failed to assign legendary character');
    } finally {
      setBusy(null);
    }
  };

  const unassignLegendary = async (legendaryId: number, fiefId: number) => {
    setBusy(`legendary-unassign-${legendaryId}`);
    try {
      await kingdomAPI.unassignLegendaryCharacter(fiefId, legendaryId);
      await fetchKingdomManagementData();
      await fetchKingdoms();
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Failed to unassign legendary character');
    } finally {
      setBusy(null);
    }
  };

  const castPrayer = async (prayerKey: string) => {
    if (!selectedKingdom) return;
    setBusy(`prayer-${prayerKey}`);
    try {
      await kingdomAPI.castPrayer(Number(selectedKingdom.id), prayerKey, {
        targetFiefId: prayerTargetFiefId || undefined,
      });
      await fetchKingdomManagementData();
      await fetchKingdoms();
      if (selectedFiefId) await fetchFief(selectedFiefId);
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Failed to cast prayer');
    } finally {
      setBusy(null);
    }
  };

  const saveDesiredTradeText = async () => {
    if (!selectedKingdom) return;
    setBusy('trade-desired');
    try {
      const res = await kingdomAPI.setTradeDesiredResource(Number(selectedKingdom.id), tradeDesiredText);
      setTradeDepot(res.depot);
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Failed to save desired trade text');
    } finally {
      setBusy(null);
    }
  };

  const submitTradeMovement = async (direction: 'deposit' | 'withdraw') => {
    if (!selectedKingdom || !tradeSourceFiefId) {
      pushToast('Select a fief first');
      return;
    }

    const amount = Math.max(0, Number(tradeResourceAmount || 0));
    const population = Math.max(0, Math.floor(Number(tradePopulationAmount || 0)));
    const slavesAmount = Math.max(0, Math.floor(Number(tradeSlavesAmount || 0)));
    const hasResource = amount > 0;
    const hasPopulation = population > 0;
    const hasSlaves = slavesAmount > 0;

    if (!hasResource && !hasPopulation && !hasSlaves) {
      pushToast('Enter at least one amount to move');
      return;
    }

    setBusy(`trade-${direction}`);
    try {
      const payload = {
        fiefId: Number(tradeSourceFiefId),
        resources: hasResource ? { [tradeResourceKey]: amount } : undefined,
        population: hasPopulation ? population : undefined,
        slaves: hasSlaves ? slavesAmount : undefined,
      };

      const result = direction === 'deposit'
        ? await kingdomAPI.depositTradeDepot(Number(selectedKingdom.id), payload)
        : await kingdomAPI.withdrawTradeDepot(Number(selectedKingdom.id), payload);

      setTradeDepot(result.depot);
      setTradeResourceAmount('0');
      setTradePopulationAmount('0');
      setTradeSlavesAmount('0');
      await fetchKingdoms();
      if (selectedFiefId) await fetchFief(selectedFiefId);
    } catch (e: any) {
      pushToast(e?.response?.data?.error || `Failed to ${direction} trade depot`);
    } finally {
      setBusy(null);
    }
  };

  const acceptTrade = async (takeAll: boolean) => {
    if (!selectedKingdom || !isDungeonMaster) return;
    setBusy(takeAll ? 'trade-accept-all' : 'trade-accept-partial');
    try {
      const amount = Math.max(0, Number(tradeResourceAmount || 0));
      const population = Math.max(0, Math.floor(Number(tradePopulationAmount || 0)));
      const slavesAmount = Math.max(0, Math.floor(Number(tradeSlavesAmount || 0)));

      const payload = takeAll
        ? { takeAll: true }
        : {
            resources: amount > 0 ? { [tradeResourceKey]: amount } : undefined,
            population: population > 0 ? population : undefined,
            slaves: slavesAmount > 0 ? slavesAmount : undefined,
          };

      const result = await kingdomAPI.acceptTradeDepot(Number(selectedKingdom.id), payload);
      setTradeDepot(result.depot);
      setTradeResourceAmount('0');
      setTradePopulationAmount('0');
      setTradeSlavesAmount('0');
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Failed to accept trade');
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
        Loading kingdom data...
      </div>
    );
  }

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', minHeight: 'calc(100vh - 220px)', overflow: 'visible' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h5 style={{ color: 'var(--text-gold)', margin: 0 }}>👑 Kingdom</h5>
        {isDungeonMaster && (
          <button
            onClick={() => setShowGrantModal(true)}
            style={{
              padding: '0.55rem 1rem',
              borderRadius: '0.5rem',
              border: '1px solid rgba(var(--theme-accent-rgb), 0.45)',
              background: 'rgba(245, 158, 11, 0.2)',
              color: 'var(--text-gold)',
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            Grant Kingdom
          </button>
        )}
      </div>

      {toasts.length > 0 && ReactDOM.createPortal(
        <div style={{ position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-end' }}>
          {toasts.map(t => {
            const toneStyles = t.tone === 'success'
              ? { border: '1px solid rgba(34,197,94,0.45)', background: 'rgba(20,83,45,0.92)', color: '#86efac' }
              : t.tone === 'info'
                ? { border: '1px solid rgba(59,130,246,0.45)', background: 'rgba(30,58,138,0.92)', color: '#bfdbfe' }
                : { border: '1px solid rgba(239,68,68,0.45)', background: 'rgba(127,29,29,0.92)', color: '#fca5a5' };
            return (
              <div key={t.id} style={{ padding: '0.65rem 1rem', borderRadius: '0.45rem', boxShadow: '0 4px 16px rgba(0,0,0,0.5)', maxWidth: '22rem', fontSize: '0.9rem', ...toneStyles }}>
                {t.message}
              </div>
            );
          })}
        </div>,
        document.body
      )}

      {hoveredBuilding && ReactDOM.createPortal(
        (() => {
          const b = hoveredBuilding.building;
          const resourceOutput = (b.resource_output && typeof b.resource_output === 'object') ? b.resource_output as Record<string, number> : {};
          const outputEntries = Object.entries(resourceOutput).filter(([, v]) => Number(v) > 0);
          // Clamp tooltip so it doesn't overflow the right edge of the viewport
          const tooltipWidth = 260;
          const left = Math.min(hoveredBuilding.x, window.innerWidth - tooltipWidth - 12);
          const top = hoveredBuilding.y;
          return (
            <div
              style={{
                position: 'fixed',
                top,
                left,
                width: tooltipWidth,
                zIndex: 10000,
                background: 'rgba(2,6,23,0.97)',
                border: '1px solid rgba(148,163,184,0.35)',
                borderRadius: '0.55rem',
                padding: '0.7rem 0.85rem',
                boxShadow: '0 8px 28px rgba(0,0,0,0.6)',
                pointerEvents: 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
              }}
            >
              <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.95rem' }}>{b.name}</div>
              <div style={{ color: '#94a3b8', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '-0.2rem' }}>{b.building_type}</div>
              {b.description && (
                <div style={{ color: '#cbd5e1', fontSize: '0.8rem', lineHeight: '1.45', borderTop: '1px solid rgba(148,163,184,0.15)', paddingTop: '0.4rem' }}>
                  {b.description}
                </div>
              )}
              {outputEntries.length > 0 && (
                <div style={{ borderTop: '1px solid rgba(148,163,184,0.15)', paddingTop: '0.4rem' }}>
                  <div style={{ color: '#86efac', fontSize: '0.72rem', fontWeight: 700, marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Output</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.18rem' }}>
                    {outputEntries.map(([resource, amount]) => (
                      <div key={resource} style={{ display: 'flex', justifyContent: 'space-between', color: '#e2e8f0', fontSize: '0.8rem' }}>
                        <span style={{ textTransform: 'capitalize' }}>{RESOURCE_ICONS[resource] ? `${RESOURCE_ICONS[resource]} ` : ''}{resource}</span>
                        <span style={{ color: '#86efac', fontWeight: 700 }}>+{Number(amount).toFixed(1)} /day</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {b.level > 1 && (
                <div style={{ color: '#fde68a', fontSize: '0.75rem', borderTop: '1px solid rgba(148,163,184,0.15)', paddingTop: '0.4rem' }}>
                  Level {b.level}
                </div>
              )}
            </div>
          );
        })(),
        document.body
      )}

      {!visibleKingdoms.length ? (
        <div style={{ color: 'var(--text-muted)', padding: '1rem 0.2rem' }}>No kingdom assigned yet.</div>
      ) : (
        <>
          {visibleKingdoms.map((k) => {
            const isMyKingdom = !isDungeonMaster && Number(k.player_id) === Number(userId);
            const coOwners: KingdomCoOwner[] = k.co_owners || [];
            const coOwnerPlayerIds = new Set(coOwners.map((c) => c.player_id));
            const eligibleCoOwnerPlayers = (players || []).filter(
              (p) => Number(p.id) !== Number(k.player_id) && !coOwnerPlayerIds.has(Number(p.id))
            );
            const isAddingCoOwner = coOwnerTargetKingdomId === Number(k.id);
            const highestTierInKingdom = (k.fiefs || []).reduce((max, f) => Math.max(max, Number(f.tier || 0)), 0);
            const canToggleManagement = highestTierInKingdom >= 3;
            const isSelectedKingdom = Number(selectedKingdom?.id) === Number(k.id);
            return (
              <div key={k.id} style={{ border: '1px solid rgba(148,163,184,0.2)', borderRadius: '0.6rem', background: 'rgba(2,6,23,0.35)', overflow: 'hidden', marginBottom: '0.5rem' }}>
                {/* Kingdom header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.55rem 0.75rem', borderBottom: '1px solid rgba(148,163,184,0.15)', background: 'rgba(0,0,0,0.25)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <span style={{ color: 'var(--text-gold)', fontWeight: 700, fontSize: '1rem' }}>
                      👑 {k.name || `Unnamed Kingdom #${k.id}`}
                    </span>
                    {/* Primary owner row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                        Player: {k.player_username || `#${k.player_id}`} • {k.is_active ? 'Active' : 'Pending Name'}
                      </span>
                      {isDungeonMaster && (
                        <button
                          title="Add a player to share this kingdom"
                          onClick={() => {
                            if (isAddingCoOwner) {
                              setCoOwnerTargetKingdomId(null);
                              setCoOwnerSelectedPlayerId('');
                            } else {
                              setCoOwnerTargetKingdomId(Number(k.id));
                              setCoOwnerSelectedPlayerId('');
                            }
                          }}
                          style={{ padding: '0.05rem 0.35rem', borderRadius: '0.3rem', border: '1px solid rgba(96,165,250,0.5)', background: 'rgba(30,58,138,0.3)', color: '#93c5fd', cursor: 'pointer', fontSize: '0.8rem', lineHeight: 1, fontWeight: 700 }}
                        >
                          +
                        </button>
                      )}
                    </div>
                    {/* Co-owners */}
                    {coOwners.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.1rem' }}>
                        {coOwners.map((co) => (
                          <span key={co.player_id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', padding: '0.1rem 0.45rem', borderRadius: '0.35rem', background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.3)', color: '#93c5fd', fontSize: '0.72rem' }}>
                            {co.player_username}
                            {isDungeonMaster && (
                              <button
                                title={`Remove ${co.player_username} from kingdom`}
                                disabled={busy === `co-owner-remove-${Number(k.id)}-${co.player_id}`}
                                onClick={() => handleRemoveCoOwner(Number(k.id), co.player_id)}
                                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0 0.1rem', fontSize: '0.75rem', lineHeight: 1 }}
                              >
                                ×
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                    {/* Add co-owner inline picker */}
                    {isDungeonMaster && isAddingCoOwner && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem' }}>
                        <select
                          value={coOwnerSelectedPlayerId}
                          onChange={(e) => setCoOwnerSelectedPlayerId(e.target.value === '' ? '' : Number(e.target.value))}
                          style={{ padding: '0.2rem 0.4rem', borderRadius: '0.3rem', border: '1px solid rgba(96,165,250,0.4)', background: 'rgba(15,23,42,0.8)', color: '#e2e8f0', fontSize: '0.8rem' }}
                        >
                          <option value="">Select player…</option>
                          {eligibleCoOwnerPlayers.map((p) => (
                            <option key={p.id} value={p.id}>{p.username}</option>
                          ))}
                        </select>
                        <button
                          disabled={!coOwnerSelectedPlayerId || busy === `co-owner-add-${Number(k.id)}`}
                          onClick={handleAddCoOwner}
                          style={{ padding: '0.2rem 0.5rem', borderRadius: '0.3rem', border: '1px solid rgba(96,165,250,0.5)', background: 'rgba(30,58,138,0.4)', color: '#93c5fd', cursor: 'pointer', fontSize: '0.8rem' }}
                        >
                          {busy === `co-owner-add-${Number(k.id)}` ? '…' : 'Add'}
                        </button>
                        <button
                          onClick={() => { setCoOwnerTargetKingdomId(null); setCoOwnerSelectedPlayerId(''); }}
                          style={{ padding: '0.2rem 0.4rem', borderRadius: '0.3rem', border: '1px solid rgba(148,163,184,0.3)', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '0.8rem' }}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                  {isDungeonMaster && (
                    <button
                      onClick={() => handleDeleteKingdom(Number(k.id), k.name)}
                      disabled={busy === `delete-${Number(k.id)}`}
                      style={{ padding: '0.28rem 0.6rem', borderRadius: '0.35rem', border: '1px solid rgba(239,68,68,0.45)', background: 'rgba(127,29,29,0.3)', color: '#fca5a5', cursor: 'pointer', fontSize: '0.8rem' }}
                    >
                      {busy === `delete-${Number(k.id)}` ? 'Deleting...' : 'Delete'}
                    </button>
                  )}
                </div>
                {/* Fief tabs */}
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', padding: '0.5rem 0.6rem' }}>
                  {(k.fiefs || []).map((f) => {
                    const inTransit = Number(f.travel_days_remaining || 0) > 0;
                    const isSelected = Number(selectedFiefId) === Number(f.id);
                    return (
                      <button
                        key={f.id}
                        onClick={() => {
                          setSelectedFiefId(Number(f.id));
                          fetchFief(Number(f.id));
                        }}
                        style={{
                          padding: '0.4rem 0.75rem',
                          borderRadius: '0.45rem',
                          border: isSelected
                            ? '1px solid rgba(var(--theme-accent-rgb), 0.65)'
                            : '1px solid rgba(148,163,184,0.3)',
                          background: isSelected
                            ? 'rgba(245,158,11,0.18)'
                            : inTransit
                              ? 'rgba(15,23,42,0.25)'
                              : 'rgba(15,23,42,0.4)',
                          color: inTransit ? '#64748b' : isSelected ? 'var(--text-gold)' : '#cbd5e1',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          fontSize: '0.88rem',
                          opacity: inTransit ? 0.65 : 1,
                        }}
                      >
                        {f.name}
                        {inTransit && (
                          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                            🚶 {f.travel_days_remaining}d
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {isMyKingdom && (
                    <button
                      onClick={() => {
                        setCreateFiefKingdomId(Number(k.id));
                        setNewFiefName('');
                        setNewFiefPop(10);
                        setNewFiefResources({ food: 40, wood: 57, stone: 0, minerals: 0 });
                        setShowCreateFiefModal(true);
                      }}
                      style={{
                        padding: '0.4rem 0.75rem',
                        borderRadius: '0.45rem',
                        border: '1px solid rgba(34,197,94,0.4)',
                        background: 'rgba(20,83,45,0.25)',
                        color: '#86efac',
                        cursor: 'pointer',
                        fontSize: '0.88rem',
                      }}
                    >
                      + New Fief
                    </button>
                  )}
                  {canToggleManagement && isSelectedKingdom && (
                    <button
                      onClick={() => setManagementMode((prev) => (prev === 'fief' ? 'kingdom' : 'fief'))}
                      style={{
                        marginLeft: 'auto',
                        padding: '0.4rem 0.75rem',
                        borderRadius: '0.45rem',
                        border: '1px solid rgba(96,165,250,0.45)',
                        background: managementMode === 'kingdom' ? 'rgba(30,58,138,0.35)' : 'rgba(15,23,42,0.4)',
                        color: managementMode === 'kingdom' ? '#93c5fd' : '#cbd5e1',
                        cursor: 'pointer',
                        fontSize: '0.88rem',
                        fontWeight: 700,
                      }}
                      title="Toggle between fief and kingdom management views"
                    >
                      {managementMode === 'fief' ? 'Fief Management' : 'Kingdom Management'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {managementMode === 'kingdom' && selectedKingdom && canUseKingdomManagement && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
              <div style={{ padding: '1rem', border: '1px solid rgba(96,165,250,0.35)', borderRadius: '0.8rem', background: 'linear-gradient(135deg, rgba(15,23,42,0.8), rgba(2,6,23,0.8))' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.55rem', marginBottom: '0.8rem' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ color: '#bfdbfe', fontWeight: 800, fontSize: '1rem' }}>Legendary Command</div>
                    <div style={{ color: '#94a3b8', fontSize: '0.78rem' }}>Inventory and active assignments across all fiefs</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <span style={{ color: '#cbd5e1', fontSize: '0.78rem' }}>Slot cap per fief: {legendarySlotsPerFief}</span>
                    {isDungeonMaster && (
                      <button
                        onClick={() => setShowLegendaryCreateModal(true)}
                        style={{ padding: '0.35rem 0.65rem', borderRadius: '0.4rem', border: '1px solid rgba(34,197,94,0.45)', background: 'rgba(20,83,45,0.35)', color: '#86efac', fontWeight: 700, cursor: 'pointer' }}
                      >
                        Add Legendary
                      </button>
                    )}
                  </div>
                </div>

                {kingdomManagementLoading ? (
                  <div style={{ color: '#64748b' }}>Loading legendary management...</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 1.2fr) minmax(320px, 1fr)', gap: '0.8rem' }}>
                    <div style={{ border: '1px solid rgba(148,163,184,0.22)', borderRadius: '0.65rem', background: 'rgba(2,6,23,0.55)', padding: '0.65rem' }}>
                      <div style={{ color: '#e2e8f0', fontWeight: 700, marginBottom: '0.55rem', textAlign: 'center' }}>Legendary Inventory</div>
                      {legendaryCharacters.length === 0 ? (
                        <div style={{ color: '#64748b', fontSize: '0.82rem' }}>No legendary characters available.</div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.5rem', maxHeight: '430px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                          {legendaryCharacters.map((legendary) => {
                            const assignedFief = (selectedKingdom.fiefs || []).find((f) => Number(f.id) === Number(legendary.assigned_fief_id));
                            const canAssign = Boolean(selectedKingdom);
                            const selectedTargetFiefId = Number(legendaryAssignFief[legendary.id] || 0);
                            const selectedTargetFief = (selectedKingdom.fiefs || []).find((f) => Number(f.id) === selectedTargetFiefId);
                            const selectedAssignedCount = selectedTargetFief
                              ? Number(fiefLegendaryCount[Number(selectedTargetFief.id)] || 0)
                              : 0;
                            const selectedIsCurrent = selectedTargetFief
                              ? Number(legendary.assigned_fief_id) === Number(selectedTargetFief.id)
                              : false;
                            const selectedRemainingSlots = selectedTargetFief
                              ? Math.max(0, legendarySlotsPerFief - (selectedIsCurrent ? selectedAssignedCount - 1 : selectedAssignedCount))
                              : 0;
                            const assignDisabled = busy === `legendary-assign-${legendary.id}`
                              || !selectedTargetFiefId
                              || !canAssign
                              || (!selectedIsCurrent && selectedRemainingSlots <= 0);

                            return (
                              <div key={legendary.id} style={{ border: '1px solid rgba(148,163,184,0.2)', borderRadius: '0.55rem', background: 'rgba(8,15,35,0.65)', padding: '0.55rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', alignItems: 'center' }}>
                                  <div style={{ color: '#f1f5f9', fontWeight: 700 }}>{legendary.name}</div>
                                  <div style={{ color: assignedFief ? '#93c5fd' : '#94a3b8', fontSize: '0.72rem' }}>
                                    {assignedFief ? `Assigned: ${assignedFief.name}` : 'Unassigned'}
                                  </div>
                                </div>
                                <div style={{ color: '#94a3b8', fontSize: '0.76rem', marginTop: '0.15rem' }}>{legendary.description || 'No description'}</div>
                                {legendary.bonuses && Object.keys(legendary.bonuses).length > 0 && (
                                  <div style={{ marginTop: '0.35rem', display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                                    {Object.entries(legendary.bonuses)
                                      .sort(([a], [b]) => a.localeCompare(b))
                                      .map(([k, v]) => (
                                      <span key={k} style={{ fontSize: '0.7rem', color: '#bfdbfe', border: '1px solid rgba(59,130,246,0.35)', borderRadius: '0.35rem', padding: '0.08rem 0.35rem', background: 'rgba(30,58,138,0.25)' }}>
                                        {formatLegendaryBonus(k, Number(v || 0))}
                                      </span>
                                    ))}
                                  </div>
                                )}

                                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 1fr) auto auto', gap: '0.35rem', marginTop: '0.45rem', alignItems: 'center' }}>
                                  <select
                                    value={legendaryAssignFief[legendary.id] || legendary.assigned_fief_id || ''}
                                    onChange={(e) => {
                                      const next = Number(e.target.value || 0);
                                      setLegendaryAssignFief((prev) => ({ ...prev, [legendary.id]: next }));
                                    }}
                                    style={{ padding: '0.25rem 0.38rem', borderRadius: '0.35rem', border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(15,23,42,0.75)', color: '#e2e8f0', fontSize: '0.78rem' }}
                                  >
                                    <option value="">Select fief</option>
                                    {(selectedKingdom.fiefs || []).map((f) => {
                                      const assignedCount = Number(fiefLegendaryCount[Number(f.id)] || 0);
                                      const isCurrent = Number(legendary.assigned_fief_id) === Number(f.id);
                                      const remainingSlots = Math.max(0, legendarySlotsPerFief - (isCurrent ? assignedCount - 1 : assignedCount));
                                      const disabled = remainingSlots <= 0 && !isCurrent;
                                      return (
                                        <option key={f.id} value={f.id} disabled={disabled}>
                                          {f.name} ({Math.max(0, remainingSlots)} slots)
                                        </option>
                                      );
                                    })}
                                  </select>
                                  <button
                                    disabled={assignDisabled}
                                    onClick={() => assignLegendary(legendary.id, Number(legendaryAssignFief[legendary.id]))}
                                    style={{ padding: '0.25rem 0.56rem', borderRadius: '0.34rem', border: '1px solid rgba(34,197,94,0.42)', background: 'rgba(20,83,45,0.35)', color: '#86efac', cursor: 'pointer', fontWeight: 700, fontSize: '0.76rem' }}
                                  >
                                    Assign
                                  </button>
                                  {legendary.assigned_fief_id ? (
                                    <button
                                      disabled={busy === `legendary-unassign-${legendary.id}`}
                                      onClick={() => unassignLegendary(legendary.id, Number(legendary.assigned_fief_id))}
                                      style={{ padding: '0.25rem 0.56rem', borderRadius: '0.34rem', border: '1px solid rgba(239,68,68,0.42)', background: 'rgba(127,29,29,0.35)', color: '#fca5a5', cursor: 'pointer', fontWeight: 700, fontSize: '0.76rem' }}
                                    >
                                      Unassign
                                    </button>
                                  ) : <span />}
                                </div>
                                {selectedTargetFiefId > 0 && (
                                  <div style={{ marginTop: '0.22rem', color: selectedRemainingSlots <= 0 && !selectedIsCurrent ? '#fca5a5' : '#94a3b8', fontSize: '0.72rem' }}>
                                    Remaining slots in target: {selectedRemainingSlots}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div style={{ border: '1px solid rgba(148,163,184,0.22)', borderRadius: '0.65rem', background: 'rgba(2,6,23,0.55)', padding: '0.65rem' }}>
                      <div style={{ color: '#e2e8f0', fontWeight: 700, marginBottom: '0.55rem', textAlign: 'center' }}>Fief Assignments</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.45rem', maxHeight: '430px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                        {(selectedKingdom.fiefs || []).map((fief) => {
                          const assignedList = legendaryByFief[Number(fief.id)] || [];
                          const remaining = Math.max(0, legendarySlotsPerFief - assignedList.length);
                          return (
                            <div key={fief.id} style={{ border: '1px solid rgba(148,163,184,0.2)', borderRadius: '0.5rem', background: 'rgba(8,15,35,0.65)', padding: '0.5rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                                <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.86rem' }}>{fief.name}</div>
                                <div style={{ color: remaining === 0 ? '#fca5a5' : '#93c5fd', fontSize: '0.72rem' }}>{assignedList.length}/{legendarySlotsPerFief} used</div>
                              </div>
                              <div style={{ marginTop: '0.35rem', display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                                {assignedList.length === 0 ? (
                                  <span style={{ color: '#64748b', fontSize: '0.74rem' }}>No legendary assigned</span>
                                ) : assignedList.map((legendary) => (
                                  <span key={legendary.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', border: '1px solid rgba(59,130,246,0.35)', borderRadius: '0.35rem', padding: '0.09rem 0.35rem', background: 'rgba(30,58,138,0.22)', color: '#bfdbfe', fontSize: '0.72rem' }}>
                                    {legendary.name}
                                  </span>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ padding: '1rem', border: '1px solid rgba(196,181,253,0.35)', borderRadius: '0.8rem', background: 'linear-gradient(135deg, rgba(46,16,101,0.34), rgba(30,27,75,0.28))' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ color: '#ddd6fe', fontWeight: 800, fontSize: '1rem' }}>Prayer Chamber</div>
                    <div style={{ color: '#c4b5fd', fontSize: '0.78rem' }}>Effects are shown as exact gains at your current kingdom tier</div>
                  </div>
                  <div style={{ color: '#e2e8f0', fontSize: '0.82rem', textAlign: 'center' }}>
                    Pooled faith: <span style={{ color: '#fde68a', fontWeight: 800 }}>{pooledFaith.toFixed(1)}</span>
                  </div>
                </div>

                <div style={{ marginBottom: '0.7rem', maxWidth: '320px', marginLeft: 'auto', marginRight: 'auto' }}>
                  <select
                    value={prayerTargetFiefId || ''}
                    onChange={(e) => setPrayerTargetFiefId(Number(e.target.value || 0) || null)}
                    style={{ width: '100%', padding: '0.33rem 0.45rem', borderRadius: '0.4rem', border: '1px solid rgba(167,139,250,0.5)', background: 'rgba(15,23,42,0.72)', color: '#e2e8f0', fontSize: '0.82rem' }}
                  >
                    {(selectedKingdom.fiefs || []).map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>

                {prayers.length === 0 ? (
                  <div style={{ color: '#a78bfa', fontSize: '0.82rem' }}>No prayers unlocked yet.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '0.55rem' }}>
                    {prayers.map((prayer) => (
                      <div key={prayer.key} style={{ border: '1px solid rgba(167,139,250,0.35)', borderRadius: '0.55rem', background: 'rgba(15,23,42,0.5)', padding: '0.55rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.45rem', alignItems: 'center' }}>
                          <div style={{ color: '#f8fafc', fontWeight: 700 }}>{prayer.name}</div>
                          <div style={{ color: '#fde68a', fontSize: '0.74rem', fontWeight: 700 }}>{prayer.faithCost.toFixed(0)} faith</div>
                        </div>
                        <div style={{ color: '#c4b5fd', fontSize: '0.74rem', marginTop: '0.15rem' }}>{prayer.description}</div>
                        {prayer.effects && Object.keys(prayer.effects).length > 0 && (
                          <div style={{ marginTop: '0.35rem', display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                            {Object.entries(prayer.effects)
                              .sort(([a], [b]) => a.localeCompare(b))
                              .map(([key, value]) => (
                                <span key={key} style={{ border: '1px solid rgba(196,181,253,0.45)', borderRadius: '0.34rem', padding: '0.08rem 0.3rem', color: '#e9d5ff', fontSize: '0.7rem', background: 'rgba(76,29,149,0.24)' }}>
                                  {formatPrayerEffectValue(key, Number(value || 0))}
                                </span>
                              ))}
                          </div>
                        )}
                        <button
                          onClick={() => castPrayer(prayer.key)}
                          disabled={busy === `prayer-${prayer.key}` || pooledFaith < prayer.faithCost}
                          style={{ marginTop: '0.42rem', padding: '0.28rem 0.62rem', borderRadius: '0.36rem', border: '1px solid rgba(139,92,246,0.55)', background: 'rgba(91,33,182,0.4)', color: '#ede9fe', cursor: 'pointer', fontWeight: 700, fontSize: '0.76rem' }}
                        >
                          Cast Prayer
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ padding: '1rem', border: '1px solid rgba(16,185,129,0.38)', borderRadius: '0.8rem', background: 'linear-gradient(135deg, rgba(6,78,59,0.4), rgba(6,95,70,0.25))' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.55rem', marginBottom: '0.7rem' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ color: '#a7f3d0', fontWeight: 800, fontSize: '1rem' }}>Trading Depot</div>
                    <div style={{ color: '#99f6e4', fontSize: '0.78rem' }}>Centralized logistics and transfer control</div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                    <div style={{ padding: '0.3rem 0.55rem', borderRadius: '0.4rem', border: '1px solid rgba(16,185,129,0.4)', background: 'rgba(2,44,34,0.5)', color: '#d1fae5', fontSize: '0.75rem' }}>
                      Capacity Used: {Number(tradeDepot?.capacity_used || 0).toFixed(1)}
                    </div>
                    <div style={{ padding: '0.3rem 0.55rem', borderRadius: '0.4rem', border: '1px solid rgba(16,185,129,0.4)', background: 'rgba(2,44,34,0.5)', color: '#d1fae5', fontSize: '0.75rem' }}>
                      Capacity Max: {Number(tradeDepot?.capacity_max || 0).toFixed(1)}
                    </div>
                    <div style={{ padding: '0.3rem 0.55rem', borderRadius: '0.4rem', border: '1px solid rgba(16,185,129,0.4)', background: 'rgba(2,44,34,0.5)', color: '#d1fae5', fontSize: '0.75rem' }}>
                      Population: {Number(tradeDepot?.population || 0)}
                    </div>
                    <div style={{ padding: '0.3rem 0.55rem', borderRadius: '0.4rem', border: '1px solid rgba(16,185,129,0.4)', background: 'rgba(2,44,34,0.5)', color: '#d1fae5', fontSize: '0.75rem' }}>
                      Slaves: {Number(tradeDepot?.slaves || 0)}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.45rem', marginBottom: '0.75rem' }}>
                  {tradeResourceEntries.length > 0 ? tradeResourceEntries.map(([k, v]) => (
                    <div key={k} style={{ border: '1px solid rgba(148,163,184,0.25)', borderRadius: '0.45rem', background: 'rgba(2,6,23,0.45)', padding: '0.35rem 0.45rem' }}>
                      <div style={{ color: '#94a3b8', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{formatResourceLabel(k)}</div>
                      <div style={{ color: '#e2e8f0', fontSize: '0.86rem', fontWeight: 700 }}>{Number(v || 0).toFixed(1)}</div>
                    </div>
                  )) : (
                    <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>No stored resources in the depot yet.</div>
                  )}
                </div>

                <div style={{ border: '1px solid rgba(148,163,184,0.24)', borderRadius: '0.55rem', background: 'rgba(2,6,23,0.48)', padding: '0.55rem', marginBottom: '0.65rem' }}>
                  <div style={{ color: '#e2e8f0', fontSize: '0.79rem', fontWeight: 700, marginBottom: '0.38rem' }}>Transfer Console</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.35rem', alignItems: 'center' }}>
                    <select
                      value={tradeSourceFiefId || ''}
                      onChange={(e) => setTradeSourceFiefId(Number(e.target.value || 0) || null)}
                      style={{ padding: '0.28rem 0.4rem', borderRadius: '0.34rem', border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(15,23,42,0.75)', color: '#e2e8f0', fontSize: '0.78rem' }}
                    >
                      {(selectedKingdom.fiefs || []).map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                    <select
                      value={tradeResourceKey}
                      onChange={(e) => setTradeResourceKey(e.target.value)}
                      style={{ padding: '0.28rem 0.4rem', borderRadius: '0.34rem', border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(15,23,42,0.75)', color: '#e2e8f0', fontSize: '0.78rem' }}
                    >
                      {['wood', 'stone', 'minerals', 'food', 'gold', 'faith', 'research', 'meat', 'vegetables'].map((k) => (
                        <option key={k} value={k}>{formatResourceLabel(k)}</option>
                      ))}
                    </select>
                    <input value={tradeResourceAmount} onChange={(e) => setTradeResourceAmount(e.target.value)} type="number" min="0" step="1" placeholder="Resource" style={{ padding: '0.28rem 0.4rem', borderRadius: '0.34rem', border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(15,23,42,0.75)', color: '#e2e8f0' }} />
                    <input value={tradePopulationAmount} onChange={(e) => setTradePopulationAmount(e.target.value)} type="number" min="0" step="1" placeholder="Pop" style={{ padding: '0.28rem 0.4rem', borderRadius: '0.34rem', border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(15,23,42,0.75)', color: '#e2e8f0' }} />
                    <input value={tradeSlavesAmount} onChange={(e) => setTradeSlavesAmount(e.target.value)} type="number" min="0" step="1" placeholder="Slaves" style={{ padding: '0.28rem 0.4rem', borderRadius: '0.34rem', border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(15,23,42,0.75)', color: '#e2e8f0' }} />
                    <button onClick={() => submitTradeMovement('deposit')} disabled={busy === 'trade-deposit'} style={{ padding: '0.28rem 0.56rem', borderRadius: '0.34rem', border: '1px solid rgba(34,197,94,0.45)', background: 'rgba(20,83,45,0.35)', color: '#86efac', cursor: 'pointer', fontWeight: 700, fontSize: '0.76rem' }}>Deposit</button>
                    <button onClick={() => submitTradeMovement('withdraw')} disabled={busy === 'trade-withdraw'} style={{ padding: '0.28rem 0.56rem', borderRadius: '0.34rem', border: '1px solid rgba(59,130,246,0.45)', background: 'rgba(30,58,138,0.35)', color: '#93c5fd', cursor: 'pointer', fontWeight: 700, fontSize: '0.76rem' }}>Withdraw</button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.4rem', alignItems: 'center', marginBottom: '0.65rem' }}>
                  <input
                    value={tradeDesiredText}
                    onChange={(e) => setTradeDesiredText(e.target.value)}
                    placeholder="Desired resource / request text"
                    style={{ width: '100%', padding: '0.33rem 0.45rem', borderRadius: '0.38rem', border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(15,23,42,0.75)', color: '#e2e8f0' }}
                  />
                  <button onClick={saveDesiredTradeText} disabled={busy === 'trade-desired'} style={{ padding: '0.32rem 0.62rem', borderRadius: '0.34rem', border: '1px solid rgba(16,185,129,0.45)', background: 'rgba(6,78,59,0.4)', color: '#6ee7b7', cursor: 'pointer', fontWeight: 700, fontSize: '0.76rem' }}>Save</button>
                </div>

                {isDungeonMaster && (
                  <div style={{ display: 'flex', gap: '0.42rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button onClick={() => acceptTrade(false)} disabled={busy === 'trade-accept-partial'} style={{ padding: '0.3rem 0.62rem', borderRadius: '0.34rem', border: '1px solid rgba(234,179,8,0.52)', background: 'rgba(120,53,15,0.4)', color: '#fde68a', cursor: 'pointer', fontWeight: 700, fontSize: '0.76rem' }}>DM Take Partial</button>
                    <button onClick={() => acceptTrade(true)} disabled={busy === 'trade-accept-all'} style={{ padding: '0.3rem 0.62rem', borderRadius: '0.34rem', border: '1px solid rgba(239,68,68,0.52)', background: 'rgba(127,29,29,0.35)', color: '#fecaca', cursor: 'pointer', fontWeight: 700, fontSize: '0.76rem' }}>DM Take All</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {managementMode === 'fief' && fiefDetails && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
              {Number(fiefDetails.travel_days_remaining || 0) > 0 ? (
                <div style={{ padding: '1.5rem', border: '1px solid rgba(148,163,184,0.2)', borderRadius: '0.6rem', background: 'rgba(2,6,23,0.55)', textAlign: 'center' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🚶</div>
                  <div style={{ color: '#94a3b8', fontWeight: 700, fontSize: '1.05rem', marginBottom: '0.25rem' }}>
                    In Transit
                  </div>
                  <div style={{ color: '#64748b', fontSize: '0.9rem' }}>
                    {fiefDetails.travel_days_remaining} day{fiefDetails.travel_days_remaining !== 1 ? 's' : ''} remaining before this fief becomes available
                  </div>
                </div>
              ) : (
              <>
              <div style={{ padding: '0.8rem', border: '1px solid rgba(148,163,184,0.2)', borderRadius: '0.6rem', background: 'rgba(2,6,23,0.35)' }}>
                {(() => {
                  const storageEntries = Object.entries((fiefDetails.stored_resources || {}) as Record<string, number>)
                    .filter(([k]) => k !== 'meat' && k !== 'vegetables' && k !== 'research');
                  const totalStored = storageEntries
                    .reduce((sum, [, amount]) => sum + Math.max(0, Number(amount || 0)), 0);
                  const cap = Number(fiefDetails.storage_capacity || 100);
                  const available = Math.max(0, cap - totalStored);
                  const { output: prodOutput, foodBreakdown } = productionByLane;
                  const grossFood = Math.max(0, foodBreakdown.total);
                  const otherProd = [
                    { label: 'Wood',     amount: Math.max(0, Number(prodOutput.wood  || 0)) },
                    { label: 'Stone',    amount: Math.max(0, Number(prodOutput.stone || 0)) },
                    { label: 'Minerals', amount: Math.max(0, Number(prodOutput.iron  || 0)) },
                    { label: 'Gold',     amount: Math.max(0, Number(prodOutput.gold  || 0)) },
                    { label: 'Faith',    amount: Math.max(0, Number(prodOutput.faith || 0)) },
                  ];
                  let rem = Math.max(0, available - Math.min(grossFood, available));
                  const lostResources: { label: string; lost: number }[] = [];
                  for (const res of otherProd) {
                    if (res.amount <= 0.001) continue;
                    const accepted = Math.min(res.amount, rem);
                    const lost = res.amount - accepted;
                    rem = Math.max(0, rem - accepted);
                    if (lost > 0.05) lostResources.push({ label: res.label, lost });
                  }
                  const willLose = lostResources.length > 0;
                  const pct = cap > 0 ? Math.min(1, totalStored / cap) : 0;
                  const barColor = willLose ? '#ef4444' : pct >= 0.8 ? '#fbbf24' : '#22c55e';
                  return (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                        <div style={{ color: '#e2e8f0' }}>Tier {fiefDetails.tier} {fiefDetails.is_capital ? '• Capital' : ''}</div>
                        <div style={{ color: willLose ? '#ef4444' : '#94a3b8' }}>
                          Storage: {totalStored.toFixed(1)} / {cap}
                        </div>
                      </div>
                      <div style={{ marginTop: '0.45rem', marginBottom: '0.5rem' }}>
                        <div style={{ height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${(pct * 100).toFixed(1)}%`, background: barColor, borderRadius: '4px', transition: 'width 0.3s ease' }} />
                        </div>
                        {willLose && (
                          <div style={{ marginTop: '0.35rem', padding: '0.3rem 0.6rem', borderRadius: '0.4rem', background: 'rgba(127,29,29,0.35)', border: '1px solid rgba(239,68,68,0.45)', color: '#fca5a5', fontSize: '0.78rem', fontWeight: 600 }}>
                            📦 Storage nearly full — {lostResources.map(r => `${r.lost.toFixed(1)} ${r.label}`).join(', ')} will be lost today (food fills storage first)
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}

                <div style={{ marginTop: '0.75rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem' }}>
                  {Object.entries((fiefDetails.stored_resources || {}) as Record<string, number>)
                    .filter(([k]) => k !== 'meat' && k !== 'vegetables' && k !== 'research')
                    .map(([k, v]) => (
                    <div
                      key={k}
                      style={{
                        borderRadius: '0.55rem',
                        border: `1px solid ${RESOURCE_COLORS[k]?.border || 'rgba(148,163,184,0.25)'}`,
                        background: RESOURCE_COLORS[k]?.background || 'rgba(15,23,42,0.25)',
                        padding: '0.45rem 0.55rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.12rem',
                        minHeight: '56px',
                        justifyContent: 'center',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem' }}>
                        <span style={{ color: '#94a3b8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {RESOURCE_ICONS[k] ? `${RESOURCE_ICONS[k]} ` : ''}{k}
                        </span>
                        {isDungeonMaster && (
                          <button
                            onClick={() => dmSetResourceAmount(k, Number(v || 0))}
                            disabled={busy === 'dm-adjust'}
                            style={{
                              padding: '0.08rem 0.32rem',
                              borderRadius: '0.3rem',
                              border: '1px solid rgba(125,211,252,0.45)',
                              background: 'rgba(12,74,110,0.35)',
                              color: '#7dd3fc',
                              fontSize: '0.66rem',
                              fontWeight: 700,
                              cursor: busy === 'dm-adjust' ? 'not-allowed' : 'pointer',
                              opacity: busy === 'dm-adjust' ? 0.6 : 1,
                            }}
                          >
                            Edit
                          </button>
                        )}
                      </div>
                      <span style={{ color: RESOURCE_COLORS[k]?.text || '#e2e8f0', fontSize: '0.94rem', fontWeight: 700 }}>{Number(v || 0).toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ padding: '0.9rem 1rem', border: '1px solid rgba(148,163,184,0.22)', borderRadius: '0.7rem', background: 'rgba(2,6,23,0.38)' }}>
                {/* ── Header row ── */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.65rem' }}>
                  <span style={{ color: 'var(--text-gold)', fontWeight: 700, fontSize: '1rem' }}>👥 Population</span>
                  <span style={{
                    fontWeight: 700,
                    fontSize: '1.08rem',
                    color: housingCapacity > 0 && (totalPopulation + slaves) >= housingCapacity ? '#ef4444'
                      : housingCapacity > 0 && (totalPopulation + slaves) >= housingCapacity * 0.9 ? '#fbbf24'
                      : '#e2e8f0',
                  }}>
                    {totalPopulation + slaves}{housingCapacity > 0 ? ` / ${housingCapacity}` : ''}
                    {isDungeonMaster && (
                      <span style={{ marginLeft: '0.5rem', display: 'inline-flex', gap: '0.25rem' }}>
                        <button onClick={() => dmAdjustPopulation(-1)} disabled={busy === 'dm-adjust'}
                          style={{ padding: '0.1rem 0.38rem', borderRadius: '0.28rem', border: '1px solid rgba(239,68,68,0.45)', background: 'rgba(127,29,29,0.35)', color: '#fca5a5', fontSize: '0.72rem', fontWeight: 700, cursor: busy === 'dm-adjust' ? 'not-allowed' : 'pointer', opacity: busy === 'dm-adjust' ? 0.6 : 1 }}>−</button>
                        <button onClick={() => dmAdjustPopulation(1)} disabled={busy === 'dm-adjust'}
                          style={{ padding: '0.1rem 0.38rem', borderRadius: '0.28rem', border: '1px solid rgba(34,197,94,0.45)', background: 'rgba(20,83,45,0.35)', color: '#86efac', fontSize: '0.72rem', fontWeight: 700, cursor: busy === 'dm-adjust' ? 'not-allowed' : 'pointer', opacity: busy === 'dm-adjust' ? 0.6 : 1 }}>+</button>
                      </span>
                    )}
                  </span>
                </div>

                {/* ── Housing cap fill bar ── */}
                {(() => {
                  if (housingCapacity <= 0) return null;
                  const pct = Math.min(1, (totalPopulation + slaves) / housingCapacity);
                  const barColor = pct >= 1 ? '#ef4444' : pct >= 0.9 ? '#fbbf24' : '#22c55e';
                  return (
                    <div style={{ marginBottom: '0.65rem' }}>
                      <div style={{ height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(pct * 100).toFixed(1)}%`, background: barColor, borderRadius: '4px', transition: 'width 0.3s ease' }} />
                      </div>
                      {pct >= 1 && (
                        <div style={{ marginTop: '0.35rem', padding: '0.3rem 0.6rem', borderRadius: '0.4rem', background: 'rgba(127,29,29,0.35)', border: '1px solid rgba(239,68,68,0.45)', color: '#fca5a5', fontSize: '0.78rem', fontWeight: 600 }}>
                          🏠 Housing capacity full — build more Tents to allow population growth
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* ── Breakdown ── */}
                {/* Core 3-column grid: Adults | Children | Slaves */}
                <div style={{ display: 'grid', gridTemplateColumns: (hasPrisonInfrastructure || slaves > 0) ? '1fr 1fr 1fr' : '1fr 1fr', gap: '0.75rem', alignItems: 'start', textAlign: 'center', marginBottom: (sickInjuredPopulation > 0 || soldiers > 0) ? '0.5rem' : '0.6rem' }}>
                  {/* Adults */}
                  <div>
                    <div style={{ color: '#94a3b8', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Adults</div>
                    <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '1rem', marginBottom: '0.1rem' }}>{assignablePopulation}</div>
                    <div style={{ color: '#64748b', fontSize: '0.75rem' }}>{unassignedAdults} unassigned</div>
                  </div>
                  {/* Children */}
                  <div>
                    <div style={{ color: '#94a3b8', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Children</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                      <button onClick={() => setShowChildrenModal(true)} style={{ display: 'inline-block', width: 'fit-content', padding: '0.18rem 0.55rem', borderRadius: '0.32rem', border: '1px solid rgba(125,211,252,0.4)', background: 'rgba(12,74,110,0.32)', color: '#7dd3fc', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer', marginBottom: '0.1rem' }}>
                        {underagePopulation}
                      </button>
                      {isDungeonMaster && (
                        <button onClick={handleGiveBirth} disabled={busy === 'give-birth'} title="DM: Immediately add one newborn child" style={{ display: 'inline-block', width: 'fit-content', padding: '0.18rem 0.45rem', borderRadius: '0.32rem', border: '1px solid rgba(251,191,36,0.5)', background: 'rgba(120,53,15,0.35)', color: '#fbbf24', fontSize: '0.72rem', fontWeight: 700, cursor: busy === 'give-birth' ? 'not-allowed' : 'pointer', opacity: busy === 'give-birth' ? 0.6 : 1, marginBottom: '0.1rem' }}>
                          Give Birth
                        </button>
                      )}
                    </div>
                    <div style={{ color: '#64748b', fontSize: '0.75rem' }}>
                      {nextMaturityDays == null ? 'None maturing' : `Next matures in ${nextMaturityDays}d`}
                    </div>
                  </div>
                  {/* Slaves */}
                  {(hasPrisonInfrastructure || slaves > 0) && (
                    <div>
                      <div style={{ color: '#94a3b8', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Slaves</div>
                      <div style={{ color: '#fde68a', fontWeight: 700, fontSize: '1rem', marginBottom: '0.1rem' }}>{slaves}</div>
                      <button onClick={() => setShowConversionModal(true)}
                        style={{ display: 'inline-block', width: 'fit-content', padding: '0.1rem 0.4rem', borderRadius: '0.25rem', border: '1px solid rgba(234,179,8,0.4)', background: 'rgba(146,64,14,0.3)', color: '#fde68a', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600 }}>
                        Manage
                      </button>
                    </div>
                  )}
                </div>
                {/* Secondary row: Sick/Injured + Soldiers (conditional) */}
                {(sickInjuredPopulation > 0 || soldiers > 0) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem 1.5rem', marginBottom: '0.6rem' }}>
                    {sickInjuredPopulation > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.08rem', minWidth: '100px' }}>
                        <span style={{ color: '#94a3b8', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sick / Injured</span>
                        <span style={{ color: '#fca5a5', fontWeight: 700, fontSize: '1rem' }}>{sickInjuredPopulation}</span>
                      </div>
                    )}
                    {soldiers > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.08rem', minWidth: '100px' }}>
                        <span style={{ color: '#94a3b8', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Soldiers</span>
                        <span style={{ color: '#93c5fd', fontWeight: 700, fontSize: '1rem' }}>{soldiers}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Prisoner cap bar ── */}
                {(hasPrisonInfrastructure || prisoners > 0) && prisonerCapacity > 0 && (() => {
                  const pct = Math.min(1, prisoners / prisonerCapacity);
                  const barColor = pct >= 1 ? '#ef4444' : pct >= 0.8 ? '#fbbf24' : '#a78bfa';
                  return (
                    <div style={{ marginBottom: '0.65rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ color: '#94a3b8', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🔒 Prisoner Capacity</span>
                      </div>
                      <div style={{ height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(pct * 100).toFixed(1)}%`, background: barColor, borderRadius: '4px', transition: 'width 0.3s ease' }} />
                      </div>
                      {pct >= 1 && (
                        <div style={{ marginTop: '0.35rem', padding: '0.3rem 0.6rem', borderRadius: '0.4rem', background: 'rgba(127,29,29,0.35)', border: '1px solid rgba(239,68,68,0.45)', color: '#fca5a5', fontSize: '0.78rem', fontWeight: 600 }}>
                          🔓 Prison overcrowded — excess prisoners will escape and blend into the population
                        </div>
                      )}
                      {/* Prisoner count below bar */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginTop: '0.45rem' }}>
                        <span style={{ color: '#94a3b8', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Prisoners</span>
                        <span style={{ color: barColor, fontWeight: 700, fontSize: '1rem' }}>{prisoners}</span>
                        <span style={{ color: '#64748b', fontSize: '0.8rem' }}>/ {prisonerCapacity}</span>
                        {isDungeonMaster && (
                          <>
                            <button onClick={() => dmAdjustPrisoners(-1)} disabled={busy === 'dm-adjust' || prisoners <= 0}
                              style={{ padding: '0.1rem 0.35rem', borderRadius: '0.25rem', border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(127,29,29,0.35)', color: '#fca5a5', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, opacity: (busy === 'dm-adjust' || prisoners <= 0) ? 0.5 : 1 }}>−</button>
                            <button onClick={() => dmAdjustPrisoners(1)} disabled={busy === 'dm-adjust'}
                              style={{ padding: '0.1rem 0.35rem', borderRadius: '0.25rem', border: '1px solid rgba(34,197,94,0.4)', background: 'rgba(20,83,45,0.35)', color: '#86efac', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, opacity: busy === 'dm-adjust' ? 0.5 : 1 }}>+</button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* ── Food summary ── */}
                <div style={{ paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.8rem' }}>
                  <span style={{ color: productionByLane.foodBreakdown.net >= 0 ? '#22c55e' : '#ef4444', fontWeight: 700, fontSize: '0.9rem' }}>
                    Food: {productionByLane.foodBreakdown.net >= 0 ? '+' : ''}{productionByLane.foodBreakdown.net.toFixed(1)} /day
                  </span>
                  <span style={{ color: '#94a3b8', fontSize: '0.82rem' }}>
                    🏦 {storedFood.toFixed(1)} stored
                    {dailyFoodConsumption > 0 && ` · ${foodDaysLeftIfNoProduction === Number.POSITIVE_INFINITY ? '∞' : foodDaysLeftIfNoProduction.toFixed(0)}d reserve`}
                  </span>
                </div>

                {/* ── Gold upkeep summary (Tier 4+) ── */}
                {Number(fiefDetails?.tier || 1) >= 4 && (() => {
                  const goldNet = productionByLane.output.gold - dailyGoldConsumption;
                  return (
                    <div style={{ paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.8rem' }}>
                      <span style={{ color: goldNet >= 0 ? '#22c55e' : '#ef4444', fontWeight: 700, fontSize: '0.9rem' }}>
                        🪙 Gold: {goldNet >= 0 ? '+' : ''}{goldNet.toFixed(1)} /day
                      </span>
                      <span style={{ color: '#94a3b8', fontSize: '0.82rem' }}>
                        🏦 {storedGold.toFixed(1)} stored
                        {dailyGoldConsumption > 0 && ` · ${goldDaysLeftIfNoProduction === Number.POSITIVE_INFINITY ? '∞' : goldDaysLeftIfNoProduction.toFixed(0)}d reserve`}
                      </span>
                      <span style={{ color: '#64748b', fontSize: '0.74rem' }}>
                        Upkeep: {dailyGoldConsumption.toFixed(1)}/day
                        {' '}({(totalPopulation / 10).toFixed(1)} population
                        {militiaReserveCount > 0 && ` · ${militiaReserveCount} Militia`}
                        {otherSoldierReserveCount > 0 && ` · ${otherSoldierReserveCount} soldier(s) ×2`})
                      </span>
                      {storedGold <= 0 && dailyGoldConsumption > 0 && (
                        <span style={{ color: '#fca5a5', fontSize: '0.78rem', fontWeight: 600 }}>
                          ⚠️ Unpaid gold upkeep — population will emigrate
                        </span>
                      )}
                    </div>
                  );
                })()}

                {/* ── Unrest (Tier 5+ civic stability) ── */}
                {Number(fiefDetails?.tier || 1) >= 5 && (() => {
                  const barColor = currentUnrest >= UNREST_REVOLT_FLOOR ? '#ef4444' : currentUnrest > UNREST_PENALTY_FLOOR ? '#fbbf24' : '#22c55e';
                  return (
                    <div style={{ paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                        <span style={{ color: '#94a3b8', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>⚖️ Unrest</span>
                        <span style={{ color: barColor, fontWeight: 700, fontSize: '0.85rem' }}>{currentUnrest.toFixed(0)} / 100</span>
                      </div>
                      <div style={{ height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${currentUnrest}%`, background: barColor, borderRadius: '4px', transition: 'width 0.3s ease' }} />
                      </div>
                      <div style={{ marginTop: '0.4rem', display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                        <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>
                          Civic capacity supports {unrestSupportedPopulation.toFixed(0)} population
                          {totalPopulation > unrestSupportedPopulation && (
                            <span style={{ color: '#fbbf24' }}> — {(totalPopulation - unrestSupportedPopulation).toFixed(0)} over</span>
                          )}
                        </span>
                        {unrestProductionPenaltyPct > 0 && (
                          <span style={{ color: '#fca5a5', fontSize: '0.78rem', fontWeight: 600 }}>
                            −{unrestProductionPenaltyPct.toFixed(0)}% production
                          </span>
                        )}
                        {unrestRevoltChancePct > 0 && (
                          <span style={{ color: '#ef4444', fontSize: '0.78rem', fontWeight: 700 }}>
                            🔥 {unrestRevoltChancePct.toFixed(0)}% revolt risk/day — soldiers and citizens will die if it breaks out
                          </span>
                        )}
                      </div>
                      {unrestTarget > currentUnrest && (
                        <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: '0.2rem', fontStyle: 'italic' }}>
                          Rising toward {unrestTarget.toFixed(0)} — build Guard Post→Barracks→Shield Hall, the Faith Temple chain, or Council Hall/Diplomatic Office to raise civic capacity.
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
              </>
              )}





              {(() => {
                const showSlaves = hasPrisonInfrastructure || slaves > 0 || totalSlaveAssigned > 0;
                const renderModifier = (key: string) => {
                  const RESOURCE_KEYS = ['vegetables', 'meat', 'wood', 'stone', 'iron', 'minerals', 'faith', 'research', 'gold'];
                  const badges: React.ReactNode[] = [];

                  // Location modifier badge (amber) — all keys
                  const locationMods = (fiefDetails?.location_modifiers && typeof fiefDetails.location_modifiers === 'object')
                    ? fiefDetails.location_modifiers as Record<string, number>
                    : {};
                  const locationMod = Number(locationMods[key] || 0);
                  if (locationMod !== 0) {
                    const locPct = Math.round(Math.abs(locationMod) * 100);
                    const locColor = locationMod > 0 ? '#f59e0b' : '#f87171';
                    badges.push(
                      <span key="loc" style={{ color: locColor, fontSize: '0.72rem', fontWeight: 600 }}>
                        📍 {locationMod > 0 ? '+' : '-'}{locPct}% terrain
                      </span>
                    );
                  }

                  if (currentCampaignDay && RESOURCE_KEYS.includes(key)) {
                    const logisticsLevel = Math.max(0, Number(productionByLane.foodBreakdown.logisticsLevel || 0));
                    // Logistics badge (green) — resource keys only
                    if (logisticsLevel > 0) {
                      badges.push(
                        <span key="log" style={{ color: '#22c55e', fontSize: '0.72rem', fontWeight: 600 }}>
                          🏭 +{logisticsLevel * 5}% logistics
                        </span>
                      );
                    }
                    // Seasonal badge (green/red) — resource keys only
                    const season = currentSeason || getSeasonForDay(currentCampaignDay);
                    const effects = (currentSeasonEffects && typeof currentSeasonEffects === 'object') ? currentSeasonEffects : getSeasonEffects(season);
                    const displayKey = key === 'iron' ? 'minerals' : key;
                    const resourceModifier = effects[displayKey] || 0;
                    if (resourceModifier !== 0) {
                      const isBonus = resourceModifier > 0;
                      const color = isBonus ? '#22c55e' : '#ef4444';
                      const percent = Math.round(Math.abs(resourceModifier) * 100);
                      badges.push(
                        <span key="season" title={`${season} effect: ${isBonus ? '+' : '-'}${percent}% production`} style={{ color, fontSize: '0.72rem', fontWeight: 600, cursor: 'help' }}>
                          {season} {isBonus ? '📈' : '📉'} {isBonus ? '+' : '-'}{percent}%
                        </span>
                      );
                    }
                  }

                  const legendaryBonusByResource: Record<string, string> = {
                    wood: 'wood_bonus_pct',
                    stone: 'stone_bonus_pct',
                    iron: 'iron_bonus_pct',
                    meat: 'meat_bonus_pct',
                    vegetables: 'vegetables_bonus_pct',
                    gold: 'gold_bonus_pct',
                    research: 'research_bonus_pct',
                    faith: 'faith_bonus_pct',
                    building: 'building_bonus_pct',
                  };
                  const legendaryBonusKey = legendaryBonusByResource[key];
                  const legendaryPct = legendaryBonusKey ? Number(fiefLegendaryBonuses[legendaryBonusKey] || 0) : 0;
                  if (legendaryPct !== 0) {
                    badges.push(
                      <span key="legendary" style={{ color: '#93c5fd', fontSize: '0.72rem', fontWeight: 600 }}>
                        ⭐ {legendaryPct > 0 ? '+' : ''}{Math.round(legendaryPct)}% legendary
                      </span>
                    );
                  }

                  if (badges.length === 0) return null;
                  if (badges.length === 1) return badges[0];
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', alignItems: 'center' }}>
                      {badges}
                    </div>
                  );
                };

                const citizenControls = (row: { key: string; assigned: number; max: number }) => (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem', flexWrap: 'wrap', padding: '0.4rem 0.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.2rem' }}>
                      {WORKER_STEP_OPTIONS.slice().reverse().map((step) => (
                        <button key={`minus-${row.key}-${step}`} onClick={() => adjustWorkers(row.key, -step)} disabled={busy === 'workers'}
                          style={{ padding: '0.15rem 0.32rem', borderRadius: '0.3rem', border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(127,29,29,0.3)', color: '#fca5a5', cursor: 'pointer', fontSize: '0.78rem' }}>
                          -{step}
                        </button>
                      ))}
                    </div>
                    <span style={{ minWidth: '80px', textAlign: 'center', color: '#f8fafc', fontWeight: 700, fontSize: '1.45rem', lineHeight: 1 }}>{row.assigned}/{row.max}</span>
                    <div style={{ display: 'flex', gap: '0.2rem' }}>
                      {WORKER_STEP_OPTIONS.map((step) => (
                        <button key={`plus-${row.key}-${step}`} onClick={() => adjustWorkers(row.key, step)} disabled={busy === 'workers'}
                          style={{ padding: '0.15rem 0.32rem', borderRadius: '0.3rem', border: '1px solid rgba(34,197,94,0.35)', background: 'rgba(20,83,45,0.35)', color: '#86efac', cursor: 'pointer', fontSize: '0.78rem' }}>
                          +{step}
                        </button>
                      ))}
                    </div>
                  </div>
                );

                const slaveControls = (row: { key: string; assigned: number; max: number }) => (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem', flexWrap: 'wrap', padding: '0.4rem 0.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.2rem' }}>
                      {WORKER_STEP_OPTIONS.slice().reverse().map((step) => (
                        <button key={`slave-minus-${row.key}-${step}`} onClick={() => adjustSlaveWorkers(row.key, -step)} disabled={busy === 'slave-workers'}
                          style={{ padding: '0.15rem 0.32rem', borderRadius: '0.3rem', border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(127,29,29,0.3)', color: '#fca5a5', cursor: 'pointer', fontSize: '0.78rem' }}>
                          -{step}
                        </button>
                      ))}
                    </div>
                    <span style={{ minWidth: '80px', textAlign: 'center', color: '#f8fafc', fontWeight: 700, fontSize: '1.45rem', lineHeight: 1 }}>{row.assigned}/{row.max}</span>
                    <div style={{ display: 'flex', gap: '0.2rem' }}>
                      {WORKER_STEP_OPTIONS.map((step) => (
                        <button key={`slave-plus-${row.key}-${step}`} onClick={() => adjustSlaveWorkers(row.key, step)} disabled={busy === 'slave-workers'}
                          style={{ padding: '0.15rem 0.32rem', borderRadius: '0.3rem', border: '1px solid rgba(34,197,94,0.35)', background: 'rgba(20,83,45,0.35)', color: '#86efac', cursor: 'pointer', fontSize: '0.78rem' }}>
                          +{step}
                        </button>
                      ))}
                    </div>
                  </div>
                );

                const totalCell = (key: string) => {
                  const output = Number(productionByLane.output[key] || 0);
                  const outputColor = output > 0 ? '#22c55e' : output < 0 ? '#ef4444' : '#94a3b8';
                  const suffix = key === 'building' ? 'build/day' : key === 'vegetables' ? 'food/cycle' : '/day';
                  const modifier = renderModifier(key);
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.1rem', padding: '0.4rem 0.6rem', height: '100%' }}>
                      <span style={{ color: outputColor, fontWeight: 700, fontSize: '1.05rem' }}>{formatSigned(output)}</span>
                      <span style={{ color: '#475569', fontSize: '0.7rem' }}>{suffix}</span>
                      <div style={{ minHeight: '1.15rem', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>{modifier}</div>
                    </div>
                  );
                };

                const headerCols = showSlaves ? '80px 1px 1fr 1px 1fr 1px 140px' : '80px 1px 1fr 1px 140px';
                const laneCols   = showSlaves ? '80px 1px 1fr 1px 1fr 1px 140px' : '80px 1px 1fr 1px 140px';

                return (
                  <div style={{ border: '1px solid rgba(148,163,184,0.2)', borderRadius: '0.6rem', background: 'rgba(2,6,23,0.35)', overflow: 'hidden' }}>
                    {/* Column headers */}
                    <div style={{ display: 'grid', gridTemplateColumns: headerCols }}>
                      <div style={{ padding: '0.7rem 0.4rem 0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Resource</span>
                      </div>
                      <div style={{ background: 'rgba(148,163,184,0.15)' }} />
                      <div style={{ padding: '0.7rem 0.8rem 0.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <div style={{ color: 'var(--text-gold)', fontWeight: 700, fontSize: '0.95rem' }}>⚒ Workers — Citizens</div>
                          <button
                            onClick={unassignAllCitizenWorkers}
                            disabled={busy === 'workers' || totalAssigned <= 0}
                            style={{
                              padding: '0.2rem 0.52rem',
                              borderRadius: '0.35rem',
                              border: '1px solid rgba(239,68,68,0.45)',
                              background: 'rgba(127,29,29,0.35)',
                              color: '#fca5a5',
                              fontWeight: 700,
                              fontSize: '0.72rem',
                              cursor: (busy === 'workers' || totalAssigned <= 0) ? 'not-allowed' : 'pointer',
                              opacity: (busy === 'workers' || totalAssigned <= 0) ? 0.55 : 1,
                            }}
                          >
                            Unassign All
                          </button>
                        </div>
                        <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: '0.2rem' }}>Assigned: {totalAssigned} / {assignablePopulation} assignable adults</div>
                      </div>
                      {showSlaves && <div style={{ background: 'rgba(148,163,184,0.15)' }} />}
                      {showSlaves && (
                        <div style={{ padding: '0.7rem 0.8rem 0.5rem', background: 'rgba(120,53,15,0.18)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <div style={{ color: '#fde68a', fontWeight: 700, fontSize: '0.95rem' }}>⛓ Workers — Slave Labor</div>
                            <button
                              onClick={unassignAllSlaveWorkers}
                              disabled={busy === 'slave-workers' || totalSlaveAssigned <= 0}
                              style={{
                                padding: '0.2rem 0.52rem',
                                borderRadius: '0.35rem',
                                border: '1px solid rgba(239,68,68,0.45)',
                                background: 'rgba(127,29,29,0.35)',
                                color: '#fca5a5',
                                fontWeight: 700,
                                fontSize: '0.72rem',
                                cursor: (busy === 'slave-workers' || totalSlaveAssigned <= 0) ? 'not-allowed' : 'pointer',
                                opacity: (busy === 'slave-workers' || totalSlaveAssigned <= 0) ? 0.55 : 1,
                              }}
                            >
                              Unassign All
                            </button>
                          </div>
                          <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: '0.2rem' }}>Assigned: {totalSlaveAssigned} / {slaves} slaves</div>
                        </div>
                      )}
                      <div style={{ background: 'rgba(148,163,184,0.15)' }} />
                      <div style={{ padding: '0.7rem 0.6rem 0.5rem', background: 'rgba(15,23,42,0.5)', textAlign: 'center' }}>
                        <div style={{ color: '#cbd5e1', fontWeight: 700, fontSize: '0.85rem' }}>Total Output</div>
                      </div>
                    </div>

                    {/* Divider under headers */}
                    <div style={{ height: '1px', background: 'rgba(148,163,184,0.15)' }} />

                    {/* Lane rows */}
                    {resourceRows.map((citizenRow, idx) => {
                      const slaveRow = showSlaves ? slaveResourceRows.find(r => r.key === citizenRow.key) : null;
                      const isEven = idx % 2 === 0;
                      const rowBg = isEven ? 'rgba(255,255,255,0.02)' : 'transparent';
                      return (
                        <div key={citizenRow.key} style={{ display: 'grid', gridTemplateColumns: laneCols, background: rowBg, borderTop: idx > 0 ? '1px solid rgba(148,163,184,0.08)' : undefined, alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.3rem 0.2rem' }}>
                            <span style={{ color: '#cbd5e1', textTransform: 'capitalize', fontSize: '0.85rem', fontWeight: 600, textAlign: 'center' }}>{citizenRow.key}</span>
                          </div>
                          <div style={{ background: 'rgba(148,163,184,0.15)', alignSelf: 'stretch' }} />
                          <div>{citizenControls(citizenRow)}</div>
                          {showSlaves && <div style={{ background: 'rgba(148,163,184,0.15)', alignSelf: 'stretch' }} />}
                          {showSlaves && (
                            <div style={{ background: 'rgba(120,53,15,0.10)' }}>
                              {slaveRow
                                ? slaveControls(slaveRow)
                                : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.4rem', color: '#94a3b8', opacity: 0.35 }}>—</div>
                              }
                            </div>
                          )}
                          <div style={{ background: 'rgba(148,163,184,0.15)', alignSelf: 'stretch' }} />
                          <div style={{ background: 'rgba(15,23,42,0.4)', alignSelf: 'stretch' }}>{totalCell(citizenRow.key)}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              <div style={{ padding: '0.8rem', border: '1px solid rgba(148,163,184,0.2)', borderRadius: '0.6rem', background: 'rgba(2,6,23,0.35)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
                  <div style={{ color: 'var(--text-gold)', fontWeight: 700 }}>Construction</div>
                  <div style={{ display: 'flex', gap: '0.45rem' }}>
                    <button
                      onClick={() => {
                        setBuildTab('all');
                        setShowBuildModal(true);
                      }}
                      style={{
                        padding: '0.38rem 0.7rem',
                        borderRadius: '0.45rem',
                        border: '1px solid rgba(var(--theme-accent-rgb),0.45)',
                        background: 'rgba(120,53,15,0.35)',
                        color: 'var(--text-gold)',
                        cursor: 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      Build
                    </button>
                    <button
                      onClick={() => setShowBuildQueueModal(true)}
                      style={{
                        padding: '0.38rem 0.7rem',
                        borderRadius: '0.45rem',
                        border: '1px solid rgba(148,163,184,0.45)',
                        background: 'rgba(30,41,59,0.5)',
                        color: '#cbd5e1',
                        cursor: 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      📋 Build Queue{buildQueueOrder.length > 0 ? ` (${buildQueueOrder.length})` : ''}
                    </button>
                    {hasCompletedResearchLab && (
                      <button
                        onClick={() => {
                          setResearchTab('all');
                          setShowResearchModal(true);
                        }}
                        style={{
                          padding: '0.38rem 0.7rem',
                          borderRadius: '0.45rem',
                          border: '1px solid rgba(59,130,246,0.45)',
                          background: 'rgba(30,58,138,0.35)',
                          color: '#93c5fd',
                          cursor: 'pointer',
                          fontWeight: 700,
                        }}
                      >
                        📘 Research
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ color: '#94a3b8', fontSize: '0.76rem', marginBottom: '0.6rem' }}>Built and in-progress structures</div>
                {BUILD_TABS.map((category) => {
                  if (category === 'all') return null;
                  const buildingsInCategory = (fiefDetails.buildings || []).filter((b: any) => getBuildingCategory(b) === category);
                  if (buildingsInCategory.length === 0) return null;

                  const categoryColors = BUILD_TAB_COLORS[category];
                  return (
                    <div key={category} style={{ marginBottom: '0.8rem' }}>
                      <div style={{ color: categoryColors.text, fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {BUILD_TAB_LABELS[category]}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem', marginBottom: '0.6rem' }}>
                        {(() => {
                          // Group identical tiles (same type, tier/level and construction status) and show a count badge instead of one tile per building.
                          const groupsByKey = new Map<string, { rep: any; ids: number[] }>();
                          for (const b of buildingsInCategory) {
                            const groupKey = [
                              String(b.building_type),
                              Number(b.level || 1),
                              b.is_complete ? 'done' : `building:${Number(b.days_remaining || 0)}`,
                            ].join('|');
                            const existing = groupsByKey.get(groupKey);
                            if (existing) {
                              existing.ids.push(Number(b.id));
                            } else {
                              groupsByKey.set(groupKey, { rep: b, ids: [Number(b.id)] });
                            }
                          }
                          const groups = Array.from(groupsByKey.values()).sort((a, b) => String(a.rep.name || '').localeCompare(String(b.rep.name || '')));

                          return groups.map(({ rep: b, ids }) => {
                            const upgrade = upgradeByBuildingId.get(Number(b.id));
                            const count = ids.length;

                            return (
                              <div
                                key={ids.join(',')}
                                onMouseEnter={b.is_complete ? (e) => {
                                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                  setHoveredBuilding({ building: b, x: rect.left, y: rect.bottom + 6 });
                                } : undefined}
                                onMouseLeave={b.is_complete ? () => setHoveredBuilding(null) : undefined}
                                style={{
                                  borderRadius: '0.55rem',
                                  border: `1px solid ${categoryColors.border}`,
                                  background: categoryColors.background,
                                  opacity: b.is_complete ? 1 : 0.75,
                                  padding: '0.5rem 0.6rem',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '0.16rem',
                                  cursor: b.is_complete ? 'default' : undefined,
                                  position: 'relative',
                                }}
                              >
                                {count > 1 && (
                                  <span style={{
                                    position: 'absolute',
                                    top: '-0.4rem',
                                    right: '-0.4rem',
                                    background: 'var(--text-gold)',
                                    color: '#1c1206',
                                    borderRadius: '999px',
                                    minWidth: '1.3rem',
                                    height: '1.3rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.7rem',
                                    fontWeight: 800,
                                    padding: '0 0.3rem',
                                    boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
                                  }}>
                                    ×{count}
                                  </span>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                                  <span style={{ color: '#e2e8f0', fontSize: '0.9rem', fontWeight: 700 }}>{b.name}</span>
                                  {upgrade && (
                                    <button
                                      onClick={() => {
                                        setSelectedUpgradeBuildingId(Number(b.id));
                                        setShowUpgradeModal(true);
                                      }}
                                      disabled={busy === `upgrade-building-${Number(b.id)}`}
                                      style={{
                                        padding: '0.14rem 0.4rem',
                                        borderRadius: '0.34rem',
                                        border: busy === `upgrade-building-${Number(b.id)}`
                                          ? '1px solid rgba(148,163,184,0.45)'
                                          : upgrade.canUpgrade
                                            ? '1px solid rgba(34,197,94,0.6)'
                                            : '1px solid rgba(239,68,68,0.55)',
                                        background: busy === `upgrade-building-${Number(b.id)}`
                                          ? 'rgba(71,85,105,0.35)'
                                          : upgrade.canUpgrade
                                            ? 'rgba(20,83,45,0.38)'
                                            : 'rgba(127,29,29,0.34)',
                                        color: busy === `upgrade-building-${Number(b.id)}`
                                          ? '#94a3b8'
                                          : upgrade.canUpgrade
                                            ? '#86efac'
                                            : '#fca5a5',
                                        cursor: busy === `upgrade-building-${Number(b.id)}` ? 'not-allowed' : 'pointer',
                                        fontSize: '0.72rem',
                                        fontWeight: 700,
                                      }}
                                    >
                                      {/* Upgrade always targets a single building's id — grouping never lets one upgrade affect the whole stack. */}
                                      {busy === `upgrade-building-${Number(b.id)}` ? '...' : (count > 1 ? '↑ Upgrade 1' : '↑ Upgrade')}
                                    </button>
                                  )}
                                </div>
                                <span style={{ color: '#94a3b8', fontSize: '0.74rem', textTransform: 'uppercase' }}>{b.building_type}</span>
                                <span style={{ fontSize: '0.8rem', color: b.is_complete ? '#86efac' : 'var(--text-gold)' }}>
                                  {b.is_complete ? 'Completed' : `${Number(b.days_remaining || 0)} day(s) remaining`}
                                </span>
                                {count > 1 && upgrade && (
                                  <span style={{ color: '#64748b', fontSize: '0.68rem', fontStyle: 'italic' }}>
                                    Upgrades 1 of {count} — cost applies once
                                  </span>
                                )}
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  );
                })}
              </div>
              {hasMilitiaBuilding && (
              <div style={{ padding: '0.8rem', border: '1px solid rgba(148,163,184,0.2)', borderRadius: '0.6rem', background: 'rgba(2,6,23,0.35)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <div style={{ color: 'var(--text-gold)', fontWeight: 700 }}>Militia & Unit Training</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <div style={{ color: '#cbd5e1', fontSize: '0.85rem' }}>Unassigned adults: {unassignedAdults}</div>
                    <button
                      onClick={() => setShowProgressionModal(true)}
                      style={{ padding: '0.25rem 0.5rem', borderRadius: '0.35rem', border: '1px solid rgba(var(--theme-accent-rgb),0.45)', background: 'rgba(120,53,15,0.35)', color: 'var(--text-gold)', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}
                    >
                      📖 View Troop Progression
                    </button>
                  </div>
                </div>

                <div style={{ marginTop: '0.7rem', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '0.45rem', alignItems: 'end' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.18rem', color: '#cbd5e1', fontSize: '0.75rem' }}>
                    Unit Type
                    <select
                      value={selectedTrainUnitType}
                      onChange={(e) => setSelectedTrainUnitType(String(e.target.value || 'Militia'))}
                      style={{ padding: '0.3rem 0.4rem', borderRadius: '0.35rem', border: '1px solid rgba(var(--theme-accent-rgb),0.35)', background: 'rgba(15,23,42,0.6)', color: '#e2e8f0' }}
                    >
                      {(fiefDetails?.trainable_unit_types || []).length === 0 ? (
                        <option value="">No units unlocked yet</option>
                      ) : (
                        (fiefDetails?.trainable_unit_types || []).map((unit) => (
                          <option key={unit} value={unit}>{unit}</option>
                        ))
                      )}
                    </select>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.18rem', color: '#cbd5e1', fontSize: '0.75rem' }}>
                    Amount
                    <input
                      type="number"
                      min={1}
                      value={trainUnitsAmount}
                      onChange={(e) => setTrainUnitsAmount(e.target.value)}
                      style={{ padding: '0.3rem 0.4rem', borderRadius: '0.35rem', border: '1px solid rgba(var(--theme-accent-rgb),0.35)', background: 'rgba(15,23,42,0.6)', color: '#e2e8f0' }}
                    />
                  </label>
                  <div style={{ color: 'var(--text-gold)', fontSize: '0.75rem' }}>
                    {(() => {
                      const speedPct = Math.min(90, Number((fiefDetails?.legendary_bonuses || {}).unit_training_speed_reduction_pct || 0));
                      return speedPct >= 0
                        ? `Speed bonus: -${speedPct.toFixed(1)}%`
                        : `Speed penalty: +${Math.abs(speedPct).toFixed(1)}%`;
                    })()}
                  </div>
                  <button
                    onClick={trainSoldiers}
                    disabled={busy === 'train-soldiers' || unassignedAdults <= 0}
                    style={{
                      padding: '0.3rem 0.65rem',
                      borderRadius: '0.35rem',
                      border: '1px solid rgba(var(--theme-accent-rgb),0.45)',
                      background: 'rgba(120,53,15,0.35)',
                      color: 'var(--text-gold)',
                      fontWeight: 700,
                      cursor: 'pointer',
                      opacity: (busy === 'train-soldiers' || unassignedAdults <= 0) ? 0.6 : 1,
                    }}
                  >
                    {busy === 'train-soldiers' ? 'Queueing...' : 'Queue Training'}
                  </button>
                </div>

                <div style={{ marginTop: '0.65rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={collectTrainedUnits}
                    disabled={busy === 'collect-units'}
                    style={{ padding: '0.25rem 0.55rem', borderRadius: '0.35rem', border: '1px solid rgba(34,197,94,0.45)', background: 'rgba(20,83,45,0.35)', color: '#86efac', fontWeight: 700, cursor: 'pointer' }}
                  >
                    {busy === 'collect-units' ? 'Collecting...' : 'Collect Completed Units'}
                  </button>
                </div>

                <div style={{ marginTop: '0.65rem', borderTop: '1px solid rgba(148,163,184,0.18)', paddingTop: '0.55rem' }}>
                  <div style={{ color: 'var(--text-gold)', fontWeight: 700, fontSize: '0.82rem', marginBottom: '0.35rem' }}>In Training (Per Unit Timers)</div>
                  {(fiefDetails?.training_queue || []).length === 0 ? (
                    <div style={{ color: '#64748b', fontSize: '0.8rem' }}>No units currently in training.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {(fiefDetails?.training_queue || []).map((row) => {
                        const isReady = String(row.status || '').toLowerCase() === 'ready';
                        return (
                          <div
                            key={row.id}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '1.4fr 0.9fr 0.9fr 1.2fr',
                              gap: '0.4rem',
                              alignItems: 'center',
                              padding: '0.3rem 0.4rem',
                              borderRadius: '0.35rem',
                              background: isReady ? 'rgba(20,83,45,0.35)' : 'rgba(15,23,42,0.45)',
                              border: isReady ? '1px solid rgba(34,197,94,0.5)' : '1px solid rgba(148,163,184,0.18)',
                              boxShadow: isReady ? 'inset 0 0 0 1px rgba(34,197,94,0.25)' : undefined,
                            }}
                          >
                            <span style={{ color: '#e2e8f0', fontSize: '0.8rem', fontWeight: 600 }}>{row.unit_type}</span>
                            <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>#{row.id}</span>
                            <span style={{ color: isReady ? '#86efac' : 'var(--text-gold)', fontSize: '0.75rem', fontWeight: isReady ? 700 : 500 }}>
                              {isReady ? 'Ready to collect' : row.status}
                            </span>
                            <span style={{ color: isReady ? '#bbf7d0' : 'var(--text-gold)', fontSize: '0.75rem', fontWeight: isReady ? 700 : 500 }}>
                              {isReady ? 'Collect now' : `${Math.max(0, Number(row.days_remaining || 0))}d left`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div style={{ marginTop: '0.65rem', borderTop: '1px solid rgba(148,163,184,0.18)', paddingTop: '0.55rem' }}>
                  <div style={{ color: 'var(--text-gold)', fontWeight: 700, fontSize: '0.82rem', marginBottom: '0.35rem' }}>Reserve Units</div>
                  {(() => {
                    const entries = Object.entries(fiefDetails?.unit_reserves || {}).filter(([, amount]) => Math.max(0, Number(amount || 0)) > 0);
                    if (entries.length === 0) {
                      return <div style={{ color: '#64748b', fontSize: '0.8rem' }}>No reserve units available yet.</div>;
                    }
                    const grouped = new Map<string, Array<[string, number]>>();
                    for (const [unit, amount] of entries) {
                      const lineKey = unitTypeToLine.get(unit) || 'Other';
                      if (!grouped.has(lineKey)) grouped.set(lineKey, []);
                      grouped.get(lineKey)!.push([unit, Math.max(0, Number(amount || 0))]);
                    }
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                        {Array.from(grouped.entries()).map(([lineKey, unitEntries]) => (
                          <div key={lineKey} style={{ border: '1px solid rgba(148,163,184,0.15)', borderRadius: '0.4rem', background: 'rgba(15,23,42,0.35)', padding: '0.4rem' }}>
                            <div style={{ color: '#94a3b8', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>{lineKey}</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                              {unitEntries.map(([unit, amount]) => (
                                <span key={unit} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.28rem', border: '1px solid rgba(var(--theme-accent-rgb),0.35)', borderRadius: '0.35rem', padding: '0.15rem 0.45rem', background: 'rgba(120,53,15,0.2)', color: 'var(--text-gold)', fontSize: '0.76rem' }}>
                                  <strong style={{ color: '#e2e8f0' }}>{unit}</strong>
                                  <span>{amount}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                <div style={{ marginTop: '0.65rem', borderTop: '1px solid rgba(148,163,184,0.18)', paddingTop: '0.55rem' }}>
                  <div style={{ color: 'var(--text-gold)', fontWeight: 700, fontSize: '0.82rem', marginBottom: '0.35rem' }}>Upgrade Units</div>
                  {(fiefDetails?.upgradable_units || []).length === 0 ? (
                    <div style={{ color: '#64748b', fontSize: '0.8rem' }}>No reserve units are eligible for an upgrade yet.</div>
                  ) : (
                    (() => {
                      const grouped = new Map<string, Array<NonNullable<typeof fiefDetails.upgradable_units>[number]>>();
                      for (const u of (fiefDetails?.upgradable_units || [])) {
                        // Militia specializes across many lines, so group those by the destination line instead of "Militia".
                        const lineKey = u.unit_type === 'Militia'
                          ? (unitTypeToLine.get(u.next_unit_type) || 'Other')
                          : (unitTypeToLine.get(u.unit_type) || 'Other');
                        if (!grouped.has(lineKey)) grouped.set(lineKey, []);
                        grouped.get(lineKey)!.push(u);
                      }
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {Array.from(grouped.entries()).map(([lineKey, units]) => (
                            <div key={lineKey} style={{ border: '1px solid rgba(148,163,184,0.15)', borderRadius: '0.4rem', background: 'rgba(15,23,42,0.35)', padding: '0.4rem' }}>
                              <div style={{ color: '#94a3b8', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' }}>{lineKey}</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                {units.map((u) => {
                                  const amountKey = `${u.unit_type}->${u.next_unit_type}`;
                                  const amount = upgradeAmountByUnit[amountKey] || '1';
                                  const busyKey = `upgrade-units-${u.unit_type}-${u.next_unit_type}`;
                                  return (
                                    <div key={amountKey} style={{ border: '1px solid rgba(148,163,184,0.2)', borderRadius: '0.4rem', background: 'rgba(15,23,42,0.45)', padding: '0.45rem' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.3rem' }}>
                                        <span style={{ color: '#e2e8f0', fontSize: '0.8rem', fontWeight: 700 }}>{u.unit_type} → {u.next_unit_type}</span>
                                        <span style={{ color: u.unlocked ? '#86efac' : '#fca5a5', fontSize: '0.72rem' }}>
                                          {u.unlocked ? `${u.next_base_days}d training` : `Requires ${u.required_building_type || 'higher tier building'}`}
                                        </span>
                                      </div>
                                      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.35rem', alignItems: 'end' }}>
                                        <input
                                          type="number"
                                          min={1}
                                          max={u.available}
                                          value={amount}
                                          onChange={(e) => setUpgradeAmountByUnit((prev) => ({ ...prev, [amountKey]: e.target.value }))}
                                          style={{ padding: '0.28rem 0.35rem', borderRadius: '0.3rem', border: '1px solid rgba(var(--theme-accent-rgb),0.35)', background: 'rgba(15,23,42,0.6)', color: '#e2e8f0' }}
                                        />
                                        <button
                                          onClick={() => upgradeMilitiaUnits(u.unit_type, Math.max(0, Math.floor(Number(amount) || 0)), u.next_unit_type)}
                                          disabled={!u.unlocked || busy === busyKey}
                                          style={{ padding: '0.3rem 0.6rem', borderRadius: '0.35rem', border: '1px solid rgba(var(--theme-accent-rgb),0.45)', background: 'rgba(120,53,15,0.35)', color: 'var(--text-gold)', fontWeight: 700, cursor: 'pointer', opacity: (!u.unlocked || busy === busyKey) ? 0.55 : 1 }}
                                        >
                                          {busy === busyKey ? 'Queueing...' : `Upgrade (${u.available} available)`}
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()
                  )}
                </div>

                <div style={{ marginTop: '0.65rem', borderTop: '1px solid rgba(148,163,184,0.18)', paddingTop: '0.55rem' }}>
                  <div style={{ color: 'var(--text-gold)', fontWeight: 700, fontSize: '0.82rem', marginBottom: '0.35rem' }}>Defensive Guards</div>
                  {(fiefDetails?.guard_assignments || []).length === 0 ? (
                    <div style={{ color: '#64748b', fontSize: '0.8rem' }}>No eligible defensive buildings with guard capacity.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {(fiefDetails?.guard_assignments || []).map((g) => {
                        const pct = g.capacity > 0 ? Math.min(1, g.assigned_total / g.capacity) : 0;
                        const barColor = pct >= 1 ? '#ef4444' : pct >= 0.75 ? '#fbbf24' : '#22c55e';
                        const reserveEntries = Object.entries(fiefDetails?.unit_reserves || {}).filter(([, c]) => Math.max(0, Number(c || 0)) > 0);
                        const assignedEntries = Object.entries(g.assigned_by_type || {}).filter(([, c]) => Math.max(0, Number(c || 0)) > 0);
                        const remainingCapacity = Math.max(0, g.capacity - g.assigned_total);
                        return (
                          <div key={g.building_type} style={{ border: '1px solid rgba(148,163,184,0.2)', borderRadius: '0.5rem', background: 'rgba(15,23,42,0.45)', padding: '0.55rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.3rem' }}>
                              <span style={{ color: '#e2e8f0', fontSize: '0.82rem', fontWeight: 700 }}>{g.building_name}</span>
                              <span style={{ color: barColor, fontSize: '0.75rem', fontWeight: 700 }}>{g.assigned_total} / {g.capacity} guards</span>
                            </div>
                            <div style={{ height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginBottom: '0.55rem' }}>
                              <div style={{ height: '100%', width: `${(pct * 100).toFixed(1)}%`, background: barColor, borderRadius: '3px', transition: 'width 0.3s ease' }} />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                              {/* Left: unassigned reserves available to post here */}
                              <div style={{ border: '1px solid rgba(148,163,184,0.15)', borderRadius: '0.4rem', background: 'rgba(2,6,23,0.35)', padding: '0.4rem' }}>
                                <div style={{ color: '#94a3b8', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>Unassigned Reserves</div>
                                {reserveEntries.length === 0 ? (
                                  <div style={{ color: '#64748b', fontSize: '0.74rem' }}>No reserve units available.</div>
                                ) : (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                    {reserveEntries.map(([unit, count]) => (
                                      <div key={unit} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.35rem' }}>
                                        <span style={{ color: '#cbd5e1', fontSize: '0.76rem' }}>{unit} <span style={{ color: '#64748b' }}>x{Math.max(0, Number(count || 0))}</span></span>
                                        <button
                                          onClick={() => adjustBuildingGuardsDirect(g.building_type, unit, 1)}
                                          disabled={busy === `guards-${g.building_type}` || remainingCapacity <= 0}
                                          title={remainingCapacity <= 0 ? 'Post is at capacity' : `Assign 1 ${unit}`}
                                          style={{ padding: '0.12rem 0.4rem', borderRadius: '0.3rem', border: '1px solid rgba(34,197,94,0.4)', background: 'rgba(20,83,45,0.35)', color: '#86efac', fontWeight: 700, cursor: 'pointer', fontSize: '0.72rem', opacity: (busy === `guards-${g.building_type}` || remainingCapacity <= 0) ? 0.5 : 1 }}
                                        >
                                          Assign →
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Right: units currently posted here */}
                              <div style={{ border: '1px solid rgba(148,163,184,0.15)', borderRadius: '0.4rem', background: 'rgba(2,6,23,0.35)', padding: '0.4rem' }}>
                                <div style={{ color: '#94a3b8', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>Assigned Here</div>
                                {assignedEntries.length === 0 ? (
                                  <div style={{ color: '#64748b', fontSize: '0.74rem' }}>No units posted yet.</div>
                                ) : (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                    {assignedEntries.map(([unit, count]) => (
                                      <div key={unit} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.35rem' }}>
                                        <span style={{ color: 'var(--text-gold)', fontSize: '0.76rem' }}>{unit} <span style={{ color: '#64748b' }}>x{Math.max(0, Number(count || 0))}</span></span>
                                        <button
                                          onClick={() => adjustBuildingGuardsDirect(g.building_type, unit, -1)}
                                          disabled={busy === `guards-${g.building_type}`}
                                          title={`Unassign 1 ${unit}`}
                                          style={{ padding: '0.12rem 0.4rem', borderRadius: '0.3rem', border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(127,29,29,0.35)', color: '#fca5a5', fontWeight: 700, cursor: 'pointer', fontSize: '0.72rem', opacity: busy === `guards-${g.building_type}` ? 0.5 : 1 }}
                                        >
                                          ← Unassign
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {isDungeonMaster && (
                  <div style={{ marginTop: '0.65rem', borderTop: '1px solid rgba(148,163,184,0.18)', paddingTop: '0.55rem' }}>
                    <div style={{ color: 'var(--text-gold)', fontWeight: 700, fontSize: '0.82rem', marginBottom: '0.35rem' }}>DM Unit Controls (Population Unchanged)</div>
                    <div style={{ color: '#64748b', fontSize: '0.72rem', marginBottom: '0.5rem' }}>
                      Enter an amount next to any unit(s), then click Add or Remove once to apply them all.
                    </div>
                    <div style={{ display: 'block', width: '100%' }}>
                      {(fiefDetails?.unit_progression || []).map((line) => (
                        <div
                          key={line.line_key}
                          style={{
                            display: 'block',
                            width: '100%',
                            boxSizing: 'border-box',
                            marginBottom: '0.5rem',
                            padding: '0.5rem',
                            border: '1px solid rgba(148,163,184,0.18)',
                            borderRadius: '0.4rem',
                            background: 'rgba(15,23,42,0.35)',
                          }}
                        >
                          <div style={{ color: 'var(--text-gold)', fontSize: '0.72rem', fontWeight: 700, marginBottom: '0.35rem', textAlign: 'left' }}>{line.line_key}</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                            {line.tiers.map((tier) => (
                              <label
                                key={tier.unit_type}
                                style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', color: '#cbd5e1', fontSize: '0.7rem', flex: '0 1 140px', textAlign: 'left' }}
                              >
                                {tier.unit_type}
                                <input
                                  type="number"
                                  value={dmUnitAdjustAmounts[tier.unit_type] || ''}
                                  onChange={(e) => setDmUnitAdjustAmounts((prev) => ({ ...prev, [tier.unit_type]: e.target.value }))}
                                  placeholder="0"
                                  style={{ width: '100%', boxSizing: 'border-box', padding: '0.24rem 0.32rem', borderRadius: '0.3rem', border: '1px solid rgba(var(--theme-accent-rgb),0.35)', background: 'rgba(15,23,42,0.6)', color: '#e2e8f0' }}
                                />
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.55rem' }}>
                      <button
                        onClick={() => dmAddUnitsBatch(1)}
                        disabled={busy === 'dm-adjust-units'}
                        style={{ padding: '0.32rem 0.6rem', borderRadius: '0.3rem', border: '1px solid rgba(34,197,94,0.4)', background: 'rgba(20,83,45,0.35)', color: '#86efac', fontWeight: 700, cursor: 'pointer' }}
                      >
                        {busy === 'dm-adjust-units' ? 'Applying...' : '+ Add'}
                      </button>
                      <button
                        onClick={() => dmAddUnitsBatch(-1)}
                        disabled={busy === 'dm-adjust-units'}
                        style={{ padding: '0.32rem 0.6rem', borderRadius: '0.3rem', border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(127,29,29,0.35)', color: '#fca5a5', fontWeight: 700, cursor: 'pointer' }}
                      >
                        {busy === 'dm-adjust-units' ? 'Applying...' : '- Remove'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              )}
              <div style={{ padding: '0.8rem', border: '1px solid rgba(218,165,32,0.3)', borderRadius: '0.6rem', background: 'rgba(113,63,18,0.25)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                  <div style={{ color: 'var(--text-gold)', fontWeight: 700, fontSize: '1.05rem' }}>⬆️ Fief Tier Upgrade</div>
                  <div style={{ color: '#f8fafc', fontWeight: 700, fontSize: '1rem' }}>Tier {fiefDetails.tier}</div>
                </div>

                {fiefDetails.tier >= 5 ? (
                  <div style={{ color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center', padding: '0.5rem 0' }}>
                    ✓ Maximum tier reached for this phase
                  </div>
                ) : fiefDetails.tier >= 4 ? (
                  <>
                    {Number(fiefDetails.tier_upgrade_days_remaining_5 || 0) > 0 ? (
                      <div style={{ marginBottom: '0.6rem' }}>
                        <div style={{ color: 'var(--text-gold)', fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                          ⏳ Tier 5 Upgrade in Progress
                        </div>
                        <div style={{ color: '#e2e8f0', fontSize: '0.95rem', textAlign: 'center', padding: '0.5rem', background: 'rgba(34,197,94,0.15)', borderRadius: '0.4rem' }}>
                          {Number(fiefDetails.tier_upgrade_days_remaining_5 || 0)} day(s) remaining
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{ marginBottom: '0.6rem' }}>
                          <div style={{ color: '#93c5fd', fontSize: '0.82rem', marginBottom: '0.35rem', fontWeight: 600 }}>Will unlock:</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.4rem' }}>
                            {['Tier 5 Buildings', 'Tier 5 Research', '+1 Legendary Slot', 'Civic Unrest'].map((res) => (
                              <div key={res} style={{ color: '#e2e8f0', fontSize: '0.8rem', padding: '0.3rem 0.5rem', background: 'rgba(148,163,184,0.1)', borderRadius: '0.3rem', textAlign: 'center' }}>
                                🔓 {res}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div style={{ marginBottom: '0.6rem', padding: '0.4rem 0.55rem', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '0.35rem' }}>
                          <span style={{ color: '#fca5a5', fontSize: '0.76rem' }}>
                            ⚠️ Tier 5 introduces Unrest: population growth beyond your civic capacity (Guard chain, Faith chain, Council Hall/Diplomatic Office) saps production, and can erupt into a revolt that costs soldiers and citizens.
                          </span>
                        </div>

                        <div style={{ marginBottom: '0.6rem' }}>
                          <div style={{ color: '#86efac', fontSize: '0.82rem', marginBottom: '0.35rem', fontWeight: 600 }}>Requirements:</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                            <div style={{ color: '#f8fafc', fontSize: '0.9rem', padding: '0.35rem 0.5rem', background: 'rgba(217,119,6,0.15)', borderRadius: '0.3rem', display: 'flex', justifyContent: 'space-between' }}>
                              <span>⏱️ Time:</span>
                              <span style={{ fontWeight: 600 }}>35 days</span>
                            </div>
                            <div style={{ color: '#f8fafc', fontSize: '0.9rem', padding: '0.35rem 0.5rem', background: (storedResources.wood || 0) >= 19500 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', borderRadius: '0.3rem', display: 'flex', justifyContent: 'space-between' }}>
                              <span>🌳 Wood:</span>
                              <span style={{ fontWeight: 600, color: (storedResources.wood || 0) >= 19500 ? '#86efac' : '#ef4444' }}>
                                {(storedResources.wood || 0) >= 19500 ? '✓' : '✗'} {Number(storedResources.wood || 0).toFixed(1)}/19500
                              </span>
                            </div>
                            <div style={{ color: '#f8fafc', fontSize: '0.9rem', padding: '0.35rem 0.5rem', background: (storedResources.stone || 0) >= 9000 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', borderRadius: '0.3rem', display: 'flex', justifyContent: 'space-between' }}>
                              <span>🪨 Stone:</span>
                              <span style={{ fontWeight: 600, color: (storedResources.stone || 0) >= 9000 ? '#86efac' : '#ef4444' }}>
                                {(storedResources.stone || 0) >= 9000 ? '✓' : '✗'} {Number(storedResources.stone || 0).toFixed(1)}/9000
                              </span>
                            </div>
                            <div style={{ color: '#f8fafc', fontSize: '0.9rem', padding: '0.35rem 0.5rem', background: (storedResources.minerals || 0) >= 4500 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', borderRadius: '0.3rem', display: 'flex', justifyContent: 'space-between' }}>
                              <span>⛓️ Iron:</span>
                              <span style={{ fontWeight: 600, color: (storedResources.minerals || 0) >= 4500 ? '#86efac' : '#ef4444' }}>
                                {(storedResources.minerals || 0) >= 4500 ? '✓' : '✗'} {Number(storedResources.minerals || 0).toFixed(1)}/4500
                              </span>
                            </div>
                            <div style={{ color: '#f8fafc', fontSize: '0.9rem', padding: '0.35rem 0.5rem', background: (storedResources.gold || 0) >= 6000 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', borderRadius: '0.3rem', display: 'flex', justifyContent: 'space-between' }}>
                              <span>🪙 Gold:</span>
                              <span style={{ fontWeight: 600, color: (storedResources.gold || 0) >= 6000 ? '#86efac' : '#ef4444' }}>
                                {(storedResources.gold || 0) >= 6000 ? '✓' : '✗'} {Number(storedResources.gold || 0).toFixed(1)}/6000
                              </span>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={startTier5Upgrade}
                          disabled={busy === 'upgrade-tier5' || (storedResources.wood || 0) < 19500 || (storedResources.stone || 0) < 9000 || (storedResources.minerals || 0) < 4500 || (storedResources.gold || 0) < 6000}
                          style={{
                            width: '100%',
                            padding: '0.55rem 0.8rem',
                            borderRadius: '0.45rem',
                            border: '1px solid rgba(var(--theme-accent-rgb),0.5)',
                            background: 'rgba(120,53,15,0.5)',
                            color: 'var(--text-gold)',
                            cursor: busy === 'upgrade-tier5' ? 'not-allowed' : 'pointer',
                            fontWeight: 700,
                            fontSize: '0.95rem',
                            opacity: (busy === 'upgrade-tier5' || (storedResources.wood || 0) < 19500 || (storedResources.stone || 0) < 9000 || (storedResources.minerals || 0) < 4500 || (storedResources.gold || 0) < 6000) ? 0.6 : 1,
                          }}
                        >
                          {busy === 'upgrade-tier5' ? 'Starting...' : 'Start Tier 5 Upgrade'}
                        </button>
                      </>
                    )}
                  </>
                ) : fiefDetails.tier >= 3 ? (
                  <>
                    {Number(fiefDetails.tier_upgrade_days_remaining_4 || 0) > 0 ? (
                      <div style={{ marginBottom: '0.6rem' }}>
                        <div style={{ color: 'var(--text-gold)', fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                          ⏳ Tier 4 Upgrade in Progress
                        </div>
                        <div style={{ color: '#e2e8f0', fontSize: '0.95rem', textAlign: 'center', padding: '0.5rem', background: 'rgba(34,197,94,0.15)', borderRadius: '0.4rem' }}>
                          {Number(fiefDetails.tier_upgrade_days_remaining_4 || 0)} day(s) remaining
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{ marginBottom: '0.6rem' }}>
                          <div style={{ color: '#93c5fd', fontSize: '0.82rem', marginBottom: '0.35rem', fontWeight: 600 }}>Will unlock:</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.4rem' }}>
                            {['Tier 4 Buildings', 'Tier 4 Research', 'Advanced Military', '+1 Legendary Slot'].map((res) => (
                              <div key={res} style={{ color: '#e2e8f0', fontSize: '0.8rem', padding: '0.3rem 0.5rem', background: 'rgba(148,163,184,0.1)', borderRadius: '0.3rem', textAlign: 'center' }}>
                                🔓 {res}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div style={{ marginBottom: '0.6rem' }}>
                          <div style={{ color: '#86efac', fontSize: '0.82rem', marginBottom: '0.35rem', fontWeight: 600 }}>Requirements:</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                            <div style={{ color: '#f8fafc', fontSize: '0.9rem', padding: '0.35rem 0.5rem', background: 'rgba(217,119,6,0.15)', borderRadius: '0.3rem', display: 'flex', justifyContent: 'space-between' }}>
                              <span>⏱️ Time:</span>
                              <span style={{ fontWeight: 600 }}>28 days</span>
                            </div>
                            <div style={{ color: '#f8fafc', fontSize: '0.9rem', padding: '0.35rem 0.5rem', background: (storedResources.wood || 0) >= 4500 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', borderRadius: '0.3rem', display: 'flex', justifyContent: 'space-between' }}>
                              <span>🌳 Wood:</span>
                              <span style={{ fontWeight: 600, color: (storedResources.wood || 0) >= 4500 ? '#86efac' : '#ef4444' }}>
                                {(storedResources.wood || 0) >= 4500 ? '✓' : '✗'} {Number(storedResources.wood || 0).toFixed(1)}/4500
                              </span>
                            </div>
                            <div style={{ color: '#f8fafc', fontSize: '0.9rem', padding: '0.35rem 0.5rem', background: (storedResources.stone || 0) >= 2000 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', borderRadius: '0.3rem', display: 'flex', justifyContent: 'space-between' }}>
                              <span>🪨 Stone:</span>
                              <span style={{ fontWeight: 600, color: (storedResources.stone || 0) >= 2000 ? '#86efac' : '#ef4444' }}>
                                {(storedResources.stone || 0) >= 2000 ? '✓' : '✗'} {Number(storedResources.stone || 0).toFixed(1)}/2000
                              </span>
                            </div>
                            <div style={{ color: '#f8fafc', fontSize: '0.9rem', padding: '0.35rem 0.5rem', background: (storedResources.minerals || 0) >= 1000 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', borderRadius: '0.3rem', display: 'flex', justifyContent: 'space-between' }}>
                              <span>⛓️ Iron:</span>
                              <span style={{ fontWeight: 600, color: (storedResources.minerals || 0) >= 1000 ? '#86efac' : '#ef4444' }}>
                                {(storedResources.minerals || 0) >= 1000 ? '✓' : '✗'} {Number(storedResources.minerals || 0).toFixed(1)}/1000
                              </span>
                            </div>
                            <div style={{ color: '#f8fafc', fontSize: '0.9rem', padding: '0.35rem 0.5rem', background: (storedResources.gold || 0) >= 1000 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', borderRadius: '0.3rem', display: 'flex', justifyContent: 'space-between' }}>
                              <span>🪙 Gold:</span>
                              <span style={{ fontWeight: 600, color: (storedResources.gold || 0) >= 1000 ? '#86efac' : '#ef4444' }}>
                                {(storedResources.gold || 0) >= 1000 ? '✓' : '✗'} {Number(storedResources.gold || 0).toFixed(1)}/1000
                              </span>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={startTier4Upgrade}
                          disabled={busy === 'upgrade-tier4' || (storedResources.wood || 0) < 4500 || (storedResources.stone || 0) < 2000 || (storedResources.minerals || 0) < 1000 || (storedResources.gold || 0) < 1000}
                          style={{
                            width: '100%',
                            padding: '0.55rem 0.8rem',
                            borderRadius: '0.45rem',
                            border: '1px solid rgba(var(--theme-accent-rgb),0.5)',
                            background: 'rgba(120,53,15,0.5)',
                            color: 'var(--text-gold)',
                            cursor: busy === 'upgrade-tier4' ? 'not-allowed' : 'pointer',
                            fontWeight: 700,
                            fontSize: '0.95rem',
                            opacity: (busy === 'upgrade-tier4' || (storedResources.wood || 0) < 4500 || (storedResources.stone || 0) < 2000 || (storedResources.minerals || 0) < 1000 || (storedResources.gold || 0) < 1000) ? 0.6 : 1,
                          }}
                        >
                          {busy === 'upgrade-tier4' ? 'Starting...' : 'Start Tier 4 Upgrade'}
                        </button>
                      </>
                    )}
                  </>
                ) : fiefDetails.tier >= 2 ? (
                  <>
                    {Number(fiefDetails.tier_upgrade_days_remaining_3 || 0) > 0 ? (
                      <div style={{ marginBottom: '0.6rem' }}>
                        <div style={{ color: 'var(--text-gold)', fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                          ⏳ Tier 3 Upgrade in Progress
                        </div>
                        <div style={{ color: '#e2e8f0', fontSize: '0.95rem', textAlign: 'center', padding: '0.5rem', background: 'rgba(34,197,94,0.15)', borderRadius: '0.4rem' }}>
                          {Number(fiefDetails.tier_upgrade_days_remaining_3 || 0)} day(s) remaining
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{ marginBottom: '0.6rem' }}>
                          <div style={{ color: '#93c5fd', fontSize: '0.82rem', marginBottom: '0.35rem', fontWeight: 600 }}>Will unlock:</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.4rem' }}>
                            {['Builders Hut', 'Advanced Buildings', 'Tier 3 Research', 'Higher Throughput'].map((res) => (
                              <div key={res} style={{ color: '#e2e8f0', fontSize: '0.8rem', padding: '0.3rem 0.5rem', background: 'rgba(148,163,184,0.1)', borderRadius: '0.3rem', textAlign: 'center' }}>
                                🔓 {res}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div style={{ marginBottom: '0.6rem' }}>
                          <div style={{ color: '#86efac', fontSize: '0.82rem', marginBottom: '0.35rem', fontWeight: 600 }}>Requirements:</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                            <div style={{ color: '#f8fafc', fontSize: '0.9rem', padding: '0.35rem 0.5rem', background: 'rgba(217,119,6,0.15)', borderRadius: '0.3rem', display: 'flex', justifyContent: 'space-between' }}>
                              <span>⏱️ Time:</span>
                              <span style={{ fontWeight: 600 }}>20 days</span>
                            </div>
                            <div style={{ color: '#f8fafc', fontSize: '0.9rem', padding: '0.35rem 0.5rem', background: (storedResources.wood || 0) >= 300 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', borderRadius: '0.3rem', display: 'flex', justifyContent: 'space-between' }}>
                              <span>🌳 Wood:</span>
                              <span style={{ fontWeight: 600, color: (storedResources.wood || 0) >= 300 ? '#86efac' : '#ef4444' }}>
                                {(storedResources.wood || 0) >= 300 ? '✓' : '✗'} {Number(storedResources.wood || 0).toFixed(1)}/300
                              </span>
                            </div>
                            <div style={{ color: '#f8fafc', fontSize: '0.9rem', padding: '0.35rem 0.5rem', background: (storedResources.stone || 0) >= 100 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', borderRadius: '0.3rem', display: 'flex', justifyContent: 'space-between' }}>
                              <span>🪨 Stone:</span>
                              <span style={{ fontWeight: 600, color: (storedResources.stone || 0) >= 100 ? '#86efac' : '#ef4444' }}>
                                {(storedResources.stone || 0) >= 100 ? '✓' : '✗'} {Number(storedResources.stone || 0).toFixed(1)}/100
                              </span>
                            </div>
                            <div style={{ color: '#f8fafc', fontSize: '0.9rem', padding: '0.35rem 0.5rem', background: (storedResources.minerals || 0) >= 50 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', borderRadius: '0.3rem', display: 'flex', justifyContent: 'space-between' }}>
                              <span>⛓️ Iron:</span>
                              <span style={{ fontWeight: 600, color: (storedResources.minerals || 0) >= 50 ? '#86efac' : '#ef4444' }}>
                                {(storedResources.minerals || 0) >= 50 ? '✓' : '✗'} {Number(storedResources.minerals || 0).toFixed(1)}/50
                              </span>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={startTier3Upgrade}
                          disabled={busy === 'upgrade-tier3' || (storedResources.wood || 0) < 300 || (storedResources.stone || 0) < 100 || (storedResources.minerals || 0) < 50}
                          style={{
                            width: '100%',
                            padding: '0.55rem 0.8rem',
                            borderRadius: '0.45rem',
                            border: '1px solid rgba(var(--theme-accent-rgb),0.5)',
                            background: 'rgba(120,53,15,0.5)',
                            color: 'var(--text-gold)',
                            cursor: busy === 'upgrade-tier3' ? 'not-allowed' : 'pointer',
                            fontWeight: 700,
                            fontSize: '0.95rem',
                            opacity: (busy === 'upgrade-tier3' || (storedResources.wood || 0) < 300 || (storedResources.stone || 0) < 100 || (storedResources.minerals || 0) < 50) ? 0.6 : 1,
                          }}
                        >
                          {busy === 'upgrade-tier3' ? 'Starting...' : 'Start Tier 3 Upgrade'}
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    {Number(fiefDetails.tier_upgrade_days_remaining || 0) > 0 ? (
                      <div style={{ marginBottom: '0.6rem' }}>
                        <div style={{ color: 'var(--text-gold)', fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                          ⏳ Upgrade in Progress
                        </div>
                        <div style={{ color: '#e2e8f0', fontSize: '0.95rem', textAlign: 'center', padding: '0.5rem', background: 'rgba(34,197,94,0.15)', borderRadius: '0.4rem' }}>
                          {fiefDetails.tier_upgrade_days_remaining} day(s) remaining
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{ marginBottom: '0.6rem' }}>
                          <div style={{ color: '#93c5fd', fontSize: '0.82rem', marginBottom: '0.35rem', fontWeight: 600 }}>Will unlock:</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.4rem' }}>
                            {['Quarry', 'Mine', 'Research Lab', 'Faith Temple'].map((res) => (
                              <div key={res} style={{ color: '#e2e8f0', fontSize: '0.8rem', padding: '0.3rem 0.5rem', background: 'rgba(148,163,184,0.1)', borderRadius: '0.3rem', textAlign: 'center' }}>
                                🔓 {res}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div style={{ marginBottom: '0.6rem' }}>
                          <div style={{ color: '#86efac', fontSize: '0.82rem', marginBottom: '0.35rem', fontWeight: 600 }}>Requirements:</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                            <div style={{ color: '#f8fafc', fontSize: '0.9rem', padding: '0.35rem 0.5rem', background: 'rgba(217,119,6,0.15)', borderRadius: '0.3rem', display: 'flex', justifyContent: 'space-between' }}>
                              <span>⏱️ Time:</span>
                              <span style={{ fontWeight: 600 }}>14 days</span>
                            </div>
                            <div style={{ color: '#f8fafc', fontSize: '0.9rem', padding: '0.35rem 0.5rem', background: (storedResources.wood || 0) >= 200 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', borderRadius: '0.3rem', display: 'flex', justifyContent: 'space-between' }}>
                              <span>🌳 Wood:</span>
                              <span style={{ fontWeight: 600, color: (storedResources.wood || 0) >= 200 ? '#86efac' : '#ef4444' }}>
                                {(storedResources.wood || 0) >= 200 ? '✓' : '✗'} {Number(storedResources.wood || 0).toFixed(1)}/200
                              </span>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={startTierUpgrade}
                          disabled={busy === 'upgrade' || (storedResources.wood || 0) < 200}
                          style={{
                            width: '100%',
                            padding: '0.55rem 0.8rem',
                            borderRadius: '0.45rem',
                            border: '1px solid rgba(var(--theme-accent-rgb),0.5)',
                            background: 'rgba(120,53,15,0.5)',
                            color: 'var(--text-gold)',
                            cursor: busy === 'upgrade' ? 'not-allowed' : 'pointer',
                            fontWeight: 700,
                            fontSize: '0.95rem',
                            opacity: (busy === 'upgrade' || (storedResources.wood || 0) < 200) ? 0.6 : 1,
                          }}
                        >
                          {busy === 'upgrade' ? 'Starting...' : 'Start Tier 2 Upgrade'}
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Create New Fief Modal ───────────────────────────────────────────── */}
      {showCreateFiefModal && ReactDOM.createPortal(
        (() => {
          const kingdom = kingdoms.find((k) => Number(k.id) === createFiefKingdomId);
          const capital = kingdom ? (kingdom.fiefs || []).find((f) => f.is_capital) : null;
          const capitalAdults = Math.floor(Number(capital?.population || 0));
          const maxPop = Math.max(10, capitalAdults - 10);
          const totalSent = newFiefResources.food + newFiefResources.wood + newFiefResources.stone + newFiefResources.minerals;
          const overBudget = totalSent > 100;
          const capFood = Math.floor(Number((capital?.stored_resources as any)?.food || 0));
          const capWood = Math.floor(Number((capital?.stored_resources as any)?.wood || 0));
          const capStone = Math.floor(Number((capital?.stored_resources as any)?.stone || 0));
          const capMinerals = Math.floor(Number((capital?.stored_resources as any)?.minerals || 0));
          const canSubmit = newFiefName.trim().length > 0
            && newFiefPop >= 10 && newFiefPop <= maxPop
            && newFiefResources.food >= 40 && newFiefResources.wood >= 57
            && !overBudget
            && newFiefResources.food <= capFood
            && newFiefResources.wood <= capWood
            && newFiefResources.stone <= capStone
            && newFiefResources.minerals <= capMinerals;
          const adjRes = (key: keyof typeof newFiefResources, delta: number, min: number, max: number) => {
            setNewFiefResources((prev) => ({ ...prev, [key]: Math.max(min, Math.min(max, prev[key] + delta)) }));
          };
          return (
            <div
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '2rem 1rem', overflowY: 'auto' }}
              onClick={(e) => { if (e.target === e.currentTarget) setShowCreateFiefModal(false); }}
            >
              <div
                style={{ background: 'rgba(18,18,18,0.97)', border: '1px solid rgba(var(--theme-accent-rgb),0.3)', borderRadius: '12px', boxShadow: '0 25px 50px rgba(0,0,0,0.5)', width: '100%', maxWidth: '480px' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-header">
                  <h3 className="modal-title">🏘️ Create New Fief</h3>
                  <button className="modal-close" onClick={() => setShowCreateFiefModal(false)} aria-label="Close">×</button>
                </div>
                <div className="modal-content" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {/* Name */}
                  <div>
                    <label style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Fief Name</label>
                    <input
                      type="text"
                      value={newFiefName}
                      onChange={(e) => setNewFiefName(e.target.value)}
                      placeholder="Enter fief name…"
                      maxLength={60}
                      style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: '0.4rem', border: '1px solid rgba(148,163,184,0.3)', background: 'rgba(15,23,42,0.6)', color: '#e2e8f0', boxSizing: 'border-box' }}
                    />
                  </div>
                  {/* Population */}
                  <div>
                    <label style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
                      Population to Send <span style={{ color: '#64748b', fontWeight: 400 }}>(capital has {capitalAdults}, keeps ≥ 10)</span>
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <button onClick={() => setNewFiefPop((p) => Math.max(10, p - 1))} style={{ padding: '0.3rem 0.6rem', borderRadius: '0.35rem', border: '1px solid rgba(148,163,184,0.25)', background: 'rgba(15,23,42,0.5)', color: '#e2e8f0', cursor: 'pointer' }}>−</button>
                      <span style={{ color: '#e2e8f0', fontWeight: 700, minWidth: '2rem', textAlign: 'center' }}>{newFiefPop}</span>
                      <button onClick={() => setNewFiefPop((p) => Math.min(maxPop, p + 1))} style={{ padding: '0.3rem 0.6rem', borderRadius: '0.35rem', border: '1px solid rgba(148,163,184,0.25)', background: 'rgba(15,23,42,0.5)', color: '#e2e8f0', cursor: 'pointer' }}>+</button>
                      <span style={{ color: '#64748b', fontSize: '0.78rem' }}>max {maxPop}</span>
                    </div>
                  </div>
                  {/* Resources */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <label style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600 }}>Resources to Send</label>
                      <span style={{ color: overBudget ? '#ef4444' : '#94a3b8', fontSize: '0.8rem', fontWeight: 600 }}>
                        Total: {totalSent} / 100 {overBudget && '⚠️'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {([
                        { key: 'food' as const, label: '🌾 Food', min: 40, cap: capFood, hint: 'min 40' },
                        { key: 'wood' as const, label: '🌳 Wood', min: 57, cap: capWood, hint: 'min 57 (32 for tents)' },
                        { key: 'stone' as const, label: '🪨 Stone', min: 0, cap: capStone, hint: '' },
                        { key: 'minerals' as const, label: '⛏️ Minerals', min: 0, cap: capMinerals, hint: '' },
                      ] as Array<{ key: keyof typeof newFiefResources; label: string; min: number; cap: number; hint: string }>).map(({ key, label, min, cap, hint }) => {
                        const val = newFiefResources[key];
                        const belowMin = val < min;
                        const overCap = val > cap;
                        return (
                          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ color: '#94a3b8', fontSize: '0.82rem', minWidth: '90px' }}>{label}</span>
                            <button onClick={() => adjRes(key, -1, min, cap)} style={{ padding: '0.2rem 0.5rem', borderRadius: '0.3rem', border: '1px solid rgba(148,163,184,0.2)', background: 'rgba(15,23,42,0.5)', color: '#94a3b8', cursor: 'pointer' }}>−</button>
                            <input
                              type="number"
                              value={val}
                              min={min}
                              max={cap}
                              onChange={(e) => setNewFiefResources((prev) => ({ ...prev, [key]: Math.max(min, Math.min(cap, Math.floor(Number(e.target.value) || 0))) }))}
                              style={{ width: '62px', padding: '0.25rem 0.4rem', borderRadius: '0.3rem', border: `1px solid ${belowMin || overCap ? 'rgba(239,68,68,0.5)' : 'rgba(148,163,184,0.25)'}`, background: 'rgba(15,23,42,0.5)', color: belowMin || overCap ? '#ef4444' : '#e2e8f0', textAlign: 'center' }}
                            />
                            <button onClick={() => adjRes(key, 1, min, cap)} style={{ padding: '0.2rem 0.5rem', borderRadius: '0.3rem', border: '1px solid rgba(148,163,184,0.2)', background: 'rgba(15,23,42,0.5)', color: '#94a3b8', cursor: 'pointer' }}>+</button>
                            <span style={{ color: '#64748b', fontSize: '0.72rem' }}>
                              cap has {cap}{hint ? ` • ${hint}` : ''}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
                    <button className="btn btn-secondary" onClick={() => setShowCreateFiefModal(false)}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleCreateFief} disabled={!canSubmit || busy === 'create-fief'}>
                      {busy === 'create-fief' ? 'Creating…' : 'Create Fief'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })(),
        document.body
      )}

      {/* ── DM: Set Fief Location Modifiers + Travel Days Modal ─────────────── */}
      {showFiefModifiersModal && isDungeonMaster && ReactDOM.createPortal(
        (() => {
          const LOCATION_LANES: Array<{ key: string; label: string; icon: string }> = [
            { key: 'wood', label: 'Wood', icon: '🌳' },
            { key: 'stone', label: 'Stone', icon: '🪨' },
            { key: 'iron', label: 'Iron', icon: '⛓️' },
            { key: 'meat', label: 'Meat', icon: '🥩' },
            { key: 'vegetables', label: 'Vegetables', icon: '🥕' },
            { key: 'gold', label: 'Gold', icon: '🪙' },
            { key: 'research', label: 'Research', icon: '📘' },
            { key: 'faith', label: 'Faith', icon: '✨' },
            { key: 'building', label: 'Building', icon: '🏗️' },
          ];
          const adjustMod = (key: string, delta: number) => {
            setPendingFiefModifiers((prev) => {
              const current = Number(prev[key] || 0);
              const next = Math.round((current + delta) * 100) / 100;
              const clamped = Math.max(-1, Math.min(2, next));
              return { ...prev, [key]: clamped };
            });
          };
          // Find fief name for display
          const fiefName = kingdoms.flatMap((k) => k.fiefs || []).find((f) => Number(f.id) === pendingFiefModifierId)?.name || `Fief #${pendingFiefModifierId}`;
          return (
            <div
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 10001, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '2rem 1rem', overflowY: 'auto' }}
              onClick={(e) => { if (e.target === e.currentTarget) { setShowFiefModifiersModal(false); } }}
            >
              <div
                style={{ background: 'rgba(18,18,18,0.97)', border: '1px solid rgba(var(--theme-accent-rgb),0.3)', borderRadius: '12px', boxShadow: '0 25px 50px rgba(0,0,0,0.5)', width: '100%', maxWidth: '560px' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-header">
                  <h3 className="modal-title">📍 Set Location for {fiefName}</h3>
                  <button className="modal-close" onClick={() => setShowFiefModifiersModal(false)} aria-label="Close">×</button>
                </div>
                <div className="modal-content" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {/* Location modifier grid */}
                  <div>
                    <div style={{ color: '#f59e0b', fontWeight: 700, fontSize: '0.88rem', marginBottom: '0.5rem' }}>📍 Location Bonuses</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem' }}>
                      {LOCATION_LANES.map(({ key, label, icon }) => {
                        const mod = Number(pendingFiefModifiers[key] || 0);
                        const pct = Math.round(mod * 100);
                        const color = mod > 0 ? '#f59e0b' : mod < 0 ? '#f87171' : '#64748b';
                        return (
                          <div key={key} style={{ background: 'rgba(2,6,23,0.5)', border: '1px solid rgba(148,163,184,0.15)', borderRadius: '0.45rem', padding: '0.35rem 0.4rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <div style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600 }}>{icon} {label}</div>
                            <div style={{ color, fontWeight: 700, fontSize: '0.95rem', textAlign: 'center' }}>{pct >= 0 ? '+' : ''}{pct}%</div>
                            <div style={{ display: 'flex', gap: '0.2rem', justifyContent: 'center' }}>
                              {[-25, -5].map((d) => (
                                <button key={d} onClick={() => adjustMod(key, d / 100)}
                                  style={{ padding: '0.1rem 0.28rem', borderRadius: '0.25rem', border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(127,29,29,0.3)', color: '#fca5a5', cursor: 'pointer', fontSize: '0.72rem' }}>
                                  {d}%
                                </button>
                              ))}
                              {[5, 25].map((d) => (
                                <button key={d} onClick={() => adjustMod(key, d / 100)}
                                  style={{ padding: '0.1rem 0.28rem', borderRadius: '0.25rem', border: '1px solid rgba(34,197,94,0.35)', background: 'rgba(20,83,45,0.35)', color: '#86efac', cursor: 'pointer', fontSize: '0.72rem' }}>
                                  +{d}%
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {/* Travel days */}
                  <div style={{ borderTop: '1px solid rgba(148,163,184,0.15)', paddingTop: '0.85rem' }}>
                    <div style={{ color: '#94a3b8', fontWeight: 600, fontSize: '0.88rem', marginBottom: '0.4rem' }}>🚶 Travel Days</div>
                    <div style={{ color: '#64748b', fontSize: '0.78rem', marginBottom: '0.5rem' }}>
                      The fief is locked (no production, no workers) until travel is complete. Set 0 for immediate availability.
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <button onClick={() => setPendingTravelDays((d) => Math.max(0, d - 1))} style={{ padding: '0.3rem 0.7rem', borderRadius: '0.35rem', border: '1px solid rgba(148,163,184,0.25)', background: 'rgba(15,23,42,0.5)', color: '#e2e8f0', cursor: 'pointer', fontSize: '1rem' }}>−</button>
                      <input
                        type="number"
                        value={pendingTravelDays}
                        min={0}
                        onChange={(e) => setPendingTravelDays(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                        style={{ width: '72px', padding: '0.35rem 0.5rem', borderRadius: '0.4rem', border: '1px solid rgba(148,163,184,0.25)', background: 'rgba(15,23,42,0.6)', color: '#e2e8f0', textAlign: 'center' }}
                      />
                      <button onClick={() => setPendingTravelDays((d) => d + 1)} style={{ padding: '0.3rem 0.7rem', borderRadius: '0.35rem', border: '1px solid rgba(148,163,184,0.25)', background: 'rgba(15,23,42,0.5)', color: '#e2e8f0', cursor: 'pointer', fontSize: '1rem' }}>+</button>
                      <span style={{ color: '#64748b', fontSize: '0.8rem' }}>
                        {pendingTravelDays === 0 ? 'Available immediately' : `Available after ${pendingTravelDays} day${pendingTravelDays !== 1 ? 's' : ''}`}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                    <button className="btn btn-secondary" onClick={() => setShowFiefModifiersModal(false)}>Skip</button>
                    <button className="btn btn-primary" onClick={handleSaveFiefModifiers} disabled={busy === 'fief-modifiers'}>
                      {busy === 'fief-modifiers' ? 'Saving…' : 'Save Modifiers'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })(),
        document.body
      )}

      {showLegendaryCreateModal && isDungeonMaster && ReactDOM.createPortal(
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 10003, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowLegendaryCreateModal(false); }}
        >
          <div style={{ width: '100%', maxWidth: '620px', background: 'rgba(18,18,18,0.97)', border: '1px solid rgba(96,165,250,0.35)', borderRadius: '12px', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Create Legendary Character</h3>
              <button className="modal-close" onClick={() => setShowLegendaryCreateModal(false)} aria-label="Close">×</button>
            </div>
            <div className="modal-content" style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
              <input
                value={legendaryForm.name}
                onChange={(e) => setLegendaryForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Legendary character name"
                style={{ padding: '0.5rem 0.6rem', borderRadius: '0.4rem', border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(15,23,42,0.65)', color: '#e2e8f0' }}
              />
              <textarea
                value={legendaryForm.description}
                onChange={(e) => setLegendaryForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Description"
                rows={3}
                style={{ padding: '0.5rem 0.6rem', borderRadius: '0.4rem', border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(15,23,42,0.65)', color: '#e2e8f0', resize: 'vertical' }}
              />

              <div style={{ color: '#93c5fd', fontSize: '0.8rem', fontWeight: 700 }}>Fixed Bonuses</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(160px, 1fr))', gap: '0.45rem' }}>
                {[
                  ['wood_bonus_pct', 'Wood %'],
                  ['stone_bonus_pct', 'Stone %'],
                  ['iron_bonus_pct', 'Iron %'],
                  ['meat_bonus_pct', 'Meat %'],
                  ['vegetables_bonus_pct', 'Vegetables %'],
                  ['gold_bonus_pct', 'Gold %'],
                  ['research_bonus_pct', 'Research %'],
                  ['faith_bonus_pct', 'Faith %'],
                  ['building_bonus_pct', 'Building %'],
                  ['population_growth_bonus_pct', 'Pop Growth %'],
                  ['food_consumption_reduction_pct', 'Food Use Reduction %'],
                  ['unit_training_speed_reduction_pct', 'Unit Training Speed Reduction %'],
                ].map(([key, label]) => (
                  <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', color: '#cbd5e1', fontSize: '0.76rem' }}>
                    {label}
                    <input
                      type="number"
                      step="0.01"
                      value={Number((legendaryForm as any)[key] || 0)}
                      onChange={(e) => setLegendaryForm((prev) => ({ ...prev, [key]: Number(e.target.value || 0) } as any))}
                      style={{ padding: '0.32rem 0.42rem', borderRadius: '0.35rem', border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(15,23,42,0.7)', color: '#e2e8f0' }}
                    />
                  </label>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button className="btn btn-secondary" onClick={() => setShowLegendaryCreateModal(false)}>Cancel</button>
                <button className="btn btn-primary" disabled={busy === 'legendary-create' || !legendaryForm.name.trim()} onClick={createLegendaryCharacter}>
                  {busy === 'legendary-create' ? 'Creating…' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showGrantModal && ReactDOM.createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.72)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: '2rem 1rem',
            overflowY: 'auto',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) { setShowGrantModal(false); setGrantLocationModifiers({}); }
          }}
        >
          <div
            style={{
              background: 'rgba(18, 18, 18, 0.96)',
              border: '1px solid rgba(var(--theme-accent-rgb), 0.3)',
              borderRadius: '12px',
              boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5)',
              width: '100%',
              maxWidth: '560px',
              maxHeight: '90vh',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 className="modal-title">Grant Kingdom</h3>
              <button className="modal-close" onClick={() => { setShowGrantModal(false); setGrantLocationModifiers({}); }} aria-label="Close">×</button>
            </div>
            <div className="modal-content" style={{ display: 'flex', flexDirection: 'column', maxHeight: 'calc(90vh - 90px)' }}>
              {grantRows.length === 0 ? (
                <div style={{ color: 'var(--text-muted)' }}>No characters found for this campaign.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', overflowY: 'auto', paddingRight: '0.25rem', maxHeight: '52vh' }}>
                  {grantRows.map((row, idx) => {
                    const checked = row.playerId != null && selectedGrantPlayerIds.includes(Number(row.playerId));
                    const secondary = row.characterName.toLowerCase() !== row.username.toLowerCase() ? `@${row.username}` : '';
                    return (
                      <label key={`${row.playerId}-${idx}`} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', color: '#e2e8f0' }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!row.canGrant}
                          onChange={(e) => {
                            if (row.playerId == null) return;
                            const id = Number(row.playerId);
                            setSelectedGrantPlayerIds((prev) => {
                              if (e.target.checked) return prev.includes(id) ? prev : [...prev, id];
                              return prev.filter((x) => x !== id);
                            });
                          }}
                        />
                        <span style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                          <span style={{ color: '#e2e8f0' }}>{row.characterName}</span>
                          {secondary && (
                            <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{secondary}</span>
                          )}
                          {!row.canGrant && row.reason && (
                            <span style={{ color: '#fca5a5', fontSize: '0.72rem' }}>{row.reason}</span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* Location Bonuses */}
              {(() => {
                const LOCATION_LANES: Array<{ key: string; label: string; icon: string }> = [
                  { key: 'wood', label: 'Wood', icon: '🌳' },
                  { key: 'stone', label: 'Stone', icon: '🪨' },
                  { key: 'iron', label: 'Iron', icon: '⛓️' },
                  { key: 'meat', label: 'Meat', icon: '🥩' },
                  { key: 'vegetables', label: 'Vegetables', icon: '🥕' },
                  { key: 'gold', label: 'Gold', icon: '🪙' },
                  { key: 'research', label: 'Research', icon: '📘' },
                  { key: 'faith', label: 'Faith', icon: '✨' },
                  { key: 'building', label: 'Building', icon: '🏗️' },
                ];
                const adjustMod = (key: string, delta: number) => {
                  setGrantLocationModifiers((prev) => {
                    const current = Number(prev[key] || 0);
                    const next = Math.round((current + delta) * 100) / 100;
                    const clamped = Math.max(-1, Math.min(2, next));
                    return { ...prev, [key]: clamped };
                  });
                };
                return (
                  <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(148,163,184,0.15)', paddingTop: '0.75rem' }}>
                    <div style={{ color: '#f59e0b', fontWeight: 700, fontSize: '0.88rem', marginBottom: '0.5rem' }}>📍 Location Bonuses <span style={{ color: '#64748b', fontWeight: 400, fontSize: '0.78rem' }}>(permanent, based on where the kingdom is built)</span></div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem' }}>
                      {LOCATION_LANES.map(({ key, label, icon }) => {
                        const mod = Number(grantLocationModifiers[key] || 0);
                        const pct = Math.round(mod * 100);
                        const color = mod > 0 ? '#f59e0b' : mod < 0 ? '#f87171' : '#64748b';
                        return (
                          <div key={key} style={{ background: 'rgba(2,6,23,0.5)', border: '1px solid rgba(148,163,184,0.15)', borderRadius: '0.45rem', padding: '0.35rem 0.4rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <div style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600 }}>{icon} {label}</div>
                            <div style={{ color, fontWeight: 700, fontSize: '0.95rem', textAlign: 'center' }}>{pct >= 0 ? '+' : ''}{pct}%</div>
                            <div style={{ display: 'flex', gap: '0.2rem', justifyContent: 'center' }}>
                              {[-25, -5].map((d) => (
                                <button key={d} onClick={() => adjustMod(key, d / 100)}
                                  style={{ padding: '0.1rem 0.28rem', borderRadius: '0.25rem', border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(127,29,29,0.3)', color: '#fca5a5', cursor: 'pointer', fontSize: '0.72rem' }}>
                                  {d}%
                                </button>
                              ))}
                              {[5, 25].map((d) => (
                                <button key={d} onClick={() => adjustMod(key, d / 100)}
                                  style={{ padding: '0.1rem 0.28rem', borderRadius: '0.25rem', border: '1px solid rgba(34,197,94,0.35)', background: 'rgba(20,83,45,0.35)', color: '#86efac', cursor: 'pointer', fontSize: '0.72rem' }}>
                                  +{d}%
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button className="btn btn-secondary" onClick={() => { setShowGrantModal(false); setGrantLocationModifiers({}); }}>Cancel</button>
                <button className="btn btn-primary" onClick={handleGrant} disabled={busy === 'grant' || selectedGrantPlayerIds.length === 0}>Grant</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showChildrenModal && ReactDOM.createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.72)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: '2rem 1rem',
            overflowY: 'auto',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowChildrenModal(false);
          }}
        >
          <div
            style={{
              background: 'rgba(18, 18, 18, 0.96)',
              border: '1px solid rgba(125,211,252,0.3)',
              borderRadius: '12px',
              boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5)',
              width: '100%',
              maxWidth: '520px',
              maxHeight: '90vh',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 className="modal-title">Children By Age</h3>
              <button className="modal-close" onClick={() => setShowChildrenModal(false)} aria-label="Close">×</button>
            </div>

            <div className="modal-content" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: 'calc(90vh - 90px)', overflowY: 'auto' }}>
              <div style={{ color: '#94a3b8', fontSize: '0.82rem' }}>
                Children are unassignable until age 15.
              </div>
              <div style={{ color: '#e2e8f0', fontSize: '0.88rem' }}>
                Total children: {underagePopulation}
              </div>
              <div style={{ color: '#93c5fd', fontSize: '0.84rem' }}>
                {nextMaturityDays == null
                  ? 'No child maturation currently scheduled.'
                  : `Next child matures in ${nextMaturityDays} day(s).`}
              </div>

              {!currentCampaignDay ? (
                <div style={{ color: '#fca5a5', fontSize: '0.82rem' }}>Could not determine current campaign day, so age grouping is unavailable.</div>
              ) : childrenByAgeYears.length === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: '0.82rem' }}>No children cohorts found.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {childrenByAgeYears.map((group) => (
                    <div key={`age-${group.ageYears}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem', border: '1px solid rgba(148,163,184,0.2)', borderRadius: '0.45rem', padding: '0.4rem 0.55rem' }}>
                      <span style={{ color: '#cbd5e1' }}>Age {group.ageYears}</span>
                      <span style={{ color: '#e2e8f0', fontWeight: 700 }}>{group.count}</span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: '0.35rem', display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => setShowChildrenModal(false)}>Close</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showBuildModal && ReactDOM.createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.72)',
            zIndex: 10010,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: '2rem 1rem',
            overflowY: 'auto',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowBuildModal(false);
          }}
        >
          <div
            style={{
              background: 'rgba(18, 18, 18, 0.96)',
              border: '1px solid rgba(var(--theme-accent-rgb),0.3)',
              borderRadius: '12px',
              boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5)',
              width: '100%',
              maxWidth: '920px',
              maxHeight: '90vh',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 className="modal-title">Build Structures (Tier {Number(fiefDetails?.tier || 1)})</h3>
              <button className="modal-close" onClick={() => setShowBuildModal(false)} aria-label="Close">×</button>
            </div>
            <div className="modal-content" style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', maxHeight: 'calc(90vh - 90px)', overflowY: 'auto' }}>
              <div style={{ color: '#94a3b8', fontSize: '0.78rem' }}>
                Buildings are filtered by your current fief tier and prerequisite completion.
              </div>
              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                {BUILD_TABS.map((tab) => {
                  const active = buildTab === tab;
                  const style = BUILD_TAB_COLORS[tab];
                  return (
                    <button
                      key={tab}
                      onClick={() => setBuildTab(tab)}
                      style={{
                        padding: '0.33rem 0.62rem',
                        borderRadius: '999px',
                        border: `1px solid ${style.border}`,
                        background: active ? style.background : 'rgba(15,23,42,0.28)',
                        color: style.text,
                        cursor: 'pointer',
                        fontWeight: active ? 700 : 500,
                      }}
                    >
                      {BUILD_TAB_LABELS[tab]}
                    </button>
                  );
                })}
              </div>

              {filteredBuildOptions.length === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: '0.84rem' }}>No buildings available in this category.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '0.6rem' }}>
                  {filteredBuildOptions.map((b: any) => {
                    const category = (b.__category || 'civic') as BuildTabId;
                    const c = BUILD_TAB_COLORS[category] || BUILD_TAB_COLORS.civic;
                    const locked = Boolean(b?.isLocked);
                    const lockReason = String(b?.lockReason || '').trim();
                    return (
                      <div
                        key={String(b.key)}
                        style={{
                          borderRadius: '0.6rem',
                          border: `1px solid ${c.border}`,
                          background: c.background,
                          padding: '0.55rem 0.65rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.35rem',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <span style={{ color: '#e2e8f0', fontWeight: 700 }}>{b.name}</span>
                          <span style={{ color: c.text, fontSize: '0.75rem', textTransform: 'uppercase' }}>{BUILD_TAB_LABELS[category]}</span>
                        </div>
                        <div style={{ color: '#cbd5e1', fontSize: '0.78rem' }}>
                          Tier {Number(b.tierRequired || 1)} • {Number(b.days || 0)} day(s)
                        </div>
                        {b.description && (
                          <div style={{ color: '#94a3b8', fontSize: '0.78rem', lineHeight: '1.4' }}>{b.description}</div>
                        )}
                        <div style={{ color: '#94a3b8', fontSize: '0.74rem' }}>
                          Cost:{' '}
                          {Object.entries((b.cost || {}) as Record<string, number>).length === 0 ? (
                            <span style={{ color: '#94a3b8' }}>None</span>
                          ) : (
                            Object.entries((b.cost || {}) as Record<string, number>).map(([k, v], idx, arr) => {
                              const needed = Math.max(0, Number(v || 0));
                              const available = getStoredAmountForCostResource(k);
                              const enough = available >= needed;
                              return (
                                <span key={`${String(b.key)}-cost-${k}`} style={{ color: enough ? '#86efac' : '#fca5a5', fontWeight: 600 }}>
                                  {k} {needed}
                                  {idx < arr.length - 1 ? ', ' : ''}
                                </span>
                              );
                            })
                          )}
                        </div>
                        {locked && (
                          <div style={{ color: '#fca5a5', fontSize: '0.74rem' }}>{lockReason || 'Locked'}</div>
                        )}
                        <button
                          onClick={() => queueBuilding(String(b.key))}
                          disabled={locked || busy === `build-${String(b.key)}`}
                          style={{
                            marginTop: '0.15rem',
                            padding: '0.34rem 0.62rem',
                            borderRadius: '0.4rem',
                            border: `1px solid ${c.border}`,
                            background: (locked || busy === `build-${String(b.key)}`) ? 'rgba(71,85,105,0.35)' : 'rgba(2,6,23,0.55)',
                            color: (locked || busy === `build-${String(b.key)}`) ? '#94a3b8' : c.text,
                            cursor: (locked || busy === `build-${String(b.key)}`) ? 'not-allowed' : 'pointer',
                            alignSelf: 'flex-start',
                          }}
                        >
                          {locked ? 'Locked' : busy === `build-${String(b.key)}` ? 'Queueing...' : 'Build'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {showBuildQueueModal && fiefDetails && ReactDOM.createPortal(
        (() => {
          const buildingsById = new Map(
            (fiefDetails.buildings || []).map((b: any) => [Number(b.id), b])
          );
          const orderedQueue = buildQueueOrder
            .map((id) => buildingsById.get(id))
            .filter(Boolean) as any[];

          const handleDragStart = (id: number) => setDraggedQueueBuildingId(id);
          const handleDragOver = (e: React.DragEvent, overId: number) => {
            e.preventDefault();
            if (draggedQueueBuildingId == null || draggedQueueBuildingId === overId) return;
            setBuildQueueOrder((prev) => {
              const from = prev.indexOf(draggedQueueBuildingId);
              const to = prev.indexOf(overId);
              if (from === -1 || to === -1 || from === to) return prev;
              const next = [...prev];
              next.splice(from, 1);
              next.splice(to, 0, draggedQueueBuildingId);
              return next;
            });
          };
          const handleDragEnd = () => {
            if (draggedQueueBuildingId != null) {
              commitBuildQueueReorder(buildQueueOrder);
            }
            setDraggedQueueBuildingId(null);
          };

          return (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.72)',
                zIndex: 10010,
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                padding: '2rem 1rem',
                overflowY: 'auto',
              }}
              onClick={(e) => {
                if (e.target === e.currentTarget) setShowBuildQueueModal(false);
              }}
            >
              <div
                style={{
                  background: 'rgba(18, 18, 18, 0.96)',
                  border: '1px solid rgba(var(--theme-accent-rgb),0.3)',
                  borderRadius: '12px',
                  boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5)',
                  width: '100%',
                  maxWidth: '520px',
                  maxHeight: '90vh',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-header">
                  <h3 className="modal-title">Build Queue</h3>
                  <button className="modal-close" onClick={() => setShowBuildQueueModal(false)} aria-label="Close">×</button>
                </div>
                <div style={{ padding: '0.7rem 1rem 0', flexShrink: 0 }}>
                  <div style={{ color: '#93c5fd', fontSize: '0.78rem', marginBottom: '0.4rem' }}>
                    ↕️ Drag and drop items to change their build priority. The item at the top is worked on first.
                  </div>
                  <div style={{ color: '#fca5a5', fontSize: '0.78rem', marginBottom: '0.5rem' }}>
                    ⚠️ Cancelling a build or upgrade does not refund any resources already spent. A cancelled tier 1 building is destroyed; a cancelled upgrade reverts to its pre-upgrade form.
                  </div>
                </div>
                <div
                  style={{
                    padding: '0 1rem 1rem',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.45rem',
                  }}
                >
                  {orderedQueue.length === 0 ? (
                    <div style={{ color: '#94a3b8', fontSize: '0.84rem', padding: '0.5rem 0' }}>
                      Nothing is currently queued or under construction.
                    </div>
                  ) : (
                    orderedQueue.map((b: any, idx: number) => {
                      const isUpgrade = Boolean(b.previous_building_type);
                      const isBeingCancelled = busy === `cancel-building-${Number(b.id)}`;
                      const isDragging = draggedQueueBuildingId === Number(b.id);
                      return (
                        <div
                          key={b.id}
                          draggable
                          onDragStart={() => handleDragStart(Number(b.id))}
                          onDragOver={(e) => handleDragOver(e, Number(b.id))}
                          onDragEnd={handleDragEnd}
                          onDrop={(e) => e.preventDefault()}
                          style={{
                            borderRadius: '0.5rem',
                            border: '1px solid rgba(148,163,184,0.3)',
                            background: isDragging ? 'rgba(120,53,15,0.35)' : 'rgba(15,23,42,0.5)',
                            padding: '0.5rem 0.6rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.6rem',
                            cursor: 'grab',
                            opacity: isDragging ? 0.6 : 1,
                          }}
                        >
                          <span style={{ color: '#64748b', fontWeight: 700, fontSize: '0.8rem', minWidth: '1.2rem' }}>
                            {idx + 1}
                          </span>
                          <span style={{ color: '#64748b', fontSize: '0.9rem' }} title="Drag to reorder">⠿</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                              <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.85rem' }}>{b.name}</span>
                              {isUpgrade && (
                                <span style={{ color: '#93c5fd', fontSize: '0.68rem', textTransform: 'uppercase', fontWeight: 700 }}>
                                  Upgrade
                                </span>
                              )}
                            </div>
                            <div style={{ color: 'var(--text-gold)', fontSize: '0.76rem' }}>
                              {Number(b.days_remaining || 0)} day(s) remaining
                              {idx > 0 ? ' • waiting' : ' • in progress'}
                            </div>
                          </div>
                          <button
                            onClick={() => cancelQueuedBuilding(Number(b.id), isUpgrade)}
                            disabled={isBeingCancelled}
                            title={isUpgrade ? 'Cancel upgrade (reverts to previous form)' : 'Cancel build (destroys the building)'}
                            style={{
                              width: '1.7rem',
                              height: '1.7rem',
                              borderRadius: '999px',
                              border: '1px solid rgba(239,68,68,0.55)',
                              background: isBeingCancelled ? 'rgba(71,85,105,0.35)' : 'rgba(127,29,29,0.34)',
                              color: isBeingCancelled ? '#94a3b8' : '#fca5a5',
                              cursor: isBeingCancelled ? 'not-allowed' : 'pointer',
                              fontWeight: 800,
                              flexShrink: 0,
                              lineHeight: 1,
                            }}
                          >
                            {isBeingCancelled ? '…' : '✕'}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          );
        })(),
        document.body
      )}

      {showResearchModal && fiefDetails && ReactDOM.createPortal(
        (() => {
          const fiefTier = Number(fiefDetails?.tier || 1);
          const allResearch = (fiefDetails.availableResearch || []) as any[];
          const activeResearch = researchQueue.find((r: any) => r.status === 'active');
          const dailyResearchRate = Math.max(0, Number(productionByLane.output.research || 0));
          const getETA = (pointsRequired: number, pointsAccumulated = 0): string => {
            const remaining = Math.max(0, pointsRequired - pointsAccumulated);
            if (remaining === 0) return 'Done';
            if (dailyResearchRate <= 0) return 'No researchers';
            const days = Math.ceil(remaining / dailyResearchRate);
            return `~${days} day${days === 1 ? '' : 's'}`;
          };
          const completedSet = new Set(allResearch.filter((r: any) => r.isCompleted).map((r: any) => String(r.id)));
          const prereqsMet = (r: any): boolean =>
            (r.prerequisites || []).every((p: string) => completedSet.has(p));
          const queueableResearch = allResearch.filter((r: any) =>
            !r.isCompleted && !r.isQueuedOrActive &&
            Number(r.tierRequired || 2) <= fiefTier && prereqsMet(r)
          );
          const filteredQueueable = researchTab === 'all'
            ? queueableResearch
            : queueableResearch.filter((r: any) => getResearchCategory(r) === researchTab);
          return (
            <div
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 10015, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '2rem 1rem', overflowY: 'auto' }}
              onClick={(e) => { if (e.target === e.currentTarget) setShowResearchModal(false); }}
            >
              <div
                style={{ background: 'rgba(18,18,18,0.96)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '12px', boxShadow: '0 25px 50px rgba(0,0,0,0.5)', width: '100%', maxWidth: '960px', maxHeight: '90vh', overflow: 'hidden' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-header">
                  <h3 className="modal-title">📘 Research (Tier {fiefTier})</h3>
                  <button className="modal-close" onClick={() => setShowResearchModal(false)} aria-label="Close">×</button>
                </div>
                <div className="modal-content" style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', maxHeight: 'calc(90vh - 90px)', overflowY: 'auto' }}>
                  {allResearch.length === 0 ? (
                    <div style={{ color: '#94a3b8', fontSize: '0.82rem' }}>Research unlocks after reaching Tier 2 and building a Research Lab.</div>
                  ) : (
                    <>
                      {/* Active */}
                      {activeResearch && (
                        <div style={{ padding: '0.6rem', border: '1px solid rgba(217,119,6,0.35)', borderRadius: '0.45rem', background: 'rgba(120,53,15,0.2)' }}>
                          <div style={{ color: 'var(--text-gold)', fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.3rem' }}>⏳ Active</div>
                          {researchQueue.filter((r: any) => r.status === 'active').map((entry: any) => {
                            const research = allResearch.find((r: any) => String(r.id) === String(entry.research_id));
                            const progress = Number(entry.points_accumulated || 0);
                            const required = Number(research?.pointsRequired || 100);
                            const progressPercent = Math.min(100, (progress / required) * 100);
                            const eta = getETA(required, progress);
                            return (
                              <div key={entry.id}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                                  <span style={{ color: '#e2e8f0', fontSize: '0.86rem', fontWeight: 600 }}>{research?.name || formatResearchLabel(entry.research_id)}</span>
                                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    <span style={{ color: '#fde68a', fontSize: '0.72rem', fontWeight: 600 }}>{eta}</span>
                                    <span style={{ color: '#bfdbfe', fontSize: '0.74rem' }}>{Math.floor(progress)}/{required} pts</span>
                                  </div>
                                </div>
                                <div style={{ height: '0.32rem', background: 'rgba(30,41,59,0.5)', borderRadius: '0.2rem', overflow: 'hidden' }}>
                                  <div style={{ height: '100%', background: 'rgba(217,119,6,0.7)', width: `${progressPercent}%`, transition: 'width 0.3s ease' }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Queued */}
                      {researchQueue.filter((r: any) => r.status === 'queued').length > 0 && (
                        <div style={{ padding: '0.6rem', border: '1px solid rgba(148,163,184,0.25)', borderRadius: '0.45rem', background: 'rgba(30,41,59,0.25)' }}>
                          <div style={{ color: '#cbd5e1', fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.3rem' }}>⋯ Queued</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            {researchQueue.filter((r: any) => r.status === 'queued').map((entry: any, idx: number) => {
                              const research = allResearch.find((r: any) => String(r.id) === String(entry.research_id));
                              return (
                                <div key={entry.id} style={{ fontSize: '0.76rem', color: '#94a3b8' }}>
                                  {idx + 1}. {research?.name || formatResearchLabel(entry.research_id)}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Completed */}
                      {allResearch.filter((r: any) => r.isCompleted).length > 0 && (
                        <div style={{ padding: '0.6rem', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '0.45rem', background: 'rgba(22,163,74,0.15)' }}>
                          <div style={{ color: '#86efac', fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.4rem' }}>✓ Completed</div>
                          {(['economy', 'military', 'civic'] as ResearchTabId[]).map((cat) => {
                            const items = allResearch.filter((r: any) => r.isCompleted && getResearchCategory(r) === cat);
                            if (items.length === 0) return null;
                            const s = RESEARCH_TAB_COLORS[cat];
                            return (
                              <div key={cat} style={{ marginBottom: '0.4rem' }}>
                                <div style={{ color: s.text, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>
                                  {RESEARCH_TAB_LABELS[cat]}
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                                  {items.map((r: any) => (
                                    <div key={r.id} title={String(r.description || '')}
                                      style={{ fontSize: '0.73rem', color: '#86efac', padding: '0.18rem 0.38rem', background: 'rgba(34,197,94,0.1)', borderRadius: '0.3rem', cursor: 'help' }}>
                                      {r.name}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Available */}
                      <div style={{ padding: '0.6rem', border: '1px solid rgba(96,165,250,0.3)', borderRadius: '0.45rem', background: 'rgba(30,58,138,0.15)' }}>
                        <div style={{ color: '#93c5fd', fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.4rem' }}>📖 Available to Research</div>
                        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                          {RESEARCH_TABS.map((tab) => {
                            const count = tab === 'all'
                              ? queueableResearch.length
                              : queueableResearch.filter((r: any) => getResearchCategory(r) === tab).length;
                            if (tab !== 'all' && count === 0) return null;
                            const active = researchTab === tab;
                            const s = RESEARCH_TAB_COLORS[tab];
                            return (
                              <button key={tab} onClick={() => setResearchTab(tab)}
                                style={{
                                  padding: '0.24rem 0.52rem', borderRadius: '999px',
                                  border: `1px solid ${s.border}`,
                                  background: active ? s.background : 'rgba(15,23,42,0.28)',
                                  color: s.text, cursor: 'pointer',
                                  fontWeight: active ? 700 : 500, fontSize: '0.74rem',
                                }}>
                                {RESEARCH_TAB_LABELS[tab]}{tab !== 'all' && ` (${count})`}
                              </button>
                            );
                          })}
                        </div>
                        {filteredQueueable.length === 0 ? (
                          <div style={{ color: '#94a3b8', fontSize: '0.82rem' }}>
                            {queueableResearch.length === 0
                              ? `No research available at Tier ${fiefTier}. Increase your fief tier to unlock more.`
                              : 'No research in this category.'}
                          </div>
                        ) : (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.5rem' }}>
                            {filteredQueueable.map((research: any) => {
                              const cat = getResearchCategory(research);
                              const c = RESEARCH_TAB_COLORS[cat];
                              return (
                                <div key={research.id}
                                  style={{ border: `1px solid ${c.border}`, borderRadius: '0.45rem', padding: '0.5rem 0.6rem', background: 'rgba(30,41,59,0.4)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.4rem' }}>
                                    <div style={{ color: '#dbeafe', fontWeight: 700, fontSize: '0.88rem' }}>{research.name}</div>
                                    <span style={{ color: c.text, fontSize: '0.68rem', textTransform: 'uppercase', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                      {RESEARCH_TAB_LABELS[cat]}
                                    </span>
                                  </div>
                                  <div style={{ color: '#cbd5e1', fontSize: '0.75rem', lineHeight: '1.3' }}>{research.description}</div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.2rem' }}>
                                    <span style={{ color: '#93c5fd', fontSize: '0.74rem', fontWeight: 600 }}>
                                      Tier {research.tierRequired} • {research.pointsRequired} pts
                                    </span>
                                    <span style={{ color: '#fde68a', fontSize: '0.72rem', fontWeight: 600 }}>
                                      {getETA(Number(research.pointsRequired))}
                                    </span>
                                    <button
                                      onClick={() => startResearch(research.id)}
                                      disabled={busy === `research-${research.id}`}
                                      style={{
                                        padding: '0.24rem 0.5rem', borderRadius: '0.3rem',
                                        border: `1px solid ${c.border}`,
                                        background: busy === `research-${research.id}` ? 'rgba(71,85,105,0.35)' : 'rgba(30,58,138,0.45)',
                                        color: busy === `research-${research.id}` ? '#94a3b8' : c.text,
                                        cursor: busy === `research-${research.id}` ? 'not-allowed' : 'pointer',
                                        fontSize: '0.72rem', fontWeight: 600,
                                      }}>
                                      {busy === `research-${research.id}` ? 'Starting…' : 'Queue'}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })(),
        document.body
      )}

      {showConversionModal && fiefDetails && ReactDOM.createPortal(
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setShowConversionModal(false); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 10020, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
        >
          <div style={{ background: '#0f172a', border: '1px solid rgba(234,179,8,0.35)', borderRadius: '0.75rem', padding: '1.4rem', width: '100%', maxWidth: '480px', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ color: '#fde68a', fontWeight: 700, fontSize: '1.05rem' }}>⛓ Prisoner & Slave Management</div>
              <button onClick={() => setShowConversionModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
              <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '0.5rem', padding: '0.7rem', textAlign: 'center' }}>
                <div style={{ color: '#fca5a5', fontSize: '0.78rem', marginBottom: '0.25rem' }}>Prisoners</div>
                <div style={{ color: '#f8fafc', fontWeight: 700, fontSize: '1.5rem' }}>{prisoners}</div>
              </div>
              <div style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.25)', borderRadius: '0.5rem', padding: '0.7rem', textAlign: 'center' }}>
                <div style={{ color: '#fde68a', fontSize: '0.78rem', marginBottom: '0.25rem' }}>Slaves</div>
                <div style={{ color: '#f8fafc', fontWeight: 700, fontSize: '1.5rem' }}>{slaves}</div>
              </div>
            </div>

            {/* Prisoners → Slaves */}
            <div style={{ background: 'rgba(146,64,14,0.2)', border: '1px solid rgba(234,179,8,0.2)', borderRadius: '0.55rem', padding: '1rem' }}>
              <div style={{ color: '#fde68a', fontWeight: 700, marginBottom: '0.5rem' }}>Convert Prisoners → Slaves</div>
              <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginBottom: '0.75rem' }}>Prisoners are put to work as slave labor. This is irreversible unless you release them below.</div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="number" min="1" max={prisoners} value={conversionInput}
                  onChange={(e) => setConversionInput(e.target.value)}
                  style={{ width: '70px', padding: '0.35rem 0.5rem', borderRadius: '0.35rem', border: '1px solid rgba(234,179,8,0.3)', background: 'rgba(0,0,0,0.4)', color: '#f8fafc', textAlign: 'center' }}
                />
                <span style={{ color: '#64748b', fontSize: '0.82rem' }}>of {prisoners} prisoners</span>
                <button
                  onClick={executeConversion}
                  disabled={busy === 'convert-prisoners' || prisoners <= 0 || Number(conversionInput) <= 0}
                  style={{ marginLeft: 'auto', padding: '0.35rem 0.75rem', borderRadius: '0.35rem', border: '1px solid rgba(234,179,8,0.45)', background: 'rgba(146,64,14,0.45)', color: '#fde68a', fontWeight: 700, cursor: 'pointer', opacity: (busy === 'convert-prisoners' || prisoners <= 0) ? 0.5 : 1 }}
                >
                  {busy === 'convert-prisoners' ? 'Converting…' : 'Convert'}
                </button>
              </div>
            </div>

            {/* Slaves → Prisoners */}
            <div style={{ background: 'rgba(30,41,59,0.5)', border: '1px solid rgba(148,163,184,0.18)', borderRadius: '0.55rem', padding: '1rem' }}>
              <div style={{ color: '#cbd5e1', fontWeight: 700, marginBottom: '0.5rem' }}>Release Slaves → Prisoners</div>
              <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginBottom: '0.75rem' }}>Released slaves return to the prisoner pool. Any excess worker assignments are automatically reduced.</div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="number" min="1" max={slaves} value={releaseInput}
                  onChange={(e) => setReleaseInput(e.target.value)}
                  style={{ width: '70px', padding: '0.35rem 0.5rem', borderRadius: '0.35rem', border: '1px solid rgba(148,163,184,0.25)', background: 'rgba(0,0,0,0.4)', color: '#f8fafc', textAlign: 'center' }}
                />
                <span style={{ color: '#64748b', fontSize: '0.82rem' }}>of {slaves} slaves</span>
                <button
                  onClick={executeRelease}
                  disabled={busy === 'release-slaves' || slaves <= 0 || Number(releaseInput) <= 0}
                  style={{ marginLeft: 'auto', padding: '0.35rem 0.75rem', borderRadius: '0.35rem', border: '1px solid rgba(148,163,184,0.3)', background: 'rgba(30,41,59,0.6)', color: '#e2e8f0', fontWeight: 700, cursor: 'pointer', opacity: (busy === 'release-slaves' || slaves <= 0) ? 0.5 : 1 }}
                >
                  {busy === 'release-slaves' ? 'Releasing…' : 'Release'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showProgressionModal && ReactDOM.createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.72)',
            zIndex: 10020,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowProgressionModal(false);
          }}
        >
          <div
            style={{
              background: 'rgba(18, 18, 18, 0.96)',
              border: '2px solid rgba(var(--theme-accent-rgb),0.4)',
              borderRadius: '12px',
              boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5)',
              width: '100%',
              maxWidth: '80vw',
              maxHeight: '85vh',
              overflowY: 'auto',
              padding: '2rem',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <h2 style={{ color: 'var(--text-gold)', margin: 0, marginBottom: '0.25rem', fontSize: '1.3rem', fontWeight: 700 }}>
                  Troop Progression
                </h2>
                <p style={{ color: '#94a3b8', margin: 0, fontSize: '0.82rem' }}>
                  Train civilians into Militia, then upgrade reserve units up their line's tiers as the matching building is completed. Some tiers require more than one building to unlock.
                </p>
              </div>
              <button
                onClick={() => setShowProgressionModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.5rem', cursor: 'pointer', padding: 0 }}
              >
                ×
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {progressionRenderModel.primaryLines.map((line) => (
                <div key={line.line_key} style={{ padding: '0.75rem', background: 'rgba(30,41,59,0.35)', borderRadius: '0.5rem', border: '1px solid rgba(148,163,184,0.2)' }}>
                  <div style={{ color: 'var(--text-gold)', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.5rem' }}>{line.line_key}</div>
                  <div style={{ display: 'flex', alignItems: 'stretch', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {line.tiers.map((tier, idx) => (
                      <React.Fragment key={tier.unit_type}>
                        {idx > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', color: '#64748b', fontSize: '1rem' }}>→</div>
                        )}
                        <div
                          style={{
                            minWidth: '150px',
                            padding: '0.5rem',
                            borderRadius: '0.4rem',
                            border: `1px solid ${tier.unlocked ? 'rgba(34,197,94,0.4)' : 'rgba(148,163,184,0.25)'}`,
                            background: tier.unlocked ? 'rgba(20,83,45,0.25)' : 'rgba(15,23,42,0.4)',
                          }}
                        >
                          <div style={{ color: tier.unlocked ? '#86efac' : '#94a3b8', fontWeight: 700, fontSize: '0.82rem' }}>
                            {tier.unlocked ? '✅' : '🔒'} {tier.unit_type}
                          </div>
                          <div style={{ color: '#94a3b8', fontSize: '0.7rem', marginTop: '0.2rem' }}>{tier.base_days} day(s)</div>
                          <div style={{ marginTop: '0.3rem', display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                            {tier.required_buildings.map((rb) => (
                              <div key={rb.building_type} style={{ color: rb.completed ? '#86efac' : '#f87171', fontSize: '0.68rem' }}>
                                {rb.completed ? '✓' : '✗'} {rb.building_name}
                              </div>
                            ))}
                          </div>
                        </div>
                      </React.Fragment>
                    ))}
                  </div>

                  {(progressionRenderModel.branchesByParent.get(line.line_key) || []).map((branch) => {
                    // Right-align the branch's tiers under the LAST N columns of the widest primary line
                    // (N = branch tier count) so equivalent-power units (matching base_days/tier) land in
                    // the correct column even when their direct parent has fewer tiers than the full tree
                    // (e.g. Covert only shows Street Informant/Infiltrator, but Assassin/Shadow Assassin
                    // are tier-3/4 units and must land in columns 3-4, not overlap columns 1-2).
                    const offset = Math.max(0, progressionRenderModel.maxPrimaryTierCount - branch.tiers.length);
                    const totalSlots = offset + branch.tiers.length;
                    return (
                      <div key={branch.line_key} style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed rgba(148,163,184,0.2)' }}>
                        <div style={{ color: '#94a3b8', fontSize: '0.75rem', fontStyle: 'italic', marginBottom: '0.35rem' }}>
                          ⤷ {branch.line_key}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'stretch', gap: '0.4rem', flexWrap: 'wrap' }}>
                          {Array.from({ length: totalSlots }).map((_, i) => {
                            const isSpacer = i < offset;
                            const tier = isSpacer ? null : branch.tiers[i - offset];
                            return (
                              <React.Fragment key={i}>
                                {i > 0 && (
                                  <div style={{ display: 'flex', alignItems: 'center', color: '#64748b', fontSize: '1rem', visibility: i > offset ? 'visible' : 'hidden' }}>→</div>
                                )}
                                {isSpacer || !tier ? (
                                  <div style={{ minWidth: '150px', visibility: 'hidden' }} />
                                ) : (
                                  <div
                                    style={{
                                      minWidth: '150px',
                                      padding: '0.5rem',
                                      borderRadius: '0.4rem',
                                      border: `1px dashed ${tier.unlocked ? 'rgba(34,197,94,0.4)' : 'rgba(148,163,184,0.3)'}`,
                                      background: tier.unlocked ? 'rgba(20,83,45,0.18)' : 'rgba(15,23,42,0.3)',
                                    }}
                                  >
                                    <div style={{ color: tier.unlocked ? '#86efac' : '#94a3b8', fontWeight: 700, fontSize: '0.82rem' }}>
                                      {tier.unlocked ? '✅' : '🔒'} {tier.unit_type}
                                    </div>
                                    <div style={{ color: '#94a3b8', fontSize: '0.7rem', marginTop: '0.2rem' }}>{tier.base_days} day(s)</div>
                                    <div style={{ marginTop: '0.3rem', display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                                      {tier.required_buildings.map((rb) => (
                                        <div key={rb.building_type} style={{ color: rb.completed ? '#86efac' : '#f87171', fontSize: '0.68rem' }}>
                                          {rb.completed ? '✓' : '✗'} {rb.building_name}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
              {(fiefDetails?.unit_progression || []).length === 0 && (
                <div style={{ color: '#64748b', fontSize: '0.85rem' }}>No unit progression data available for this fief yet.</div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button
                onClick={() => setShowProgressionModal(false)}
                style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid rgba(148,163,184,0.3)', background: 'rgba(30,41,59,0.35)', color: '#cbd5e1', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showUpgradeModal && selectedUpgradeBuildingId !== null && (() => {
        const building = fiefDetails?.buildings?.find((b: any) => Number(b.id) === selectedUpgradeBuildingId);
        const upgrade = building ? upgradeByBuildingId.get(selectedUpgradeBuildingId) : null;
        
        return ReactDOM.createPortal(
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.72)',
              zIndex: 10020,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1rem',
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowUpgradeModal(false);
            }}
          >
            <div
              style={{
                background: 'rgba(18, 18, 18, 0.96)',
                border: '2px solid rgba(59,130,246,0.4)',
                borderRadius: '12px',
                boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5)',
                width: '100%',
                maxWidth: '500px',
                padding: '2rem',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                <div>
                  <h2 style={{ color: '#93c5fd', margin: 0, marginBottom: '0.25rem', fontSize: '1.3rem', fontWeight: 700 }}>
                    Upgrade Building
                  </h2>
                  <p style={{ color: '#cbd5e1', margin: 0, fontSize: '0.9rem' }}>
                    {upgrade?.currentName} → {upgrade?.targetName}
                  </p>
                </div>
                <button
                  onClick={() => setShowUpgradeModal(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    fontSize: '1.5rem',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  ×
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                {/* Research Required */}
                <div style={{ padding: '0.75rem', background: 'rgba(59,130,246,0.1)', borderRadius: '0.5rem', border: '1px solid rgba(59,130,246,0.25)' }}>
                  <div style={{ color: '#93c5fd', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.25rem' }}>📖 Research Required</div>
                  <div style={{ color: upgrade?.researchRequired ? '#e2e8f0' : '#94a3b8', fontSize: '0.95rem' }}>
                    {upgrade?.researchRequired ? formatResearchLabel(upgrade.researchRequired) : 'None'}
                  </div>
                </div>

                {/* Time Required */}
                <div style={{ padding: '0.75rem', background: 'rgba(217,119,6,0.1)', borderRadius: '0.5rem', border: '1px solid rgba(217,119,6,0.25)' }}>
                  <div style={{ color: 'var(--text-gold)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.25rem' }}>⏱️ Time Required</div>
                  <div style={{ color: '#e2e8f0', fontSize: '0.95rem' }}>
                    {Number(upgrade?.days || 0)} day(s)
                  </div>
                </div>

                {/* Cost */}
                {upgrade?.cost && Object.keys(upgrade.cost).length > 0 && (
                  <div style={{ padding: '0.75rem', background: 'rgba(239,68,68,0.1)', borderRadius: '0.5rem', border: '1px solid rgba(239,68,68,0.25)' }}>
                    <div style={{ color: '#fca5a5', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.5rem' }}>💰 Resource Cost</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                      {Object.entries(upgrade.cost || {}).map(([resource, amount]) => {
                        const needed = Math.max(0, Number(amount || 0));
                        const available = getStoredAmountForCostResource(String(resource));
                        const requirementColor = available < needed
                          ? '#ef4444'
                          : available === needed
                            ? '#facc15'
                            : '#22c55e';
                        return (
                          <div key={resource} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#cbd5e1', fontSize: '0.85rem' }}>
                            <span>{String(resource).charAt(0).toUpperCase() + String(resource).slice(1)}</span>
                            <span style={{ fontWeight: 700, color: requirementColor }}>{needed}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Note */}
                <div style={{ padding: '0.75rem', background: 'rgba(148,163,184,0.1)', borderRadius: '0.5rem', border: '1px solid rgba(148,163,184,0.25)' }}>
                  <div style={{ color: '#94a3b8', fontSize: '0.8rem', lineHeight: '1.5' }}>
                    <strong>ℹ️ Note:</strong> Upgraded buildings still consume building-lane work while upgrading.
                  </div>
                </div>
              </div>

              {upgrade && !upgrade.canUpgrade && (
                <div style={{ padding: '0.75rem', background: 'rgba(239,68,68,0.15)', borderRadius: '0.5rem', border: '1px solid rgba(239,68,68,0.3)', marginBottom: '1.5rem' }}>
                  <div style={{ color: '#fca5a5', fontSize: '0.9rem', fontWeight: 600 }}>⚠️ Cannot Upgrade</div>
                  <div style={{ color: '#fca5a5', fontSize: '0.8rem', marginTop: '0.25rem' }}>{upgrade.reason || 'Missing resources or requirements'}</div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowUpgradeModal(false)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '0.5rem',
                    border: '1px solid rgba(148,163,184,0.3)',
                    background: 'rgba(30,41,59,0.35)',
                    color: '#cbd5e1',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                  }}
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    setShowUpgradeModal(false);
                    upgradeBuilding(selectedUpgradeBuildingId);
                  }}
                  disabled={!upgrade?.canUpgrade || busy === `upgrade-building-${selectedUpgradeBuildingId}`}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '0.5rem',
                    border: '1px solid rgba(125,211,252,0.5)',
                    background: (!upgrade?.canUpgrade || busy === `upgrade-building-${selectedUpgradeBuildingId}`) ? 'rgba(71,85,105,0.35)' : 'rgba(12,74,110,0.45)',
                    color: (!upgrade?.canUpgrade || busy === `upgrade-building-${selectedUpgradeBuildingId}`) ? '#94a3b8' : '#93c5fd',
                    cursor: (!upgrade?.canUpgrade || busy === `upgrade-building-${selectedUpgradeBuildingId}`) ? 'not-allowed' : 'pointer',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                  }}
                >
                  {busy === `upgrade-building-${selectedUpgradeBuildingId}` ? 'Upgrading...' : 'Start Upgrade'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}

    </div>
  );
};

export default KingdomTab;
