-- Sourcework piece formats: a catalog that follows newsroom conventions.
--
-- The four formats seeded with Phase E (Radio wrap, Voicer, Script, Cut and copy) are replaced
-- by the five a public radio newsroom actually files in: Reader / Voicer, Cut and Copy, Wrap,
-- Super Spot and Feature. A spot is a category, not a template, and two-ways, interviews and
-- other techniques are deliberately not formats yet.
--
-- What changed in the spec (lib/sourcework/piece-formats.ts), all backwards compatible with
-- stored versions:
--   * a section may be "anchor": the anchor's lead-in to a reporter's recorded piece, kept out
--     of the piece's timed length (a reader or a cut and copy is timed as a whole, so it has none);
--   * a section may be "optional": a tag, a second voice, a sign-off the material doesn't call for;
--   * the actuality range is a usual range, not a quota.
-- Narration blocks gain an optional role ("anchor") in the piece body, which pieces.ts parses
-- and sw_pieces/sw_piece_versions treat as opaque jsonb, so no schema change is needed for it.
--
-- Existing rows are kept, never deleted: a format is renamed and given a new version through
-- the same path an editor's Publish takes, so History shows v1 (built in) then v2 (this
-- change). Only a format nobody has edited is touched (every version has no author); a format
-- an editor has changed is left exactly as they left it. Super Spot is new.

do $migration$
declare
  def jsonb;
  f_id uuid;
  v_next integer;
  v_id uuid;
  defs jsonb := $defs$[
    {
      "old": "Voicer", "name": "Reader / Voicer", "position": 1,
      "spec": {
        "targetSeconds": 38, "toleranceSeconds": 8, "minActualities": 0, "maxActualities": 0,
        "sections": [
          {"type": "anchor", "optional": true, "guidance": "Anchor intro, only when a reporter voices the story: one or two sentences with the newest fact, setting it up without repeating the reporter's first line."},
          {"type": "narration", "guidance": "Lead: the newest fact and where it happened, in one sentence."},
          {"type": "narration", "guidance": "Context: what a listener needs to make sense of it, attributed to the people who said it."},
          {"type": "narration", "optional": true, "guidance": "What happens next. A voicer ends with the sign-off, leaving [REPORTER NAME] as a placeholder; a reader just ends on its last fact."}
        ],
        "style": "Spoken copy with no recorded excerpts, read by the anchor (a reader) or the reporter (a voicer). Short sentences, one idea each, attribution first (\"the mayor says...\"). Present tense where it reads naturally. Attribute what sources said in your own words rather than quoting at length. Do not use an adjective the speaker did not use, and never tell the audience what to feel."
      }
    },
    {
      "old": "Cut and copy", "name": "Cut and Copy", "position": 2,
      "spec": {
        "targetSeconds": 45, "toleranceSeconds": 5, "minActualities": 1, "maxActualities": 1,
        "sections": [
          {"type": "narration", "guidance": "Anchor copy: the news in one or two sentences, ending by naming who we hear next and why."},
          {"type": "actuality", "guidance": "The cut: one clear, self-contained thought, ideally under 20 seconds."},
          {"type": "narration", "optional": true, "guidance": "Tag: one sentence after the cut with a fact or what happens next."}
        ],
        "style": "Written for an anchor to read cold, and timed as a whole: the copy, the cut and the tag. Name the speaker before the cut, never only after it. Do not say in the copy what the cut says. Short sentences, plain words, no adjective the speaker did not use."
      }
    },
    {
      "old": "Radio wrap", "name": "Wrap", "position": 3,
      "spec": {
        "targetSeconds": 53, "toleranceSeconds": 8, "minActualities": 1, "maxActualities": 2,
        "sections": [
          {"type": "anchor", "optional": true, "guidance": "Anchor intro: one or two sentences with the newest fact, setting up the story. It is not timed with the piece, and should not repeat the reporter's first line."},
          {"type": "narration", "guidance": "Setup: the news and the place in a sentence or two, then who we hear."},
          {"type": "actuality", "guidance": "Voice: the strongest moment, one the narration can't give: an experience, a feeling, an explanation in the speaker's own words."},
          {"type": "narration", "guidance": "Context and turn: the facts a listener needs, and the complication or other side if the material has one."},
          {"type": "actuality", "optional": true, "guidance": "A second clip, only if it adds something the first did not: another view, a complication, the human stakes."},
          {"type": "narration", "guidance": "Close and sign-off: the last fact or what happens next, then [REPORTER NAME] as a placeholder. Not a summary."}
        ],
        "style": "A reporter's voiced story with tape wrapped inside it. Plain and factual, present tense where it reads naturally, attribution first. Name the speaker before each clip. Do not use an adjective the speaker did not use, and never tell the audience what to feel. Short enough to read in one breath."
      }
    },
    {
      "old": null, "name": "Super Spot", "position": 4,
      "spec": {
        "targetSeconds": 120, "toleranceSeconds": 10, "minActualities": 1, "maxActualities": 3,
        "sections": [
          {"type": "anchor", "optional": true, "guidance": "Anchor intro: two or three sentences setting up the story, ending by naming the reporter as [REPORTER NAME]. Not timed with the piece."},
          {"type": "narration", "guidance": "Lead: the news, or a specific scene that puts the listener in the story, in the fewest words that work."},
          {"type": "actuality", "guidance": "First voice: someone who lived it or can speak to it directly."},
          {"type": "narration", "guidance": "Context: what happened before, the numbers and the facts a listener needs to judge the claims, from the accepted themes."},
          {"type": "actuality", "optional": true, "guidance": "Another voice, if it moves the story forward or complicates it."},
          {"type": "narration", "optional": true, "guidance": "The other side, the complication, or what changed."},
          {"type": "actuality", "optional": true, "guidance": "A third voice, only if it is not saying what an earlier one did."},
          {"type": "narration", "guidance": "Close: where things stand and what comes next, then the sign-off."}
        ],
        "style": "A short report with room to develop one idea. Write for the ear: one idea per sentence, present tense where it reads naturally, and attribute every claim. Let the clips carry the feeling and the narration carry the facts. Complicating evidence belongs in the story. Do not use an adjective the speaker did not use."
      }
    },
    {
      "old": "Script", "name": "Feature", "position": 5,
      "spec": {
        "targetSeconds": 240, "toleranceSeconds": 30, "minActualities": 2, "maxActualities": 6,
        "sections": [
          {"type": "anchor", "optional": true, "guidance": "Anchor intro: two or three sentences a host reads, ending by naming the reporter as [REPORTER NAME]. Not timed with the piece."},
          {"type": "narration", "guidance": "Opening: a specific scene, or the strongest fact, from what the sources describe."},
          {"type": "actuality", "guidance": "First voice: someone who lived it."},
          {"type": "narration", "guidance": "Why it matters now, and what the piece will look at, in a sentence or two."},
          {"type": "actuality", "guidance": "A second voice that adds to the first, or sees it differently."},
          {"type": "narration", "guidance": "Body: develop the story with the history, the facts and the context from the accepted themes. Bring in further voices where each one earns its place; the story decides how the narration and clips alternate."},
          {"type": "actuality", "optional": true, "guidance": "More voices, as the story needs them. One person can be heard more than once if that is the strongest material."},
          {"type": "narration", "optional": true, "guidance": "The complication, the other side, or what changed."},
          {"type": "narration", "guidance": "Close: where things stand now, then the sign-off."}
        ],
        "style": "A fully reported piece, with room for several voices and a shape of its own. Write for the ear: one idea per sentence, present tense where it reads naturally, and attribute every claim. The clips carry the feeling and the narration the facts. Vary the rhythm; do not alternate narration and clips mechanically. Complicating evidence is part of the story. Do not use an adjective the speaker did not use."
      }
    }
  ]$defs$::jsonb;
begin
  for def in select * from jsonb_array_elements(defs) loop
    f_id := null;
    if def->>'old' is not null then
      select id into f_id from public.sw_piece_formats where name = def->>'old';
    end if;
    if f_id is null then
      select id into f_id from public.sw_piece_formats where lower(btrim(name)) = lower(def->>'name');
    end if;

    if f_id is null then
      insert into public.sw_piece_formats (name, position) values (def->>'name', (def->>'position')::int)
        returning id into f_id;
    elsif exists (
      select 1 from public.sw_piece_format_versions where format_id = f_id and created_by is not null
    ) then
      -- An editor has already changed it; their wording stays.
      continue;
    end if;

    select coalesce(max(version), 0) + 1 into v_next
      from public.sw_piece_format_versions where format_id = f_id;
    insert into public.sw_piece_format_versions (format_id, version, spec, note)
    values (
      f_id, v_next, def->'spec',
      case when v_next = 1 then 'Built-in starting point' else 'Catalog revised to the five newsroom formats' end
    )
    returning id into v_id;

    update public.sw_piece_formats
       set name = def->>'name',
           position = (def->>'position')::int,
           live_version_id = v_id,
           live_moved_at = now()
     where id = f_id;
  end loop;
end
$migration$;
