import os, json, re, csv, sys
S=os.environ['GAP_WORK']
out=sys.argv[1]
recs=[r for r in json.load(open(S+'/gap-records.json')) if r['group']=='standalone']
rules=[('test-scratch','drop','Test or scratch page.',r'^(test|webtest|wedtest|testpage|testwebcast|cadenceexample|page-left-example|new-page-page|demo-links|framegrid|zoolander|page|d|8|9|412|908|9082|t2|t66543|nt6657|cs216|wc428|w23|s60|tlclm|tixemr|rlnext|rltixw|lt1|ac2|eb|dbt|sone|ssl|bog1|bog2|cpos9|ers23a?|ert24)$|^test'),
 ('uwf-board-of-trustees','decide','UWF Board of Trustees meeting page: UWF content, not WUWF reporting. Owner decision (archive link or drop).',r'^(uwf-)?bot|^bog|^special-uwf-bot|^uwf-board'),
 ('uwf-event-webcast','decide','UWF event webcast page (commencement, convocation, honors, symposium, forum). Owner decision.',r'commencement|convocation|honors|symposium|forum|german|gmba|sotu|sou-|state-of-the-univ|town-hall|erap|3mt|three-mt|^130|^530|^930|uwf-130|uwf-530|uwf-930|webcast|lecture|dekle|landrum|inauguration|women|leadership|startup|innovation|employee|staff-symp|academic'),
 ('schedule-weather','replace','Schedule, grid or weather page: replaced by the schedule and weather features, redirect to them.',r'grid|schedule|weather|radar|storm'),
 ('station-info','keep','Station information or membership page: keep as a standard page at the same address.',r'about|contact|privacy|eeo|fcc|corporate|membership|sustaining|legacy|mission|governing|cpb|dmca|apps|stream|newsletter|testimonial|sponsor|support|protocols|tickets?|primary-signal|demographics|maintenance|real-estate|how-can-i|map-and')]
rows=[]
for r in recs:
    slug=r['path'][1:]
    cluster,prop,note=('other-review','review','Needs a person to read it.')
    t=r.get('template') or ''
    if t.endswith('SectionPage.hbs'): cluster,prop,note=('section-landing','merge','Grove section landing page; becomes the generated section list at the same address (needs a decision on curated content).')
    elif t.endswith('/Page.hbs'): cluster,prop,note=('page-hbs','review','Template (Page.hbs) the converter does not handle.')
    else:
        for c,p,n,rx in rules:
            if re.search(rx,slug,re.I): cluster,prop,note=c,p,n; break
    rows.append([r['path'],r.get('template') or r['code'],r.get('pub',''),r.get('title',''),cluster,'proposed:'+prop,note])
w=csv.writer(open(out,'w',newline='')); w.writerow(['path','template','published','title','cluster','proposed_disposition','note']); w.writerows(rows)
import collections; print(collections.Counter(r[4] for r in rows))
