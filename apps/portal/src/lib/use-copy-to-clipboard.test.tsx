import { afterEach, describe, expect, it, vi } from "vitest";
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { useCopyToClipboard, type CopyStatus } from "./use-copy-to-clipboard";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const api = { current: undefined as unknown as ReturnType<typeof useCopyToClipboard> };
function Harness() {
  const value = useCopyToClipboard(1000);
  useEffect(() => {
    api.current = value;
  });
  return null;
}

function setClipboard(writeText: (t: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}

afterEach(() => vi.useRealTimers());

describe("useCopyToClipboard", () => {
  it("reports copied, then resets", async () => {
    vi.useFakeTimers();
    setClipboard(async () => {});
    const root = createRoot(document.createElement("div"));
    act(() => root.render(<Harness />));
    let ok = false;
    await act(async () => {
      ok = await api.current.copy("hi");
    });
    expect(ok).toBe(true);
    expect(api.current.status).toBe<CopyStatus>("copied");
    act(() => vi.advanceTimersByTime(1000));
    expect(api.current.status).toBe<CopyStatus>("idle");
    act(() => root.unmount());
  });

  it("reports failed instead of rejecting when the clipboard is denied", async () => {
    setClipboard(() => Promise.reject(new Error("denied")));
    const root = createRoot(document.createElement("div"));
    act(() => root.render(<Harness />));
    let ok = true;
    await act(async () => {
      ok = await api.current.copy("hi");
    });
    expect(ok).toBe(false);
    expect(api.current.status).toBe<CopyStatus>("failed");
    act(() => root.unmount());
  });
});
