// Measures the kingdom READ endpoints on the SCRATCH DB: payload size (raw and gzipped, as the real
// server sends it with the compression middleware), latency and DB query count.
//
//   bash scripts/perf/reset.sh && DB_NAME=dnd_scratch_perf node scripts/perf/bench_read.js
const path = require('path');
const http = require('http');
const zlib = require('zlib');

if (!/^dnd_scratch/.test(process.env.DB_NAME || '')) {
  console.error('Refusing to run: DB_NAME must be a dnd_scratch* database (see scripts/perf/README.md).');
  process.exit(2);
}
const BACKEND = path.resolve(__dirname, '..', '..');
process.chdir(BACKEND);

const pg = require(path.join(BACKEND, 'node_modules', 'pg'));
let queries = 0;
const originalQuery = pg.Client.prototype.query;
pg.Client.prototype.query = function (...args) { queries += 1; return originalQuery.apply(this, args); };

const express = require(path.join(BACKEND, 'node_modules', 'express'));
const compression = require(path.join(BACKEND, 'node_modules', 'compression'));
const jwt = require(path.join(BACKEND, 'node_modules', 'jsonwebtoken'));
const { pool } = require(path.join(BACKEND, 'models', 'database.js'));

const app = express();
app.use(compression({ threshold: 1024 })); // same setting as server.js
app.use(express.json());
app.use('/api/kingdoms', require(path.join(BACKEND, 'routes', 'kingdoms.js')));

const server = app.listen(0, async () => {
  const port = server.address().port;
  const q = async (sql) => (await pool.query(sql)).rows;
  const [{ id: campaignId, dungeon_master_id: dmId }] = await q('SELECT id, dungeon_master_id FROM campaigns ORDER BY id LIMIT 1');
  const bySize = await q(`SELECT f.id, f.kingdom_id FROM fiefs f ORDER BY (SELECT count(*) FROM fief_buildings b WHERE b.fief_id = f.id) DESC`);
  const big = bySize[0]; const small = bySize[bySize.length - 1];
  const token = jwt.sign({ userId: dmId }, process.env.JWT_SECRET);

  const get = (label, url) => new Promise((resolve) => {
    const before = queries; const started = Date.now();
    http.get({ port, path: url, headers: { Authorization: `Bearer ${token}`, 'Accept-Encoding': 'gzip' } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const wire = Buffer.concat(chunks);
        const raw = res.headers['content-encoding'] === 'gzip' ? zlib.gunzipSync(wire) : wire;
        console.log(`${label.padEnd(28)} status=${res.statusCode} raw=${(raw.length / 1024).toFixed(1)}KB wire=${(wire.length / 1024).toFixed(1)}KB ${Date.now() - started}ms queries=${queries - before}`);
        resolve();
      });
    });
  });

  await get('kingdoms list', `/api/kingdoms/campaign/${campaignId}`);
  await get('fief (biggest, cold)', `/api/kingdoms/fiefs/${big.id}`);
  await get('fief (biggest, warm)', `/api/kingdoms/fiefs/${big.id}`);
  await get('fief (smallest)', `/api/kingdoms/fiefs/${small.id}`);
  await get('animals (kingdom)', `/api/kingdoms/${big.kingdom_id}/animals`);
  await get('training queue', `/api/kingdoms/fiefs/${big.id}/military/training`);
  server.close();
  await pool.end();
});
