-- Marks every clock's Music Bed, Billboard, Return, and Promo slots eligible
-- as local opportunities, per WUWF's explicit instruction (2026-08-11):
-- billboards, returns, and promos carry the identical contractual right as
-- music beds under NPR's own program terms (Morning Edition, All Things
-- Considered, and Weekend Edition all grant "any billboard, newscast/
-- headlines, return, promo, or music bed" in one clause, no program-specific
-- restriction) -- this is the WUWF policy decision
-- 20260810170000_log_syndicated_local_opportunities.sql explicitly deferred
-- for Billboard and Return ("left out entirely... without a WUWF policy
-- decision"). See docs/log-design.md's "NPR broadcast-rights context" note
-- for the full account of the terms checked.
--
-- Label-matched across every clock template, not hardcoded by id, for the
-- same reason 20260810170000 resolves by clock template name: several
-- templates were created independently through the producer UI in each
-- project, and their slot ids differ between preview and production even
-- though the offsets/durations/labels are identical. `on conflict (slot_id)
-- do nothing` makes this safe to run against a database where some of these
-- opportunities already exist -- e.g. every Music Bed opportunity
-- 20260810170000 already seeded for its 22 templates, or the Newscast 2/4
-- opportunities from earlier migrations, none of which this file should
-- touch or duplicate.
--
-- Two corrections ride along, since both are part of the same pass that
-- produced this end state:
--
--   1. Morning Edition's own Music Bed opportunities were found seeded with
--      requirement = 'required' -- inconsistent with both this design's own
--      documented intent (docs/log-design.md's Morning Edition seed list
--      calls opportunities #1/#2 "optional") and every other program's
--      Music Bed convention. Corrected to 'optional'.
--   2. Echoes' Hour 1 junction (59:00-60:00) -- a Music-Bed-labeled slot --
--      is explicitly "Protected/network content... not eligible" per
--      20260810170000's own sourced audit (see that migration's Echoes
--      section), unlike its Hour 2 counterpart. Without this correction the
--      blanket insert below would mark it eligible along with every other
--      Music Bed slot, contradicting the sourced audit -- so it's
--      immediately deactivated afterward with a note explaining why, rather
--      than deleted (this table's standard "deactivate, don't delete"
--      precedent).

-- Mark every unmarked Music Bed / Billboard / Return / Promo slot eligible,
-- optional, with the standard local-content-types set already used
-- throughout log_local_opportunities.
insert into public.log_local_opportunities (clock_version_id, slot_id, requirement, permitted_content_types)
select s.clock_version_id, s.id, 'optional'::public.log_opportunity_requirement,
  array['legal_id', 'psa', 'station_promo', 'program_promo', 'membership_message', 'university_announcement', 'underwriting_credit']::text[]
from public.log_clock_slots s
left join public.log_local_opportunities o on o.slot_id = s.id
where (s.label ilike '%music bed%' or s.label ilike '%billboard%' or s.label ilike '%return%' or s.label ilike '%promo%')
  and o.id is null
on conflict (slot_id) do nothing;

-- Correction 1: Morning Edition's Music Bed opportunities should be
-- optional, matching every other program and this design's own documented
-- intent -- not required.
update public.log_local_opportunities o
set requirement = 'optional'::public.log_opportunity_requirement, updated_at = now()
from public.log_clock_slots s
join public.log_clock_versions v on v.id = s.clock_version_id
join public.log_clock_templates t on t.id = v.clock_template_id
where o.slot_id = s.id
  and t.name = 'Morning Edition'
  and s.label ilike '%music bed%'
  and o.requirement = 'required';

-- Correction 2: Echoes' Hour 1 junction is protected network content per
-- the syndicated-clock audit, unlike its Hour 2 counterpart -- deactivate
-- the opportunity the insert above would otherwise leave active for it.
update public.log_local_opportunities o
set active = false, updated_at = now(),
  notes = coalesce(notes, '') || case when notes is null or notes = '' then '' else ' ' end ||
    'Deactivated: audit (WUWF_broadcast_clocks_and_local_break_eligibility_VERIFIED.xlsx) marks this Hour 1 junction (59:00-60:00) as protected/network content, not eligible -- confirmed against the parallel Hour 2 slot''s own seeded note in 20260810170000_log_syndicated_local_opportunities.sql.'
from public.log_clock_slots s
join public.log_clock_versions v on v.id = s.clock_version_id
join public.log_clock_templates t on t.id = v.clock_template_id
where o.slot_id = s.id
  and t.name = 'Echoes'
  and s.start_offset_seconds = 3540
  and s.label ilike '%music bed%'
  and o.active = true;
