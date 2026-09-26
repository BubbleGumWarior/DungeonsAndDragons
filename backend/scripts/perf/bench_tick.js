// Benchmarks Campaign.advanceDays (the long-rest kingdom tick) on the SCRATCH DB.
//
//   bash scripts/perf/reset.sh && DB_NAME=dnd_scratch_perf node scripts/perf/bench_tick.js <days>
//
// Prints wall time, DB round trips, DB-wait vs JS time, the per-query-kind breakdown and a
// `stateHash` of the resulting kingdom state. Math.random is replaced by a seeded PRNG, so the
// hash is deterministic: the same hash before and after a change means the simulation is unchanged.
// To compare against another version of the model, save it as models/Campaign.__baseline.js
// (e.g. `git show HEAD:backend/models/Campaign.js > models/Campaign.__baseline.js`) and run with
// CAMPAIGN_FILE=Campaign.__baseline.js. Delete that temp file afterwards.
const path = require('path');
const crypto = require('crypto');

if (!/^dnd_scratch/.test(process.env.DB_NAME || '')) {
  console.error('Refusing to run: DB_NAME must be a dnd_scratch* database (see scripts/perf/README.md).');
  process.exit(2);
}
const BACKEND = path.resolve(__dirname, '..', '..');
process.chdir(BACKEND); // dotenv reads .env from the cwd; DB_NAME above still wins
const days = Number(process.argv[2] || 1);

let seed = 123456789;
Math.random = () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const pg = require(path.join(BACKEND, 'node_modules', 'pg'));
const stats = { queries: 0, dbMs: 0, byKind: {}, msByKind: {} };
const originalQuery = pg.Client.prototype.query;
pg.Client.prototype.query = function (...args) {
  const text = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].text) || '';
  const kind = `${(text.trim().split(/\s+/)[0] || '?').toUpperCase()} ${(text.match(/(?:FROM|UPDATE|INTO)\s+([a-z_.]+)/i) || [])[1]}`;
  stats.queries += 1;
  stats.byKind[kind] = (stats.byKind[kind] || 0) + 1;
  const started = process.hrtime.bigint();
  const result = originalQuery.apply(this, args);
  if (result && result.then) {
    return result.then((value) => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      stats.dbMs += ms;
      stats.msByKind[kind] = (stats.msByKind[kind] || 0) + ms;
      return value;
    });
  }
  return result;
};

const { pool } = require(path.join(BACKEND, 'models', 'database.js'));
const Campaign = require(path.join(BACKEND, 'models', process.env.CAMPAIGN_FILE || 'Campaign.js'));

(async () => {
  const campaignId = (await pool.query('SELECT id FROM campaigns ORDER BY id LIMIT 1')).rows[0].id;
  const started = Date.now();
  const summary = await Campaign.advanceDays(campaignId, days);
  const ms = Date.now() - started;
  const json = JSON.stringify(summary);

  // Fingerprint of everything the tick writes. Stored days_remaining of still-training troop rows is
  // excluded on purpose: it is derived from complete_day at read time and no longer rewritten daily.
  const q = async (sql) => (await pool.query(sql)).rows;
  const fingerprint = {
    fiefs: await q(`SELECT id, population, tier, round(unrest::numeric, 3) AS unrest, stored_resources, unit_reserves, prisoners, consecutive_starvation_days, consecutive_gold_shortage_days, completed_research FROM fiefs ORDER BY id`),
    buildings: await q(`SELECT fief_id, count(*) n, count(*) FILTER (WHERE is_complete) done, coalesce(sum(days_remaining),0) days, coalesce(sum(queue_position),0) qsum, coalesce(max(queue_position),0) qmax FROM fief_buildings GROUP BY fief_id ORDER BY fief_id`),
    training: await q(`SELECT fief_id, status, count(*) n, coalesce(sum(CASE WHEN status = 'training' THEN 0 ELSE days_remaining END),0) d FROM fief_training GROUP BY fief_id, status ORDER BY fief_id, status`),
    animals: await q(`SELECT fief_id, count(*) n, count(*) FILTER (WHERE pregnant_due_day IS NOT NULL) preg FROM fief_animals GROUP BY fief_id ORDER BY fief_id`),
    research: await q(`SELECT fief_id, research_id, status, points_accumulated FROM fief_research_queue ORDER BY id`),
    day: await q(`SELECT current_day FROM campaigns ORDER BY id LIMIT 1`),
  };
  const stateHash = crypto.createHash('sha1').update(JSON.stringify(fingerprint)).digest('hex').slice(0, 12);

  const slowest = Object.entries(stats.msByKind).sort((a, b) => b[1] - a[1]).slice(0, 7)
    .map(([kind, total]) => `${kind} ${Math.round(total)}ms x${stats.byKind[kind]}`);
  console.log(JSON.stringify({
    days, ms, queries: stats.queries, dbWaitMs: Math.round(stats.dbMs), jsMs: Math.round(ms - stats.dbMs),
    summaryKB: +(json.length / 1024).toFixed(1),
    completedBuildings: summary.completedBuildings.reduce((n, b) => n + (b.count || 1), 0),
    slowestQueries: slowest, stateHash,
  }, null, 2));
  await pool.end();
})().catch((error) => { console.error(error); process.exit(1); });
