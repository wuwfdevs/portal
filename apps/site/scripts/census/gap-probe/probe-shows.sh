#!/bin/bash
# One request at a time, >=3 s apart, neutral UA, no redirects followed. Waits for the link-resolution run to end first.
S="$1"; mkdir -p "$S/raw3"
while pgrep -f "[r]esolve-links.ts" >/dev/null; do sleep 10; done
get() { # url outfile -> prints status
  curl -sS -m 60 -A "WUWF-migration-research" -H "Accept: $3" "$1" -o "$2" -w "%{http_code}"; }
while read -r p; do
  key=$(printf '%s' "$p" | sha256sum | cut -c1-16)
  [ -e "$S/raw3/$key.status" ] && continue
  code=$(get "https://www.wuwf.org${p}?_renderer=json" "$S/raw3/$key.json" "application/json")
  printf '%s\t%s\t%s\t%s\n' "show" "$p" "$code" "$key" >> "$S/shows-manifest.tsv"; echo "$code" > "$S/raw3/$key.status"
  [ "$code" = "403" ] && { echo "STOP 403 $p" >> "$S/shows-errors.log"; exit 3; }
  sleep 3
done < "$S/shows-plan.txt"
# feeds: every feed address named by a WUWF-made show's page
python3 -I - "$S" > "$S/feeds-plan.txt" <<'PY'
import json, sys, re
S=sys.argv[1]
for l in open(S+'/shows-manifest.tsv'):
    g,p,code,key=l.rstrip('\n').split('\t')
    if code!='200': continue
    try: d=json.load(open(f'{S}/raw3/{key}.json'))
    except Exception: continue
    if d.get('nprShow') is True: continue
    m=re.search(r'href="([^"]+)"', d.get('feedLink') or '')
    if m and m.group(1).startswith('https://www.wuwf.org/'): print(m.group(1))
PY
while read -r u; do
  key=$(printf '%s' "$u" | sha256sum | cut -c1-16)
  [ -e "$S/raw3/$key.feedstatus" ] && continue
  code=$(get "$u" "$S/raw3/$key.xml" "application/rss+xml,application/xml")
  printf '%s\t%s\t%s\t%s\n' "feed" "$u" "$code" "$key" >> "$S/shows-manifest.tsv"; echo "$code" > "$S/raw3/$key.feedstatus"
  [ "$code" = "403" ] && { echo "STOP 403 $u" >> "$S/shows-errors.log"; exit 3; }
  sleep 3
done < "$S/feeds-plan.txt"
echo done > "$S/shows-done"
