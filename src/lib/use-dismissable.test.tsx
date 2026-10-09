import { describe, expect, it, vi } from "vitest";
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { useDismissable } from "./use-dismissable";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Harness({
  open,
  onDismiss,
  ignoreEscape,
}: {
  open: boolean;
  onDismiss: (r: "outside" | "escape") => void;
  ignoreEscape?: boolean;
}) {
  const ref = createRef<HTMLDivElement>();
  useDismissable({ open, onDismiss, refs: [ref], ignoreEscape });
  return (
    <div ref={ref} id="inside">
      <button id="btn">x</button>
    </div>
  );
}

function mount(props: Parameters<typeof Harness>[0]) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<Harness {...props} />));
  return () => {
    act(() => root.unmount());
    host.remove();
  };
}

describe("useDismissable", () => {
  it("dismisses on an outside pointerdown, not an inside one", () => {
    const onDismiss = vi.fn();
    const unmount = mount({ open: true, onDismiss });
    document.getElementById("btn")!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(onDismiss).not.toHaveBeenCalled();
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(onDismiss).toHaveBeenCalledWith("outside", expect.any(Event));
    unmount();
  });

  it("dismisses on Escape unless ignored", () => {
    const a = vi.fn();
    const unmountA = mount({ open: true, onDismiss: a });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(a).toHaveBeenCalledWith("escape", expect.any(Event));
    unmountA();

    const b = vi.fn();
    const unmountB = mount({ open: true, onDismiss: b, ignoreEscape: true });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(b).not.toHaveBeenCalled();
    unmountB();
  });

  it("listens to nothing while closed", () => {
    const onDismiss = vi.fn();
    const unmount = mount({ open: false, onDismiss });
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onDismiss).not.toHaveBeenCalled();
    unmount();
  });
});
