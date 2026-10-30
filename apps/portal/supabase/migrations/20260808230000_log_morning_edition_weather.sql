-- Log: a real gap in the Morning Edition local-opportunity seed
-- (20260808210000_log_morning_edition_opportunities.sql), found from a
-- user report that "Add today's weather" never appears on any break.
--
-- None of the five seeded opportunities' permitted_content_types included
-- 'weather' — an oversight in that seed's own authorship, not a missing
-- feature: log_rundown_items already supports item_kind = 'weather'
-- (20260808130000_log_rundown_breaks.sql), addWeatherItem() already exists
-- (src/app/(portal)/log/rundown-actions.ts), and the rundown builder's
-- "Add today's weather" button already renders whenever a break's
-- permitted_content_types includes it (rundowns/[id]/page.tsx) — there was
-- simply no break anywhere that permitted it, so the button had nowhere to
-- appear.
--
-- Fixed narrowly: the two short optional post-newscast music-bed covers
-- (positions 1 and 2 — already generic local avails permitting legal ID,
-- PSA, station/program promo, membership message, university announcement,
-- and underwriting credit) now also permit 'weather', since a quick
-- weather update is exactly the kind of short, generic local fill those
-- windows already exist for. The three story/ID-specific windows
-- (positions 3-5) are unchanged — a weather update doesn't belong in a
-- multi-minute local-story substitution or a required legal-ID window, and
-- widening those would be inventing behavior WUWF hasn't confirmed, the
-- exact mistake this redesign exists to avoid.

update public.log_local_opportunities
set permitted_content_types = permitted_content_types || array['weather']
where clock_version_id = 'a9d5b1e6-69cc-5e94-a4be-5466f6a1863a'
  and position in (1, 2)
  and not ('weather' = any(permitted_content_types));

-- Existing rundown breaks generated before this fix snapshot the
-- opportunity's permitted_content_types at generation time (see
-- log_rundown_breaks' own comment) and don't pick up this change on their
-- own — the same "generated before an opportunity changed" gap
-- syncRundownBreaks() exists to close, but that path only adds missing
-- breaks, it doesn't update an existing one's snapshot. Update the one
-- known affected rundown's already-generated breaks directly so the fix is
-- visible immediately rather than only on the next newly generated
-- rundown.
update public.log_rundown_breaks b
set permitted_content_types = b.permitted_content_types || array['weather']
from public.log_local_opportunities lo
where b.local_opportunity_id = lo.id
  and lo.clock_version_id = 'a9d5b1e6-69cc-5e94-a4be-5466f6a1863a'
  and lo.position in (1, 2)
  and not ('weather' = any(b.permitted_content_types));
