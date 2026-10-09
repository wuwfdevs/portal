import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const getCurrentProfile = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getCurrentProfile: () => getCurrentProfile() }));

import { ForbiddenError } from "@/lib/auth/authz";
import { guardRoute, guardStatus } from "./route-guard";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/tools", () => ({ getToolByKey: vi.fn() }));

describe("guardStatus", () => {
  it("is 401 with no profile and 403 with one", () => {
    expect(guardStatus(false)).toBe(401);
    expect(guardStatus(true)).toBe(403);
  });
});

describe("guardRoute", () => {
  beforeEach(() => getCurrentProfile.mockReset());

  it("passes the assertion's value through", async () => {
    const result = await guardRoute(async () => "profile");
    expect(result).toEqual({ ok: true, value: "profile" });
  });

  it("answers 401 when nobody is signed in", async () => {
    getCurrentProfile.mockResolvedValue(null);
    const result = await guardRoute(async () => {
      throw new ForbiddenError("No.");
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      expect(await result.response.json()).toEqual({ error: "No." });
    }
  });

  it("answers 403 when someone is signed in but refused, with a custom body", async () => {
    getCurrentProfile.mockResolvedValue({ id: "u" });
    const result = await guardRoute(
      async () => {
        throw new ForbiddenError("No.");
      },
      { body: (message) => ({ wrapped: message }) },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      expect(await result.response.json()).toEqual({ wrapped: "No." });
    }
  });

  it("rethrows anything that is not a ForbiddenError", async () => {
    await expect(
      guardRoute(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});
