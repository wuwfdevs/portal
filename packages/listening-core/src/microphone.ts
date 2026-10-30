// Why the microphone isn't available, and what to tell the participant about
// it. Pure and dependency-free so the reasoning — which is the part that was
// wrong — is testable without a browser.
//
// The distinction that matters: getUserMedia rejects with NotAllowedError both
// when a person clicks "Block" AND when the page is inside a frame that was
// never delegated microphone permission. They are completely different
// problems with completely different fixes, and the first version of this flow
// collapsed them into one message telling everybody to "allow it from the
// address bar" — advice that is useless in the second case, because the browser
// never showed a prompt and there is nothing in the address bar to change.
//
// That second case is the *likely* one inside an article embed: a cross-origin
// iframe gets no microphone access unless every ancestor frame delegates it
// with allow="microphone". A CMS that strips the attribute, or wraps our iframe
// in one of its own without it, breaks the chain — and nothing served from our
// origin can override that.

/**
 * Whether the embedding chain has granted this document microphone permission.
 *
 * `null` means "can't tell": only Chromium exposes a Permissions Policy
 * introspection API, so on Safari and Firefox this is genuinely unknown and the
 * messages below have to stay honest about that rather than guess.
 */
export function readMicrophonePolicy(doc: Document): boolean | null {
  const withPolicy = doc as Document & {
    featurePolicy?: { allowsFeature?: (feature: string) => boolean };
    permissionsPolicy?: { allowsFeature?: (feature: string) => boolean };
  };
  const policy = withPolicy.permissionsPolicy ?? withPolicy.featurePolicy;
  if (typeof policy?.allowsFeature !== "function") return null;

  try {
    return policy.allowsFeature("microphone");
  } catch {
    return null;
  }
}

export type MicrophoneBlock =
  /** The embedding page never delegated the microphone. Only a new tab fixes it. */
  | "blocked_by_embed"
  /** Framed, and we can't tell whether it's the embed or the person. */
  | "denied_in_frame"
  /** Top-level page: this really is the person (or their browser settings). */
  | "denied_by_user"
  /** Permission is fine; there's no microphone to use. */
  | "no_device"
  /** The browser can't record at all. */
  | "unsupported";

export interface MicrophoneGuidance {
  block: MicrophoneBlock;
  /** What went wrong, in one sentence, with no advice in it. */
  message: string;
  /** Whether offering "open in a new tab" is the honest primary action. */
  offerNewTab: boolean;
  /** Whether retrying in place could plausibly work. */
  offerRetry: boolean;
}

/**
 * Turns what the browser told us into what the participant should be told.
 *
 * `policyAllowsMicrophone` comes from readMicrophonePolicy() — pass null when
 * the browser doesn't expose it.
 */
export function deriveMicrophoneGuidance(params: {
  embedded: boolean;
  policyAllowsMicrophone: boolean | null;
  errorName: string;
}): MicrophoneGuidance {
  if (params.errorName === "NotFoundError" || params.errorName === "OverconstrainedError") {
    return {
      block: "no_device",
      message: "No microphone was found on this device.",
      offerNewTab: false,
      offerRetry: true,
    };
  }

  if (params.errorName === "NotSupportedError" || params.errorName === "SecurityError") {
    return {
      block: "unsupported",
      message: "This browser can't record audio on this page.",
      offerNewTab: params.embedded,
      offerRetry: false,
    };
  }

  // Definitive: the frame was never granted the permission, so no amount of
  // clicking in this page — or in the address bar — will change it.
  if (params.policyAllowsMicrophone === false) {
    return {
      block: "blocked_by_embed",
      message:
        "This article doesn't allow recording inside the page itself. Your browser never asked for permission — there's nothing to unblock here.",
      offerNewTab: true,
      offerRetry: false,
    };
  }

  if (params.embedded) {
    return {
      block: "denied_in_frame",
      message:
        "The microphone isn't available inside this article. That's usually the page's own settings rather than anything you did — opening this in its own tab almost always works.",
      offerNewTab: true,
      offerRetry: true,
    };
  }

  return {
    block: "denied_by_user",
    message:
      "Your browser blocked the microphone. Allow it from the address bar — usually a small icon at the left of the address — and try again.",
    offerNewTab: false,
    offerRetry: true,
  };
}

/**
 * Whether to skip the "Allow microphone access" button entirely and go straight
 * to the new-tab route.
 *
 * Pressing a button that provably cannot work, reading an error, and only then
 * being offered the thing that does work is three steps of wasted trust from
 * someone who was doing us a favour by responding at all.
 */
export function shouldSkipStraightToNewTab(params: {
  embedded: boolean;
  policyAllowsMicrophone: boolean | null;
}): boolean {
  return params.embedded && params.policyAllowsMicrophone === false;
}
