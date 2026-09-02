#!/usr/bin/env bash
# Runs schema.sql top to bottom on a fresh local Postgres, then the RLS
# smoke test. Needs a reachable Postgres and PGHOST/PGPORT/PGUSER set.
# supabase-stub.sql stands in for what a real Supabase project already
# has (auth schema, auth.uid(), the anon/authenticated/service_role roles).
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=${DB:-docket_check}
dropdb --if-exists "$DB"
createdb "$DB"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/local-check/supabase-stub.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f schema.sql
echo "schema.sql: OK"
psql -q -d "$DB" -f supabase/local-check/rls-smoke.sql 2>&1 | grep -v '^$'
