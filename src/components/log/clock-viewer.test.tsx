import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClockViewer, type ClockViewerProps } from "./clock-viewer";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const slot = (
  id: string,
  position: number,
  label: string,
  start: number,
  duration: number,
  extra: Partial<ClockViewerProps["slots"][number]> = {},
): ClockViewerProps["slots"][number] => ({
  id,
  position,
  label,
  segment_label: null,
  timing_mode: "fixed",
  start_offset_seconds: start,
  duration_seconds: duration,
  earliest_start_offset_seconds: null,
  latest_start_offset_seconds: null,
  ...extra,
});

function props(over: Partial<ClockViewerProps> = {}): ClockViewerProps {
  return {
    templateId: "t1",
    slots: [
      slot("s1", 1, "Billboard", 0, 120),
      slot("s2", 2, "Segment A", 180, 540),
      slot("s3", 3, "Music Bed", 720, 60),
      slot("s4", 4, "Newscast", 1020, 180),
      slot("s5", 5, "Local break", 1800, 120),
      slot("s6", 6, "Floating break", 2760, 180, {
        timing_mode: "float",
        earliest_start_offset_seconds: 2640,
        latest_start_offset_seconds: 2820,
      }),
    ],
    opportunities: [
      { id: "o1", slot_id: "s3", requirement: "optional", permittedTypeLabels: ["Legal ID"], notes: null },
      { id: "o2", slot_id: "s5", requirement: "required", permittedTypeLabels: [], notes: null },
      { id: "o3", slot_id: "s6", requirement: "optional", permittedTypeLabels: [], notes: null },
    ],
    pins: [
      { id: "p1", local_opportunity_id: "o1", hour_index: 1, days_of_week: [], title: "BirdNote" },
    ],
    shift: { hours: 2, startTime: "07:00:00" },
    canEdit: true,
    initial: { view: "timeline", hour: 0, slotId: null },
    form: null,
    keepParams: { version: "v1" },
    removeOpportunityAction: async () => {},
    removePinAction: async () => {},
    ...over,
  };
}

let container: HTMLDivElement;
let root: Root;

function mount(over?: Partial<ClockViewerProps>) {
  act(() => {
    root.render(createElement(ClockViewer, props(over)));
  });
}

const text = () => container.textContent ?? "";
const byLabel = (fragment: string) =>
  Array.from(container.querySelectorAll<HTMLElement>("[aria-label]")).find((el) =>
    el.getAttribute("aria-label")?.includes(fragment),
  );

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  window.history.replaceState(null, "", "/log/clocks/t1?version=v1");
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("ClockViewer", () => {
  it("opens on the first locally-eligible slot in the timeline, in hour 1", () => {
    mount();
    expect(text()).toContain("Selected");
    expect(text()).toContain("Music Bed");
    expect(text()).toContain("Local · optional");
    expect(text()).toContain("Hour 1 of 2 · 7:00 AM – 8:00 AM");
    expect(text()).toContain("Floating");
  });

  it("previews a slot on hover without changing the selection", () => {
    mount();
    const newscast = byLabel("Newscast");
    expect(newscast).toBeDefined();
    act(() => {
      newscast!.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(text()).toContain("Previewing");
    expect(text()).toContain("Network only");
    act(() => {
      newscast!.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    });
    expect(text()).not.toContain("Previewing");
  });

  it("selects a slot on click and writes it to the URL", () => {
    mount();
    act(() => {
      byLabel("Local break")!.click();
    });
    expect(text()).toContain("Local break");
    expect(text()).toContain("Local · required");
    expect(window.location.search).toContain("slot=s5");
  });

  it("steps through the hours: a pin applies to its own hour only", () => {
    mount();
    expect(container.querySelector('[aria-label="Previous hour"]')).toHaveProperty("disabled", true);
    expect(text()).toContain("Nothing pinned for this hour. 1 pin applies to another hour.");
    act(() => {
      (container.querySelector('[aria-label="Next hour"]') as HTMLElement).click();
    });
    expect(text()).toContain("Hour 2 of 2 · 8:00 AM – 9:00 AM");
    expect(text()).toContain("BirdNote");
    expect(window.location.search).toContain("hour=1");
  });

  it("has no hour stepper for a one-hour shift", () => {
    mount({ shift: { hours: 1, startTime: null } });
    expect(container.querySelector('[aria-label="Next hour"]')).toBeNull();
  });

  it("switches to the ring, keeping the selection and describing a floating break", () => {
    mount();
    const ring = Array.from(container.querySelectorAll("button")).find(
      (el) => el.textContent === "Ring",
    )!;
    act(() => ring.click());
    expect(container.querySelector("svg")).not.toBeNull();
    expect(text()).toContain("Music Bed");
    expect(window.location.search).toContain("view=ring");
    act(() => {
      byLabel("Floating break")!.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(text()).toContain("Previewing");
    expect(text()).toContain("so it lasts");
  });

  it("offers producers the slot actions, and nobody else", () => {
    mount();
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs.some((href) => href?.includes("mode=edit"))).toBe(true);
    expect(hrefs.some((href) => href?.includes("mode=pin"))).toBe(true);
    act(() => root.unmount());
    root = createRoot(container);
    mount({ canEdit: false });
    expect(text()).not.toContain("Edit eligibility");
  });

  it("shows the server-rendered form inside the panel for the selected slot", () => {
    mount({
      initial: { view: "timeline", hour: 0, slotId: "s3" },
      form: {
        slotId: "s3",
        title: "Edit eligibility",
        cancelHref: "/log/clocks/t1?version=v1",
        node: createElement("form", { "data-testid": "opp-form" }),
      },
    });
    expect(container.querySelector('[data-testid="opp-form"]')).not.toBeNull();
    expect(text()).toContain("Cancel");
  });
});
