#!/usr/bin/env bash
# Fails if the committed migrations do not produce the schema the current config describes.
#
# In development Payload pushes schema changes on its own, so every test can pass while a migration was never
# written; production runs only committed migrations. This builds a scratch database from the migrations alone,
# asks Payload what it would still have to change, and fails if the answer is anything.
#
#   pnpm verify:migrations        (needs a local Postgres; refuses any other host)
set -euo pipefail

BASE="${VERIFY_DATABASE_URL:-postgresql://wuwf@127.0.0.1:5433}"
case "$BASE" in *127.0.0.1*|*localhost*) ;; *) echo "Refusing: $BASE is not a local database." >&2; exit 2 ;; esac

DB="wuwf_verify_$$"
INDEX="src/migrations/index.ts"
BACKUP="$(mktemp)"
cp "$INDEX" "$BACKUP"

cleanup() {
  cp "$BACKUP" "$INDEX"; rm -f "$BACKUP" src/migrations/*verify_pending*
  psql "$BASE/postgres" -qtAc "drop database if exists $DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

psql "$BASE/postgres" -qtAc "create database $DB" >/dev/null
export DATABASE_URL="$BASE/$DB"
export NODE_OPTIONS=--no-deprecation

pnpm payload migrate >/dev/null
pnpm payload migrate:create verify_pending --force-accept-warning >/dev/null 2>&1 || true

GENERATED="$(ls src/migrations/*verify_pending.ts 2>/dev/null || true)"
if [ -n "$GENERATED" ] && grep -qE '(CREATE|ALTER|DROP) ' "$GENERATED"; then
  echo "✖ The config changes the schema in ways no committed migration covers:" >&2
  grep -E '(CREATE|ALTER|DROP) ' "$GENERATED" | head -20 >&2
  echo "Run: pnpm payload migrate:create <name>   (against a database with the existing migrations applied)" >&2
  exit 1
fi
echo "✓ The committed migrations produce the current schema."
