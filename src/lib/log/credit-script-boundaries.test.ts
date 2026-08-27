import { describe, expect, it } from "vitest";
import { applyCreditScriptBoundaries } from "./credit-script-boundaries";

// The pure half of credit-script-splitter.ts's LLM-backed credit split —
// what actually guarantees a split segment is byte-for-byte what DAD
// printed, never a model paraphrase, so it's tested directly rather than
// through a mocked OpenAI call. The model only ever supplies *where* to cut
// (a short opening phrase); this function is the code that turns that into
// real substrings, and the code that refuses to trust anything it can't
// verify.

const SCRIPT =
  "Support for WUWF comes from Juan’s Flying Burrito on Alcaniz Street in Pensacola serving a " +
  "Creole-Mexican fusion menu and agave-forward cocktails in a Big Easy atmosphere. Details at juans " +
  "flying burrito dot com Support for WUWF comes from Autumn Beck Blackledge, Attorneys of Divorce and " +
  "Family Law, who offer a number of approaches to resolving complex family issues. More details, " +
  "videos, articles and client reviews are on line at autumn o beck dot com Web address is autumn o " +
  "beck dot com";

describe("applyCreditScriptBoundaries", () => {
  it("splits a real two-credit bundle at a verbatim boundary", () => {
    const segments = applyCreditScriptBoundaries(SCRIPT, ["Support for WUWF comes from Autumn Beck Blackledge"]);
    expect(segments).toHaveLength(2);
    expect(segments![0]).toBe(
      "Support for WUWF comes from Juan’s Flying Burrito on Alcaniz Street in Pensacola serving a " +
        "Creole-Mexican fusion menu and agave-forward cocktails in a Big Easy atmosphere. Details at juans " +
        "flying burrito dot com",
    );
    expect(segments![1]).toBe(
      "Support for WUWF comes from Autumn Beck Blackledge, Attorneys of Divorce and Family Law, who offer " +
        "a number of approaches to resolving complex family issues. More details, videos, articles and " +
        "client reviews are on line at autumn o beck dot com Web address is autumn o beck dot com",
    );
    // Every segment is a real substring of the original, never retyped text.
    expect(SCRIPT).toContain(segments![0]);
    expect(SCRIPT).toContain(segments![1]);
  });

  it("splits three credits from two boundaries, in order", () => {
    const script = "Support for WUWF comes from A. Support for WUWF comes from B. Support for WUWF comes from C.";
    const segments = applyCreditScriptBoundaries(script, [
      "Support for WUWF comes from B",
      "Support for WUWF comes from C",
    ]);
    expect(segments).toEqual([
      "Support for WUWF comes from A.",
      "Support for WUWF comes from B.",
      "Support for WUWF comes from C.",
    ]);
  });

  it("matches a boundary phrase even when the model normalizes a curly apostrophe to a straight one", () => {
    const segments = applyCreditScriptBoundaries(SCRIPT, ["Support for WUWF comes from Autumn Beck Blackledge"]);
    expect(segments).not.toBeNull();
    const withStraightQuoteOnly = applyCreditScriptBoundaries("Juan's place. Support for WUWF comes from B.", [
      "Support for WUWF comes from B",
    ]);
    expect(withStraightQuoteOnly).toEqual(["Juan's place.", "Support for WUWF comes from B."]);
  });

  it("returns null for an empty boundary list — a single, unbundled credit", () => {
    expect(applyCreditScriptBoundaries("Support for WUWF comes from A.", [])).toBeNull();
  });

  it("returns null when a proposed boundary phrase isn't actually in the text", () => {
    const segments = applyCreditScriptBoundaries("Support for WUWF comes from A. Nothing else.", [
      "Support for WUWF comes from Somebody Else Entirely",
    ]);
    expect(segments).toBeNull();
  });

  it("returns null when a boundary points at the very start of the text", () => {
    const segments = applyCreditScriptBoundaries("Support for WUWF comes from A.", ["Support for WUWF comes from A"]);
    expect(segments).toBeNull();
  });

  it("returns null when boundaries aren't in increasing order", () => {
    const script = "Support for WUWF comes from A. Support for WUWF comes from B.";
    // The second requested boundary ("A") only occurs before the first ("B") in the text.
    const segments = applyCreditScriptBoundaries(script, ["Support for WUWF comes from B", "Support for WUWF comes from A"]);
    expect(segments).toBeNull();
  });
});
