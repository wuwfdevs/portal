import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { useDelayedCommit } from "./use-delayed-commit";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Schedule = ReturnType<typeof useDelayedCommit>["schedule"];

function Probe({ onReady }: { onReady: (schedule: Schedule) => void }) {
  const { schedule } = useDelayedCommit(400);
  useEffect(() => onReady(schedule), [onReady, schedule]);
  return null;
}

function mount() {
  let schedule!: Schedule;
  const root = createRoot(document.createElement("div"));
  act(() =>
    root.render(
      <Probe
        onReady={(value) => {
          schedule = value;
        }}
      />,
    ),
  );
  return { schedule, unmount: () => act(() => root.unmount()) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useDelayedCommit", () => {
  it("runs only the latest task, once the schedule has been quiet for the delay", () => {
    const { schedule, unmount } = mount();
    const first = vi.fn();
    const second = vi.fn();
    schedule(first);
    vi.advanceTimersByTime(300);
    schedule(second);
    vi.advanceTimersByTime(399);
    expect(second).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("drops a pending task on unmount", () => {
    const { schedule, unmount } = mount();
    const task = vi.fn();
    schedule(task);
    unmount();
    vi.advanceTimersByTime(1000);
    expect(task).not.toHaveBeenCalled();
  });
});
