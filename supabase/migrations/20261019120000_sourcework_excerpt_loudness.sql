-- Excerpt loudness (Sourcework): what an excerpt measures, and how it is levelled for playback and export.
--
-- Measured at creation and again after a trim (lib/transcription/loudness-measure.ts): gated integrated
-- loudness (LUFS) and true peak (dBTP) per BS.1770. The gain itself is never stored for auto mode — it
-- is derived from the measurement by lib/sourcework/loudness.ts, so the target can change without a
-- backfill. gain_mode 'auto' is the default; 'off' plays and exports the tape as recorded.
-- The source recording is untouched.
--
-- No new policy: the existing sw_source_excerpts update policy already admits any tool member, the
-- same trust model as trimming or renaming an excerpt.

alter table public.sw_source_excerpts
  add column loudness_lufs numeric(5, 1),
  add column true_peak_dbtp numeric(5, 1),
  add column loudness_measured_at timestamptz,
  add column gain_mode text not null default 'auto';

alter table public.sw_source_excerpts
  add constraint sw_source_excerpts_gain_mode_check
    check (gain_mode in ('auto', 'off'));

comment on column public.sw_source_excerpts.loudness_lufs is
  'Gated integrated loudness of this excerpt''s range (BS.1770, LUFS). Null until measured, when the audio is silent, or when it could not be read.';
comment on column public.sw_source_excerpts.true_peak_dbtp is
  'True peak of this excerpt''s range (dBTP). Set with loudness_lufs.';
comment on column public.sw_source_excerpts.loudness_measured_at is
  'When a measurement was last attempted, successful or not; null = never attempted (a trim does not clear it, the remeasure overwrites it).';
comment on column public.sw_source_excerpts.gain_mode is
  'auto = gain derived from the measurement toward the broadcast target; off = as recorded.';
