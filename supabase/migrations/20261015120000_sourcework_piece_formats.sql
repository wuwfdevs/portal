-- Sourcework analysis, Phase E (docs/sourcework-analysis-design.md §4.7, §6.3, §6.4, §8):
-- piece formats, Draft with AI, and the assistant's piece capabilities.
--
-- A format is the shape and wording the model follows when it drafts a piece: ordered
-- sections (narration or actuality, each with a line of guidance), a target length with a
-- tolerance, a range for the number of actualities, and a style paragraph. Editors own that
-- language; code owns the block schema, and the model places actualities by excerpt id, so a
-- format can never make it type out a quote (lib/sourcework/piece-formats.ts is the model).
--
-- The same versioning rules as the research prompts (§8): a version is insert-only and
-- immutable, "live" is a pointer on the format, rolling back is moving it, and one draft per
-- format per editor autosaves. A format is never deleted — a piece records the version that
-- drafted it, and History keeps every version.
--
-- Four formats are seeded with a first published version so Draft with AI works before an
-- editor has touched anything. Seeded rows have no author (created_by null = built in).

-- Formats ------------------------------------------------------------------------------
create table public.sw_piece_formats (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  position integer not null default 0,
  -- Which published version Draft with AI uses. Null until the first publish; a format
  -- with no live version is not offered to reporters.
  live_version_id uuid,
  live_moved_by uuid references public.profiles (id) on delete set null,
  live_moved_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.sw_piece_formats is
  'A piece format (docs/sourcework-analysis-design.md §6.3): what Draft with AI follows. Content is in sw_piece_format_versions; live_version_id is the movable pointer. created_by null = seeded.';

create unique index sw_piece_formats_name_key on public.sw_piece_formats (lower(btrim(name)));

create trigger set_sw_piece_formats_updated_at
  before update on public.sw_piece_formats
  for each row execute function public.set_updated_at();

create table public.sw_piece_format_versions (
  id uuid primary key default gen_random_uuid(),
  format_id uuid not null references public.sw_piece_formats (id) on delete cascade,
  version integer not null check (version >= 1),
  -- { targetSeconds, toleranceSeconds, minActualities, maxActualities,
  --   sections: [{ type: 'narration' | 'actuality', guidance }], style }
  spec jsonb not null check (jsonb_typeof(spec) = 'object'),
  note text check (note is null or char_length(note) <= 300),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (format_id, version),
  unique (id, format_id)
);

comment on table public.sw_piece_format_versions is
  'Insert-only history of a piece format. A piece drafted from one records it (sw_pieces.format_version_id).';

-- The live pointer can only name a version of its own format.
alter table public.sw_piece_formats
  add constraint sw_piece_formats_live_version_fkey
  foreign key (live_version_id, id) references public.sw_piece_format_versions (id, format_id);

-- One draft per format per editor, autosaved; whatever is typed, checked only when it is
-- tried or published.
create table public.sw_piece_format_drafts (
  format_id uuid not null references public.sw_piece_formats (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  spec jsonb not null check (jsonb_typeof(spec) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (format_id, user_id)
);

-- "Try this draft" for a format (§6.3, §8.1): the live version and the draft each draft a
-- piece from the same project's accepted themes and excerpts, and the two are compared.
-- Private to the editor, kept 14 days, and never touches project data.
create table public.sw_piece_format_trials (
  id uuid primary key default gen_random_uuid(),
  format_id uuid not null references public.sw_piece_formats (id) on delete cascade,
  draft_spec jsonb not null check (jsonb_typeof(draft_spec) = 'object'),
  -- The live version when the trial ran; null when the format had none yet.
  live_version_id uuid references public.sw_piece_format_versions (id) on delete set null,
  project_id uuid not null references public.tw_projects (id) on delete cascade,
  direction text not null default '' check (char_length(direction) <= 1000),
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  error text,
  -- { live: DraftSide | null, draft: DraftSide } — see lib/sourcework/piece-format-trials.ts.
  results jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  expires_at timestamptz not null default (now() + interval '14 days')
);

create index sw_piece_format_trials_owner_idx
  on public.sw_piece_format_trials (created_by, format_id, created_at desc);

-- Pieces: which format drafted them ------------------------------------------------------
-- format_version_id: the format version that last drafted the piece (null = written by
-- hand). drafted_version: the piece version that draft became, so the list can say
-- "Radio wrap format, then edited" once a later version exists.
alter table public.sw_pieces
  add column format_version_id uuid references public.sw_piece_format_versions (id) on delete set null,
  add column drafted_version integer check (drafted_version is null or drafted_version >= 1);

create index sw_pieces_format_version_idx on public.sw_pieces (format_version_id)
  where format_version_id is not null;

-- Runs: Draft with AI is one more kind of model run --------------------------------------
alter table public.sw_analysis_runs drop constraint sw_analysis_runs_kind_check;
alter table public.sw_analysis_runs add constraint sw_analysis_runs_kind_check
  check (kind in ('context', 'extraction', 'theme_assign', 'theme_review', 'quote_suggest', 'piece_draft'));

alter table public.sw_analysis_runs
  add column piece_id uuid references public.sw_pieces (id) on delete set null,
  add column format_version_id uuid references public.sw_piece_format_versions (id) on delete set null;

-- A real draft names its piece; a trial run writes no piece and leaves it null.
alter table public.sw_analysis_runs add constraint sw_analysis_runs_piece_draft_check
  check (kind <> 'piece_draft' or trial or piece_id is not null);

-- One draft at a time per piece, so a double click cannot start two.
create unique index sw_analysis_runs_one_running_piece_draft
  on public.sw_analysis_runs (piece_id)
  where status = 'running' and kind = 'piece_draft' and not trial;

-- Publishing a format ---------------------------------------------------------------------
-- Saves the next version and moves the live pointer to it, atomically. security invoker:
-- the editor policies below still decide whether the caller may.
create function public.sw_publish_piece_format(p_format_id uuid, p_spec jsonb, p_note text)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_next integer;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('sw_piece_format_' || p_format_id::text));

  select coalesce(max(version), 0) + 1 into v_next
    from public.sw_piece_format_versions
   where format_id = p_format_id;

  insert into public.sw_piece_format_versions (format_id, version, spec, note, created_by)
  values (p_format_id, v_next, p_spec, nullif(btrim(p_note), ''), auth.uid())
  returning id into v_id;

  update public.sw_piece_formats
     set live_version_id = v_id,
         live_moved_by = auth.uid(),
         live_moved_at = now()
   where id = p_format_id;
  if not found then
    raise exception 'format_not_found' using errcode = 'P0002';
  end if;

  return v_next;
end;
$$;

revoke all on function public.sw_publish_piece_format(uuid, jsonb, text) from public;
grant execute on function public.sw_publish_piece_format(uuid, jsonb, text) to authenticated;

-- Row Level Security ------------------------------------------------------------------------
alter table public.sw_piece_formats enable row level security;
alter table public.sw_piece_format_versions enable row level security;
alter table public.sw_piece_format_drafts enable row level security;
alter table public.sw_piece_format_trials enable row level security;

grant select, insert, update on public.sw_piece_formats to authenticated;
grant select, insert on public.sw_piece_format_versions to authenticated;
grant select, insert, update, delete on public.sw_piece_format_drafts to authenticated;
grant select, insert, update, delete on public.sw_piece_format_trials to authenticated;

-- Every member drafts from the live formats; only an editor writes them. No delete policy:
-- a format is never deleted.
create policy sw_piece_formats_select on public.sw_piece_formats
  for select to authenticated
  using ((select private.has_transcription_access((select auth.uid()))));

create policy sw_piece_formats_insert on public.sw_piece_formats
  for insert to authenticated
  with check (
    (select private.has_transcription_access((select auth.uid())))
    and (select private.is_sourcework_editor((select auth.uid())))
    and created_by = (select auth.uid())
  );

create policy sw_piece_formats_update on public.sw_piece_formats
  for update to authenticated
  using (
    (select private.has_transcription_access((select auth.uid())))
    and (select private.is_sourcework_editor((select auth.uid())))
  )
  with check (
    (select private.has_transcription_access((select auth.uid())))
    and (select private.is_sourcework_editor((select auth.uid())))
  );

create policy sw_piece_format_versions_select on public.sw_piece_format_versions
  for select to authenticated
  using ((select private.has_transcription_access((select auth.uid()))));

create policy sw_piece_format_versions_insert on public.sw_piece_format_versions
  for insert to authenticated
  with check (
    (select private.has_transcription_access((select auth.uid())))
    and (select private.is_sourcework_editor((select auth.uid())))
    and created_by = (select auth.uid())
  );

create policy sw_piece_format_drafts_own on public.sw_piece_format_drafts
  for all to authenticated
  using (
    user_id = (select auth.uid())
    and (select private.is_sourcework_editor((select auth.uid())))
  )
  with check (
    user_id = (select auth.uid())
    and (select private.is_sourcework_editor((select auth.uid())))
  );

create policy sw_piece_format_trials_own on public.sw_piece_format_trials
  for all to authenticated
  using (
    created_by = (select auth.uid())
    and (select private.has_transcription_access((select auth.uid())))
    and (select private.is_sourcework_editor((select auth.uid())))
  )
  with check (
    created_by = (select auth.uid())
    and (select private.has_transcription_access((select auth.uid())))
    and (select private.is_sourcework_editor((select auth.uid())))
  );

-- Seeded formats ----------------------------------------------------------------------------
-- Inserted with RLS bypassed (a migration runs as the owner), with no author. Editors change
-- them like any other format: a new version, published with a note.
-- Three statements, not one with data-modifying CTEs: a CTE's insert is not visible to the
-- rest of its own statement, so the final update would find nothing to point at.
insert into public.sw_piece_formats (name, position)
values ('Radio wrap', 1), ('Voicer', 2), ('Script', 3), ('Cut and copy', 4);

insert into public.sw_piece_format_versions (format_id, version, spec, note)
select f.id, 1, spec.spec, 'Built-in starting point'
  from public.sw_piece_formats f
  join (values
      ('Radio wrap', $spec${
        "targetSeconds": 60, "toleranceSeconds": 5, "minActualities": 2, "maxActualities": 3,
        "sections": [
          {"type": "narration", "guidance": "Setup: name the place and the question in one sentence."},
          {"type": "actuality", "guidance": "Voice: the strongest first-person moment."},
          {"type": "narration", "guidance": "Turn: introduce a second voice or a complication."},
          {"type": "actuality", "guidance": "Voice: a different speaker, ideally one who complicates."},
          {"type": "narration", "guidance": "Close and sign-off. Leave [REPORTER NAME] as a placeholder."}
        ],
        "style": "Plain and factual. Present tense where it reads naturally. Do not use an adjective the speaker did not use. Never tell the audience what to feel. Keep sentences short enough to read in one breath."
      }$spec$::jsonb),
      ('Voicer', $spec${
        "targetSeconds": 45, "toleranceSeconds": 5, "minActualities": 0, "maxActualities": 0,
        "sections": [
          {"type": "narration", "guidance": "Lead: the newest fact and where it happened, in one sentence."},
          {"type": "narration", "guidance": "Context: what a listener needs to make sense of it, attributed to the people who said it."},
          {"type": "narration", "guidance": "What happens next, then the sign-off. Leave [REPORTER NAME] as a placeholder."}
        ],
        "style": "The reporter's voice only, with no actualities. Attribute what sources said in your own words (\"she says\") rather than quoting at length. Plain, factual and in the present tense where it reads naturally."
      }$spec$::jsonb),
      ('Script', $spec${
        "targetSeconds": 180, "toleranceSeconds": 15, "minActualities": 3, "maxActualities": 6,
        "sections": [
          {"type": "narration", "guidance": "Host introduction: two or three sentences a host reads, ending by naming the reporter as [REPORTER NAME]."},
          {"type": "narration", "guidance": "Scene: put the listener somewhere specific, from what the sources describe."},
          {"type": "actuality", "guidance": "First voice: someone who lived it."},
          {"type": "narration", "guidance": "Context: the history or facts a listener needs, from the accepted themes."},
          {"type": "actuality", "guidance": "Second voice: a different speaker or source."},
          {"type": "narration", "guidance": "Turn: the complication, the other side, or what changed."},
          {"type": "actuality", "guidance": "Third voice: ideally one who complicates the first."},
          {"type": "narration", "guidance": "Close: where things stand now, then the sign-off."}
        ],
        "style": "Write for the ear. One idea per sentence, present tense where it reads naturally, and attribute every claim. Let the actualities carry the feeling; the narration carries the facts. Do not use an adjective the speaker did not use."
      }$spec$::jsonb),
      ('Cut and copy', $spec${
        "targetSeconds": 45, "toleranceSeconds": 5, "minActualities": 1, "maxActualities": 1,
        "sections": [
          {"type": "narration", "guidance": "Host copy: the news in one or two sentences, ending by naming who we hear next and why."},
          {"type": "actuality", "guidance": "The clip: one clear, self-contained thought."},
          {"type": "narration", "guidance": "Tag: one sentence after the clip with a fact or what happens next."}
        ],
        "style": "Written for a host to read cold. Name the speaker before the clip, never only after it. Short sentences, plain words, no adjective the speaker did not use."
      }$spec$::jsonb)
    ) as spec (name, spec) on spec.name = f.name;

update public.sw_piece_formats f
   set live_version_id = v.id,
       live_moved_at = now()
  from public.sw_piece_format_versions v
 where v.format_id = f.id
   and v.version = 1
   and f.live_version_id is null;
