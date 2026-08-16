-- Sourcework Phase 5: themes, meta-themes, synthesis
-- (docs/sourcework-analysis-design.md). Synthesis layer: grouping Phase 4's
-- data points into a pattern worth reporting (a theme), and, when patterns
-- themselves cluster, grouping themes into a meta-theme (a theme with
-- children — see that doc's §3, no separate table). The actual deliverable
-- this whole model aims at: for each research question, the meta-theme(s)
-- that answer it (research_question_id below) — see that doc's §1.
--
-- Themes are NOT project-scoped (that doc's §2, resolving Phase 5's own
-- open question from docs/sourcework-design.md §5): membership derives
-- entirely from whichever data points a theme groups, which can span more
-- than one project. No project_id column on this table.

create table public.sw_themes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  notes text,
  parent_theme_id uuid references public.sw_themes (id) on delete set null,
  research_question_id uuid references public.sw_research_questions (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.sw_themes is
  'A pattern grouping Phase 4 data points, optionally nested under a parent theme (a "meta-theme" is simply a theme with children) and optionally answering one research question. Not project-scoped — see docs/sourcework-analysis-design.md §2.';

create index sw_themes_parent_theme_id_idx on public.sw_themes (parent_theme_id);
create index sw_themes_research_question_id_idx on public.sw_themes (research_question_id);

create table public.sw_theme_data_points (
  theme_id uuid not null references public.sw_themes (id) on delete cascade,
  data_point_id uuid not null references public.sw_data_points (id) on delete cascade,
  added_at timestamptz not null default now(),
  added_by uuid references public.profiles (id) on delete set null,
  primary key (theme_id, data_point_id)
);

comment on table public.sw_theme_data_points is
  'Many-to-many: which data points a theme groups. Deleting a data point only removes this join row; deleting a theme cascades this join but not the data point.';

create index sw_theme_data_points_data_point_id_idx on public.sw_theme_data_points (data_point_id);

-- updated_at maintenance ------------------------------------------------------

create trigger set_sw_themes_updated_at
  before update on public.sw_themes
  for each row execute function public.set_updated_at();

-- RLS: same collaborative sub-resource model every sw_/tw_ table uses. No
-- project-scoping predicate — there is nothing to scope it to (see above).

alter table public.sw_themes enable row level security;
alter table public.sw_theme_data_points enable row level security;

create policy sw_themes_member_all on public.sw_themes
  for all to authenticated
  using (private.has_transcription_access(auth.uid()))
  with check (private.has_transcription_access(auth.uid()));

grant select, insert, update, delete on public.sw_themes to authenticated;

create policy sw_theme_data_points_member_all on public.sw_theme_data_points
  for all to authenticated
  using (private.has_transcription_access(auth.uid()))
  with check (private.has_transcription_access(auth.uid()));

grant select, insert, update, delete on public.sw_theme_data_points to authenticated;
