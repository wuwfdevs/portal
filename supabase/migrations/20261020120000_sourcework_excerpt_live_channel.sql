-- Excerpt loudness, second standard (Sourcework): -18 LUFS with a -6 dBFS hard limiter, and one-sided stereo.
--
-- The target moved from -24 LUFS (a distribution spec that played quiet on air) to the team's Audition
-- practice. Gain is still derived from the stored measurement in lib/sourcework/loudness.ts, so the new
-- target needs no backfill.
--
-- live_channel is new: a stereo clip with the voice in one channel and a silent other channel measures
-- about 3 dB low and drops about 6 dB summed to mono, so measuring, playback and export feed both sides from
-- the live channel. 0 = left, 1 = right, null = an ordinary clip (or not measured yet).
--
-- Existing excerpts have to be measured again to learn which of them are one-sided. Clearing
-- loudness_measured_at is the re-measure-on-open path: the excerpt reads already queue anything never
-- attempted for measuring after the response (queueLoudnessBackfill), and an export measures inline. Until
-- an excerpt's turn comes it keeps its stored loudness and plays at the new target.
--
-- Cached exports were rendered at -24 LUFS with no limiter, so they are un-cached; the next export or zip
-- renders them again (the object path is fixed and upserted, so nothing is orphaned).
--
-- No new policy: the existing sw_source_excerpts update policy already admits any tool member.

alter table public.sw_source_excerpts
  add column live_channel smallint;

alter table public.sw_source_excerpts
  add constraint sw_source_excerpts_live_channel_check
    check (live_channel in (0, 1));

comment on column public.sw_source_excerpts.live_channel is
  'For a stereo clip whose other channel is silent (more than 40 dB below): the channel with the audio, 0 = left, 1 = right. Fed to both sides when measuring, playing and exporting. Null = ordinary or not measured yet.';

update public.sw_source_excerpts
   set loudness_measured_at = null
 where locator_kind = 'temporal';

update public.sw_source_excerpts
   set export_storage_path = null,
       exported_at = null
 where locator_kind = 'temporal'
   and export_storage_path is not null;
