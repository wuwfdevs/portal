import { describe, expect, it } from "vitest";
import {
  deriveMicrophoneGuidance,
  readMicrophonePolicy,
  shouldSkipStraightToNewTab,
} from "./microphone";

function guidance(params: {
  embedded?: boolean;
  policyAllowsMicrophone?: boolean | null;
  errorName?: string;
}) {
  return deriveMicrophoneGuidance({
    embedded: params.embedded ?? false,
    policyAllowsMicrophone: params.policyAllowsMicrophone ?? null,
    errorName: params.errorName ?? "NotAllowedError",
  });
}

describe("deriveMicrophoneGuidance", () => {
  // The bug this module exists to fix: a Grove embed that never delegated the
  // microphone produced "allow it from the address bar", which cannot work —
  // the browser never prompted, so there is nothing there to allow.
  it("never sends someone to the address bar when the embed is what blocked it", () => {
    const result = guidance({ embedded: true, policyAllowsMicrophone: false });
    expect(result.block).toBe("blocked_by_embed");
    expect(result.message).not.toMatch(/address bar/i);
    expect(result.offerNewTab).toBe(true);
    expect(result.offerRetry).toBe(false);
  });

  it("says plainly that the participant did nothing wrong", () => {
    expect(guidance({ embedded: true, policyAllowsMicrophone: false }).message).toMatch(
      /nothing to unblock/i,
    );
  });

  it("hedges honestly when framed but the policy is unknowable", () => {
    // Safari and Firefox expose no Permissions Policy introspection, so this is
    // the common embedded case and the message must not assert a cause.
    const result = guidance({ embedded: true, policyAllowsMicrophone: null });
    expect(result.block).toBe("denied_in_frame");
    expect(result.offerNewTab).toBe(true);
    expect(result.offerRetry).toBe(true);
    expect(result.message).not.toMatch(/address bar/i);
  });

  it("gives the address-bar advice only on a top-level page, where it works", () => {
    const result = guidance({ embedded: false });
    expect(result.block).toBe("denied_by_user");
    expect(result.message).toMatch(/address bar/i);
    expect(result.offerNewTab).toBe(false);
  });

  it("does not offer a new tab when the policy explicitly allows it and we're framed", () => {
    // Policy is fine, so the person really did decline — a new tab wouldn't help
    // any more than retrying, but retrying might.
    const result = guidance({ embedded: true, policyAllowsMicrophone: true });
    expect(result.block).toBe("denied_in_frame");
    expect(result.offerRetry).toBe(true);
  });

  it("reports a missing device as a device problem, not a permission one", () => {
    for (const errorName of ["NotFoundError", "OverconstrainedError"]) {
      const result = guidance({ embedded: true, policyAllowsMicrophone: false, errorName });
      expect(result.block).toBe("no_device");
      expect(result.offerNewTab).toBe(false);
    }
  });

  it("treats an insecure or unsupported context as unrecoverable in place", () => {
    const result = guidance({ embedded: true, errorName: "SecurityError" });
    expect(result.block).toBe("unsupported");
    expect(result.offerRetry).toBe(false);
  });
});

describe("shouldSkipStraightToNewTab", () => {
  it("skips the pointless button only when the block is provable", () => {
    expect(shouldSkipStraightToNewTab({ embedded: true, policyAllowsMicrophone: false })).toBe(
      true,
    );
  });

  it("still asks first when framed but unknowable — the mic may well work", () => {
    expect(shouldSkipStraightToNewTab({ embedded: true, policyAllowsMicrophone: null })).toBe(
      false,
    );
    expect(shouldSkipStraightToNewTab({ embedded: true, policyAllowsMicrophone: true })).toBe(
      false,
    );
  });

  it("never short-circuits a standalone page", () => {
    expect(shouldSkipStraightToNewTab({ embedded: false, policyAllowsMicrophone: false })).toBe(
      false,
    );
  });
});

describe("readMicrophonePolicy", () => {
  it("reads the modern permissionsPolicy API", () => {
    const doc = { permissionsPolicy: { allowsFeature: () => false } } as unknown as Document;
    expect(readMicrophonePolicy(doc)).toBe(false);
  });

  it("falls back to the older featurePolicy API", () => {
    const doc = { featurePolicy: { allowsFeature: () => true } } as unknown as Document;
    expect(readMicrophonePolicy(doc)).toBe(true);
  });

  it("returns null where neither exists — Safari and Firefox", () => {
    expect(readMicrophonePolicy({} as Document)).toBeNull();
  });

  it("returns null rather than throwing if the API misbehaves", () => {
    const doc = {
      featurePolicy: {
        allowsFeature: () => {
          throw new Error("nope");
        },
      },
    } as unknown as Document;
    expect(readMicrophonePolicy(doc)).toBeNull();
  });
});
