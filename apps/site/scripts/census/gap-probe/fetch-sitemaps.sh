#!/bin/bash
# Neutral UA, >=3s between requests, resumable, stop on 403 or 5 consecutive failures.
S="$1"; fails=0
while read -r url; do
  f="$S/sitemaps/$(basename "$url")"
  [ -s "$f" ] && continue
  code=$(curl -sS -m 60 -A "WUWF-migration-research" -H "Accept: application/xml" "$url" -o "$f.tmp" -w "%{http_code}")
  if [ "$code" = "200" ]; then mv "$f.tmp" "$f"; fails=0
  else rm -f "$f.tmp"; echo "$(date -u +%T) $code $url" >> "$S/fetch-errors.log"
       [ "$code" = "403" ] && { echo "STOP 403" >> "$S/fetch-errors.log"; exit 3; }
       fails=$((fails+1)); [ $fails -ge 5 ] && { echo "STOP 5 failures" >> "$S/fetch-errors.log"; exit 4; }
       sleep 10; continue; fi
  sleep 3
done < "$S/index-locs.txt"
echo done > "$S/fetch-done"
