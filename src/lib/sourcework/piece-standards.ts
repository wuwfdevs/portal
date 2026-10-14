// What every model-written piece text shares: the limit on a reporter's direction, and the standards for
// accuracy and attribution that code owns. Outline and Write from outline both embed them, so the two cannot
// drift apart. How the narration is *worded* (tense of attribution, writing for the ear) is house style, which
// editors own as the "writing" prompt slot (prompts.ts), so it can be iterated on without a deploy. Pure.

export const DIRECTION_MAX = 1000;

/** The newsroom's standards for anything written for a piece. */
export const WRITING_STANDARDS = `Accuracy and attribution:
- Use only what the material says. Never invent a name, a number, a date, a place or anything a person said. When a sentence needs a fact the material does not give, write a short bracketed placeholder such as [CHECK: year the gap was closed] instead of guessing.
- Attribute what sources said. Findings are paraphrases, so do not present them as quotations.
- Name the speaker in the narration before each actuality: a listener cannot see who is talking.
- Complicating evidence is part of the story; do not leave it out to make the piece neater. Give the context a listener needs to judge a claim.`;
