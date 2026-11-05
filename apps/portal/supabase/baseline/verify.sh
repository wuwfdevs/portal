#!/usr/bin/env bash
# Proves the committed baseline is WUWF's history: compares a database built by replay-history.sh (then cleared with
# ../install/clear-seed-data-for-new-station.sql) with a database built from schema.sql and product-data.sql.
#
#   ./verify.sh <replay database URL> <baseline database URL>
#
# 1. Every schema object has the same definition (fingerprint.sql).
# 2. Every kept table holds the same rows (the product data), ignoring what a replay generates afresh each time: UUIDs
#    (gen_random_uuid defaults) and timestamps (now() defaults). The rows' content is compared as text with those masked.
set -euo pipefail
cd "$(dirname "$0")"
REPLAY="$1"; INSTALLED="$2"
KEEP="$(awk '/v_keep text\[\] := array\[/,/\];/' ../install/clear-seed-data-for-new-station.sql | grep -o "'[a-z_]*'" | tr -d "'")"
[ -n "$KEEP" ] || { echo "could not read the kept-table list" >&2; exit 1; }
fp() { psql "$1" -X -At -v ON_ERROR_STOP=1 -f fingerprint.sql; }

fp "$REPLAY" > /tmp/fingerprint.replay.txt
fp "$INSTALLED" > /tmp/fingerprint.installed.txt
if diff /tmp/fingerprint.replay.txt /tmp/fingerprint.installed.txt > /tmp/fingerprint.diff; then
  echo "ok:   schema identical ($(wc -l < /tmp/fingerprint.replay.txt) objects)"
else
  echo "FAIL: the baseline's schema differs from the replayed history (< replay, > baseline):"; head -40 /tmp/fingerprint.diff; exit 1
fi

bad=0
# A row as text, with every UUID and every timestamp replaced by a placeholder. Dates without a time of day are kept.
MASK="regexp_replace(regexp_replace(to_jsonb(x)::text, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', 'UUID', 'g'), '[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?([+-][0-9]{2}(:[0-9]{2})?|Z)?', 'TS', 'g')"
for t in $KEEP; do
  q="select count(*) || ':' || coalesce(md5(string_agg($MASK, '' order by $MASK)), '') from public.$t x"
  a="$(psql "$REPLAY" -X -At -v ON_ERROR_STOP=1 -c "$q")"; b="$(psql "$INSTALLED" -X -At -v ON_ERROR_STOP=1 -c "$q")"
  if [ "$a" != "$b" ]; then echo "FAIL: $t differs (replay $a, baseline $b)"; bad=1; fi
done
[ "$bad" -eq 0 ] && echo "ok:   product data identical, ignoring generated ids and timestamps ($(echo $KEEP | wc -w) kept tables)"
exit "$bad"
