#!/usr/bin/env bash
# Replays WUWF's migration history, in order, into an EMPTY database that already has Supabase's auth and storage
# schemas (a local Supabase stack with its migrations folder set aside, or local-stubs.sql on plain Postgres).
# This is how schema.sql and product-data.sql are generated and how CI checks them; see README.md.
#
#   PGHOST=... PGPORT=... PGUSER=... PGDATABASE=... [THROUGH=<migration version>] ./replay-history.sh
#
# THROUGH stops after that migration version (default: replay everything). CI uses it so the baseline, which stops at
# BASELINE_THROUGH, is compared with a replay that stops at the same place.
#
# The Supabase CLI cannot do this replay (it stops at 20260914130000), which is why new stations install from
# the baseline instead. Two deliberate differences from a plain "apply each file in a transaction":
#
# 1. 20260914130000 and 20260914140000 are run statement by statement and their failures ignored. They wrap Sourcework
#    research policies in "(select auth.uid())" for tables that, in the files, are only created a month later;
#    WUWF's projects applied them while the older versions of those tables existed. The later files rebuild the tables.
# 2. While replaying, public.rc_articles_before_update() never marks a guide "edited since release". Early migrations
#    updated guides in a way that trips the flag, although nobody edited anything, and every later release migration
#    then skipped those guides. The original function is put back at the end, so the schema is unchanged.
set -euo pipefail
cd "$(dirname "$0")/../migrations"
Q() { psql -X -At -v ON_ERROR_STOP=1 -c "$1"; }
export PGOPTIONS='-c client_min_messages=error'

original_fn=""
failed=0
for f in $(ls ./*.sql | sort); do
  f="${f#./}"
  if [ -n "${THROUGH:-}" ] && [[ "${f%%_*}" > "$THROUGH" ]]; then continue; fi
  case "$f" in
    20260914130000_*|20260914140000_*)
      psql -X -q -f "$f" >/dev/null 2>&1 || true ;;
    *)
      if ! psql -X -q --single-transaction -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>"/tmp/replay-error.$$"; then
        echo "FAILED: $f"; grep -m1 ERROR "/tmp/replay-error.$$" || true; failed=$((failed + 1))
      fi ;;
  esac
  if [[ "$f" == 20260928140000_* ]]; then
    original_fn="$(Q "select pg_get_functiondef('public.rc_articles_before_update()'::regprocedure)")"
    psql -X -q -v ON_ERROR_STOP=1 -c "$(printf '%s' "$original_fn" | sed 's/new.edited_since_release := true;/new.edited_since_release := false;/')" >/dev/null
  fi
done
rm -f "/tmp/replay-error.$$"
[ -n "$original_fn" ] && psql -X -q -v ON_ERROR_STOP=1 -c "$original_fn" >/dev/null
echo "replayed up to ${THROUGH:-the last file}; $failed failed"
[ "$failed" -eq 0 ]
