import type { CSSProperties } from 'react';
// Building categories shared by the Construction panel and the Build Structures modal.

export const RESEARCH_BUILDING_CHAIN = ['research_lab', 'research_lab_advanced', 'applied_sciences_lab', 'innovation_institute', 'arcane_research_institute', 'grand_academy_of_sciences', 'experimental_nexus', 'transcendent_research_complex', 'omniscience_institute'];

export const BUILD_TABS = ['all', 'food', 'wood', 'stone', 'research', 'faith', 'storage', 'military', 'defense', 'trade', 'animals', 'civic'] as const;
export type BuildTabId = typeof BUILD_TABS[number];

export const BUILD_TAB_LABELS: Record<BuildTabId, string> = {
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
  animals: 'Animals',
  civic: 'Civic',
};

export const BUILD_TAB_COLORS: Record<BuildTabId, { text: string; border: string; background: string }> = {
  all:      { text: 'var(--text-secondary)', border: 'rgba(var(--theme-accent-rgb),0.4)',   background: 'rgba(26,26,26,0.35)' },
  food:     { text: '#86efac', border: 'rgba(34,197,94,0.45)',    background: 'rgba(20,83,45,0.3)' },
  wood:     { text: '#d6bc9a', border: 'rgba(180,136,90,0.45)',   background: 'rgba(92,58,34,0.35)' },
  stone:    { text: 'var(--text-secondary)', border: 'rgba(var(--theme-accent-rgb),0.45)',  background: 'rgba(51,65,85,0.35)' },
  research: { text: '#93c5fd', border: 'rgba(59,130,246,0.45)',   background: 'rgba(30,58,138,0.28)' },
  faith:    { text: '#c4b5fd', border: 'rgba(139,92,246,0.45)',   background: 'rgba(76,29,149,0.25)' },
  storage:  { text: '#fde68a', border: 'rgba(234,179,8,0.45)',    background: 'rgba(113,63,18,0.28)' },
  military: { text: '#fca5a5', border: 'rgba(239,68,68,0.45)',    background: 'rgba(127,29,29,0.28)' },
  defense:  { text: 'var(--text-muted)', border: 'rgba(100,116,139,0.45)',  background: 'rgba(26,26,26,0.35)' },
  trade:    { text: '#6ee7b7', border: 'rgba(16,185,129,0.45)',   background: 'rgba(6,78,59,0.28)' },
  animals:  { text: '#fbbf24', border: 'rgba(217,119,6,0.45)',    background: 'rgba(120,53,15,0.28)' },
  civic:    { text: 'var(--text-gold)', border: 'rgba(var(--theme-accent-rgb),0.4)', background: 'rgba(120,53,15,0.28)' },
};

export const getBuildingCategory = (building: any): BuildTabId => {
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
  if (['housing', 'wood_lodge', 'reinforced_lodge', 'stone_lodge', 'longhouse_block', 'manor_house', 'townhouse_row', 'urban_residence', 'noble_residence', 'royal_estate', 'storage', 'storage_shack', 'advanced_storage_tent', 'storehouse', 'reinforced_storehouse', 'central_storehouse', 'storage_advanced', 'vaulted_warehouse', 'granary', 'reinforced_granary', 'cold_cellar_granary', 'regional_granary', 'central_food_reserve', 'preservation_complex', 'nutrient_reserve_hall', 'strategic_food_vault', 'eternal_harvest_vault', 'bank', 'trade_bank', 'merchant_bank', 'royal_treasury', 'builders_hut', 'masons_workshop', 'engineers_lodge', 'construction_guildhall', 'master_builder_hall', 'grand_architect_hall'].includes(key)) return 'storage';
  // Military
  if (['barracks',
       'militia_camp', 'militia_barracks', 'veteran_barracks', 'elite_garrison', 'war_garrison', 'legion_garrison', 'imperial_muster_hall',
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
  // Animals — Animal Management panel capacity/breeding buildings
  if (['animal_stable', 'grand_stable', 'royal_stud_farm', 'imperial_stud_farm',
       'animal_farm', 'grand_pasture', 'livestock_ranch', 'grand_stockyards',
       'breeding_pen', 'nursery',
  ].includes(key)) return 'animals';
  // Civic (diplomacy, welfare)
  return 'civic';
};


// Solid RGB per category (used with rgba(var(--cat-rgb), a)) so sections can carry a visible tint.
export const BUILD_TAB_RGB: Record<BuildTabId, string> = {
  all: 'var(--theme-accent-rgb)',
  food: '74, 222, 128',
  wood: '196, 154, 108',
  stone: '168, 162, 158',
  research: '96, 165, 250',
  faith: '167, 139, 250',
  storage: '250, 204, 21',
  military: '248, 113, 113',
  defense: '129, 150, 178',
  trade: '52, 211, 153',
  animals: '251, 146, 60',
  civic: 'var(--theme-accent-rgb)',
};

// Some structures are stored under their internal key ("central_food_reserve") rather than a
// display name, so fall back to a readable version of the key instead of showing it raw.
const looksLikeKey = (value: string) => /^[a-z0-9]+(_[a-z0-9]+)*$/.test(value);

const SMALL_WORDS = new Set(['of', 'the', 'and', 'a', 'an', 'to']);

export const prettifyKey = (key: string): string =>
  key
    .split('_')
    .filter(Boolean)
    .map((word, i) => (i > 0 && SMALL_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');

export const getBuildingDisplayName = (building: any, nameByType?: Map<string, string>): string => {
  const type = String(building?.building_type || building?.key || '').trim();
  const raw = String(building?.name || '').trim();
  if (raw && !looksLikeKey(raw)) return raw;
  const known = nameByType?.get(type);
  if (known && !looksLikeKey(known)) return known;
  return prettifyKey(raw || type) || 'Structure';
};

// Inline custom properties that drive a category's tint (see constructionPanel.css).
export const catStyle = (category: BuildTabId): CSSProperties =>
  ({ '--cat-rgb': BUILD_TAB_RGB[category], '--cat-text': BUILD_TAB_COLORS[category].text } as CSSProperties);
