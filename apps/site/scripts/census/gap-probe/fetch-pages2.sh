#!/bin/bash
# Same rules as before. Also records the canonical host and deletes the raw JSON of any page whose canonical is not wuwf.org.
S="$1"; mkdir -p "$S/raw2"; fails=0
while IFS=$'\t' read -r group path; do
  key=$(printf '%s' "$path" | sha256sum | cut -c1-16)
  [ -e "$S/raw2/$key.status" ] && continue
  code=$(curl -sS -m 60 -A "WUWF-migration-research" -H "Accept: application/json" "https://www.wuwf.org${path}?_renderer=json" -o "$S/raw2/$key.json" -w "%{http_code}")
  host=""
  if [ "$code" = "200" ]; then host=$(python3 -I "$S/drop-external.py" "$S/raw2/$key.json")
     case "$host" in www.wuwf.org|wuwf.org) ;; *) rm -f "$S/raw2/$key.json";; esac; fi
  printf '%s\t%s\t%s\t%s\t%s\n' "$group" "$path" "$code" "$host" "$key" >> "$S/gap-manifest2.tsv"
  echo "$code" > "$S/raw2/$key.status"
  case "$code" in
    200|404|301|302|308) fails=0;;
    403) echo "STOP 403 at $path" >> "$S/gap-errors2.log"; exit 3;;
    *) rm -f "$S/raw2/$key.status"; fails=$((fails+1)); echo "$code $path" >> "$S/gap-errors2.log"
       [ $fails -ge 5 ] && { echo "STOP 5 failures" >> "$S/gap-errors2.log"; exit 4; }; sleep 10; continue;;
  esac
  sleep 3
done < "$S/gap-plan2.tsv"
echo done > "$S/gap-done2"
