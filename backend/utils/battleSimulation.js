/**
 * Mass-combat simulation.
 *
 * One attack goal is resolved as a short engagement of several exchanges instead of a single roll:
 *
 *  - Geometry decides who can hurt whom. A unit only deals damage while the enemy is inside its reach,
 *    so archers firing at melee troops that cannot close the distance take no losses at all.
 *  - Defenders that are not holding ground (no defend goal) advance by their movement each exchange,
 *    so fast cavalry can run archers down while slow infantry never reaches them.
 *  - Damage follows a Lanchester-style attrition model: fighting strength is troops x per-troop weight x
 *    quality, so a shrinking army hits weaker each exchange and a dragon is worth many soldiers.
 *  - Quality comes from the army's stats (equipment, discipline, morale, command, logistics), unit-line
 *    matchups (cavalry beats archers, spears blunt cavalry, ...), goal modifiers and the d100 rolls.
 *  - Armies rout once they have lost too much for their morale and stop fighting.
 *
 * Everything here is pure: callers pass the rolls in, so results can be tested.
 */

const { UNIT_TEMPLATES } = require('./unitTemplates');

const TICKS = 4; // exchanges per resolution
const BASE_KILL_RATE = 0.045; // share of fighting strength converted into kills per exchange
const MAX_TICK_FRACTION = 0.3; // no army loses more than this share of its troops in one exchange
const MIN_TICK_LOSS = 2; // ...unless the army is smaller than this, so tiny armies are not untouchable
const MELEE_FEET = 40; // reach at or below this is melee

// Keep reach and movement in sync with UNIT_LINES in frontend battlefieldHelpers.ts
const REACH = { infantry: 40, guard: 40, cavalry: 40, covert: 40, archer: 300, artillery: 600, mage: 200, dragon: 200 };
const MOVE = { infantry: 100, guard: 100, cavalry: 300, covert: 150, archer: 100, artillery: 50, mage: 100, dragon: 500 };

// Fighting strength of one troop relative to a plain infantryman
const WEIGHT = { infantry: 1, guard: 1.25, cavalry: 1.7, archer: 0.9, artillery: 6, covert: 0.8, mage: 3.5, dragon: 80 };
// How much punishment one troop absorbs. Siege crews hit like their engines but die like ordinary men.
const DURABILITY = { ...WEIGHT, artillery: 1.1 };

// How effective the attacking line (row) is against the defending line (column)
const MATCHUP = {
  infantry:  { infantry: 1.0, archer: 1.2, cavalry: 0.9, guard: 0.9, artillery: 1.3, covert: 1.1, mage: 1.2, dragon: 0.5 },
  archer:    { infantry: 1.1, archer: 1.0, cavalry: 1.0, guard: 0.8, artillery: 1.2, covert: 1.1, mage: 1.1, dragon: 0.6 },
  cavalry:   { infantry: 1.2, archer: 1.4, cavalry: 1.0, guard: 0.9, artillery: 1.4, covert: 1.2, mage: 1.3, dragon: 0.5 },
  guard:     { infantry: 1.0, archer: 1.1, cavalry: 1.0, guard: 1.0, artillery: 1.1, covert: 1.1, mage: 1.1, dragon: 0.5 },
  artillery: { infantry: 1.3, archer: 1.2, cavalry: 1.0, guard: 1.2, artillery: 1.1, covert: 1.0, mage: 1.0, dragon: 0.8 },
  covert:    { infantry: 0.9, archer: 1.2, cavalry: 0.8, guard: 0.7, artillery: 1.3, covert: 1.0, mage: 1.2, dragon: 0.4 },
  mage:      { infantry: 1.3, archer: 1.2, cavalry: 1.2, guard: 1.1, artillery: 1.2, covert: 1.2, mage: 1.0, dragon: 0.8 },
  dragon:    { infantry: 1.5, archer: 1.5, cavalry: 1.4, guard: 1.3, artillery: 1.4, covert: 1.5, mage: 1.2, dragon: 1.0 },
};

// Ranged lines are clumsy once the enemy is on top of them
const CLOSE_RANGE_PENALTY = { archer: 0.6, artillery: 0.35, mage: 0.75 };

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const baseTypeOf = (category) => {
  const template = UNIT_TEMPLATES[category];
  if (template) return template.baseType;
  // Categories that predate the unit templates
  if (/catapult|trebuchet|ballist|siege tower|bombard/i.test(category || '')) return 'artillery';
  if (/archer|bow|skirmisher|ranger/i.test(category || '')) return 'archer';
  return 'infantry';
};

const getReachFeet = (category) => REACH[baseTypeOf(category)] || MELEE_FEET;
const getMovementFeet = (category) => MOVE[baseTypeOf(category)] || 100;

const stat = (army, key) => clamp(Number(army.stats && army.stats[key]) || 5, 1, 10);

// Physical quality: weapons and armour decide how hard an army hits and how much it can take
const offense = (army) => 0.7 + 0.07 * stat(army, 'equipment');
const damageTaken = (army) => 1 / (0.7 + 0.09 * stat(army, 'equipment'));

/**
 * Readiness, 0 to 1: how well drilled, equipped, motivated, led, supplied and numerous an army is.
 * Morale fades as the army is whittled down. Every stat counts, so a well trained army rolls better.
 */
const readiness = (army) => {
  const fraction = clamp((army.troops || 0) / Math.max(1, army.totalTroops || army.troops || 1), 0, 1);
  const morale = stat(army, 'morale') * (0.5 + 0.5 * fraction);
  const rating = 0.22 * stat(army, 'equipment') + 0.24 * stat(army, 'discipline') + 0.18 * morale
    + 0.12 * stat(army, 'command') + 0.08 * stat(army, 'logistics') + 0.16 * stat(army, 'numbers');
  return clamp((rating - 1) / 9, 0, 1);
};

// Typical d100 result for an army: raw recruits sit around 35, the average army in the 60s, elite guards in the 90s
const expectedRoll = (army) => clamp(Math.round(13 + 118 * readiness(army)), 8, 99);

// Disciplined, well led armies are consistent; green ones swing wildly
const consistency = (army) => clamp((0.6 * stat(army, 'discipline') + 0.4 * stat(army, 'command') - 1) / 9, 0, 1);

const gaussian = (rng) => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());

/** Roll a d100 for an army: centred on its readiness, tight when it is disciplined, with the odd disaster. */
const rollArmy = (army, rng = Math.random) => {
  const loose = 1 - consistency(army);
  const spread = 2 + 20 * loose * loose;
  let roll = expectedRoll(army) + gaussian(rng) * spread;
  if (rng() < 0.015 + 0.05 * loose * loose) roll -= 20 + rng() * 25; // a bad day
  return clamp(Math.round(roll), 1, 100);
};

// The d100 becomes a luck multiplier around 1.0 for the engagement
const luckFromRoll = (roll) => 0.5 + clamp(roll, 1, 100) / 100;
// Undead are mindless and fight to the last bone
const routThreshold = (army) => (army.undead ? 0 : clamp(0.3 - 0.02 * stat(army, 'morale'), 0.08, 0.3));

const roundKills = (raw, available) => {
  if (raw <= 0 || available <= 0) return 0;
  const rounded = Math.round(raw);
  return Math.min(available, rounded === 0 && raw >= 0.25 ? 1 : rounded);
};

const feet = (n) => `${Math.round(n)} ft`;

// Covert ranks: how much of the target a hidden strike can cut down (share of the target's troops) and how many
// victims each operative can account for. Shadow Assassins are the deadliest thing on the battlefield.
const STEALTH_STRIKE = {
  'Street Informant': { share: 0.03, perHead: 3 },
  'Infiltrator': { share: 0.06, perHead: 5 },
  'Scout': { share: 0.06, perHead: 5 },
  'Master Scout': { share: 0.09, perHead: 8 },
  'Spy': { share: 0.08, perHead: 6 },
  'Master Spy': { share: 0.13, perHead: 12 },
  'Assassin': { share: 0.22, perHead: 22 },
  'Shadow Assassin': { share: 0.34, perHead: 36 },
};

// Bonus to the stealth check by covert rank
const STEALTH_SKILL = { 'Street Informant': 0, 'Infiltrator': 3, 'Scout': 4, 'Master Scout': 7, 'Spy': 5, 'Master Spy': 8, 'Assassin': 8, 'Shadow Assassin': 12 };

/** Hidden strike: no defence, no return fire, and a share of the target's troops falls whatever their numbers. */
function simulateStealthStrike({ attacker, defender, attackGoal, attackerRoll, defenderRoll }) {
  const tier = STEALTH_STRIKE[attacker.category] || { share: 0.05, perHead: 4 };
  const luck = luckFromRoll(attackerRoll);
  const resilience = damageTaken(defender) / damageTaken({ stats: { equipment: 5 } }); // well-armoured targets shrug a little off
  const byShare = defender.troops * tier.share * luck * resilience;
  const byCapacity = attacker.troops * tier.perHead * luck;
  const kills = Math.min(Math.round(Math.min(byShare, byCapacity)), Math.floor(defender.troops * 0.5), defender.troops);
  const selfLoss = Math.min(attacker.troops, Math.round(attacker.troops * 0.02 * luckFromRoll(defenderRoll)));

  const lossFracD = kills / Math.max(1, defender.troops);
  const defenderScore = Math.max(0, defender.score || 0);
  const scoreMult = (attackGoal && attackGoal.score_multiplier) || 1;
  const log = [
    `${attacker.name} strikes from hiding: no warning, no defence, no return fire.`,
    kills > 0 ? `${kills} of ${defender.name} fall before the alarm is raised.` : 'The blow finds nothing.',
  ];
  return {
    casualties_target: kills,
    casualties_self: selfLoss,
    score_change_target: -Math.round(defenderScore * (0.6 * lossFracD + 0.1) * scoreMult * 0.5),
    score_change_self: 0,
    routed: { attacker: false, defender: false },
    firstContact: null,
    log,
    summary: kills > 0 ? `${attacker.name} struck from the shadows and cut down ${kills}.` : `${attacker.name} struck at nothing.`,
  };
}

/** Stealth check: stats-driven roll plus covert rank against the watchfulness of the enemy's best-drilled army. */
function simulateVanish({ executor, enemies, roll, rng = Math.random }) {
  const watch = enemies.reduce((best, army) => Math.max(best, stat(army, 'discipline')), 3);
  const dc = clamp(50 + 2 * watch, 55, 75);
  const total = clamp(roll + (STEALTH_SKILL[executor.category] || 0), 1, 100);
  // Even the best slip up now and then: a wandering patrol spoils about one attempt in twenty
  return { success: total >= dc && rng() > 0.05, dc, total };
}

/**
 * Simulate one attack goal.
 * attacker / defender: { name, category, troops, totalTroops, score, stats }
 * attackGoal / defendGoal: goal templates (defendGoal may be null)
 */
function simulateEngagement({ attacker, defender, attackGoal, defendGoal, distanceFeet, attackerRoll, defenderRoll, rng = Math.random }) {
  if (attackGoal && attackGoal.stealth) return simulateStealthStrike({ attacker, defender, attackGoal, attackerRoll, defenderRoll });
  const aType = baseTypeOf(attacker.category);
  const dType = baseTypeOf(defender.category);
  const reachA = REACH[aType];
  const reachD = REACH[dType];
  const speedA = MOVE[aType];
  const speedD = MOVE[dType];

  const luckA = luckFromRoll(attackerRoll);
  const luckD = luckFromRoll(defenderRoll);
  const goalPower = (attackGoal && attackGoal.casualty_multiplier) || 1;
  const bracing = (defendGoal && defendGoal.casualty_multiplier) || 1; // defend goals soften incoming damage
  const holds = !!defendGoal;
  const defenderMelee = reachD <= MELEE_FEET;
  const attackerMelee = reachA <= MELEE_FEET;

  let troopsA = attacker.troops;
  let troopsD = defender.troops;
  let dist = distanceFeet;
  let killedD = 0;
  let killedA = 0;
  let routedA = false;
  let routedD = false;
  let firstContact = null;
  const log = [];

  const strike = (from, to, fromType, toType, troopsFrom, troopsTo, luck, mult, inMelee) => {
    const power = troopsFrom * WEIGHT[fromType] * offense(from)
      * luck * mult * MATCHUP[fromType][toType] * (inMelee ? (CLOSE_RANGE_PENALTY[fromType] || 1) : 1)
      * (0.9 + rng() * 0.2);
    return BASE_KILL_RATE * power / DURABILITY[toType] * damageTaken(to);
  };

  for (let tick = 1; tick <= TICKS && troopsA > 0 && troopsD > 0; tick += 1) {
    // Melee attackers close on a distant target; defenders that are not holding the line advance too
    if (!routedA && attackerMelee && dist > reachA) dist = Math.max(reachA, dist - speedA / TICKS);
    let advanced = 0;
    if (!routedD && !holds && defenderMelee && dist > reachD) {
      advanced = Math.min(dist - reachD, speedD / TICKS);
      dist = Math.max(0, dist - advanced);
    }
    const inMelee = dist <= MELEE_FEET;
    const aFires = !routedA && dist <= reachA;
    const dFires = !routedD && dist <= reachD;
    if (firstContact === null && dFires) firstContact = tick;

    const rawToD = aFires ? strike(attacker, defender, aType, dType, troopsA, troopsD, luckA, goalPower, inMelee) * bracing : 0;
    const rawToA = dFires ? strike(defender, attacker, dType, aType, troopsD, troopsA, luckD, 1, inMelee) : 0;

    // Small armies can still be overrun: the cap never drops below a couple of troops per exchange
    const lossD = Math.min(rawToD, Math.max(troopsD * MAX_TICK_FRACTION, Math.min(troopsD, MIN_TICK_LOSS)));
    const lossA = Math.min(rawToA, Math.max(troopsA * MAX_TICK_FRACTION, Math.min(troopsA, MIN_TICK_LOSS)));
    killedD += lossD;
    killedA += lossA;
    troopsD = Math.max(0, troopsD - lossD);
    troopsA = Math.max(0, troopsA - lossA);

    log.push(
      `Exchange ${tick} at ${feet(dist)}: ${attacker.name} ${aFires ? `kills ${lossD.toFixed(lossD < 10 ? 1 : 0)}` : 'out of reach'}`
      + `, ${defender.name} ${dFires ? `kills ${lossA.toFixed(lossA < 10 ? 1 : 0)}` : (advanced > 0 ? `closes ${feet(advanced)}` : 'cannot reach back')}.`
    );

    if (!routedD && troopsD / Math.max(1, defender.totalTroops || defender.troops) < routThreshold(defender)) {
      routedD = true;
      log.push(`${defender.name} breaks and flees.`);
    }
    if (!routedA && troopsA / Math.max(1, attacker.totalTroops || attacker.troops) < routThreshold(attacker)) {
      routedA = true;
      log.push(`${attacker.name} breaks and retreats.`);
    }
    if (routedA || routedD) break;
  }

  const assassination = attackGoal && attackGoal.key === 'assassinate_commander';
  let casualtiesTarget = roundKills(killedD, defender.troops);
  let casualtiesSelf = roundKills(killedA, attacker.troops);

  // Backlash from volatile spells and similar goals applies whatever the enemy does
  if (attackGoal && attackGoal.guaranteed_casualty && !assassination) {
    const backlash = Math.min(attackGoal.guaranteed_casualty, Math.max(1, Math.ceil(attacker.troops * 0.2)));
    casualtiesSelf = Math.min(attacker.troops, casualtiesSelf + backlash);
    log.push(`${attacker.name} suffers ${backlash} from the backlash.`);
  }

  const edgeRolls = attackerRoll >= defenderRoll;
  if (assassination) {
    // A hit-and-run strike: one guaranteed kill on success, heavy exposure on failure
    casualtiesTarget = edgeRolls ? 1 : 0;
    const exposure = edgeRolls ? 0.03 : 0.12;
    casualtiesSelf = Math.min(attacker.troops, Math.max(edgeRolls ? 0 : 1, Math.round(attacker.troops * exposure * luckD)));
    log.push(edgeRolls ? 'The assassins slip away after the kill.' : 'The assassins are discovered.');
  }

  // Score follows the damage taken, with morale swinging towards whoever is winning
  const lossFracD = casualtiesTarget / Math.max(1, defender.troops);
  const lossFracA = casualtiesSelf / Math.max(1, attacker.troops);
  const edge = clamp(lossFracD - lossFracA, -0.5, 0.5);
  const scoreMult = (attackGoal && attackGoal.score_multiplier) || 1;
  const attackerScore = Math.max(0, attacker.score || 0);
  const defenderScore = Math.max(0, defender.score || 0);

  let scoreChangeTarget = -Math.round(defenderScore * (0.6 * lossFracD + 0.15 * Math.max(0, edge) + (routedD ? 0.1 : 0)) * scoreMult);
  let scoreChangeSelf = -Math.round(attackerScore * (0.6 * lossFracA + (routedA ? 0.1 : 0)))
    + Math.round(attackerScore * 0.08 * Math.max(0, edge) * scoreMult);
  if (assassination && edgeRolls) scoreChangeTarget = -Math.floor(defenderScore / 2);

  const summary = (() => {
    if (assassination) return edgeRolls ? 'The assassins struck the commander and slipped away.' : 'The assassins were discovered.';
    if (casualtiesSelf === 0 && casualtiesTarget > 0) {
      return firstContact !== null
        ? `${attacker.name} struck without taking losses.`
        : `${defender.name} could not reach ${attacker.name}, so there were no return losses.`;
    }
    if (casualtiesTarget === 0 && casualtiesSelf === 0) return 'Neither side could do real harm.';
    if (casualtiesSelf > casualtiesTarget) return `${defender.name} won the exchange.`;
    if (casualtiesTarget > casualtiesSelf) return `${attacker.name} won the exchange.`;
    return 'A bloody stalemate.';
  })();

  return {
    casualties_target: casualtiesTarget,
    casualties_self: casualtiesSelf,
    score_change_target: scoreChangeTarget,
    score_change_self: scoreChangeSelf,
    routed: { attacker: routedA, defender: routedD },
    firstContact,
    log,
    summary,
  };
}

/** Logistics goals: supply gains, disrupting the enemy's supply, or restoring an army's nerve. */
function simulateLogistics({ executor, target, goal, roll }) {
  const luck = 0.5 + clamp(roll, 1, 100) / 100;
  const scoreMult = (goal && goal.score_multiplier) || 1;
  const strain = clamp(1.15 - (executor.troops || 0) / 20000, 0.7, 1.15); // bigger armies are harder to feed

  // Morale: Steady the Ranks is a full recovery goal, Rally Our Troops gives a smaller lift alongside its score gain
  let moraleChange = 0;
  if (goal && goal.effect === 'restore_morale') moraleChange = Math.round(14 + 2 * stat(executor, 'command') + roll / 10);
  else if (goal && goal.key === 'rally_troops') moraleChange = Math.round(6 + stat(executor, 'command') / 2 + roll / 20);

  if (goal && goal.effect === 'restore_morale') {
    return { score_change_target: 0, score_change_self: 0, moraleChange, notes: `The army's nerve returns (morale +${moraleChange}).`, log: [] };
  }

  if (goal && goal.effect === 'decrease_target' && target) {
    const resilience = 1 / (0.8 + 0.05 * stat(target, 'logistics'));
    const percent = (0.02 + 0.04 * (stat(executor, 'logistics') / 10)) * luck * resilience * scoreMult;
    const delta = Math.max(1, Math.round(Math.max(0, target.score || 0) * percent));
    return { score_change_target: -delta, score_change_self: 0, moraleChange, notes: `Enemy supply lines disrupted (${(percent * 100).toFixed(1)}% of their score).`, log: [] };
  }
  const percent = (0.02 + 0.05 * (stat(executor, 'logistics') / 10)) * luck * strain * scoreMult;
  const delta = Math.max(1, Math.round(Math.max(0, executor.score || 0) * percent));
  const moraleNote = moraleChange ? ` Morale +${moraleChange}.` : '';
  return { score_change_target: 0, score_change_self: delta, moraleChange, notes: `Supplies secured (${(percent * 100).toFixed(1)}% of score).${moraleNote}`, log: [] };
}

module.exports = {
  TICKS,
  MELEE_FEET,
  getReachFeet,
  getMovementFeet,
  baseTypeOf,
  simulateEngagement,
  simulateLogistics,
  simulateVanish,
  rollArmy,
  expectedRoll,
  readiness,
};
