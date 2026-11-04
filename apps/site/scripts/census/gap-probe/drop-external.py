import json, sys
from urllib.parse import urlparse
f = sys.argv[1]
try: d = json.load(open(f))
except Exception: sys.exit(0)
def find(n, depth=0):
    if depth > 9: return None
    if isinstance(n, dict):
        if isinstance(n.get('canonicalLink'), str) and n['canonicalLink']: return n['canonicalLink']
        for v in n.values():
            r = find(v, depth + 1)
            if r: return r
    elif isinstance(n, list):
        for i in n[:60]:
            r = find(i, depth + 1)
            if r: return r
host = urlparse(find(d) or '').netloc
print(host)
