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
  const normalized = normalizeMaturationSchedule(schedule);
  return Object.values(normalized).reduce((sum, count) => sum + Math.max(0, Number(count) || 0), 0);
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
