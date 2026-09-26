#!/bin/bash
# Recreates the throwaway working DB from the seeded template. Run before every benchmark run.
set -euo pipefail
BACKEND="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$BACKEND"
envval() { grep -E "^$1=" .env | head -1 | cut -d= -f2-; }
export PGPASSWORD="$(envval DB_PASSWORD)"
PGBIN="${PGBIN:-/c/Program Files/PostgreSQL/17/bin}"
command -v psql >/dev/null 2>&1 && PGBIN="$(dirname "$(command -v psql)")"
"$PGBIN/psql" -h "$(envval DB_HOST)" -U "$(envval DB_USER)" -d postgres -qAt \
  -c "DROP DATABASE IF EXISTS dnd_scratch_perf;" -c "CREATE DATABASE dnd_scratch_perf TEMPLATE dnd_scratch_perf_seed;"
