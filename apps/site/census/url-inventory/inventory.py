#!/usr/bin/env python3
"""Build the URL disposition ledger from the monthly sitemaps. Reads only local files.
Usage: python3 -I inventory.py <sitemaps_dir> <out_dir>
"""
import csv, collections, json, re, sys, glob, os
from urllib.parse import urlparse

src, out = sys.argv[1], sys.argv[2]
LOCAL = {'local-news','commentary','uwf-news','local-arts','unearthing-florida','local-politics',
         'local-elections','local-music','local-economy','local-news-featured','local-music-scene'}
DATE = re.compile(r'^(\d{4})-(\d{2})-(\d{2})$')

def classify(p):
    seg = [s for s in p.split('/') if s]
    d = lambda s: s if s and DATE.match(s) else None
    if not seg: return ('home', None, None)
    if len(seg) == 3 and seg[0] == 'community-calendar' and seg[1] == 'event': return ('event', None, None)
    if len(seg) == 2 and seg[0] == 'people': return ('person', None, None)
    if seg[0] in ('tags', 'tag'): return ('tag', None, None)
    if seg[0] == 'live-updates': return ('live-blog', None, None)
    if seg[0] == 'show':
        if len(seg) == 2: return ('show-page', None, None)
        if len(seg) == 4 and d(seg[2]): return ('show-episode', seg[1], seg[2][:4])
        return ('other', None, None)
    if len(seg) == 2 and d(seg[0]): return ('wire-story', None, seg[0][:4])
    if len(seg) == 3 and d(seg[1]):
        return ('local-story' if seg[0] in LOCAL else 'section-story-other', seg[0], seg[1][:4])
    if len(seg) == 1: return ('standalone', None, None)
    return ('other', None, None)

seen = {}
for f in sorted(glob.glob(os.path.join(src, 'sitemap-*.xml'))):
    xml = open(f, encoding='utf-8', errors='replace').read()
    for m in re.finditer(r'<loc>([^<]+)</loc>(?:\s*<lastmod>([^<]+)</lastmod>)?', xml):
        u = urlparse(m.group(1).strip())
        if u.netloc not in ('www.wuwf.org', 'wuwf.org'): continue
        path = u.path.rstrip('/') or '/'
        seen.setdefault(path, (m.group(2) or '', os.path.basename(f)))

rows = []
for path, (lastmod, f) in sorted(seen.items()):
    shape, section, year = classify(path)
    rows.append((path, shape, section or '', year or '', lastmod, f))

os.makedirs(out, exist_ok=True)
with open(os.path.join(out, 'ledger.csv'), 'w', newline='') as fh:
    w = csv.writer(fh)
    w.writerow(['path', 'shape', 'section', 'year', 'lastmod', 'sitemap', 'disposition', 'note'])
    for r in rows: w.writerow(list(r) + ['undecided', ''])

by_shape = collections.Counter(r[1] for r in rows)
by_section = collections.Counter(r[2] for r in rows if r[1] in ('local-story', 'section-story-other'))
by_year = collections.defaultdict(collections.Counter)
for r in rows:
    if r[3]: by_year[r[3]][r[1]] += 1
summary = {'total': len(rows), 'by_shape': by_shape.most_common(),
           'sections': by_section.most_common(),
           'by_year': {y: dict(c) for y, c in sorted(by_year.items())}}
json.dump(summary, open(os.path.join(out, 'summary.json'), 'w'), indent=1)
print(json.dumps({k: summary[k] for k in ('total', 'by_shape')}, indent=1))
print('sections:', summary['sections'][:25])
# the standalone pages are the decision list
sa = [r[0] for r in rows if r[1] == 'standalone']
open(os.path.join(out, 'standalone.txt'), 'w').write('\n'.join(sa) + '\n')
print('standalone:', len(sa))
