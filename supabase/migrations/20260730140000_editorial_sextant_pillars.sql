-- Editorial Planning: adopt the newsroom's real coverage pillars.
--
-- The five pillar names seeded in 20260730130000 were explicitly placeholders
-- ("Proposed pillars pending formal newsroom adoption" — see that migration
-- and design §4C) pending the newsroom settling on real ones. The newsroom
-- has now adopted the six Sextant pillars (WUWF_Sextant_Podcast_Strategy),
-- each built around an enduring guiding question. This is a plain options-
-- list update on the existing primary_pillar field, not a deactivate-and-
-- recreate: the field's meaning ("primary coverage pillar, from the
-- newsroom's currently defined pillars") is unchanged, only the vocabulary
-- is — the same kind of edit the settings/form screen already treats as
-- routine ("Removing an option doesn't change pitches that already selected
-- it"). No pitch has used primary_pillar yet (confirmed against both
-- Supabase projects before writing this migration), so there is nothing to
-- reconcile.

update public.ep_form_fields
set
  options = '[
    "Growth and Resilience",
    "Public Health and Well-Being",
    "Military Affairs",
    "Public Safety and Civil Liberties",
    "Affordability and Opportunity",
    "Power and Politics",
    "Outside current pillars",
    "Emerging issue / possible future priority",
    "Immediate public need"
  ]'::jsonb,
  help_text = 'WUWF''s six coverage pillars, each built around an enduring guiding question — Growth and Resilience (grow while protecting what makes the region livable?); Public Health and Well-Being (what shapes the health of people and communities?); Military Affairs (meet defense needs while sustaining those who serve?); Public Safety and Civil Liberties (protect people while preserving rights and accountability?); Affordability and Opportunity (share prosperity''s benefits and burdens broadly?); Power and Politics (how should power be exercised and constrained?). If this doesn''t map to a current pillar, say so instead of forcing a fit.'
where key = 'primary_pillar' and active;
