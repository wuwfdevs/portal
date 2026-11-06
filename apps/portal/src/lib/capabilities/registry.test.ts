import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
const canUseTool = vi.fn();
vi.mock("@/lib/auth/authz", () => ({ canUseTool: (...args: unknown[]) => canUseTool(...args) }));

import { listCapabilities, listCapabilitiesFor } from "./registry";

const user = { id: "user-1" };

describe("listCapabilitiesFor", () => {
  beforeEach(() => {
    canUseTool.mockReset();
  });

  it("lists nothing when the caller can use no tool", async () => {
    canUseTool.mockResolvedValue(false);
    expect(await listCapabilitiesFor(user)).toEqual([]);
  });

  it("lists every capability when the caller can use every tool", async () => {
    canUseTool.mockResolvedValue(true);
    expect((await listCapabilitiesFor(user)).map((c) => c.id)).toEqual(
      listCapabilities().map((c) => c.id),
    );
  });

  it("lists only the capabilities of tools the caller can use", async () => {
    canUseTool.mockImplementation(async (_user: unknown, key: string) => key === "roadmap");
    const listed = await listCapabilitiesFor(user);
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.every((c) => c.requires.tool === "roadmap")).toBe(true);
    // Everything else is hidden, not just reordered.
    expect(listed.length).toBeLessThan(listCapabilities().length);
  });

  it("asks once per tool, not once per capability", async () => {
    canUseTool.mockResolvedValue(true);
    await listCapabilitiesFor(user);
    const keys = canUseTool.mock.calls.map((call) => call[1] as string);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBeLessThan(listCapabilities().length);
  });

  it("asks about the person it was given", async () => {
    canUseTool.mockResolvedValue(true);
    await listCapabilitiesFor(user);
    expect(canUseTool.mock.calls.every((call) => call[0] === user)).toBe(true);
  });
});
