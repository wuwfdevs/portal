import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DismissibleHint } from "./dismissible-hint";
import { hintStorageKey, resetDismissedHintsForTests } from "@/lib/dismissed-hints";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  window.localStorage.clear();
  resetDismissedHintsForTests();
  vi.restoreAllMocks();
});

function render(id = "test-hint") {
  act(() =>
    root.render(
      <DismissibleHint id={id}>
        <span>Select words to make an excerpt.</span>
      </DismissibleHint>,
    ),
  );
}

describe("DismissibleHint", () => {
  it("shows its text until dismissed", () => {
    render();
    expect(container.textContent).toContain("Select words to make an excerpt.");
  });

  it("goes away on Got it and stays away on the next visit", () => {
    render();
    act(() => container.querySelector("button")!.click());
    expect(container.textContent).toBe("");
    expect(window.localStorage.getItem(hintStorageKey("test-hint"))).toBe("1");

    act(() => root.unmount());
    root = createRoot(container);
    render();
    expect(container.textContent).toBe("");
  });

  it("does not show when the browser already remembers it", () => {
    window.localStorage.setItem(hintStorageKey("test-hint"), "1");
    render();
    expect(container.textContent).toBe("");
  });

  it("keeps a different hint on screen", () => {
    window.localStorage.setItem(hintStorageKey("other"), "1");
    render("test-hint");
    expect(container.textContent).toContain("Select words");
  });

  it("still hides for this visit when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render();
    act(() => container.querySelector("button")!.click());
    expect(container.textContent).toBe("");
  });
});
