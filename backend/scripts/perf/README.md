# Kingdom performance harness

Measures the two things that get slow when kingdoms grow: the long-rest simulation
(`Campaign.advanceDays`) and the kingdom read endpoints the client refetches after every event.
The dev DB is tiny, so this builds **scratch** databases seeded at production scale
(4 kingdoms, ~1000 queued buildings each, ~1500 troop-training rows, 1500 animals, full maturation
schedules). The dev DB is only read (`pg_dump`); the benchmarks refuse to run unless
`DB_NAME` starts with `dnd_scratch`.

```bash
bash scripts/perf/setup.sh                       # once: clone dev DB -> dnd_scratch_perf_seed, seed it
# If the dev DB has not run a recent migration yet, apply it to the seed, e.g.:
#   DB_NAME=dnd_scratch_perf_seed node migrations/add_kingdom_custom_units.js

bash scripts/perf/reset.sh && DB_NAME=dnd_scratch_perf node scripts/perf/bench_tick.js 1    # 1-day long rest
bash scripts/perf/reset.sh && DB_NAME=dnd_scratch_perf node scripts/perf/bench_tick.js 30   # 30-day skip
bash scripts/perf/reset.sh && DB_NAME=dnd_scratch_perf node scripts/perf/bench_read.js      # read endpoints
```

`bench_tick.js` seeds `Math.random`, so its `stateHash` is deterministic: **the same hash before and
after a change means the simulation output is unchanged.** To compare against the previous version of
the model:

```bash
git show HEAD:backend/models/Campaign.js > models/Campaign.__baseline.js
bash scripts/perf/reset.sh && DB_NAME=dnd_scratch_perf CAMPAIGN_FILE=Campaign.__baseline.js node scripts/perf/bench_tick.js 7
bash scripts/perf/reset.sh && DB_NAME=dnd_scratch_perf node scripts/perf/bench_tick.js 7
rm models/Campaign.__baseline.js
```

Drop the scratch databases when finished:
`DROP DATABASE dnd_scratch_perf; DROP DATABASE dnd_scratch_perf_seed;`

## Reference numbers (local Postgres, sub-millisecond latency)

| | before | after |
|---|---|---|
| 1-day long rest | 745 ms, 4,059 queries | 195 ms, 46 queries |
| 7-day skip | 1.0 s, 4,155 queries | 234 ms, 46 queries |
| 30-day skip | 2.3 s, 4,531 queries, 218 KB summary | 372 ms, 54 queries, 4 KB summary |
| `GET /fiefs/:id`, biggest fief | 1.21 MB on the wire, 16 queries | 38 KB on the wire, 11 queries |
| `GET /kingdoms/campaign/:id` | 76 KB (up to ~440 KB with full schedules) | 1.3 KB on the wire |
| Kingdom tab requests per long rest | 7 (about 3.4 MB) | 2 (about 40 KB) |

The tick is dominated by round trips, so against a remote database the gap is much larger.
