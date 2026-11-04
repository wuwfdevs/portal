import csv, random, sys, os
S = sys.argv[1]  # the work directory
rows = list(csv.DictReader(open(os.path.join(S, 'ledger', 'ledger.csv'))))
rng = random.Random('wuwf-gap-probe-1')
plan = []
def add(group, paths):
    for p in paths: plan.append((group, p))
add('podcast', [r['path'] for r in rows if r['path'].startswith('/podcast/')])
odd = ['civics-101','through-the-lens','america-250','eco','blog','live-event','election-2024','arts','science']
for s in odd:
    ps = [r['path'] for r in rows if r['shape']=='section-story-other' and r['section']==s]
    add('odd:'+s, sorted(rng.sample(ps, min(5, len(ps)))))
for s in ['florida-news','music-arts','news']:
    ps = sorted(r['path'] for r in rows if r['shape']=='section-story-other' and r['section']==s)
    add('prefix:'+s, sorted(rng.sample(ps, 100)))
add('standalone', [r['path'] for r in rows if r['shape']=='standalone'])
with open(os.path.join(S, 'gap-plan.tsv'), 'w') as f:
    for g, p in plan: f.write(f'{g}\t{p}\n')
print(len(plan))
