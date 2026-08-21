-- Replaces 20260821160000's documented approximation of the ATC furniture
-- between Segment B and the Return with WUWF's direct account:
--
--   Promo      29:00–29:30  (Morning Edition promo)
--   Music Bed  29:30–30:00
--   Return     30:00–30:30  (already correct)
--
-- There is no music bed between Segment B's end (~28:59) and the promo —
-- the 16-second one the approximation kept is deleted outright, and the
-- ~1-second gap left between B and the promo is the same rounding noise
-- every one of these clocks' own PDFs shows (see 20260807120000's header).
--
-- Between the junction fix and this correction, production gained local
-- opportunities across the whole ATC clock (marked 2026-08-21) and one
-- generated ATC rundown whose breaks reference them — including the
-- doomed music-bed slot's, which blocked the slot delete via
-- log_rundown_breaks' FK on this file's first production attempt. Every
-- one of those breaks was empty (zero rundown items, confirmed directly),
-- and the ones on the four slots this file and 20260821160000 moved
-- carried now-wrong scheduled_at/duration snapshots — so the breaks on
-- those four slots' opportunities are deleted first (guarded to
-- still-empty breaks only), letting the doomed slot's cascade proceed;
-- the surviving three can be re-created with fresh, correct snapshots via
-- the rundown screen's "Sync them in now". Preview reached this file's
-- end state on its first application (it had no ATC breaks), so the
-- cleanup statements are no-ops there.

delete from public.log_rundown_breaks b
using public.log_local_opportunities o,
      public.log_clock_slots s,
      public.log_clock_versions v,
      public.log_clock_templates t
where b.local_opportunity_id = o.id
  and o.slot_id = s.id
  and s.clock_version_id = v.id
  and v.clock_template_id = t.id
  and t.name = 'All Things Considered'
  and (s.label = 'Music Bed' and s.start_offset_seconds in (1080, 1739, 1785)
       or s.label like 'Promo%' and s.start_offset_seconds = 1755)
  and not exists (select 1 from public.log_rundown_items i where i.break_id = b.id);

delete from public.log_clock_slots s
using public.log_clock_versions v
join public.log_clock_templates t on t.id = v.clock_template_id
where s.clock_version_id = v.id
  and t.name = 'All Things Considered'
  and s.label = 'Music Bed'
  and s.start_offset_seconds = 1739;

update public.log_clock_slots s
set start_offset_seconds = 1740
from public.log_clock_versions v
join public.log_clock_templates t on t.id = v.clock_template_id
where s.clock_version_id = v.id
  and t.name = 'All Things Considered'
  and s.label like 'Promo%'
  and s.start_offset_seconds = 1755;

update public.log_clock_slots s
set start_offset_seconds = 1770, duration_seconds = 30
from public.log_clock_versions v
join public.log_clock_templates t on t.id = v.clock_template_id
where s.clock_version_id = v.id
  and t.name = 'All Things Considered'
  and s.label = 'Music Bed'
  and s.start_offset_seconds = 1785;
