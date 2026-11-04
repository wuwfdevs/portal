import os, json, collections, sys
S=os.environ['GAP_WORK']; D=sys.argv[1]
W={'www.wuwf.org','wuwf.org'}
def org(n,depth=0):
    if depth>9: return None
    if isinstance(n,dict):
        if isinstance(n.get('sourceOrganizationName'),str) and n['sourceOrganizationName']: return n['sourceOrganizationName']
        for v in n.values():
            r=org(v,depth+1)
            if r: return r
    elif isinstance(n,list):
        for i in n[:60]:
            r=org(i,depth+1)
            if r: return r
def cls(host,o):
    if not host: return 'ambiguous'
    if host not in W: return 'external'
    return 'ambiguous' if (o and 'wuwf' not in o.lower()) else 'wuwf'
rows=[]; agg=collections.defaultdict(collections.Counter)
for r in json.load(open(S+'/gap-records.json')):                       # first probe (794)
    c=cls(r['host'],r['org']) if r.get('code')=='200' else ''
    rows.append((r['group'],r['path'],r['code'],r.get('template') or '',r.get('host') or '',c))
    if c: agg[r['group']][c]+=1
for l in open(S+'/gap-manifest2.tsv'):                                 # extended fetch
    g,p,code,host,key=l.rstrip('\n').split('\t'); c=''; tpl=''
    if code=='200':
        if host in W:
            d=json.load(open(f'{S}/raw2/{key}.json')); tpl=d.get('_template',''); c=cls(host,org(d))
        else: c=cls(host,None)
        agg[g][c]+=1
    rows.append((g,p,code,tpl,host,c))
with open(D+'/probe-manifest.tsv','w') as f:
    f.write('group\tpath\tstatus\ttemplate\tcanonical_host\torigin\n')
    for r in rows: f.write('\t'.join(r)+'\n')
json.dump({k:dict(v) for k,v in sorted(agg.items())},open(D+'/probe-results.json','w'),indent=1)
sec=collections.defaultdict(collections.Counter)
for g,c in agg.items():
    if g.startswith(('prefix:','full:','odd:')): sec[g.split(':')[1]].update(c)
for s,c in sorted(sec.items()): print(f'{s:20s} {sum(c.values()):5d} fetched  ', dict(c))
