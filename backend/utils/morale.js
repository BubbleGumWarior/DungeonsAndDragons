/**
 * Army morale.
 *
 * Every army starts a battle at MORALE_BASE plus MORALE_PER_STAT per point of its morale stat, so a
 * morale 1 army starts at 55 and a morale 10 army at 100. Morale falls as the army bleeds and wins or
 * loses exchanges, and rises through rally goals and quiet rounds.
 *
 * Armies can only desert once morale has fallen below BREAK_POINT. Because even the shakiest army
 * starts above it, nobody can break the moment combat begins. Below it, each round opens with a
 * saving throw on the morale stat; a failure sends the army fleeing and it leaves the battle.
 */

const MORALE_BASE = 50;
const MORALE_PER_STAT = 5;
const BREAK_POINT = 35;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const statOf = (value) => clamp(Number(value) || 5, 1, 10);

const maxMoraleFor = (moraleStat) => clamp(MORALE_BASE + MORALE_PER_STAT * statOf(moraleStat), MORALE_BASE + MORALE_PER_STAT, 100);

// Chance, 0 to 1, of holding the line: better the closer morale is to the break point and the higher the stat
const saveChance = (morale, moraleStat) =>
  clamp((Math.max(0, morale) / BREAK_POINT) * 0.6 + (statOf(moraleStat) / 10) * 0.4, 0.02, 0.98);

// d100 save: roll at or under the needed number to hold
const rollSave = (morale, moraleStat, rng = Math.random) => {
  const needed = Math.round(saveChance(morale, moraleStat) * 100);
  const roll = Math.floor(rng() * 100) + 1;
  return { roll, needed, passed: roll <= needed };
};

// Morale lost for losing a share of the army (0 to 1). A heavy loss shakes the army far more than the raw share.
const moraleLossForCasualties = (lossFraction) => {
  const f = Math.max(0, lossFraction);
  const heavy = f >= 0.35 ? 12 : f >= 0.2 ? 6 : 0;
  return Math.round(f * 100 * 0.9) + heavy;
};

// Morale gained for cutting down a share of the enemy army (0 to 1): inflicting a lot of damage is heartening
const moraleGainForKills = (killFraction) => {
  const f = Math.max(0, killFraction);
  const crushing = f >= 0.2 ? 5 : 0;
  return Math.round(f * 100 * 0.6) + crushing;
};

// Armies that go into battle stronger than the opposition are bolder, and vice versa. The shift is capped,
// and nobody starts below FLOOR_AT_START so desertion is never possible the moment combat begins.
const MORALE_START_SWING = 40;
const FLOOR_AT_START = BREAK_POINT + 5;
const startingMoraleShift = (ownStrength, opposingStrength) => {
  const total = Math.max(1, ownStrength + opposingStrength);
  return Math.round(((ownStrength - opposingStrength) / total) * MORALE_START_SWING);
};

module.exports = {
  MORALE_BASE,
  MORALE_PER_STAT,
  BREAK_POINT,
  maxMoraleFor,
  saveChance,
  rollSave,
  moraleLossForCasualties,
  moraleGainForKills,
  MORALE_START_SWING,
  FLOOR_AT_START,
  startingMoraleShift,
};
