import "server-only";
import OpenAI from "openai";

/**
 * Maps an OpenAI SDK failure to a message a newsroom user can act on. The
 * SDK's own rate-limit message is a raw dump (org id, exact token counts, a
 * billing URL) that reached reporters verbatim through the editorial-turn and
 * agent-chat error paths — confirmed by a real 429 against the org's 100k
 * token cap. The provider's "try again in …" hint is the one genuinely
 * useful part, so it's kept when present. Everything else falls through
 * unchanged.
 *
 * The match is NOT just `instanceof RateLimitError`: that subclass only
 * exists for a real HTTP 429, and a streaming call (responses.stream())
 * returns HTTP 200 and delivers the failure as an in-stream error event,
 * which the SDK wraps as a plain APIError with `status: undefined` and
 * `code: "rate_limit_exceeded"` — confirmed in the production Vercel logs
 * when the first version of this check silently missed exactly that shape.
 */
function isRateLimit(error: unknown): boolean {
  if (error instanceof OpenAI.RateLimitError) return true;
  if (error instanceof OpenAI.APIError) {
    const nestedCode = (error.error as { code?: string } | undefined)?.code;
    return (
      error.status === 429 ||
      error.code === "rate_limit_exceeded" ||
      nestedCode === "rate_limit_exceeded"
    );
  }
  return false;
}

export function humanizeOpenAIError(error: unknown): Error {
  if (isRateLimit(error) && error instanceof Error) {
    const retryHint = /try again in ([^.]+?)\.(?:\s|$)/i.exec(error.message)?.[1];
    return new Error(
      `The AI provider's usage limit was hit — it suggests trying again in ${retryHint ?? "a little while"}. ` +
        "This is the shared OpenAI account's token cap, not a portal problem; if it keeps happening, the account's rate limit needs raising on platform.openai.com.",
    );
  }
  return error instanceof Error ? error : new Error("The assistant failed to respond.");
}
