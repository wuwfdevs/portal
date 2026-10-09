import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { useInterval, usePoller } from "./use-poller";

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
