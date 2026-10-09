import { describe, expect, it } from "vitest";
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { failureMessage, useOptimisticList } from "./use-optimistic-list";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Row = { id: string; col: string };
const api = { current: undefined as unknown as ReturnType<typeof useOptimisticList<Row>> };
function Harness({ rows }: { rows: Row[] }) {
  const value = useOptimisticList(rows, { getId: (r) => r.id });
  useEffect(() => {
    api.current = value;
  });
  return null;
}

function mount(rows: Row[]) {
  const root = createRoot(document.createElement("div"));
  act(() => root.render(<Harness rows={rows} />));
  return { root, rerender: (r: Row[]) => act(() => root.render(<Harness rows={r} />)) };
}

function deferred() {
  let resolve!: (v: { ok: boolean; error?: string }) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<{ ok: boolean; error?: string }>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const rows = (): Row[] => [
  { id: "a", col: "x" },
  { id: "b", col: "x" },
];

describe("failureMessage", () => {
  it("reads both result shapes", () => {
    expect(failureMessage({ ok: true })).toBeNull();
    expect(failureMessage({})).toBeNull();
    expect(failureMessage({ ok: false, error: "no" })).toBe("no");
    expect(failureMessage({ error: "nope" })).toBe("nope");
    expect(failureMessage({ ok: false })).toMatch(/could not be saved/);
  });
});

describe("useOptimisticList", () => {
  it("rolls back only the failed item, keeping a second quick move", async () => {
    mount(rows());
    const first = deferred();
    const second = deferred();
    act(() => {
      api.current.apply("a", { col: "y" }, () => first.promise);
      api.current.apply("b", { col: "z" }, () => second.promise);
    });
    expect(api.current.items.map((r) => r.col)).toEqual(["y", "z"]);
    await act(async () => first.resolve({ ok: false, error: "refused" }));
    expect(api.current.items.map((r) => r.col)).toEqual(["x", "z"]);
    expect(api.current.error).toBe("refused");
    await act(async () => second.resolve({ ok: true }));
    expect(api.current.items.map((r) => r.col)).toEqual(["x", "z"]);
  });

  it("surfaces a thrown action and restores the item", async () => {
    mount(rows());
    const d = deferred();
    act(() => api.current.apply("a", { col: "y" }, () => d.promise));
    await act(async () => d.reject(new Error("offline")));
    expect(api.current.items[0]?.col).toBe("x");
    expect(api.current.error).toMatch(/Could not reach the server/);
    act(() => api.current.clearError());
    expect(api.current.error).toBeNull();
  });

  it("re-syncs when the server items change", () => {
    const view = mount(rows());
    act(() => api.current.apply("a", { col: "y" }, () => new Promise(() => {})));
    view.rerender([{ id: "a", col: "server" }]);
    expect(api.current.items).toEqual([{ id: "a", col: "server" }]);
  });
});
