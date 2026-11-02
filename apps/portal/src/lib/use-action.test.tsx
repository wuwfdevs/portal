import { describe, expect, it } from "vitest";
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { actionFailureMessage, ACTION_FAILED_MESSAGE, useAction } from "./use-action";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const api = { current: undefined as unknown as ReturnType<typeof useAction<[number], number>> };
function Harness({ fn }: { fn: (n: number) => Promise<number> }) {
  const value = useAction(fn);
  useEffect(() => {
    api.current = value;
  });
  return null;
}

function mount(fn: (n: number) => Promise<number>) {
  const root = createRoot(document.createElement("div"));
  act(() => root.render(<Harness fn={fn} />));
}

describe("useAction", () => {
  it("keeps the result", async () => {
    mount(async (n) => n * 2);
    await act(async () => api.current.run(4));
    expect(api.current.result).toBe(8);
    expect(api.current.error).toBeNull();
    expect(api.current.pending).toBe(false);
  });

  it("turns a rejection into error and ends pending", async () => {
    mount(async () => {
      throw new Error("boom");
    });
    await act(async () => api.current.run(1));
    expect(api.current.error).toBe("boom");
    expect(api.current.pending).toBe(false);
    act(() => api.current.reset());
    expect(api.current.error).toBeNull();
  });
});

describe("actionFailureMessage", () => {
  it("hides raw network wording", () => {
    expect(actionFailureMessage(new TypeError("Failed to fetch"))).toBe(ACTION_FAILED_MESSAGE);
    expect(actionFailureMessage("x")).toBe(ACTION_FAILED_MESSAGE);
  });
});
