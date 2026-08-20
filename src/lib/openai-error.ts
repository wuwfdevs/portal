import "server-only";
import OpenAI from "openai";

/**
 * Maps an OpenAI SDK failure to a message a newsroom user can act on. The
 * SDK's own rate-limit message is a raw dump (org id, exact token counts, a
 * billing URL) that reached reporters verbatim through the editorial-turn and
 * agent-chat error paths — confirmed by a real 429 against the org's 100k
 * tokens-per-minute cap. The provider's "try again in …" hint is the one
 * genuinely useful part, so it's kept when present. Everything else falls
 * through unchanged.
 */
export function humanizeOpenAIError(error: unknown): Error {
  if (error instanceof OpenAI.RateLimitError) {
    const retryHint = /try again in ([^.]+?)\.(?:\s|$)/i.exec(error.message)?.[1];
    return new Error(
      `The AI provider's usage limit was hit — it suggests trying again in ${retryHint ?? "a little while"}. ` +
        "This is the shared OpenAI account's per-minute token cap, not a portal problem; if it keeps happening, the account's rate limit needs raising on platform.openai.com.",
    );
  }
  return error instanceof Error ? error : new Error("The assistant failed to respond.");
}
