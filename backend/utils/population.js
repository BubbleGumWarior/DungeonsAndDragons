/**
 * Parse and sanitize maturation schedule JSON.
 * Shape: { [campaignDayMatures]: count }
 */
function normalizeMaturationSchedule(raw) {
  const source = (raw && typeof raw === 'object') ? raw : {};
  const out = {};
  for (const [key, value] of Object.entries(source)) {
    const day = Math.floor(Number(key));
    const count = Math.floor(Number(value) || 0);
    if (Number.isFinite(day) && day > 0 && count > 0) {
      out[String(day)] = count;
    }
  }
  return out;
}

function getUnderagePopulation(schedule) {
  if (!schedule || typeof schedule !== 'object') return 0;
  // Hot path: the schedule can hold thousands of day keys and this runs per fief per simulated day,
  // so sum in place instead of building a normalised copy. Only canonical integer-day keys are
  // handled here (distinct keys can then never collide once normalised); anything else falls
  // through to the full normalise-then-sum below so odd legacy data behaves exactly as before.
  let sum = 0;
  for (const key of Object.keys(schedule)) {
    const day = Math.floor(Number(key));
    if (String(day) !== key) {
      const normalized = normalizeMaturationSchedule(schedule);
      return Object.values(normalized).reduce((total, count) => total + Math.max(0, Number(count) || 0), 0);
    }
    const count = Math.floor(Number(schedule[key]) || 0);
    if (Number.isFinite(day) && day > 0 && count > 0) sum += count;
  }
  return sum;
}

function getAssignablePopulation(totalPopulation, schedule, sickInjuredPopulation = 0) {
  const total = Math.max(0, Math.floor(Number(totalPopulation) || 0));
  const underage = getUnderagePopulation(schedule);
  const sickInjured = Math.max(0, Math.floor(Number(sickInjuredPopulation) || 0));
  return Math.max(0, total - underage - sickInjured);
}

module.exports = {
  normalizeMaturationSchedule,
  getUnderagePopulation,
  getAssignablePopulation,
};
