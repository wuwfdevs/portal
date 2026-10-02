-- Resources content for DAD cuts on underwriting copy (CLAUDE.md,
-- "Resources stay in step with the code"). Content only; the schema changes
-- are 20261002120000 and 20261002120100.

select private.rc_release_guide(
  p_slug => 'underwriting-copy-in-dad',
  p_tool_key => 'underwriting',
  p_title => 'Copy in DAD',
  p_summary => 'Each message''s DAD cut: the number to record it under, or the existing DAD spot it plays.',
  p_screen_keys => array['underwriting.copy'],
  p_sort_order => 35,
  p_version_note => 'DAD cuts on copy',
  p_body => $body${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Every message on file has a DAD cut: the number DAD plays it from. A recorded spot plays its recording. A live read is read by the host when someone is on air, and DAD plays its recorded version in hours with no host."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"New recording"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"A new message gets the next free cut when you save it, in the form "},{"type":"text","text":"00548A","marks":[{"type":"bold"}]},{"type":"text","text":". Record the message into DAD under that number."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Messages that were on file before cuts existed kept their old number where only one current message used it, so Loyalty Credit Union's copy 1 is "},{"type":"text","text":"00013A","marks":[{"type":"bold"}]},{"type":"text","text":"."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"To use another number, choose "},{"type":"text","text":"Use a different cut","marks":[{"type":"bold"}]},{"type":"text","text":" on the copy's edit page. A cut belongs to one message, so a number already in use is refused."}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Existing DAD spot"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Some copy asks the host to play a spot that's already in DAD, such as a Learning Minute in the PPA group. Choose "},{"type":"text","text":"Existing DAD spot","marks":[{"type":"bold"}]},{"type":"text","text":" and search DAD's library by cut number or title."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Copy like this starts without a cut. It shows "},{"type":"text","text":"Pick a DAD spot","marks":[{"type":"bold"}]},{"type":"text","text":" in the copy library, and the "},{"type":"text","text":"Needs a DAD cut","marks":[{"type":"bold"}]},{"type":"text","text":" filter lists every message still waiting."}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Good to know"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"The copy page's "},{"type":"text","text":"Copy","marks":[{"type":"bold"}]},{"type":"text","text":" button puts the cut on the clipboard for pasting into DAD."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"On the rundown, a recorded spot shows the cut the host fires. A live read shows no cut."}]}]}]}]}$body$
);

select private.rc_release_note(
  p_slug => 'release-2026-10-02-underwriting-copy-dad-cuts',
  p_tool_key => 'underwriting',
  p_released_on => '2026-10-02',
  p_title => 'Copy has a DAD cut',
  p_guide_slugs => array['underwriting-copy-in-dad'],
  p_body => $body${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Every underwriting message now has a DAD cut, shown on its copy page and in the copy library, so it can be recorded into DAD and played when no one is on air. Copy that plays a spot already in DAD asks you to pick that spot. Copy imported from program logs is labeled a live read unless its script asks the host to play a recorded spot."}]}]}$body$
);
