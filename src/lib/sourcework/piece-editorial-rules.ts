// The newsroom's standards for a radio piece, in one place (docs/sourcework-analysis-design.md
// §6.3, §6.4). Draft with AI (piece-draft-prompt.ts) and the in-portal assistant working in a
// piece (piece-assistant-prompt.ts) both read these, so a sentence the assistant writes or
// rewrites is held to the bar a drafted one is — they used to diverge, and the assistant's edits
// showed it. Nothing here refers to excerpt numbers, ids or block kinds: those belong to whichever
// prompt owns the tool or schema. Pure.

export const PIECE_ACCURACY_RULES = `Accuracy and attribution:
- Use only what the material says. Never invent a name, a number, a date, a place, a cause or anything a person said. When a sentence needs a fact the material does not give, write a short bracketed placeholder such as [CHECK: year the gap was closed] instead of guessing.
- Attribute what sources said ("he says", "she remembers"), to the person or office that said it. Data points are paraphrases, so do not present them as quotations.
- When sources differ, or only one of them says something, give each claim to whoever made it and let the difference stand. Do not blend them into one unattributed summary ("officials say…"), and do not escalate: one reported death is not "deaths", and something one source has not confirmed does not become confirmed because another source mentioned it.
- Complicating evidence is part of the story; do not leave it out to make the piece neater. Give the context a listener needs to judge a claim.
- Keep one account of the facts across the whole piece. What the opening claims, what the lead-ins say and what the close says must agree.`;

export const PIECE_CLIP_RULES = `Choosing and introducing actualities:
- Use a clip for what narration can't do: an experience, a feeling, an opinion, an explanation in the speaker's own voice. Facts, figures and dates belong in the narration. A clip that is mostly a list of figures is poor radio: say the headline figure yourself and leave the clip out, or choose a better one.
- A clip must make sense on its own and say something the narration doesn't repeat.
- A listener cannot see who is talking. Narration right before each actuality names the speaker and gives the one thing that makes them worth hearing: a title, a role, where they were. That lead-in says who and why, never what. Do not preview or summarize the clip, and do not use vague verbs such as "described", "explained", "talked about", "weighed in" or "put in context". Good: "Jim Ortiz runs the county's emergency management office." Poor: "Ortiz described how the response is going."
- Name a speaker with their title the first time, and by surname afterward.
- The format's actuality count is a usual range, not a quota. Use fewer when fewer clips earn their place; a strong short piece may use one, a voicer none. Do not pad with a weaker clip to reach a number, and do not require a different speaker for each clip. If the material has no clip worth placing, place none.
- Keep clips short. Most radio actualities run 8 to 20 seconds; one past about 30 seconds has to be exceptional, and clips together should not fill much more than half of the piece unless the format's style says otherwise.`;

export const PIECE_EAR_RULES = `Writing for the ear:
- Short sentences, one idea each, in plain spoken language that can be read aloud in one breath. Put the attribution first ("the mayor says the plan will cost...").
- Use the present tense for what is true now and for what someone says; use the past only for events that are over. Do not slide between the two inside a block.
- The reporter's first words lead with the newest or most important fact, attributed, in the reporter's own voice. Do not hand the strongest fact to a clip, and open with the reporter rather than a clip unless the format's style asks for a cold open.
- A narration block is a few sentences, not a paragraph: past about 60 words, split it or cut it. The close says where things stand in a few short sentences and signs off; it is not a place to list what did not fit earlier. Fold what matters into the body and leave the rest out.`;

/** All three, for a prompt that holds the whole standard. */
export const PIECE_EDITORIAL_RULES = [PIECE_ACCURACY_RULES, PIECE_CLIP_RULES, PIECE_EAR_RULES].join(
  "\n\n",
);
