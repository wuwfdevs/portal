-- Sourcework piece formats become guardrails, not block outlines.
--
-- A format's spec (lib/sourcework/piece-formats.ts) used to carry an ordered `sections` list, which
-- prescribed the block structure of every draft. It now carries `anchorIntro` (whether an anchor reads a lead-in), alongside the target length,
-- tolerance, actuality range and style. The model assembles the narration and actualities freely.
--
-- Stored versions are insert-only and are not rewritten: readFormatSpec reads an old `sections`
-- list as a description (the sections' guidance joined) plus an anchor flag. This migration gives
-- the five built-in formats proper descriptions as a new version each, through the same path
-- Publish takes. A format an editor has changed (any version with an author) is left alone.

do $migration$
declare
  def jsonb;
  f_id uuid;
  v_next integer;
  v_id uuid;
  defs jsonb := $defs$[
    {
      "name": "Reader / Voicer",
      "spec": {
        "targetSeconds": 38, "toleranceSeconds": 8, "minActualities": 0, "maxActualities": 0,
        "anchorIntro": true,
        "style": "Spoken copy with no recorded excerpts: a reader is read by the anchor, a voicer by the reporter. Lead with the newest fact and where it happened, give a listener the context to make sense of it, attributed to the people who said it, and end on what happens next or the last fact. A voicer ends with the sign-off, leaving [REPORTER NAME] as a placeholder. When a reporter voices the story, an anchor intro of one or two sentences sets it up without repeating the reporter's first line. Short sentences, one idea each, attribution first (\"the mayor says...\"). Present tense where it reads naturally. Attribute what sources said in your own words rather than quoting at length. Do not use an adjective the speaker did not use, and never tell the audience what to feel."
      }
    },
    {
      "name": "Cut and Copy",
      "spec": {
        "targetSeconds": 45, "toleranceSeconds": 5, "minActualities": 1, "maxActualities": 1,
        "anchorIntro": false,
        "style": "Copy an anchor reads cold, with one cut in it. The copy gives the news in a sentence or two and ends by naming who we hear next and why; the cut is one clear, self-contained thought, ideally under 20 seconds; a closing sentence after the cut can add a fact or what happens next. The whole thing is timed together. Name the speaker before the cut, never only after it. Do not say in the copy what the cut says. Short sentences, plain words, no adjective the speaker did not use."
      }
    },
    {
      "name": "Wrap",
      "spec": {
        "targetSeconds": 53, "toleranceSeconds": 8, "minActualities": 1, "maxActualities": 2,
        "anchorIntro": true,
        "style": "A reporter's voiced story with tape wrapped inside it. It sets up the news and the place, lets a voice carry what narration can't (an experience, a feeling, an explanation in the speaker's own words), supplies the facts and any complication or other side, and closes on the last fact or what happens next with the reporter's sign-off, leaving [REPORTER NAME] as a placeholder. A second clip belongs only if it adds something the first did not. An anchor intro of one or two sentences sets the story up without repeating the reporter's first line. Plain and factual, present tense where it reads naturally, attribution first. Name the speaker before each clip. Do not use an adjective the speaker did not use, and never tell the audience what to feel. Short enough to read in one breath."
      }
    },
    {
      "name": "Super Spot",
      "spec": {
        "targetSeconds": 120, "toleranceSeconds": 10, "minActualities": 1, "maxActualities": 3,
        "anchorIntro": true,
        "style": "A short report with room to develop one idea. It opens with the news or a specific scene that puts the listener in the story, hears from the people who lived it or can speak to it directly, gives the context and the facts a listener needs to judge the claims, includes the complication or other side when the material has one, and closes with where things stand and the sign-off. Each voice should move the story forward or complicate it, not repeat an earlier one. An anchor intro of two or three sentences ends by naming the reporter as [REPORTER NAME]. Write for the ear: one idea per sentence, present tense where it reads naturally, and attribute every claim. Let the clips carry the feeling and the narration carry the facts. Complicating evidence belongs in the story. Do not use an adjective the speaker did not use."
      }
    },
    {
      "name": "Feature",
      "spec": {
        "targetSeconds": 240, "toleranceSeconds": 30, "minActualities": 2, "maxActualities": 6,
        "anchorIntro": true,
        "style": "A fully reported piece with room for several voices and a shape of its own. It opens on a specific scene or the strongest fact, says why it matters now and what the piece will look at, develops the story with the history, the facts and the context from the accepted themes, brings in voices where each earns its place (one person can be heard more than once if that is the strongest material), includes the complication, the other side or what changed, and closes with where things stand and the sign-off. An anchor intro of two or three sentences a host reads ends by naming the reporter as [REPORTER NAME]. Write for the ear: one idea per sentence, present tense where it reads naturally, and attribute every claim. The clips carry the feeling and the narration the facts. Vary the rhythm. Complicating evidence is part of the story. Do not use an adjective the speaker did not use."
      }
    }
  ]$defs$::jsonb;
begin
  for def in select * from jsonb_array_elements(defs) loop
    select id into f_id from public.sw_piece_formats where lower(btrim(name)) = lower(def->>'name');
    if f_id is null then continue; end if;
    -- An editor has already changed it; their wording stays.
    if exists (
      select 1 from public.sw_piece_format_versions where format_id = f_id and created_by is not null
    ) then
      continue;
    end if;

    select coalesce(max(version), 0) + 1 into v_next
      from public.sw_piece_format_versions where format_id = f_id;
    insert into public.sw_piece_format_versions (format_id, version, spec, note)
    values (f_id, v_next, def->'spec', 'Description and guardrails replace the ordered sections')
    returning id into v_id;

    update public.sw_piece_formats
       set live_version_id = v_id, live_moved_at = now()
     where id = f_id;
  end loop;
end
$migration$;
