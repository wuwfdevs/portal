-- Reconciliation corrective migration: replace provisional duplicate overview instructions
-- with links to detailed existing guides. Preserve each guide's version history.
with targets(tool_key,slug,heading,intro) as (values ('bookings','bookings-workflow-overview','Bookings: guide index','Start with entering a request and its estimate. Follow the detailed guides for capacity, rates, delivery and settlement.'),
('underwriting','traffic-workflow-overview','Traffic: guide index','Follow the contract, copy, placement, exception and affidavit guides. DAD release procedures are documented under On Air.'),
('log','on-air-workflow-overview','On Air: guide index','Use the rundown guide for shifts and the specialized guides for schedules, clocks, automation and DAD logs.'),
('transcription','sourcework-workflow-overview','Sourcework: guide index','Start with a project, then follow the transcript, source-library and search guides for particular tasks.'),
('editorial-planning','editorial-planning-workflow-overview','Editorial Planning: guide index','Use the pitch, meeting and rubric guides for current workflow instructions.'),
('audience-listening','audience-listening-workflow-overview','Audience Listening: guide index','Use the existing query, submissions and Sourcework handoff guides. Public responses are not a representative survey.'),
('roadmap','roadmap-workflow-overview','Roadmap: guide index','Refer to the current board guide for request statuses and administrative actions.')),
assembled as (
select o.id,t.heading,t.intro,
jsonb_build_object('type','doc','content',jsonb_build_array(
jsonb_build_object('type','paragraph','content',jsonb_build_array(jsonb_build_object('type','text','text',t.intro))),
jsonb_build_object('type','heading','attrs',jsonb_build_object('level',2),'content',jsonb_build_array(jsonb_build_object('type','text','text','Detailed guides'))),
jsonb_build_object('type','bulletList','content',coalesce((
select jsonb_agg(jsonb_build_object('type','listItem','content',jsonb_build_array(jsonb_build_object('type','paragraph','content',jsonb_build_array(jsonb_build_object('type','text','text',g.title,'marks',jsonb_build_array(jsonb_build_object('type','link','attrs',jsonb_build_object('href','/resources/tools/'||t.tool_key||'/'||g.slug)))))))) order by g.sort_order,g.title)
from public.rc_articles g where g.kind='guide' and g.tool_id=o.tool_id and g.id<>o.id),'[]'::jsonb))
)) new_body
from targets t join public.tools tool on tool.key=t.tool_key join public.rc_articles o on o.slug=t.slug and o.kind='guide' and o.tool_id=tool.id)
update public.rc_articles a set title=s.heading,summary='Start here: links to the current detailed guides for this tool.',body=s.new_body,version_note='Reconciled with live guide inventory; retired overlapping unverified instructions in favor of existing detailed guides',source='release',needs_review=false from assembled s where a.id=s.id returning a.slug,a.version;
