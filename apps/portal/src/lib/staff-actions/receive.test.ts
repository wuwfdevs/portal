import { signRequest, STAFF_ACTIONS_PATH_PREFIX } from "@wuwf/portal-contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// A tiny stand-in for the admin client: tables are arrays, and the query builder supports exactly the calls the receiver makes.
const tables: Record<string, Array<Record<string, unknown>>> = {};
let failTable: string | null = null;
function builder(table: string) {
  const filters: Array<[string, unknown]> = [];
  const api = {
    select: () => api,
    eq: (column: string, value: unknown) => (filters.push([column, value]), api),
    is: (column: string, value: unknown) => (filters.push([column, value]), api),
    maybeSingle: async () => {
      if (failTable === table) return { data: null, error: { code: "XX000", message: "boom" } };
      const row = (tables[table] ?? []).find((r) => filters.every(([c, v]) => r[c] === v)) ?? null;
      return { data: row, error: null };
    },
  };
  return api;
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (t: string) => builder(t) }) }));

const { receiveStaffAction, Refusal } = await import("./receive");

const SECRET = "s".repeat(40);
const ACTOR = "11111111-1111-4111-8111-111111111111";
const PATH = `${STAFF_ACTIONS_PATH_PREFIX}/test/do`;

async function post(body: unknown, opts: { secret?: string; path?: string; raw?: string } = {}) {
  const raw = opts.raw ?? JSON.stringify(body);
  const headers = await signRequest({ method: "POST", path: opts.path ?? PATH, body: raw }, opts.secret ?? SECRET);
  return new Request(`https://portal.example.org${PATH}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: raw });
}

const run = vi.fn(async () => ({ done: true }));
const feature = {
  label: "test/do",
  toolKey: "audience-listening",
  parse: (json: unknown) => {
    const actor = (json as { actor?: { portalUserId?: string } })?.actor?.portalUserId;
    return actor ? ({ ok: true, value: { actor } } as const) : ({ ok: false, message: "Who is acting?" } as const);
  },
  run,
};
const answer = async (r: Response) => ({ status: r.status, body: await r.json() });

beforeEach(() => {
  process.env.STAFF_ACTIONS_SECRET = SECRET;
  failTable = null;
  run.mockClear();
  tables["tools"] = [{ id: "t1", key: "audience-listening" }];
  tables["profiles"] = [{ id: ACTOR, account_status: "active" }];
  tables["tool_access"] = [{ user_id: ACTOR, tool_id: "t1", revoked_at: null }];
});

describe("receiveStaffAction", () => {
  it("runs the feature for an active actor holding the tool, after a good signature", async () => {
    expect(await answer(await receiveStaffAction(await post({ actor: { portalUserId: ACTOR } }), feature))).toEqual({ status: 200, body: { ok: true, done: true } });
    expect(run).toHaveBeenCalledOnce();
  });

  it("refuses an unsigned or wrongly signed request before reading anything, and a missing secret as unavailable", async () => {
    const wrong = await receiveStaffAction(await post({ actor: { portalUserId: ACTOR } }, { secret: "x".repeat(40) }), feature);
    expect(wrong.status).toBe(401);
    const otherPath = await receiveStaffAction(await post({ actor: { portalUserId: ACTOR } }, { path: `${STAFF_ACTIONS_PATH_PREFIX}/test/other` }), feature);
    expect(otherPath.status).toBe(401);
    delete process.env.STAFF_ACTIONS_SECRET;
    expect((await receiveStaffAction(await post({ actor: { portalUserId: ACTOR } }), feature)).status).toBe(503);
    expect(run).not.toHaveBeenCalled();
  });

  it("refuses an actor with no grant, a revoked grant, or an account that is not active, and never runs the feature", async () => {
    tables["tool_access"] = [];
    expect((await answer(await receiveStaffAction(await post({ actor: { portalUserId: ACTOR } }), feature))).body).toEqual({ ok: false, error: "not_allowed" });
    tables["tool_access"] = [{ user_id: ACTOR, tool_id: "t1", revoked_at: "2026-11-01T00:00:00Z" }];
    expect((await receiveStaffAction(await post({ actor: { portalUserId: ACTOR } }), feature)).status).toBe(403);
    tables["tool_access"] = [{ user_id: ACTOR, tool_id: "t1", revoked_at: null }];
    tables["profiles"] = [{ id: ACTOR, account_status: "suspended" }];
    expect((await receiveStaffAction(await post({ actor: { portalUserId: ACTOR } }), feature)).status).toBe(403);
    expect(run).not.toHaveBeenCalled();
  });

  it("checks the grant for the feature's own tool, not just any grant", async () => {
    tables["tools"] = [{ id: "t2", key: "something-else" }];
    expect((await receiveStaffAction(await post({ actor: { portalUserId: ACTOR } }), feature)).status).toBe(403);
  });

  it("passes on the feature's own refusal with its sentence, and a database failure as unavailable", async () => {
    run.mockRejectedValueOnce(new Refusal("conflict", "This question already has answers."));
    expect(await answer(await receiveStaffAction(await post({ actor: { portalUserId: ACTOR } }), feature))).toEqual({ status: 409, body: { ok: false, error: "conflict", message: "This question already has answers." } });
    failTable = "profiles";
    expect((await receiveStaffAction(await post({ actor: { portalUserId: ACTOR } }), feature)).status).toBe(503);
  });

  it("says in a sentence what is wrong with a request, and refuses something that is not JSON", async () => {
    expect((await answer(await receiveStaffAction(await post({}), feature))).body).toEqual({ ok: false, error: "invalid", message: "Who is acting?" });
    expect((await receiveStaffAction(await post(null, { raw: "{not json" }), feature)).status).toBe(400);
  });
});
