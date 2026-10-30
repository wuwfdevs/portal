import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { STALLED_TASK_MS, useInterval, usePoller } from "./use-poller";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount(node: React.ReactNode) {
  const root = createRoot(document.createElement("div"));
  act(() => root.render(node));
  return () => act(() => root.unmount());
}

beforeEach(() => {
  vi.useFakeTimers();
  refresh.mockClear();
});
afterEach(() => vi.useRealTimers());

function Poller({ task }: { task?: () => Promise<boolean> }) {
  usePoller({ intervalMs: 1000, task });
  return null;
}

describe("usePoller", () => {
  it("refreshes on every tick without a task", () => {
    const unmount = mount(<Poller />);
    act(() => vi.advanceTimersByTime(3000));
    expect(refresh).toHaveBeenCalledTimes(3);
    unmount();
  });

  it("refreshes only when the task returns true", async () => {
    let answer = false;
    const unmount = mount(<Poller task={async () => answer} />);
    await act(async () => vi.advanceTimersByTime(1000));
    expect(refresh).not.toHaveBeenCalled();
    answer = true;
    await act(async () => vi.advanceTimersByTime(1000));
    expect(refresh).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("does not start a task while the previous one is running", async () => {
    let calls = 0;
    let release: () => void = () => {};
    const task = () => {
      calls += 1;
      return new Promise<boolean>((resolve) => {
        release = () => resolve(false);
      });
    };
    const unmount = mount(<Poller task={task} />);
    await act(async () => vi.advanceTimersByTime(3000));
    expect(calls).toBe(1);
    await act(async () => release());
    await act(async () => vi.advanceTimersByTime(1000));
    expect(calls).toBe(2);
    unmount();
  });

  it("survives a throwing task", async () => {
    const unmount = mount(
      <Poller
        task={async () => {
          throw new Error("offline");
        }}
      />,
    );
    await act(async () => vi.advanceTimersByTime(2000));
    expect(refresh).not.toHaveBeenCalled();
    unmount();
  });
});

describe("useInterval", () => {
  it("calls the latest callback", () => {
    const a = vi.fn();
    const b = vi.fn();
    function Clock({ fn }: { fn: () => void }) {
      useInterval(fn, 500);
      return null;
    }
    const root = createRoot(document.createElement("div"));
    act(() => root.render(<Clock fn={a} />));
    act(() => root.render(<Clock fn={b} />));
    act(() => vi.advanceTimersByTime(1000));
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(2);
    act(() => root.unmount());
  });
});

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

function Configured(props: Parameters<typeof usePoller>[0]) {
  usePoller(props);
  return null;
}

describe("usePoller options", () => {
  afterEach(() => setVisibility("visible"));

  it("skips ticks while the tab is hidden and catches up when it returns", () => {
    const unmount = mount(<Configured intervalMs={1000} />);
    setVisibility("hidden");
    act(() => vi.advanceTimersByTime(3000));
    expect(refresh).not.toHaveBeenCalled();
    setVisibility("visible");
    expect(refresh).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("keeps polling in a hidden tab when pauseWhenHidden is false", () => {
    const unmount = mount(<Configured intervalMs={1000} pauseWhenHidden={false} />);
    setVisibility("hidden");
    act(() => vi.advanceTimersByTime(2000));
    expect(refresh).toHaveBeenCalledTimes(2);
    unmount();
  });

  it("runs once at the start when immediate", () => {
    const unmount = mount(<Configured intervalMs={1000} immediate />);
    expect(refresh).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("does nothing while disabled", () => {
    const unmount = mount(<Configured intervalMs={1000} enabled={false} immediate />);
    act(() => vi.advanceTimersByTime(3000));
    expect(refresh).not.toHaveBeenCalled();
    unmount();
  });

  it("skips a tick when shouldSkip says so", () => {
    const unmount = mount(<Configured intervalMs={1000} shouldSkip={() => true} />);
    act(() => vi.advanceTimersByTime(3000));
    expect(refresh).not.toHaveBeenCalled();
    unmount();
  });

  it("stops ticking after unmount", () => {
    const unmount = mount(<Configured intervalMs={1000} />);
    unmount();
    act(() => vi.advanceTimersByTime(3000));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not stay blocked behind a task that never settles", async () => {
    let calls = 0;
    const hung = () => {
      calls += 1;
      return new Promise<boolean>(() => {});
    };
    const unmount = mount(<Configured intervalMs={1000} task={hung} />);
    await act(async () => vi.advanceTimersByTime(STALLED_TASK_MS - 1000));
    expect(calls).toBe(1);
    await act(async () => vi.advanceTimersByTime(3000));
    expect(calls).toBeGreaterThan(1);
    unmount();
  });
});
