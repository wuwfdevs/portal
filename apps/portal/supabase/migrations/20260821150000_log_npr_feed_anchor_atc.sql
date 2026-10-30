-- Records All Things Considered's NPR feed anchor, confirmed by the second
-- official Rundowns App document WUWF supplied (ATC, 2026-08-21): it labels
-- 4:00 PM ET "HR1" and 5:00 PM ET "HR2", so the feed's first episode hour
-- starts at 16:00 Eastern. WUWF airs ATC at 3:00 PM Central (= 4:00 PM ET),
-- so the derived episode-hour offset is 0 — the same result the null
-- fallback already produced — but the anchor is recorded now that a source
-- document confirms it, so a future schedule change can't silently
-- invalidate the assumption. The remaining multi-hour programs (1A,
-- Here & Now, Weekend Edition) stay null pending their own confirming
-- documents; all currently air from their feed's start hour, where the
-- null fallback is correct.
--
-- The same ATC document also confirmed the seeded ATC clock's segments
-- A/C/D/E to the second, and exposed one seed nit NOT fixed here: our
-- Segment B starts at 20:00 where the rundown shows 20:35. The document
-- doesn't show the network furniture between 20:00 and 20:35, so a safe
-- correction needs the ATC clock PDF re-checked (see the clock-seed
-- correction history for the process), not a blind single-slot edit.

update public.log_programs
  set npr_feed_start_hour_et = 16
  where name = 'All Things Considered';
