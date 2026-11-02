import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { useDelayedCommit } from "./use-delayed-commit";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Schedule = ReturnType<typeof useDelayedCommit>["schedule"];

function Probe({
  onReady,
  flushOnUnmount = false,
}: {
  onReady: (schedule: Schedule) => void;
  flushOnUnmount?: boolean;
}) {
  const { schedule } = useDelayedCommit(400, { flushOnUnmount });
  useEffect(() => onReady(schedule), [onReady, schedule]);
  return null;
}

function mount(flushOnUnmount = false) {
  let schedule!: Schedule;
  const root = createRoot(document.createElement("div"));
  act(() =>
    root.render(
      <Probe
        flushOnUnmount={flushOnUnmount}
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

  it("runs a pending task once on unmount when asked to flush", () => {
    const { schedule, unmount } = mount(true);
    const task = vi.fn();
    schedule(task);
    unmount();
    expect(task).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("does not flush a task that already ran", () => {
    const { schedule, unmount } = mount(true);
    const task = vi.fn();
    schedule(task);
    vi.advanceTimersByTime(400);
    unmount();
    expect(task).toHaveBeenCalledTimes(1);
  });
});
