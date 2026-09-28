import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { RightPanelProvider, useRightPanel } from "./right-panel";

// React's act() needs this flag outside a testing-library environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe() {
  const panel = useRightPanel();
  return (
    <div>
      <output>{panel.open ?? "none"}</output>
      <span data-draft>
        {panel.assistantDraft ? `${panel.assistantDraft.id}:${panel.assistantDraft.text}` : ""}
      </span>
      <button data-help onClick={() => panel.toggle("help")} />
      <button data-assistant onClick={() => panel.toggle("assistant")} />
      <button data-ask onClick={() => panel.askAssistant("About Log: ")} />
      <button data-close onClick={panel.close} />
    </div>
  );
}

let container: HTMLDivElement | null = null;

function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      <RightPanelProvider>
        <Probe />
      </RightPanelProvider>,
    ),
  );
  const click = (selector: string) =>
    act(() => container!.querySelector<HTMLButtonElement>(selector)!.click());
  const open = () => container!.querySelector("output")!.textContent;
  const draft = () => container!.querySelector("[data-draft]")!.textContent;
  return { click, open, draft, root };
}

afterEach(() => {
  container?.remove();
  container = null;
});

describe("RightPanelProvider", () => {
  it("keeps at most one panel open", () => {
    const { click, open } = mount();
    expect(open()).toBe("none");
    click("[data-help]");
    expect(open()).toBe("help");
    click("[data-assistant]");
    expect(open()).toBe("assistant");
    click("[data-assistant]");
    expect(open()).toBe("none");
    click("[data-help]");
    click("[data-close]");
    expect(open()).toBe("none");
  });

  it("opens the assistant with a new draft request each time", () => {
    const { click, open, draft } = mount();
    click("[data-help]");
    click("[data-ask]");
    expect(open()).toBe("assistant");
    expect(draft()).toBe("1:About Log: ");
    click("[data-ask]");
    expect(draft()).toBe("2:About Log: ");
  });
});
