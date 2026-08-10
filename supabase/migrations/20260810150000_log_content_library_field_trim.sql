-- Log: content library field trim (2026-08-10) — a CLAUDE.md-prompted
-- review of what these two tables' columns are actually used for.
--
-- priority, frequency_guidance, reusable, geography_tags, subject_tags, and
-- reporter_or_editor were all captured on the content-item create/edit form
-- and echoed back on the library detail page's <dl>, but never read by any
-- filter, sort, or eligibility decision anywhere in the app or in a SQL
-- function (confirmed by inspection of lib/log/rundown-eligibility.ts,
-- lib/log/opportunity-assignments.ts, lib/log/rundown-generation.ts, and
-- every log_* SQL function that touches log_content_items) — decorative
-- metadata, not load-bearing.
--
-- dad_cart_number (on both log_content_items and log_content_components)
-- was captured the same way and was, if anything, worse off: it was never
-- even surfaced on the rundown/console screen where a host would actually
-- need to look up what to cue in ENCO/DAD — captured on a form but
-- functionally invisible at the one moment it would have mattered.
--
-- eligible_program_ids was the one field of the seven that was actually
-- load-bearing — lib/log/rundown-eligibility.ts used it to restrict a
-- content item to specific programs — but it goes too: there is no real
-- WUWF content that is only eligible on specific programs. Modeling that
-- restriction was a mistaken assumption from when the content library was
-- first built, not a real requirement, so filterEligibleContent/
-- isContentItemEligibleForSlot lost the check and the underlying column
-- goes with it.
--
-- community_issue_tags is untouched — not part of this review, and still
-- free text pending FCC Reporting's taxonomy per docs/log-design.md §6.

alter table public.log_content_items
  drop column eligible_program_ids,
  drop column priority,
  drop column frequency_guidance,
  drop column reusable,
  drop column geography_tags,
  drop column subject_tags,
  drop column reporter_or_editor,
  drop column dad_cart_number;

alter table public.log_content_components
  drop column dad_cart_number;
