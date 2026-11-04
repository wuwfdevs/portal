#!/bin/bash
# Neutral UA, >=3s apart, no redirects followed, resumable, stop on 403 or 5 consecutive failures.
S="$1"; mkdir -p "$S/raw"; fails=0
while IFS=$'\t' read -r group path; do
  key=$(printf '%s' "$path" | sha256sum | cut -c1-16)
  [ -e "$S/raw/$key.status" ] && continue
  code=$(curl -sS -m 60 -A "WUWF-migration-research" -H "Accept: application/json" "https://www.wuwf.org${path}?_renderer=json" -o "$S/raw/$key.json" -w "%{http_code}")
  size=$(stat -c %s "$S/raw/$key.json" 2>/dev/null || echo 0)
  printf '%s\t%s\t%s\t%s\t%s\n' "$group" "$path" "$code" "$size" "$key" >> "$S/gap-manifest.tsv"
  echo "$code" > "$S/raw/$key.status"
  case "$code" in
    200|404|301|302|308) fails=0;;
    403) echo "STOP 403 at $path" >> "$S/gap-errors.log"; exit 3;;
    *) rm -f "$S/raw/$key.status"; fails=$((fails+1)); echo "$code $path" >> "$S/gap-errors.log"
       [ $fails -ge 5 ] && { echo "STOP 5 failures" >> "$S/gap-errors.log"; exit 4; }; sleep 10; continue;;
  esac
  sleep 3
done < "$S/gap-plan.tsv"
echo done > "$S/gap-done"
