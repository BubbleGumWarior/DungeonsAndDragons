/**
 * Returns how many of a fief's population are available as workers.
 * Below 10 pop: everyone works.
 * Above 10: diminishing returns — at 100,000 pop roughly 50,000 are workable.
 *
 * Formula: workable = pop / (1 + 0.25 * log10(pop / 10))
 *
 * Examples:
 *   10      → 10   (100%)
 *   11      → ~10  (91%)
 *   1 000   → ~667 (67%)
 *   10 000  → ~5714 (57%)
 *   100 000 → ~50000 (50%)
 */
function getWorkablePopulation(pop) {
  if (!pop || pop <= 10) return pop || 0;
  return Math.floor(pop / (1 + 0.25 * Math.log10(pop / 10)));
}

module.exports = { getWorkablePopulation };
