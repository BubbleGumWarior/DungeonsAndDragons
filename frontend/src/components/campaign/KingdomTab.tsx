import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { campaignAPI, kingdomAPI, KingdomSummary, KingdomFief } from '../../services/api';

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

const WORKER_STEP_OPTIONS = [1, 5, 10, 50, 100] as const;
const POPULATION_MATURITY_DAYS = 15 * 365;
const VEGETABLE_HARVEST_INTERVAL_DAYS = 10;
const VEGETABLES_PER_WORKER_PER_HARVEST = 2; // must match backend: 20 per 10 days
const MEAT_PER_WORKER_PER_DAY = 1.5;
const getTierWorkerYieldMultiplier = (tier?: number) => {
  const normalizedTier = Math.max(1, Math.floor(Number(tier || 1)));
  return 1 + ((normalizedTier - 1) * 0.1);
};

const getFoodConsumptionRateForTier = (tier?: number) => (Number(tier || 1) <= 1 ? 0.7 : 1);

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

const LOGISTICS_BUILDING_TYPES = new Set([
  'logistics_depot',
  'roadworks',
  'supply_depot',
  'quartermaster_depot',
  'supply_network',
  'imperial_logistics_hub',
  'trade_route_office',
]);

const BUILD_TABS = ['all', 'food', 'wood', 'stone', 'research', 'faith', 'civic'] as const;
type BuildTabId = typeof BUILD_TABS[number];

const BUILD_TAB_LABELS: Record<BuildTabId, string> = {
  all: 'All',
  food: 'Food',
  wood: 'Wood',
  stone: 'Stone & Mining',
  research: 'Research',
  faith: 'Faith',
  civic: 'Civic',
};

const BUILD_TAB_COLORS: Record<BuildTabId, { text: string; border: string; background: string }> = {
  all: { text: '#e2e8f0', border: 'rgba(148,163,184,0.4)', background: 'rgba(30,41,59,0.35)' },
  food: { text: '#86efac', border: 'rgba(34,197,94,0.45)', background: 'rgba(20,83,45,0.3)' },
  wood: { text: '#d6bc9a', border: 'rgba(180,136,90,0.45)', background: 'rgba(92,58,34,0.35)' },
  stone: { text: '#cbd5e1', border: 'rgba(148,163,184,0.45)', background: 'rgba(51,65,85,0.35)' },
  research: { text: '#93c5fd', border: 'rgba(59,130,246,0.45)', background: 'rgba(30,58,138,0.28)' },
  faith: { text: '#c4b5fd', border: 'rgba(139,92,246,0.45)', background: 'rgba(76,29,149,0.25)' },
  civic: { text: 'var(--text-gold)', border: 'rgba(var(--theme-accent-rgb),0.4)', background: 'rgba(120,53,15,0.28)' },
};

const getBuildingCategory = (building: any): BuildTabId => {
  const key = String(building?.key || building?.building_type || '').trim();
  if (['farm', 'irrigated_farm', 'farm_advanced', 'hunters_guild', 'hunting_lodge', 'hunters_lodge_advanced', 'granary'].includes(key)) return 'food';
  if (['lumber_mill', 'wood_lodge'].includes(key)) return 'wood';
  if (['quarry', 'quarry_advanced', 'mine', 'mine_advanced', 'smithy', 'forge', 'master_smithy', 'royal_forge', 'grand_forge', 'war_smithy', 'imperial_forge'].includes(key)) return 'stone';
  if (['research_lab', 'research_lab_advanced'].includes(key)) return 'research';
  if (key === 'faith_temple') return 'faith';
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
  const [fiefDetails, setFiefDetails] = useState<KingdomFief | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([]);
  const toastIdRef = React.useRef(0);
  const pushToast = React.useCallback((message: string) => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const [showGrantModal, setShowGrantModal] = useState(false);
  const [showChildrenModal, setShowChildrenModal] = useState(false);
  const [showBuildModal, setShowBuildModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedUpgradeBuildingId, setSelectedUpgradeBuildingId] = useState<number | null>(null);
  const [buildTab, setBuildTab] = useState<BuildTabId>('all');
  const [selectedGrantPlayerIds, setSelectedGrantPlayerIds] = useState<number[]>([]);
  const [currentCampaignDay, setCurrentCampaignDay] = useState<number | null>(null);
  const [currentSeason, setCurrentSeason] = useState<'Spring' | 'Summer' | 'Autumn' | 'Winter' | null>(null);
  const [currentSeasonEffects, setCurrentSeasonEffects] = useState<Record<string, number>>({});

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

  useEffect(() => {
    if (!socket) return;

    const onDataChanged = (data: { campaignId: number }) => {
      if (Number(data?.campaignId) !== Number(campaignId)) return;
      fetchKingdoms();
      if (selectedFiefId) fetchFief(selectedFiefId);
    };

    const onDayAdvanced = (data: { campaignId: number | string }) => {
      if (Number(data?.campaignId) !== Number(campaignId)) return;
      fetchKingdoms();
      if (selectedFiefId) fetchFief(selectedFiefId);
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

    return () => {
      socket.off('kingdomDataChanged', onDataChanged);
      socket.off('dayAdvanced', onDayAdvanced);
    };
  }, [socket, campaignId, isDungeonMaster, userId, selectedFiefId, fetchKingdoms, fetchFief]);

  const myKingdom = useMemo(() => {
    if (isDungeonMaster) return null;
    return kingdoms.find((k) => Number(k.player_id) === Number(userId)) || null;
  }, [kingdoms, isDungeonMaster, userId]);

  const visibleKingdoms = useMemo(
    () => (isDungeonMaster ? kingdoms : (myKingdom ? [myKingdom] : [])),
    [isDungeonMaster, kingdoms, myKingdom]
  );

  const visibleFiefs = useMemo(
    () => visibleKingdoms.flatMap((k) => k.fiefs || []),
    [visibleKingdoms]
  );

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
      await kingdomAPI.grantKingdoms(campaignId, selectedGrantPlayerIds);
      setShowGrantModal(false);
      setSelectedGrantPlayerIds([]);
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

  const resourceRows = useMemo(() => {
    if (!fiefDetails) return [] as Array<{ key: string; assigned: number; max: number }>;
    const assignments = (fiefDetails.worker_assignments || {}) as Record<string, number>;
    const unlocked = (fiefDetails.unlocked_resources || {}) as Record<string, boolean>;
    const maxMap = (fiefDetails.max_workers_per_resource || {}) as Record<string, number>;

    const keys = Object.keys(assignments).length
      ? Object.keys(assignments)
      : ['meat', 'vegetables', 'wood', 'stone', 'iron', 'gold', 'research', 'faith', 'building'];

    return keys
      .filter((k) => (k === 'meat' ? unlocked[k] === true : unlocked[k] !== false))
      .map((k) => ({ key: k, assigned: Math.max(0, Number(assignments[k] || 0)), max: Math.max(0, Number(maxMap[k] || 10)) }));
  }, [fiefDetails]);

  const slaveResourceRows = useMemo(() => {
    if (!fiefDetails) return [] as Array<{ key: string; assigned: number; max: number }>;
    const assignments = (fiefDetails.slave_worker_assignments || {}) as Record<string, number>;
    const unlocked = (fiefDetails.unlocked_resources || {}) as Record<string, boolean>;
    const maxMap = (fiefDetails.max_workers_per_resource || {}) as Record<string, number>;
    const keys = Object.keys(assignments).length
      ? Object.keys(assignments)
      : ['meat', 'vegetables', 'wood', 'stone', 'iron', 'gold'];

    return keys
      .filter((k) => unlocked[k] !== false)
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
  const dailyFoodConsumption = totalPopulation * getFoodConsumptionRateForTier(Number(fiefDetails?.tier || 1));
  const foodDaysLeftIfNoProduction = dailyFoodConsumption > 0 ? (storedFood / dailyFoodConsumption) : Number.POSITIVE_INFINITY;
  const unassignedAdults = Math.max(0, assignablePopulation - totalAssigned);
  const hasPrisonInfrastructure = Boolean(
    (fiefDetails?.buildings || []).some((b: any) => Boolean(b?.is_complete) && String(b?.building_type) === 'prison')
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
    const applySeasonalModifier = (resourceKey: string, amount: number) => {
      const key = resourceKey === 'iron' ? 'minerals' : resourceKey;
      const modifier = Number(seasonEffects[key] || 0);
      if (modifier === 0) return amount;
      return amount * (1 + modifier);
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
    const slaveVegetables = Math.max(0, Number(slaveAssignments.vegetables || 0));
    const slaveWood = Math.max(0, Number(slaveAssignments.wood || 0));
    const slaveStone = Math.max(0, Number(slaveAssignments.stone || 0));
    const slaveIron = Math.max(0, Number(slaveAssignments.iron || 0));
    const slaveGold = Math.max(0, Number(slaveAssignments.gold || 0));

    // Use server-tracked harvest state to show accurate cycle progress
    const harvestState = (fiefDetails?.vegetable_harvest_state || { day_in_cycle: 0, accumulated_worker_days: 0 }) as { day_in_cycle: number; accumulated_worker_days: number };
    const dayInCycle = Math.max(0, Number(harvestState.day_in_cycle || 0));
    const accumulatedWorkerDays = Math.max(0, Number(harvestState.accumulated_worker_days || 0));
    const daysLeftInCycle = Math.max(0, VEGETABLE_HARVEST_INTERVAL_DAYS - dayInCycle);
    // Projected yield = accumulated so far + today's workers * remaining days (including today's contribution next day)
    const totalVegetableWorkers = workersVegetables + slaveVegetables;
    const projectedAccumulated = accumulatedWorkerDays + (totalVegetableWorkers * tierWorkerYieldMultiplier * vegetableResearchMultiplier * daysLeftInCycle);
    const projectedVegetableYieldBase = projectedAccumulated * VEGETABLES_PER_WORKER_PER_HARVEST;
    const projectedVegetableYield = applySeasonalModifier('vegetables', projectedVegetableYieldBase);
    const nextDayIsHarvest = daysLeftInCycle <= 1;

    let vegetables = 0;
    let meat = (workersMeat + slaveMeat) * MEAT_PER_WORKER_PER_DAY * tierWorkerYieldMultiplier * hunterResearchMultiplier;
    output.wood += (workersWood + slaveWood) * tierWorkerYieldMultiplier;
    output.stone += (workersStone + slaveStone) * tierWorkerYieldMultiplier;
    output.iron += (workersIron + slaveIron + (workersMinerals * 0.5)) * tierWorkerYieldMultiplier;
    output.gold += (workersGold + slaveGold) * tierWorkerYieldMultiplier;
    output.research += workersResearch;
    output.faith += (workersFaith * 0.5) * tierWorkerYieldMultiplier;
    const buildersHutCount = completedBuildings.filter((b: any) => String(b?.building_type || '') === 'builders_hut').length;
    output.building += Math.max(0, Number(assignments.building || 0)) + (buildersHutCount * 3);

    for (const building of completedBuildings) {
      const buildingOutput = (building?.resource_output && typeof building.resource_output === 'object')
        ? building.resource_output
        : {};
      for (const [resource, raw] of Object.entries(buildingOutput)) {
        const amount = Math.max(0, Number(raw || 0));
        if (resource === 'vegetables') vegetables += amount;
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

    output.vegetables = applySeasonalModifier('vegetables', vegetables);
    output.meat = applySeasonalModifier('meat', meat);
    output.wood = applySeasonalModifier('wood', output.wood);
    output.stone = applySeasonalModifier('stone', output.stone);
    output.iron = applySeasonalModifier('iron', output.iron);
    output.gold = applySeasonalModifier('gold', output.gold);
    output.faith = applySeasonalModifier('faith', output.faith);

    const logisticsLevel = completedBuildings.filter((b: any) => LOGISTICS_BUILDING_TYPES.has(String(b?.building_type || ''))).length;
    const logisticsMultiplier = 1 + (Math.max(0, logisticsLevel) * 0.05);
    if (logisticsLevel > 0) {
      for (const key of ['meat', 'vegetables', 'wood', 'stone', 'iron', 'gold', 'research', 'faith']) {
        const amount = Number(output[key] || 0);
        if (amount > 0) output[key] = amount * logisticsMultiplier;
      }
    }
    const foodTotal = output.vegetables + output.meat;
    const consumption = totalPopulation * getFoodConsumptionRateForTier(Number(fiefDetails?.tier || 1));
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
        logisticsLevel,
      },
    };
  }, [fiefDetails, totalPopulation, currentSeasonEffects]);

  const researchQueue = useMemo(() => {
    return [...(fiefDetails?.researchQueue || [])].sort((a, b) => {
      const ap = a.queue_position == null ? Number.MAX_SAFE_INTEGER : Number(a.queue_position);
      const bp = b.queue_position == null ? Number.MAX_SAFE_INTEGER : Number(b.queue_position);
      return ap === bp ? Number(a.id) - Number(b.id) : ap - bp;
    });
  }, [fiefDetails]);

  const activeResearch = researchQueue.find((r) => r.status === 'active');
  const upgradeByBuildingId = useMemo(() => {
    const map = new Map<number, any>();
    for (const upgrade of (fiefDetails?.availableUpgrades || [])) {
      map.set(Number(upgrade.buildingId), upgrade);
    }
    return map;
  }, [fiefDetails?.availableUpgrades]);

  const hasCompletedResearchLab = useMemo(
    () => (fiefDetails?.buildings || []).some((b: any) => Boolean(b?.is_complete) && String(b?.building_type) === 'research_lab'),
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

  const trainSoldiers = async () => {
    if (!fiefDetails) return;
    const input = window.prompt('How many unassigned adults should train as soldiers?', '1');
    if (input == null) return;
    const amount = Math.max(0, Math.floor(Number(input) || 0));
    if (amount <= 0) {
      pushToast('Enter a positive whole number.');
      return;
    }

    setBusy('train-soldiers');
    try {
      await kingdomAPI.trainSoldiers(Number(fiefDetails.id), amount);
      await fetchFief(Number(fiefDetails.id));
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Failed to train soldiers');
    } finally {
      setBusy(null);
    }
  };

  const convertPrisonersToSlaves = async () => {
    if (!fiefDetails) return;
    const input = window.prompt('How many prisoners should be converted to slaves?', '1');
    if (input == null) return;
    const amount = Math.max(0, Math.floor(Number(input) || 0));
    if (amount <= 0) {
      pushToast('Enter a positive whole number.');
      return;
    }

    setBusy('convert-prisoners');
    try {
      await kingdomAPI.convertPrisoners(Number(fiefDetails.id), amount);
      await fetchFief(Number(fiefDetails.id));
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Failed to convert prisoners');
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
          {toasts.map(t => (
            <div key={t.id} style={{ padding: '0.65rem 1rem', borderRadius: '0.45rem', border: '1px solid rgba(239,68,68,0.45)', background: 'rgba(127,29,29,0.92)', color: '#fca5a5', boxShadow: '0 4px 16px rgba(0,0,0,0.5)', maxWidth: '22rem', fontSize: '0.9rem' }}>
              {t.message}
            </div>
          ))}
        </div>,
        document.body
      )}

      {isDungeonMaster && kingdoms.length > 0 && (
        <div style={{ padding: '0.8rem', border: '1px solid rgba(148,163,184,0.2)', borderRadius: '0.6rem', background: 'rgba(2,6,23,0.35)' }}>
          <div style={{ color: 'var(--text-gold)', marginBottom: '0.6rem', fontWeight: 700 }}>All Campaign Kingdoms</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            {kingdoms.map((k) => (
              <div key={k.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', border: '1px solid rgba(148,163,184,0.2)', borderRadius: '0.45rem', padding: '0.45rem 0.55rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                  <span style={{ color: '#e2e8f0' }}>{k.name || `Unnamed Kingdom #${k.id}`}</span>
                  <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                    Player: {k.player_username || `#${k.player_id}`} • {k.is_active ? 'Active' : 'Pending Name'} • Fiefs: {(k.fiefs || []).length}
                  </span>
                </div>
                <button
                  onClick={() => handleDeleteKingdom(Number(k.id), k.name)}
                  disabled={busy === `delete-${Number(k.id)}`}
                  style={{ padding: '0.28rem 0.6rem', borderRadius: '0.35rem', border: '1px solid rgba(239,68,68,0.45)', background: 'rgba(127,29,29,0.3)', color: '#fca5a5', cursor: 'pointer' }}
                >
                  {busy === `delete-${Number(k.id)}` ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!visibleKingdoms.length ? (
        <div style={{ color: 'var(--text-muted)', padding: '1rem 0.2rem' }}>No kingdom assigned yet.</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {visibleKingdoms.flatMap((k) => (k.fiefs || []).map((f) => ({ kingdom: k, fief: f }))).map(({ kingdom, fief }) => (
              <button
                key={fief.id}
                onClick={() => {
                  setSelectedFiefId(Number(fief.id));
                  fetchFief(Number(fief.id));
                }}
                style={{
                  padding: '0.5rem 0.8rem',
                  borderRadius: '0.45rem',
                  border: Number(selectedFiefId) === Number(fief.id)
                    ? '1px solid rgba(var(--theme-accent-rgb), 0.65)'
                    : '1px solid rgba(148,163,184,0.3)',
                  background: Number(selectedFiefId) === Number(fief.id)
                    ? 'rgba(245,158,11,0.18)'
                    : 'rgba(15,23,42,0.4)',
                  color: Number(selectedFiefId) === Number(fief.id) ? 'var(--text-gold)' : '#cbd5e1',
                  cursor: 'pointer',
                }}
              >
                {kingdom.name || 'Unnamed Kingdom'}: {fief.name}
              </button>
            ))}
          </div>

          {fiefDetails && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
              <div style={{ padding: '0.8rem', border: '1px solid rgba(148,163,184,0.2)', borderRadius: '0.6rem', background: 'rgba(2,6,23,0.35)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                  <div style={{ color: '#e2e8f0' }}>Tier {fiefDetails.tier} {fiefDetails.is_capital ? '• Capital' : ''}</div>
                  <div style={{ color: '#94a3b8' }}>
                    Storage: {Object.values((fiefDetails.stored_resources || {}) as Record<string, number>).reduce((a, b) => a + Number(b || 0), 0).toFixed(1)} / {Number(fiefDetails.storage_capacity || 100)}
                  </div>
                </div>

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

              <div style={{ padding: '0.8rem', border: '1px solid rgba(148,163,184,0.2)', borderRadius: '0.6rem', background: 'rgba(2,6,23,0.35)' }}>
                <div style={{ color: 'var(--text-gold)', marginBottom: '0.6rem', fontWeight: 700 }}>Population</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.7rem 1.1rem', alignItems: 'center' }}>
                  <span style={{ color: '#e2e8f0', fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                    Total: {totalPopulation}
                    {isDungeonMaster && (
                      <>
                        <button
                          onClick={() => dmAdjustPopulation(-1)}
                          disabled={busy === 'dm-adjust'}
                          style={{
                            padding: '0.14rem 0.42rem',
                            borderRadius: '0.32rem',
                            border: '1px solid rgba(239,68,68,0.45)',
                            background: 'rgba(127,29,29,0.35)',
                            color: '#fca5a5',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            cursor: busy === 'dm-adjust' ? 'not-allowed' : 'pointer',
                            opacity: busy === 'dm-adjust' ? 0.6 : 1,
                          }}
                        >
                          - Pop
                        </button>
                        <button
                          onClick={() => dmAdjustPopulation(1)}
                          disabled={busy === 'dm-adjust'}
                          style={{
                            padding: '0.14rem 0.42rem',
                            borderRadius: '0.32rem',
                            border: '1px solid rgba(34,197,94,0.45)',
                            background: 'rgba(20,83,45,0.35)',
                            color: '#86efac',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            cursor: busy === 'dm-adjust' ? 'not-allowed' : 'pointer',
                            opacity: busy === 'dm-adjust' ? 0.6 : 1,
                          }}
                        >
                          + Pop
                        </button>
                      </>
                    )}
                  </span>
                  <span style={{ color: '#94a3b8', fontSize: '0.98rem' }}>Assignable adults: {assignablePopulation}</span>
                  <span style={{ color: '#fca5a5', fontSize: '0.95rem' }}>Sick/Injured: {sickInjuredPopulation}</span>
                  <span style={{ color: '#93c5fd', fontSize: '0.95rem' }}>Soldiers: {soldiers}</span>
                  <span style={{ color: '#e2e8f0', fontSize: '0.95rem' }}>Prisoners: {prisoners}</span>
                  <span style={{ color: '#fde68a', fontSize: '0.95rem' }}>Slaves: {slaves}</span>
                  <span style={{ color: productionByLane.foodBreakdown.net >= 0 ? '#22c55e' : '#ef4444', fontSize: '0.95rem', fontWeight: 700 }}>Food net: {productionByLane.foodBreakdown.net.toFixed(1)} /day</span>
                  <button
                    onClick={() => setShowChildrenModal(true)}
                    style={{
                      padding: '0.4rem 0.7rem',
                      borderRadius: '0.35rem',
                      border: '1px solid rgba(125,211,252,0.45)',
                      background: 'rgba(12,74,110,0.35)',
                      color: '#7dd3fc',
                      fontSize: '0.93rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Children: {underagePopulation}
                  </button>
                  <span style={{ color: '#94a3b8', fontSize: '0.92rem' }}>
                    {nextMaturityDays == null
                      ? 'No child maturation scheduled'
                      : `Next child matures in ${nextMaturityDays} day(s)`}
                  </span>
                </div>
                <div style={{ marginTop: '0.45rem', color: '#94a3b8', fontSize: '0.76rem' }}>
                  {dailyFoodConsumption <= 0
                    ? `Stored food: ${storedFood.toFixed(1)}. No daily consumption right now, so food will not deplete from population upkeep.`
                    : `Stored food: ${storedFood.toFixed(1)}. If production stops, food lasts about ${foodDaysLeftIfNoProduction.toFixed(1)} day(s).`}
                </div>
              </div>

              <div style={{ padding: '0.8rem', border: '1px solid rgba(59,130,246,0.25)', borderRadius: '0.6rem', background: 'rgba(8,47,73,0.25)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <div style={{ color: '#93c5fd', fontWeight: 700 }}>Militia & Soldiers</div>
                  <button
                    onClick={trainSoldiers}
                    disabled={busy === 'train-soldiers' || unassignedAdults <= 0}
                    style={{
                      padding: '0.3rem 0.65rem',
                      borderRadius: '0.35rem',
                      border: '1px solid rgba(59,130,246,0.45)',
                      background: 'rgba(30,64,175,0.35)',
                      color: '#bfdbfe',
                      fontWeight: 700,
                      cursor: 'pointer',
                      opacity: (busy === 'train-soldiers' || unassignedAdults <= 0) ? 0.6 : 1,
                    }}
                  >
                    {busy === 'train-soldiers' ? 'Training...' : 'Train Soldiers'}
                  </button>
                </div>
                <div style={{ marginTop: '0.55rem', color: '#cbd5e1', fontSize: '0.9rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <span>Standing soldiers: {soldiers}</span>
                  <span>Unassigned adults: {unassignedAdults}</span>
                </div>
              </div>

              <div style={{ padding: '0.8rem', border: '1px solid rgba(234,179,8,0.28)', borderRadius: '0.6rem', background: 'rgba(120,53,15,0.22)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <div style={{ color: '#fde68a', fontWeight: 700 }}>Prisoners & Slave Labor</div>
                  <button
                    onClick={convertPrisonersToSlaves}
                    disabled={busy === 'convert-prisoners' || prisoners <= 0}
                    style={{
                      padding: '0.3rem 0.65rem',
                      borderRadius: '0.35rem',
                      border: '1px solid rgba(234,179,8,0.45)',
                      background: 'rgba(146,64,14,0.35)',
                      color: '#fde68a',
                      fontWeight: 700,
                      cursor: 'pointer',
                      opacity: (busy === 'convert-prisoners' || prisoners <= 0) ? 0.6 : 1,
                    }}
                  >
                    {busy === 'convert-prisoners' ? 'Converting...' : 'Convert Prisoners'}
                  </button>
                </div>
                <div style={{ marginTop: '0.55rem', color: '#e2e8f0', fontSize: '0.9rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <span>Prisoners held: {prisoners}</span>
                  <span>Slave population: {slaves}</span>
                  <span style={{ color: hasPrisonInfrastructure ? '#86efac' : '#fca5a5' }}>
                    Prison infrastructure: {hasPrisonInfrastructure ? 'Online' : 'Not built'}
                  </span>
                </div>
              </div>

              <div style={{ padding: '0.8rem', border: '1px solid rgba(148,163,184,0.2)', borderRadius: '0.6rem', background: 'rgba(2,6,23,0.35)' }}>
                <div style={{ color: 'var(--text-gold)', marginBottom: '0.6rem', fontWeight: 700 }}>Worker Assignments (Citizens)</div>
                <div style={{ color: '#94a3b8', fontSize: '0.82rem', marginBottom: '0.55rem', textAlign: 'center' }}>Assigned citizens: {totalAssigned}/{assignablePopulation} assignable adults</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', alignItems: 'center' }}>
                  {resourceRows.map((row) => (
                    <div
                      key={row.key}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.35rem',
                        width: '100%',
                        maxWidth: '1160px',
                      }}
                    >
                      <div style={{ display: 'grid', gridTemplateColumns: '96px minmax(250px, auto) 68px minmax(250px, auto) 96px', alignItems: 'center', justifyContent: 'center', gap: '0.55rem' }}>
                        <div style={{ textAlign: 'center', color: '#e2e8f0', textTransform: 'capitalize', minWidth: '60px' }}>{row.key}</div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.35rem', flexWrap: 'wrap' }}>
                          {WORKER_STEP_OPTIONS.slice().reverse().map((step) => (
                            <button
                              key={`minus-${row.key}-${step}`}
                              onClick={() => adjustWorkers(row.key, -step)}
                              disabled={busy === 'workers'}
                              style={{ padding: '0.2rem 0.45rem', borderRadius: '0.35rem', border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(127,29,29,0.3)', color: '#fca5a5', cursor: 'pointer' }}
                            >
                              -{step}
                            </button>
                          ))}
                        </div>
                        <span style={{ minWidth: 68, textAlign: 'center', color: '#f8fafc', fontWeight: 700 }}>{row.assigned}/{row.max}</span>
                        <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '0.35rem', flexWrap: 'wrap' }}>
                          {WORKER_STEP_OPTIONS.map((step) => (
                            <button
                              key={`plus-${row.key}-${step}`}
                              onClick={() => adjustWorkers(row.key, step)}
                              disabled={busy === 'workers'}
                              style={{ padding: '0.2rem 0.45rem', borderRadius: '0.35rem', border: '1px solid rgba(34,197,94,0.35)', background: 'rgba(20,83,45,0.35)', color: '#86efac', cursor: 'pointer' }}
                            >
                              +{step}
                            </button>
                          ))}
                        </div>
                        <div style={{ textAlign: 'center', minWidth: '70px', fontWeight: 700, fontSize: '0.88rem' }}>
                          {(() => {
                            const output = Number(productionByLane.output[row.key] || 0);
                            let color = 'var(--text-gold)';
                            if (output > 0) color = '#22c55e';
                            else if (output < 0) color = '#ef4444';
                            return <span style={{ color }}>{formatSigned(output)}</span>;
                          })()}
                        </div>
                      </div>
                      <span style={{ color: '#93c5fd', fontSize: '0.78rem', textAlign: 'center' }}>
                        {row.key === 'meat'
                          ? `${formatSigned(productionByLane.output.meat)} /day (constant)`
                          : row.key === 'vegetables'
                            ? `Getting ~${(productionByLane.foodBreakdown.projectedVegetableYield ?? 0).toFixed(1)} food in ${productionByLane.foodBreakdown.daysLeftInCycle ?? 0} day(s)`
                          : row.key === 'building'
                            ? `${formatSigned(productionByLane.output.building)} build speed/day`
                            : `${formatSigned(Number(productionByLane.output[row.key] || 0))} /day`}
                      </span>
                      {currentCampaignDay !== null && ['vegetables', 'meat', 'wood', 'stone', 'iron', 'minerals', 'faith', 'research', 'gold'].includes(row.key) && (
                        (() => {
                          const season = currentSeason || (currentCampaignDay ? getSeasonForDay(currentCampaignDay) : null);
                          if (!season) return null;
                          const effects = (currentSeasonEffects && typeof currentSeasonEffects === 'object')
                            ? currentSeasonEffects
                            : getSeasonEffects(season);
                          const displayKey = row.key === 'iron' ? 'minerals' : row.key;
                          const resourceModifier = effects[displayKey] || 0;

                          const logisticsLevel = Math.max(0, Number(productionByLane.foodBreakdown.logisticsLevel || 0));
                          const logisticsText = logisticsLevel > 0 ? ` | Logistics +${logisticsLevel * 5}%` : '';

                          if (resourceModifier !== 0) {
                            const isBonus = resourceModifier > 0;
                            const color = isBonus ? '#22c55e' : '#ef4444';
                            const percent = Math.round(Math.abs(resourceModifier) * 100);
                            const adjustedOutput = Number(productionByLane.output[row.key] || 0);
                            const outputSuffix = row.key === 'building' ? ' build speed/day' : '/day';
                            return (
                              <span title={`${season} effect: ${isBonus ? '+' : '-'}${percent}% production`} style={{ color, fontSize: '0.73rem', fontWeight: 600, cursor: 'help' }}>
                                {season} {isBonus ? '📈' : '📉'} {isBonus ? '+' : '-'}{percent}%{logisticsText}{' -> '}{formatSigned(adjustedOutput)}{outputSuffix}
                              </span>
                            );
                          }

                          if (logisticsLevel > 0) {
                            return (
                              <span style={{ color: '#22c55e', fontSize: '0.73rem', fontWeight: 600 }}>
                                Logistics +{logisticsLevel * 5}%
                              </span>
                            );
                          }

                          return null;
                        })()
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {(hasPrisonInfrastructure || slaves > 0 || totalSlaveAssigned > 0) && (
                <div style={{ padding: '0.8rem', border: '1px solid rgba(234,179,8,0.28)', borderRadius: '0.6rem', background: 'rgba(120,53,15,0.22)' }}>
                  <div style={{ color: '#fde68a', marginBottom: '0.6rem', fontWeight: 700 }}>Worker Assignments (Slave Labor)</div>
                  <div style={{ color: '#f1f5f9', fontSize: '0.82rem', marginBottom: '0.55rem', textAlign: 'center' }}>Assigned slaves: {totalSlaveAssigned}/{slaves}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', alignItems: 'center' }}>
                    {slaveResourceRows.map((row) => (
                      <div
                        key={`slave-${row.key}`}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.35rem',
                          width: '100%',
                          maxWidth: '1160px',
                        }}
                      >
                        <div style={{ display: 'grid', gridTemplateColumns: '96px minmax(250px, auto) 68px minmax(250px, auto) 96px', alignItems: 'center', justifyContent: 'center', gap: '0.55rem' }}>
                          <div style={{ textAlign: 'center', color: '#fde68a', textTransform: 'capitalize', minWidth: '60px' }}>{row.key}</div>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.35rem', flexWrap: 'wrap' }}>
                            {WORKER_STEP_OPTIONS.slice().reverse().map((step) => (
                              <button
                                key={`slave-minus-${row.key}-${step}`}
                                onClick={() => adjustSlaveWorkers(row.key, -step)}
                                disabled={busy === 'slave-workers'}
                                style={{ padding: '0.2rem 0.45rem', borderRadius: '0.35rem', border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(127,29,29,0.3)', color: '#fca5a5', cursor: 'pointer' }}
                              >
                                -{step}
                              </button>
                            ))}
                          </div>
                          <span style={{ minWidth: 68, textAlign: 'center', color: '#f8fafc', fontWeight: 700 }}>{row.assigned}/{row.max}</span>
                          <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '0.35rem', flexWrap: 'wrap' }}>
                            {WORKER_STEP_OPTIONS.map((step) => (
                              <button
                                key={`slave-plus-${row.key}-${step}`}
                                onClick={() => adjustSlaveWorkers(row.key, step)}
                                disabled={busy === 'slave-workers'}
                                style={{ padding: '0.2rem 0.45rem', borderRadius: '0.35rem', border: '1px solid rgba(34,197,94,0.35)', background: 'rgba(20,83,45,0.35)', color: '#86efac', cursor: 'pointer' }}
                              >
                                +{step}
                              </button>
                            ))}
                          </div>
                          <div style={{ textAlign: 'center', minWidth: '70px', fontWeight: 700, fontSize: '0.88rem' }}>
                            <span style={{ color: '#22c55e' }}>{formatSigned(Number(productionByLane.output[row.key] || 0))}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ padding: '0.8rem', border: '1px solid rgba(148,163,184,0.2)', borderRadius: '0.6rem', background: 'rgba(2,6,23,0.35)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
                  <div style={{ color: 'var(--text-gold)', fontWeight: 700 }}>Construction</div>
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
                        {buildingsInCategory.map((b: any) => (
                          (() => {
                            const upgrade = upgradeByBuildingId.get(Number(b.id));

                            return (
                              <div
                                key={Number(b.id)}
                                style={{
                                  borderRadius: '0.55rem',
                                  border: `1px solid ${categoryColors.border}`,
                                  background: categoryColors.background,
                                  opacity: b.is_complete ? 1 : 0.75,
                                  padding: '0.5rem 0.6rem',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '0.16rem',
                                }}
                              >
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
                                      {busy === `upgrade-building-${Number(b.id)}` ? '...' : '↑ Upgrade'}
                                    </button>
                                  )}
                                </div>
                                <span style={{ color: '#94a3b8', fontSize: '0.74rem', textTransform: 'uppercase' }}>{b.building_type}</span>
                                <span style={{ fontSize: '0.8rem', color: b.is_complete ? '#86efac' : 'var(--text-gold)' }}>
                                  {b.is_complete ? 'Completed' : `${Number(b.days_remaining || 0)} day(s) remaining`}
                                </span>
                              </div>
                            );
                          })()
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ padding: '0.8rem', border: '1px solid rgba(218,165,32,0.3)', borderRadius: '0.6rem', background: 'rgba(113,63,18,0.25)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                  <div style={{ color: 'var(--text-gold)', fontWeight: 700, fontSize: '1.05rem' }}>⬆️ Fief Tier Upgrade</div>
                  <div style={{ color: '#f8fafc', fontWeight: 700, fontSize: '1rem' }}>Tier {fiefDetails.tier}</div>
                </div>

                {fiefDetails.tier >= 3 ? (
                  <div style={{ color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center', padding: '0.5rem 0' }}>
                    ✓ Maximum tier reached for this phase
                  </div>
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

              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                {/* Placeholder for spacing */}
              </div>

              {hasCompletedResearchLab && (
              <div style={{ padding: '0.8rem', border: '1px solid rgba(148,163,184,0.2)', borderRadius: '0.6rem', background: 'rgba(2,6,23,0.35)' }}>
                <div style={{ color: '#93c5fd', marginBottom: '0.6rem', fontWeight: 700, fontSize: '1.05rem' }}>📘 Research</div>

                {(fiefDetails.availableResearch || []).length === 0 ? (
                  <div style={{ color: '#94a3b8', fontSize: '0.82rem' }}>Research unlocks after reaching Tier 2 and building a Research Lab.</div>
                ) : (
                  <>
                    {activeResearch && (
                      <div style={{ marginBottom: '0.8rem', padding: '0.6rem', border: '1px solid rgba(217,119,6,0.35)', borderRadius: '0.45rem', background: 'rgba(120,53,15,0.2)' }}>
                        <div style={{ color: 'var(--text-gold)', fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.3rem' }}>
                          ⏳ Active
                        </div>
                        {researchQueue.filter(r => r.status === 'active').map((entry) => {
                          const research = (fiefDetails.availableResearch || []).find((r: any) => String(r.id) === String(entry.research_id));
                          const progress = Number(entry.points_accumulated || 0);
                          const required = Number(research?.pointsRequired || 100);
                          const progressPercent = Math.min(100, (progress / required) * 100);
                          return (
                            <div key={entry.id}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                                <span style={{ color: '#e2e8f0', fontSize: '0.86rem', fontWeight: 600 }}>{research?.name || formatResearchLabel(entry.research_id)}</span>
                                <span style={{ color: '#bfdbfe', fontSize: '0.74rem' }}>{Math.floor(progress)}/{required} pts</span>
                              </div>
                              <div style={{ height: '0.32rem', background: 'rgba(30,41,59,0.5)', borderRadius: '0.2rem', overflow: 'hidden' }}>
                                <div style={{ height: '100%', background: 'rgba(217,119,6,0.7)', width: `${progressPercent}%`, transition: 'width 0.3s ease' }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {researchQueue.filter(r => r.status === 'queued').length > 0 && (
                      <div style={{ marginBottom: '0.8rem', padding: '0.6rem', border: '1px solid rgba(148,163,184,0.25)', borderRadius: '0.45rem', background: 'rgba(30,41,59,0.25)' }}>
                        <div style={{ color: '#cbd5e1', fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.3rem' }}>
                          ⋯ Queued
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          {researchQueue.filter(r => r.status === 'queued').map((entry, idx) => {
                            const research = (fiefDetails.availableResearch || []).find((r: any) => String(r.id) === String(entry.research_id));
                            return (
                              <div key={entry.id} style={{ fontSize: '0.76rem', color: '#94a3b8' }}>
                                {idx + 1}. {research?.name || formatResearchLabel(entry.research_id)}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {(fiefDetails.availableResearch || []).filter((r: any) => r.isCompleted).length > 0 && (
                      <div style={{ marginBottom: '0.8rem', padding: '0.6rem', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '0.45rem', background: 'rgba(22,163,74,0.15)' }}>
                        <div style={{ color: '#86efac', fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.3rem' }}>
                          ✓ Completed
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.4rem' }}>
                          {(fiefDetails.availableResearch || []).filter((r: any) => r.isCompleted).map((research: any) => (
                            <div
                              key={research.id}
                              title={`${research.name}: ${String(research.description || 'No description available.')}`}
                              style={{
                                fontSize: '0.76rem',
                                color: '#86efac',
                                padding: '0.3rem 0.4rem',
                                background: 'rgba(34,197,94,0.1)',
                                borderRadius: '0.3rem',
                                textAlign: 'center',
                                cursor: 'help',
                              }}
                            >
                              {research.name}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {(fiefDetails.availableResearch || []).filter((r: any) => !r.isCompleted && !r.isQueuedOrActive).length > 0 && (
                      <div style={{ padding: '0.6rem', border: '1px solid rgba(96,165,250,0.3)', borderRadius: '0.45rem', background: 'rgba(30,58,138,0.15)' }}>
                        <div style={{ color: '#93c5fd', fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.4rem' }}>
                          📖 Available
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.5rem' }}>
                          {(fiefDetails.availableResearch || []).filter((r: any) => !r.isCompleted && !r.isQueuedOrActive).map((research: any) => {
                            const prereqText = (research.prerequisites || []).map((r: string) => formatResearchLabel(r)).join(', ');
                            return (
                              <div
                                key={research.id}
                                style={{
                                  border: '1px solid rgba(96,165,250,0.35)',
                                  borderRadius: '0.45rem',
                                  padding: '0.5rem 0.6rem',
                                  background: 'rgba(30,41,59,0.4)',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '0.25rem',
                                }}
                              >
                                <div style={{ color: '#dbeafe', fontWeight: 700, fontSize: '0.88rem' }}>{research.name}</div>
                                <div style={{ color: '#cbd5e1', fontSize: '0.75rem', lineHeight: '1.3' }}>{research.description}</div>
                                {prereqText && (
                                  <div style={{ color: '#94a3b8', fontSize: '0.7rem', marginTop: '0.1rem' }}>⚙️ {prereqText}</div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.3rem' }}>
                                  <span style={{ color: '#93c5fd', fontSize: '0.76rem', fontWeight: 600 }}>{research.pointsRequired} pts</span>
                                  <button
                                    onClick={() => startResearch(research.id)}
                                    disabled={busy === `research-${research.id}`}
                                    style={{
                                      padding: '0.24rem 0.5rem',
                                      borderRadius: '0.3rem',
                                      border: '1px solid rgba(96,165,250,0.5)',
                                      background: busy === `research-${research.id}` ? 'rgba(71,85,105,0.35)' : 'rgba(30,58,138,0.45)',
                                      color: busy === `research-${research.id}` ? '#94a3b8' : '#93c5fd',
                                      cursor: busy === `research-${research.id}` ? 'not-allowed' : 'pointer',
                                      fontSize: '0.72rem',
                                      fontWeight: 600,
                                    }}
                                  >
                                    {busy === `research-${research.id}` ? 'Starting...' : 'Start'}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
              )}
            </div>
          )}
        </>
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
            if (e.target === e.currentTarget) setShowGrantModal(false);
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
              <button className="modal-close" onClick={() => setShowGrantModal(false)} aria-label="Close">×</button>
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
              <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button className="btn btn-secondary" onClick={() => setShowGrantModal(false)}>Cancel</button>
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
