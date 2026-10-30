import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useBeforeUnloadGuard, useEventListener } from "./use-event-listener";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(node: React.ReactNode) {
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(node));
  return {
    rerender: (n: React.ReactNode) => act(() => root.render(n)),
    unmount: () => act(() => root.unmount()),
  };
}

function Listener({ fn, active = true }: { fn: () => void; active?: boolean }) {
  useEventListener(document, "ping", fn, { active });
  return null;
}

function Guard({ active }: { active: boolean }) {
  useBeforeUnloadGuard(active);
  return null;
}

describe("useEventListener", () => {
  it("calls the latest handler and stops on unmount", () => {
    const a = vi.fn();
    const b = vi.fn();
    const view = render(<Listener fn={a} />);
    view.rerender(<Listener fn={b} />);
    document.dispatchEvent(new Event("ping"));
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    view.unmount();
    document.dispatchEvent(new Event("ping"));
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("does nothing while inactive", () => {
    const fn = vi.fn();
    const view = render(<Listener fn={fn} active={false} />);
    document.dispatchEvent(new Event("ping"));
    expect(fn).not.toHaveBeenCalled();
    view.unmount();
  });
});

describe("useBeforeUnloadGuard", () => {
  it("prevents unload only while active", () => {
    const view = render(<Guard active={false} />);
    const idle = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(idle);
    expect(idle.defaultPrevented).toBe(false);
    view.rerender(<Guard active />);
    const live = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(live);
    expect(live.defaultPrevented).toBe(true);
    view.unmount();
  });
});
