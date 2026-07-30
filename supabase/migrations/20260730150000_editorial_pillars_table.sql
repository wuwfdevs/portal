-- Editorial Planning: coverage pillars as a first-class configurable entity.
--
-- Previously pillar names lived only as strings inside primary_pillar's
-- options jsonb array, hand-edited alongside every other select field's
-- options — no separate guiding question, and no add/retire/delete lifecycle
-- of their own. Admins (the tool's editor role) now manage pillars the same
-- way they manage rubric criteria and form fields: a dedicated table with
-- its own Settings screen. primary_pillar's selectable options and help text
-- are now derived at read time from this table (see
-- lib/editorial/data.ts's listPitchFormFields) rather than stored on the
-- field row, so they can never drift out of sync with what's configured
-- here.

create table public.ep_pillars (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  guiding_question text,
  active           boolean not null default true,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.ep_pillars is
  'The newsroom''s coverage pillars, each with an optional guiding question. Same lifecycle rule as ep_criteria/ep_form_fields: deactivate (retire), don''t delete, once a pillar might have been chosen on a pitch — see design §4C/§10.1. A pillar with no recorded usage may be deleted outright (see settings actions'' usage check). The three structural status options on primary_pillar (Outside current pillars / Emerging issue / Immediate public need) are not pillars and are not stored here — they stay hard-coded, since pitch-form logic depends on recognizing them.';

create unique index ep_pillars_name_active_idx on public.ep_pillars (name) where active;

comment on index public.ep_pillars_name_active_idx is
  'Unique only among active pillars, mirroring ep_form_fields_key_active_idx — a retired pillar''s name can be reused by a fresh row.';

create trigger set_ep_pillars_updated_at
  before update on public.ep_pillars
  for each row execute function public.set_updated_at();

alter table public.ep_pillars enable row level security;

grant select, insert, update, delete on public.ep_pillars to authenticated;

create policy ep_pillars_select_members on public.ep_pillars
  for select to authenticated
  using (private.ep_has_access(auth.uid()));

create policy ep_pillars_write_editors on public.ep_pillars
  for all to authenticated
  using (private.ep_is_editor(auth.uid()))
  with check (private.ep_is_editor(auth.uid()));

-- Seed the six pillars adopted alongside the Sextant framework (matching
-- 20260730140000_editorial_sextant_pillars.sql's option list and help text).
insert into public.ep_pillars (name, guiding_question, sort_order)
values
  ('Growth and Resilience',
   'How can Northwest Florida grow while protecting the people, places and natural systems that make it livable?',
   1),
  ('Public Health and Well-Being',
   'How do individual choices, public systems and social conditions combine to shape the health of people and communities?',
   2),
  ('Military Affairs',
   'How do we meet the demands of national defense while sustaining the service members, families and communities on whom it depends?',
   3),
  ('Public Safety and Civil Liberties',
   'How do we protect people while preserving rights, equal treatment and public accountability?',
   4),
  ('Affordability and Opportunity',
   'How can the region create prosperity while ensuring its benefits and burdens are broadly shared?',
   5),
  ('Power and Politics',
   'How should power be exercised and constrained in a self-governing society?',
   6);

-- primary_pillar's options/help_text are now derived from ep_pillars at read
-- time, so the static copies on the field row would silently drift out of
-- sync with the real config — clear them rather than leave stale data an
-- editor might mistake for something live and editable.
update public.ep_form_fields
set
  options = null,
  help_text = 'Choose the pillar this pitch most advances, or one of the status options if it doesn''t map to a current pillar. Pillars and their guiding questions are configured in Settings → Pillars.'
where key = 'primary_pillar' and active;
