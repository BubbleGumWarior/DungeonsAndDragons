#!/bin/bash
# Builds the scratch benchmark databases from the dev DB. Read-only against the dev DB.
#   dnd_scratch_perf_seed : dev schema + data, pending migrations applied, seeded with a production-like load
#   dnd_scratch_perf      : throwaway working copy (recreated from the seed by reset.sh before each run)
# Usage: bash scripts/perf/setup.sh          (run from anywhere; paths are resolved from this file)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$(cd "$HERE/../.." && pwd)"
cd "$BACKEND"

envval() { grep -E "^$1=" .env | head -1 | cut -d= -f2-; }
export PGPASSWORD="$(envval DB_PASSWORD)"
DEV_DB="$(envval DB_NAME)"; PGHOST="$(envval DB_HOST)"; PGUSER="$(envval DB_USER)"
PGBIN="${PGBIN:-/c/Program Files/PostgreSQL/17/bin}"
command -v psql >/dev/null 2>&1 && PGBIN="$(dirname "$(command -v psql)")"
psqlx() { "$PGBIN/psql" -h "$PGHOST" -U "$PGUSER" -v ON_ERROR_STOP=1 -q "$@"; }

psqlx -d postgres -Atc "DROP DATABASE IF EXISTS dnd_scratch_perf;"
psqlx -d postgres -Atc "DROP DATABASE IF EXISTS dnd_scratch_perf_seed;"
psqlx -d postgres -Atc "CREATE DATABASE dnd_scratch_perf_seed;"
echo "cloning $DEV_DB -> dnd_scratch_perf_seed ..."
"$PGBIN/pg_dump" -h "$PGHOST" -U "$PGUSER" "$DEV_DB" | psqlx -d dnd_scratch_perf_seed -o /dev/null
echo "seeding ..."
psqlx -d dnd_scratch_perf_seed -f "$HERE/seed.sql"
psqlx -d dnd_scratch_perf_seed -Atc "SELECT 'fiefs=' || count(*) FROM fiefs; SELECT 'buildings=' || count(*) FROM fief_buildings; SELECT 'training_rows=' || count(*) FROM fief_training; SELECT 'animals=' || count(*) FROM fief_animals;"
echo "done. If the dev DB has not run a recent migration yet, apply it to the seed first, e.g."
echo "  DB_NAME=dnd_scratch_perf_seed node migrations/<file>.js   (then re-run reset.sh)"
