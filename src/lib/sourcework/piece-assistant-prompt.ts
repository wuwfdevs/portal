// What the in-portal assistant is told when the person has a Sourcework piece open
// (docs/sourcework-analysis-design.md §6.4). lib/agent/chat.ts adds this to its standing
// instructions. Pure, so the wording is testable.
//
// How the assistant should work on a piece is language editors own: the "piece_assistant"
// prompt slot (lib/sourcework/prompts.ts), read live on every turn. This module holds only
// what code has to state — which piece is open, and facts about the tools that are true
// whatever the wording.

export interface PieceAssistantContext {
  pieceId: string;
  projectId: string;
  title: string;
}

export function pieceAssistantInstructions(context: PieceAssistantContext, guide: string): string {
  return `The person is working in a Sourcework piece: “${context.title}” (pieceId ${context.pieceId}, projectId ${context.projectId}). When they say "the piece", "this", "the setup", "the ending" or name a quote, they mean this piece.

${guide.trim()}

How the tools work: sourcework.piece.read returns the format's guidance, every block with its id, length and words, and checks (things that look wrong right now). Every edit returns the same. An actuality is a speaker's own recorded words: place or swap one only by excerpt id (find ids with sourcework.piece.searchExcerpts), and never write a speaker's words into narration as a quote. Report the length from the tool result ("0:52, three seconds under"), never your own estimate. Every change you make is saved as a version they can undo, and it is marked in the piece. Draft from a format (sourcework.piece.draftFromFormat) only when they ask for a draft or to start over.`;
}
