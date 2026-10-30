import { describe, expect, it } from "vitest";
import { createCoalescedRunner } from "./run-coalesced";

/** A pass that stays open until the test lets it finish. */
function gatedPass() {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { gate, release };
}

describe("createCoalescedRunner", () => {
  it("runs once for a single request", async () => {
    const run = createCoalescedRunner();
    let passes = 0;
    await run("a", async () => {
      passes += 1;
    });
    expect(passes).toBe(1);
  });

  it("does not drop a request that arrives mid-run: the active run goes round once more", async () => {
    const run = createCoalescedRunner();
    const first = gatedPass();
    let passes = 0;

    const active = run("a", async () => {
      passes += 1;
      if (passes === 1) await first.gate;
    });
    // Two more requests arrive while the first pass is still running.
    await run("a", async () => {
      throw new Error("a request that arrives mid-run must not run its own pass");
    });
    await run("a", async () => {
      throw new Error("a request that arrives mid-run must not run its own pass");
    });
    first.release();
    await active;

    // One pass for the original request and one for everything that arrived meanwhile.
    expect(passes).toBe(2);
  });

  it("goes round again when a pass reports its result stale", async () => {
    const run = createCoalescedRunner();
    const results = [true, true, false];
    let passes = 0;
    await run("a", async () => results[passes++]);
    expect(passes).toBe(3);
  });

  it("stops after maxPasses so a key that keeps changing cannot loop forever", async () => {
    const run = createCoalescedRunner();
    let passes = 0;
    await run(
      "a",
      async () => {
        passes += 1;
        return true;
      },
      3,
    );
    expect(passes).toBe(3);
  });

  it("keeps keys independent, and a finished key starts fresh", async () => {
    const run = createCoalescedRunner();
    const held = gatedPass();
    let aPasses = 0;
    let bPasses = 0;

    const a = run("a", async () => {
      aPasses += 1;
      await held.gate;
    });
    await run("b", async () => {
      bPasses += 1;
    });
    expect(bPasses).toBe(1);

    held.release();
    await a;
    await run("a", async () => {
      aPasses += 1;
    });
    expect(aPasses).toBe(2);
  });

  it("releases the key when a pass throws", async () => {
    const run = createCoalescedRunner();
    await expect(
      run("a", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    let passes = 0;
    await run("a", async () => {
      passes += 1;
    });
    expect(passes).toBe(1);
  });
});
