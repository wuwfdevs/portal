import { describe, expect, it, vi } from "vitest";
import { chooseSetting, resolveNotifyAddress, resolveWebsiteOrigin } from "./station-links";

type Row = { website_origin: string | null; listening_notify_email: string | null } | null;

/** A client whose station_settings read returns `row`, or an error. */
function client(row: Row, error: { code: string } | null = null) {
  const maybeSingle = vi.fn(async () => ({ data: row, error }));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  return { from: vi.fn(() => ({ select })) } as never;
}

describe("chooseSetting", () => {
  it("takes the setting when it has anything in it, else the environment", () => {
    expect(chooseSetting("https://a.example", "https://b.example")).toBe("https://a.example");
    expect(chooseSetting("  ", "https://b.example")).toBe("https://b.example");
    expect(chooseSetting(null, " https://b.example ")).toBe("https://b.example");
    expect(chooseSetting(null, undefined)).toBeUndefined();
    expect(chooseSetting("", "  ")).toBeUndefined();
  });
});

describe("resolveWebsiteOrigin", () => {
  it("uses the station's setting over the environment", async () => {
    const result = await resolveWebsiteOrigin(client({ website_origin: "https://www.example.org", listening_notify_email: null }), "https://env.example");
    expect(result).toEqual({ ok: true, origin: "https://www.example.org" });
  });
  it("falls back to the environment when the setting is empty or unreadable", async () => {
    expect(await resolveWebsiteOrigin(client({ website_origin: null, listening_notify_email: null }), "https://env.example")).toEqual({ ok: true, origin: "https://env.example" });
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await resolveWebsiteOrigin(client(null, { code: "42501" }), "https://env.example")).toEqual({ ok: true, origin: "https://env.example" });
    quiet.mockRestore();
  });
  it("says where to set it when neither has a value, and refuses an address that is not an origin", async () => {
    const none = await resolveWebsiteOrigin(client({ website_origin: null, listening_notify_email: null }), undefined);
    expect(none.ok).toBe(false);
    expect(!none.ok && none.problem).toMatch(/Administration > Station/);
    const bad = await resolveWebsiteOrigin(client({ website_origin: "https://www.example.org/path", listening_notify_email: null }), undefined);
    expect(bad.ok).toBe(false);
  });
});

describe("resolveNotifyAddress", () => {
  it("prefers the setting, falls back to the environment, and refuses a list of addresses", async () => {
    expect(await resolveNotifyAddress(client({ website_origin: null, listening_notify_email: "desk@example.org" }), "env@example.org")).toBe("desk@example.org");
    expect(await resolveNotifyAddress(client({ website_origin: null, listening_notify_email: null }), "env@example.org")).toBe("env@example.org");
    expect(await resolveNotifyAddress(client({ website_origin: null, listening_notify_email: "a@example.org, b@example.org" }), undefined)).toBeNull();
    expect(await resolveNotifyAddress(client({ website_origin: null, listening_notify_email: null }), undefined)).toBeNull();
  });
});
