import "server-only";
import {
  EXCERPT_TITLE_FRAMING,
  buildExcerptTitleSchema,
  cleanProposedTitle,
  suggestExcerptTitle,
} from "@/lib/transcription/excerpt-title";
import { callStructuredModel } from "./extraction-ai";

// A short descriptive title for a new excerpt (it becomes the quote id in the exported file name).
// Optional like every model call here: with no OPENAI_API_KEY, or on any failure, the title is the
// first words of the excerpt, as it was before, and nothing is surfaced as an error.

/** The longest stretch of an excerpt the model reads; a title never needs more. */
const MAX_INPUT_CHARS = 2000;

export async function proposeExcerptTitle(excerptText: string): Promise<string> {
  const fallback = suggestExcerptTitle(excerptText);
  const text = excerptText.replace(/\s+/g, " ").trim();
  if (!text) return fallback;
  try {
    const result = await callStructuredModel({
      step: "excerpt title",
      schemaName: "excerpt_title",
      schema: buildExcerptTitleSchema(),
      framing: EXCERPT_TITLE_FRAMING,
      guide: "",
      input: text.slice(0, MAX_INPUT_CHARS),
      effort: "low",
      maxOutputTokens: 2000,
    });
    return result.ok ? cleanProposedTitle(result.text, fallback) : fallback;
  } catch (error) {
    console.error("Could not propose an excerpt title:", error);
    return fallback;
  }
}
