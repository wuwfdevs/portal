import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bootstrapAdmin, optionsProblem, parseArgs } from "./bootstrap-admin.mjs";

/** A stand-in for the Supabase client: only what the script calls, and it records every write. */
function fakeClient({ admins = [], accounts = [], invite, auditError = null } = {}) {
  const calls = { invites: [], audits: [] };
  const from = (table) => {
    const filters = {};
    const builder = {
      select: () => builder,
      eq: (column, value) => {
        filters[column] = value;
        return builder;
      },
      limit: () => builder,
      insert: (row) => {
        calls.audits.push({ table, row });
        return Promise.resolve({ error: auditError });
      },
      then: (resolve, reject) => {
        const data = table === "profiles" ? (filters.platform_role ? admins : accounts) : [];
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return builder;
  };
  const auth = {
    admin: {
      inviteUserByEmail: async (email, options) => {
        calls.invites.push({ email, options });
        return invite ?? { data: { user: { id: "new-user-id" } }, error: null };
      },
    },
  };
  return { client: { from, auth }, calls };
}

const GOOD = {
  email: "Jordan@Station.org",
  displayName: "  Jordan Mays ",
  siteUrl: "https://tools.station.org",
};

describe("parseArgs", () => {
  it("reads spaced and equals-sign flags", () => {
    expect(
      parseArgs(["--email", "a@b.org", "--name=Jo Mays", "--site-url", "https://x.org"]),
    ).toEqual({
      email: "a@b.org",
      displayName: "Jo Mays",
      siteUrl: "https://x.org",
    });
  });
  it("refuses an unknown flag and a stray argument", () => {
    expect(() => parseArgs(["--role", "administrator"])).toThrow(/Unknown option --role/);
    expect(() => parseArgs(["a@b.org"])).toThrow(/Unexpected argument/);
  });
});

describe("optionsProblem", () => {
  it("accepts good options, and localhost over http", () => {
    expect(optionsProblem(GOOD)).toBeNull();
    expect(optionsProblem({ ...GOOD, siteUrl: "http://localhost:3000" })).toBeNull();
  });
  it("says what is wrong", () => {
    expect(optionsProblem({ ...GOOD, email: "nope" })).toMatch(/--email/);
    expect(optionsProblem({ ...GOOD, email: undefined })).toMatch(/--email/);
    expect(optionsProblem({ ...GOOD, displayName: " " })).toMatch(/--name/);
    expect(optionsProblem({ ...GOOD, siteUrl: undefined })).toMatch(/--site-url/);
    expect(optionsProblem({ ...GOOD, siteUrl: "not a url" })).toMatch(/not an address/);
    expect(optionsProblem({ ...GOOD, siteUrl: "http://tools.station.org" })).toMatch(/https/);
  });
});

describe("bootstrapAdmin", () => {
  it("sends the administrator invitation the Administration page would send", async () => {
    const { client, calls } = fakeClient();
    const result = await bootstrapAdmin({ client, ...GOOD });
    expect(result).toEqual({ ok: true, userId: "new-user-id", auditWritten: true });
    expect(calls.invites).toEqual([
      {
        email: "jordan@station.org",
        options: {
          data: { display_name: "Jordan Mays", platform_role: "administrator" },
          redirectTo: "https://tools.station.org/auth/callback",
        },
      },
    ]);
  });

  it("builds the callback from the site's origin, whatever path was typed", async () => {
    const { client, calls } = fakeClient();
    await bootstrapAdmin({ client, ...GOOD, siteUrl: "https://tools.station.org/some/path/" });
    expect(calls.invites[0].options.redirectTo).toBe("https://tools.station.org/auth/callback");
  });

  it("writes one audit line for the new administrator", async () => {
    const { client, calls } = fakeClient();
    await bootstrapAdmin({ client, ...GOOD });
    expect(calls.audits).toEqual([
      {
        table: "audit_events",
        row: {
          actor_id: "new-user-id",
          action: "admin.bootstrapped",
          target_type: "user",
          target_id: "new-user-id",
          metadata: { via: "scripts/bootstrap-admin.mjs" },
        },
      },
    ]);
  });

  it("refuses, and sends nothing, when an administrator already exists", async () => {
    const { client, calls } = fakeClient({ admins: [{ id: "a1", email: "x@y.org" }] });
    const result = await bootstrapAdmin({ client, ...GOOD });
    expect(result).toMatchObject({ ok: false, reason: "administrator_exists" });
    expect(calls.invites).toEqual([]);
    expect(calls.audits).toEqual([]);
  });

  it("refuses, and sends nothing, when the email already has an account", async () => {
    const { client, calls } = fakeClient({ accounts: [{ id: "p1", account_status: "invited" }] });
    const result = await bootstrapAdmin({ client, ...GOOD });
    expect(result).toMatchObject({ ok: false, reason: "account_exists" });
    expect(result.message).toMatch(/jordan@station\.org \(invited\)/);
    expect(calls.invites).toEqual([]);
  });

  it("does not touch the database for bad options", async () => {
    const { client, calls } = fakeClient();
    const result = await bootstrapAdmin({ client, ...GOOD, email: "nope" });
    expect(result).toMatchObject({ ok: false, reason: "bad_options" });
    expect(calls.invites).toEqual([]);
  });

  it("throws when the invitation cannot be sent, and writes no audit line", async () => {
    const { client, calls } = fakeClient({
      invite: { data: { user: null }, error: { message: "rate limit" } },
    });
    await expect(bootstrapAdmin({ client, ...GOOD })).rejects.toThrow(
      /could not be sent: rate limit/,
    );
    expect(calls.audits).toEqual([]);
  });

  it("still succeeds when only the audit line fails", async () => {
    const { client } = fakeClient({ auditError: { message: "denied" } });
    expect(await bootstrapAdmin({ client, ...GOOD })).toEqual({
      ok: true,
      userId: "new-user-id",
      auditWritten: false,
    });
  });
});

describe("the script itself", () => {
  const source = readFileSync(join(process.cwd(), "scripts/bootstrap-admin.mjs"), "utf8");

  it("never edits a profile: it invites, as the Administration page does", () => {
    expect(source).not.toMatch(/\.update\(|\.upsert\(|\.delete\(/);
    expect(source).not.toMatch(/from\("profiles"\)\s*\.insert/);
  });

  it("does not print the secret key", () => {
    expect(source).not.toMatch(
      /console\.(log|error)\([^)]*(secret|SUPABASE_SECRET_KEY)[^)]*\)\s*;?\s*$/m,
    );
    expect(source).toMatch(/never printed/);
  });
});
