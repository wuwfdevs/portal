-- Cuts the long speaker turns of transcripts made before paragraph-sized segments into the same
-- paragraphs new transcripts get (src/lib/transcription/paragraphs.ts, called by the transcription
-- webhook). The prefix continues the sequence past 20261104140000; see 20261103120000's header on
-- why a prefix is a sequence number, not a date.
--
-- Data only; no schema. This is the SQL twin of splitUtteranceIntoParagraphs() — keep the two in
-- step if either rule changes. A segment is cut when it is a transcript line nobody has edited
-- (text_edited = false), its words still line up with its text token for token, and it is longer
-- than the minimum paragraph. An edited line is left whole: its word timings are no longer the
-- ASR's, so a cut there would be a guess. Each piece keeps the speaker; the first piece keeps the
-- original row (and so its id), the rest are new rows placed right after it. Excerpts, data points
-- and suggestions point at times, never at segment ids, so none of them moves. The
-- tw_segments_flag_chunks trigger marks the search chunks stale; "Rebuild search index" on a source
-- picks them up.
--
-- Safe to run twice: a second run finds no unedited segment long enough to cut.

do $backfill$
declare
  seg record;
  wj jsonb;
  n int;
  i int;
  g int;
  k int;
  toks text[];
  starts int[];
  pstart int;
  elapsed int;
  gap int;
  is_sentence_end boolean;
  must_break boolean;
  first_i int;
  last_i int;
  ps int;
  pe int;
  valid boolean;
begin
  for seg in
    select id, representation_id, speaker_id, position, start_ms, end_ms, text, words
    from public.tw_segments
    where not text_edited
      and end_ms - start_ms > 10000
    order by representation_id, position desc
  loop
    wj := seg.words;
    n := jsonb_array_length(wj);
    toks := regexp_split_to_array(btrim(seg.text), '\s+');
    continue when n < 2 or array_length(toks, 1) <> n;

    starts := array[0];
    pstart := seg.start_ms;
    for i in 0 .. n - 2 loop
      elapsed := (wj -> i ->> 'e')::int - pstart;
      gap := (wj -> (i + 1) ->> 's')::int - (wj -> i ->> 'e')::int;
      is_sentence_end := (wj -> i ->> 'w') ~ '[.!?][]"''”’)]*$';
      must_break :=
        (elapsed >= 75000 and (is_sentence_end or gap >= 400))
        or (is_sentence_end and (elapsed >= 30000 or (elapsed >= 10000 and gap >= 1500)));
      if must_break then
        starts := starts || (i + 1);
        pstart := (wj -> (i + 1) ->> 's')::int;
      end if;
    end loop;

    k := array_length(starts, 1);
    continue when k < 2;

    -- Every piece needs a positive length (tw_segments_time_range_check).
    valid := true;
    for g in 1 .. k loop
      first_i := starts[g];
      last_i := case when g < k then starts[g + 1] - 1 else n - 1 end;
      ps := case when g = 1 then seg.start_ms else (wj -> first_i ->> 's')::int end;
      pe := case when g = k then seg.end_ms else (wj -> last_i ->> 'e')::int end;
      if pe <= ps then
        valid := false;
      end if;
    end loop;
    continue when not valid;

    update public.tw_segments
    set position = position + (k - 1)
    where representation_id = seg.representation_id
      and position > seg.position;

    for g in 1 .. k loop
      first_i := starts[g];
      last_i := case when g < k then starts[g + 1] - 1 else n - 1 end;
      ps := case when g = 1 then seg.start_ms else (wj -> first_i ->> 's')::int end;
      pe := case when g = k then seg.end_ms else (wj -> last_i ->> 'e')::int end;

      if g = 1 then
        update public.tw_segments
        set end_ms = pe,
            text = array_to_string(toks[first_i + 1 : last_i + 1], ' '),
            words = (
              select jsonb_agg(elem order by ord)
              from jsonb_array_elements(wj) with ordinality as t(elem, ord)
              where ord between first_i + 1 and last_i + 1
            )
        where id = seg.id;
      else
        insert into public.tw_segments
          (representation_id, speaker_id, position, start_ms, end_ms, text, words, text_edited)
        values (
          seg.representation_id,
          seg.speaker_id,
          seg.position + g - 1,
          ps,
          pe,
          array_to_string(toks[first_i + 1 : last_i + 1], ' '),
          (
            select jsonb_agg(elem order by ord)
            from jsonb_array_elements(wj) with ordinality as t(elem, ord)
            where ord between first_i + 1 and last_i + 1
          ),
          false
        );
      end if;
    end loop;
  end loop;
end
$backfill$;
