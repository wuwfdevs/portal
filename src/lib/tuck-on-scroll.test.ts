import { describe, expect, it } from "vitest";
import { INITIAL_TUCK, nextTuck, type TuckState } from "./tuck-on-scroll";

function scrollThrough(start: TuckState, ys: number[]): TuckState {
  return ys.reduce((state, y) => nextTuck(state, y), start);
}

describe("nextTuck", () => {
  it("tucks away when scrolling down past the top of the page", () => {
    expect(scrollThrough({ tucked: false, anchor: 200 }, [260]).tucked).toBe(true);
  });

  it("comes back when scrolling up", () => {
    expect(scrollThrough({ tucked: true, anchor: 600 }, [560]).tucked).toBe(false);
  });

  it("is always shown near the top", () => {
    expect(scrollThrough({ tucked: true, anchor: 300 }, [40]).tucked).toBe(false);
    expect(scrollThrough(INITIAL_TUCK, [100]).tucked).toBe(false);
  });

  it("counts a slow scroll made of steps smaller than the delta", () => {
    const steps = Array.from({ length: 12 }, (_, i) => 200 + (i + 1) * 3);
    expect(scrollThrough({ tucked: false, anchor: 200 }, steps).tucked).toBe(true);
  });

  it("does not bring it back for a small reversal while scrolling down", () => {
    const tucked = scrollThrough({ tucked: false, anchor: 200 }, [260, 300, 296, 298]);
    expect(tucked.tucked).toBe(true);
  });

  it("does not tuck it for a small dip while it is shown", () => {
    const shown = scrollThrough({ tucked: false, anchor: 400 }, [404, 399, 402]);
    expect(shown.tucked).toBe(false);
  });

  it("comes back after a slow scroll up, once it has moved a full delta", () => {
    const up = (count: number) => Array.from({ length: count }, (_, i) => 500 - (i + 1) * 3);
    expect(scrollThrough({ tucked: true, anchor: 500 }, up(2)).tucked).toBe(true);
    expect(scrollThrough({ tucked: true, anchor: 500 }, up(4)).tucked).toBe(false);
  });
});
