import json, sys, os, collections, csv
from urllib.parse import urlparse, unquote
S = sys.argv[1]
KEYS = {'canonicalLink','sourceOrganizationName','headline','title','datePublished','dateModified','pageTitle'}
def find(n, out=None, depth=0):
    out = {} if out is None else out
    if depth > 9: return out
    if isinstance(n, dict):
        for k, v in n.items():
            if k in KEYS and isinstance(v, str) and v and k not in out: out[k] = v
        for v in n.values(): find(v, out, depth + 1)
    elif isinstance(n, list):
        for i in n[:60]: find(i, out, depth + 1)
    return out
recs = []
for line in open(os.path.join(S, 'gap-manifest.tsv')):
    g, p, code, size, key = line.rstrip('\n').split('\t')
    if code != '200': recs.append(dict(group=g, path=p, code=code)); continue
    try: d = json.load(open(os.path.join(S, 'raw', key + '.json')))
    except Exception as e: recs.append(dict(group=g, path=p, code='badjson')); continue
    f = find(d)
    host = urlparse(f.get('canonicalLink', '')).netloc
    recs.append(dict(group=g, path=p, code=code, size=int(size), template=d.get('_template') if isinstance(d, dict) else None,
                     host=host, org=f.get('sourceOrganizationName', ''), title=unquote(f.get('headline') or f.get('title') or '')[:90],
                     pub=f.get('datePublished', '')[:12], key=key))
json.dump(recs, open(os.path.join(S, 'gap-records.json'), 'w'))
by = collections.defaultdict(list)
for r in recs: by[r['group'].split(':')[0] + (':' + r['group'].split(':')[1] if r['group'].startswith(('prefix','odd')) else '')].append(r)
for g, rs in by.items():
    print('==', g, len(rs))
    print('  templates', collections.Counter(r.get('template') for r in rs).most_common(4))
    print('  hosts', collections.Counter(r.get('host') for r in rs).most_common(6))
    orgs = collections.Counter(r.get('org') for r in rs).most_common(6)
    print('  orgs', orgs)
