import csv, random, sys, os
S = sys.argv[1]  # the work directory
done = {l.split('\t')[1] for l in open(os.path.join(S, 'gap-manifest.tsv'))}
rows = list(csv.DictReader(open(os.path.join(S, 'ledger', 'ledger.csv'))))
rng = random.Random('wuwf-gap-probe-2')
odd = ['civics-101','through-the-lens','america-250','eco','blog','live-event','election-2024','arts','science']
plan = []
for sec in ['news'] + odd + ['music-arts', 'florida-news']:
    ps = [r['path'] for r in rows if r['shape'] == 'section-story-other' and r['section'] == sec and r['path'] not in done]
    rng.shuffle(ps)
    plan += [('full:' + sec, p) for p in ps]
open(os.path.join(S, 'gap-plan2.tsv'), 'w').write(''.join(f'{g}\t{p}\n' for g, p in plan))
print(len(plan))
