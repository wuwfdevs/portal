-- Sourcework: project synthesis (docs/sourcework-analysis-design.md §21).
--
-- One run reads every accepted finding in a project and writes what they establish about each
-- research question: what is established, contested or uncertain, where the evidence conflicts, what
-- the sources leave open, and a few narrative moments found on the tape. It replaces themes as the
-- way a reporter gets from findings to an answer; existing themes stay readable.
--
-- Content is insert-only versions, the shape pieces use. `body` is the synthesis as the application
-- models it (lib/sourcework/synthesis.ts is the model; SQL never interprets it): sections keyed by
-- research question, tensions, narrative notes. Statements cite accepted findings by id, with no
-- foreign key (a finding rejected later makes a statement say so rather than break the row).

create table public.sw_project_syntheses (
  project_id uuid primary key references public.tw_projects (id) on delete cascade,
  -- The latest sw_project_synthesis_versions.version; 0 = none yet. Written only by sw_save_project_synthesis().
  current_version integer not null default 0 check (current_version >= 0),
  updated_at timestamptz not null default now()
);

comment on table public.sw_project_syntheses is
  'A project''s synthesis of its accepted findings, one row per project. Content lives in sw_project_synthesis_versions. See docs/sourcework-analysis-design.md §21.';

create trigger set_sw_project_syntheses_updated_at
  before update on public.sw_project_syntheses
  for each row execute function public.set_updated_at();

create table public.sw_project_synthesis_versions (
  project_id uuid not null references public.tw_projects (id) on delete cascade,
  version integer not null check (version >= 1),
  body jsonb not null check (jsonb_typeof(body) = 'object'),
  saved_by uuid not null references public.profiles (id) on delete restrict,
  saved_via text not null check (saved_via in ('person', 'model')),
  -- The run that wrote a model version, and the synthesis guide it used (null = the built-in text).
  run_id uuid references public.sw_analysis_runs (id) on delete set null,
  prompt_version_id uuid references public.sw_prompt_versions (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (project_id, version)
);

comment on table public.sw_project_synthesis_versions is
  'Insert-only history of a project''s synthesis. Every save, by a person or a run, is a version; nothing is overwritten.';

-- Row Level Security: same trust model as the rest of Sourcework. Versions are select + insert only.
alter table public.sw_project_syntheses enable row level security;
alter table public.sw_project_synthesis_versions enable row level security;

grant select, insert, update on public.sw_project_syntheses to authenticated;
grant select, insert on public.sw_project_synthesis_versions to authenticated;

create policy sw_project_syntheses_select on public.sw_project_syntheses
  for select to authenticated
  using ((select private.has_transcription_access((select auth.uid()))));

create policy sw_project_syntheses_insert on public.sw_project_syntheses
  for insert to authenticated
  with check ((select private.has_transcription_access((select auth.uid()))));

create policy sw_project_syntheses_update on public.sw_project_syntheses
  for update to authenticated
  using ((select private.has_transcription_access((select auth.uid()))))
  with check ((select private.has_transcription_access((select auth.uid()))));

create policy sw_project_synthesis_versions_select on public.sw_project_synthesis_versions
  for select to authenticated
  using ((select private.has_transcription_access((select auth.uid()))));

create policy sw_project_synthesis_versions_insert on public.sw_project_synthesis_versions
  for insert to authenticated
  with check (
    (select private.has_transcription_access((select auth.uid())))
    and saved_by = (select auth.uid())
  );

-- The one writer of a project's synthesis ------------------------------------------------------
-- Saves `p_body` as the next version if, and only if, the project is still at the version the caller
-- started from (0 when it has none). Returns the new version number, or -1 when someone else saved
-- first: the caller reloads rather than overwriting them. security invoker: RLS applies to every write.
create function public.sw_save_project_synthesis(
  p_project_id uuid,
  p_base_version integer,
  p_body jsonb,
  p_saved_via text,
  p_run_id uuid,
  p_prompt_version_id uuid
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_current integer;
  v_next integer;
begin
  insert into public.sw_project_syntheses (project_id) values (p_project_id)
    on conflict (project_id) do nothing;

  select current_version into v_current
    from public.sw_project_syntheses
   where project_id = p_project_id
   for update;

  if v_current <> p_base_version then
    return -1;
  end if;

  v_next := v_current + 1;

  insert into public.sw_project_synthesis_versions
    (project_id, version, body, saved_by, saved_via, run_id, prompt_version_id)
  values
    (p_project_id, v_next, p_body, auth.uid(), p_saved_via, p_run_id, p_prompt_version_id);

  update public.sw_project_syntheses
     set current_version = v_next
   where project_id = p_project_id;

  return v_next;
end;
$$;

revoke all on function public.sw_save_project_synthesis(uuid, integer, jsonb, text, uuid, uuid) from public;
grant execute on function public.sw_save_project_synthesis(uuid, integer, jsonb, text, uuid, uuid) to authenticated;

-- One synthesis run in flight per project, so a double click cannot start two.
create unique index sw_analysis_runs_one_running_synthesis
  on public.sw_analysis_runs (project_id)
  where status = 'running' and kind = 'synthesis' and not trial;
