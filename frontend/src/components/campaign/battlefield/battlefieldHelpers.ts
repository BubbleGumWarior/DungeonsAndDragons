import { Bomb, Crosshair, EyeOff, Flame, Navigation, Shield, Swords, WandSparkles, LucideIcon } from 'lucide-react';
import { UNIT_TEMPLATES } from '../../../utils/unitTemplates';
import type { BattleParticipant } from '../../../services/api';

// Map positions are stored as % of the board; one % is this many feet in both axes.
export const BATTLEFIELD_FEET_PER_PERCENT = 20 / 3;
// How far an army sees at darkness 0: 150 ft. Partial silhouette extends to twice that.
export const BASE_ARMY_VISION_RADIUS_PCT = 150 / BATTLEFIELD_FEET_PER_PERCENT;

export type ArmyBaseType = 'infantry' | 'archer' | 'cavalry' | 'guard' | 'artillery' | 'covert' | 'mage' | 'dragon';

// Reach (how far an army can act on another) and movement (per round), in feet, for each unit line.
export const UNIT_LINES: Record<ArmyBaseType, { label: string; reach: number; movement: number; glyph: LucideIcon }> = {
  infantry: { label: 'Infantry', reach: 40, movement: 100, glyph: Swords },
  archer: { label: 'Archers', reach: 300, movement: 100, glyph: Crosshair },
  cavalry: { label: 'Cavalry', reach: 40, movement: 300, glyph: Navigation },
  guard: { label: 'Guards', reach: 40, movement: 100, glyph: Shield },
  artillery: { label: 'Artillery', reach: 600, movement: 50, glyph: Bomb },
  covert: { label: 'Covert', reach: 40, movement: 150, glyph: EyeOff },
  mage: { label: 'Mages', reach: 200, movement: 100, glyph: WandSparkles },
  dragon: { label: 'Dragons', reach: 200, movement: 500, glyph: Flame },
};

export const getArmyBaseType = (category: string): ArmyBaseType =>
  UNIT_TEMPLATES[category]?.baseType ?? 'infantry';

// Army movement per round, in feet.
export const getArmyMovementSpeed = (category: string): number =>
  UNIT_TEMPLATES[category] ? UNIT_LINES[getArmyBaseType(category)].movement : 100;

export const getArmyRangeFeet = (category: string): number => UNIT_LINES[getArmyBaseType(category)].reach;

export const getArmyRangeLabel = (category: string): string => {
  const baseType = getArmyBaseType(category);
  const name = { archer: 'Archer', artillery: 'Artillery', mage: 'Mage', dragon: 'Dragon' }[baseType as string] || 'Melee';
  return name + ' ' + UNIT_LINES[baseType].reach + 'ft';
};

export const BASE_TYPE_LABEL: Record<ArmyBaseType, string> = Object.fromEntries(
  Object.entries(UNIT_LINES).map(([k, v]) => [k, v.label])
) as Record<ArmyBaseType, string>;

export const BASE_TYPE_GLYPH: Record<ArmyBaseType, LucideIcon> = Object.fromEntries(
  Object.entries(UNIT_LINES).map(([k, v]) => [k, v.glyph])
) as Record<ArmyBaseType, LucideIcon>;

export const getParticipantCategory = (participant: BattleParticipant): string => {
  if (participant.is_temporary) return participant.temp_army_category || 'Recruit';
  return participant.army_category || participant.temp_army_category || 'Recruit';
};

export const getParticipantName = (participant: BattleParticipant): string =>
  participant.temp_army_name || participant.army_name || `Army #${participant.id}`;

export const getFactionColor = (participant: Pick<BattleParticipant, 'faction_color' | 'team_name'>): string =>
  participant.faction_color || (participant.team_name === 'A' ? '#3b82f6' : '#ef4444');

// Straight-line distance between two points on the board, in feet (same measure the goal checks use).
export const getPercentDistanceFeet = (ax: number, ay: number, bx: number, by: number): number =>
  Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2) * BATTLEFIELD_FEET_PER_PERCENT;

export const getBattlefieldDistanceFeet = (attacker: BattleParticipant, target: BattleParticipant): number =>
  getPercentDistanceFeet(
    attacker.position_x ?? 50,
    attacker.position_y ?? 50,
    target.position_x ?? 50,
    target.position_y ?? 50
  );

// Readable ink for text laid over a faction colour.
export const readableOn = (color: string): string => {
  const hex = color.trim().replace('#', '');
  const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return '#ffffff';
  const [r, g, b] = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) / 255).map(c =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const darkInk = 0.012; // relative luminance of #14110a
  const againstWhite = 1.05 / (luminance + 0.05);
  const againstDark = (luminance + 0.05) / (darkInk + 0.05);
  return againstDark >= againstWhite ? '#14110a' : '#ffffff';
};

export type FogState = 'visible' | 'silhouette' | 'hidden';

// A temporary army that no player was assigned to is run by the DM
export const isDmRun = (p: Pick<BattleParticipant, 'is_temporary' | 'is_summoned' | 'controller_user_id' | 'is_dm_run'>): boolean =>
  p.is_dm_run ?? (!!p.is_temporary && !p.is_summoned && !p.controller_user_id);

export interface BattlePlayer { userId: number; name: string; team: string }

// Players who brought armies into the battle: the ones a DM army can be handed to
export const getBattlePlayers = (participants: BattleParticipant[]): BattlePlayer[] => {
  const seen = new Map<number, BattlePlayer>();
  participants.forEach(p => {
    if (p.user_id == null || seen.has(p.user_id)) return;
    seen.set(p.user_id, { userId: p.user_id, name: p.player_name || 'Player', team: p.team_name });
  });
  return Array.from(seen.values());
};

// A hidden covert army, or one the DM concealed, is invisible to everyone except the DM and the team it fights for
export const isConcealedFrom = (
  participant: BattleParticipant,
  all: BattleParticipant[],
  viewerUserId: number | undefined,
  isDM: boolean
): boolean => {
  if ((!participant.is_hidden && !participant.dm_hidden) || isDM) return false;
  return !all.some(o => o.user_id === viewerUserId && o.team_name === participant.team_name);
};

// What a viewer may see of an army under darkness: full detail, a "?" silhouette, or nothing.
export const getFogState = (
  participant: BattleParticipant,
  all: BattleParticipant[],
  viewerUserId: number | undefined,
  isDM: boolean,
  darknessLevel: number
): FogState => {
  if (isConcealedFrom(participant, all, viewerUserId, isDM)) return 'hidden';
  if (isDM || darknessLevel <= 0) return 'visible';
  if (participant.user_id === viewerUserId) return 'visible';
  const own = all.filter(p => p.user_id === viewerUserId);
  if (own.length === 0) return 'hidden';
  let nearest = Infinity;
  for (const o of own) {
    const dx = (participant.position_x ?? 50) - (o.position_x ?? 50);
    const dy = (participant.position_y ?? 50) - (o.position_y ?? 50);
    nearest = Math.min(nearest, Math.sqrt(dx * dx + dy * dy));
  }
  if (nearest > BASE_ARMY_VISION_RADIUS_PCT * 2) return 'hidden';
  if (nearest > BASE_ARMY_VISION_RADIUS_PCT) return 'silhouette';
  return 'visible';
};

// Morale. Keep MORALE_BREAK_POINT in sync with BREAK_POINT in backend utils/morale.js.
export const MORALE_BREAK_POINT = 35;
export type MoraleLevel = 'steady' | 'shaken' | 'wavering' | 'breaking';

export const getMoraleLevel = (p: Pick<BattleParticipant, 'current_morale' | 'is_summoned'>): MoraleLevel | null => {
  if (p.current_morale === null || p.current_morale === undefined || p.is_summoned) return null;
  if (p.current_morale < MORALE_BREAK_POINT) return 'breaking';
  if (p.current_morale < MORALE_BREAK_POINT + 10) return 'wavering';
  if (p.current_morale < MORALE_BREAK_POINT + 25) return 'shaken';
  return 'steady';
};

export const MORALE_LABEL: Record<MoraleLevel, string> = {
  steady: 'Steady',
  shaken: 'Shaken',
  wavering: 'Wavering',
  breaking: 'About to break',
};

export const MORALE_TONE: Record<MoraleLevel, 'good' | 'warn' | 'bad'> = {
  steady: 'good',
  shaken: 'warn',
  wavering: 'warn',
  breaking: 'bad',
};

// An army with no troops left is gone from the map: either it fled on a failed morale save or it was destroyed
export const isGone = (p: Pick<BattleParticipant, 'current_troops'>): boolean => (p.current_troops || 0) <= 0;
export const goneKind = (p: Pick<BattleParticipant, 'has_fled'>): 'fled' | 'fallen' => (p.has_fled ? 'fled' : 'fallen');

export const formatFeet = (feet: number): string => `${Math.round(feet).toLocaleString()} ft`;
export const formatCount = (n: number | undefined | null): string => (n ?? 0).toLocaleString();
