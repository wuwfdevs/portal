import { beforeEach, describe, expect, it, vi } from "vitest";
import { planLegacyCopyImport, type LegacyCopyRow, type LegacyCopySnapshot } from "./legacy-copy";

// The write path against a recording stand-in for the Supabase client: what
// it inserts, updates and links, and that rotation is re-sequenced for every
// contract whose linked copy changed — through the existing rebalance, not a
// second rotation mechanism.

vi.mock("server-only", () => ({}));

const calls: { table: string; op: string; payload: unknown; filter?: unknown }[] = [];
let failInsertLabel: string | null = null;
let nextId = 0;

function builder(table: string) {
  let op = "select";
  let payload: unknown;
  const chain = {
    insert(value: { label?: string }) {
      op = "insert";
      payload = value;
      return chain;
    },
    update(value: unknown) {
      op = "update";
      payload = value;
      return chain;
    },
    upsert(value: unknown) {
      op = "upsert";
      payload = value;
      calls.push({ table, op, payload });
      return Promise.resolve({ error: null });
    },
    select() {
      return chain;
    },
    eq(_column: string, value: unknown) {
      calls.push({ table, op, payload, filter: value });
      return Promise.resolve({ error: null });
    },
    single() {
      calls.push({ table, op, payload });
      const label = (payload as { label?: string }).label;
      if (failInsertLabel && label === failInsertLabel)
        return Promise.resolve({ data: null, error: { message: "boom" } });
      nextId += 1;
      return Promise.resolve({ data: { id: `${table}-${nextId}` }, error: null });
    },
  };
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: (table: string) => builder(table) }),
}));

const audit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAuditEvent: (event: unknown) => audit(event) }));

const rebalance = vi.fn<
  (contractId: string, actorId: string) => Promise<{ changed: number; refused: never[] }>
>(async () => ({ changed: 1, refused: [] }));
vi.mock("./rotation-rebalance", () => ({
  rebalanceContractRotation: (contractId: string, actorId: string) =>
    rebalance(contractId, actorId),
}));

const { executeLegacyCopyImport } = await import("./legacy-copy-import");

function row(overrides: Partial<LegacyCopyRow>): LegacyCopyRow {
  return {
    row: 5,
    underwriter: "Phil Hall, PA",
    label: "Copy 1",
    cart: "210",
    lengthSeconds: 30,
    startDate: "2026-06-22",
    endDate: "2027-06-13",
    script: "Support for WUWF comes from Phil Hall, P.A. in Pensacola.",
    ...overrides,
  };
}

const SNAPSHOT: LegacyCopySnapshot = {
  underwriters: [{ id: "uw-hall", name: "Phil Hall, PA" }],
  copy: [
    {
      id: "copy-existing",
      underwriter_id: "uw-hall",
      label: "Copy 2",
      cart_identifier: "211",
      script: "Support for WUWF comes from attorney Phil Hall.",
      execution_kind: "live_read",
      duration_seconds: 5,
      effective_from: "2026-09-08",
      effective_to: null,
      approval_status: "approved",
      created_at: "2026-09-08T12:00:00Z",
    },
  ],
  contracts: [
    {
      id: "c-hall",
      underwriter_id: "uw-hall",
      contract_identifier: "128578",
      sponsorship_category: null,
      status: "active",
      effective_from: "2026-06-15",
      effective_to: "2027-06-13",
    },
  ],
  flights: [],
  links: [],
};

beforeEach(() => {
  calls.length = 0;
  failInsertLabel = null;
  nextId = 0;
  audit.mockClear();
  rebalance.mockClear();
});

describe("executeLegacyCopyImport", () => {
  it("creates, updates and links copy, then rebalances each touched contract once", async () => {
    const rows = [
      row({
        row: 6,
        label: "Copy 3",
        cart: "212",
        script: "Support for WUWF comes from Phil Hall, Ask A Lawyer First.",
      }),
      row({ row: 5 }),
      row({
        row: 7,
        label: "Copy 2",
        cart: "211",
        script: "Support for WUWF comes from attorney Phil Hall.",
      }),
    ];
    const plan = planLegacyCopyImport(rows, SNAPSHOT);
    const result = await executeLegacyCopyImport(plan, SNAPSHOT, "admin-1", "export.csv");

    const inserted = calls.filter((call) => call.table === "uw_copy" && call.op === "insert");
    // Label order, so the rotation cycles Copy 1 before Copy 3.
    expect(inserted.map((call) => (call.payload as { label: string }).label)).toEqual([
      "Copy 1",
      "Copy 3",
    ]);
    expect(inserted[0]!.payload).toMatchObject({
      underwriter_id: "uw-hall",
      approval_status: "approved",
      execution_kind: "live_read",
      cart_identifier: "210",
      effective_from: "2026-06-22",
      effective_to: "2027-06-13",
      created_by: "admin-1",
    });
    expect(calls.filter((call) => call.table === "uw_copy" && call.op === "update")).toEqual([
      {
        table: "uw_copy",
        op: "update",
        payload: { effective_from: "2026-06-22", effective_to: "2027-06-13" },
        filter: "copy-existing",
      },
    ]);
    expect(calls.filter((call) => call.table === "uw_contract_copy")).toHaveLength(3);
    expect(rebalance).toHaveBeenCalledTimes(1);
    expect(rebalance).toHaveBeenCalledWith("c-hall", "admin-1");
    expect(result).toMatchObject({
      created: 2,
      updated: 1,
      linked: 3,
      failed: 0,
      rebalanced: { contracts: 1, changed: 1 },
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "underwriting.copy.legacy_imported",
        actorId: "admin-1",
        metadata: expect.objectContaining({ source: "export.csv", created: 2, linked: 3 }),
      }),
    );
  });

  it("writes nothing and rebalances nothing when every row is already in the portal", async () => {
    const already: LegacyCopySnapshot = {
      ...SNAPSHOT,
      copy: [{ ...SNAPSHOT.copy[0]!, effective_from: "2026-06-22", effective_to: "2027-06-13" }],
      links: [{ contract_id: "c-hall", copy_id: "copy-existing", flight_id: null }],
    };
    const plan = planLegacyCopyImport(
      [
        row({
          label: "Copy 2",
          cart: "211",
          script: "Support for WUWF comes from attorney Phil Hall.",
        }),
      ],
      already,
    );
    expect(plan.counts).toMatchObject({ ready: 0, done: 1 });
    const result = await executeLegacyCopyImport(plan, already, "admin-1", "export.csv");
    expect(calls.filter((call) => call.op !== "select")).toEqual([]);
    expect(rebalance).not.toHaveBeenCalled();
    expect(result).toMatchObject({ created: 0, updated: 0, linked: 0 });
  });

  it("adds a new underwriter once, however many of its rows import", async () => {
    const rows = [
      row({
        row: 5,
        underwriter: "WUWF Day Sponsor",
        label: "Day Sponsor",
        cart: "300",
        script: "Support for WUWF comes from today's day sponsor, A.",
      }),
      row({
        row: 6,
        underwriter: "WUWF Day Sponsor",
        label: "Day Sponsor",
        cart: "300",
        script: "Support for WUWF comes from today's day sponsor, B.",
      }),
    ];
    const plan = planLegacyCopyImport(rows, SNAPSHOT);
    const result = await executeLegacyCopyImport(plan, SNAPSHOT, "admin-1", "export.csv");
    expect(calls.filter((call) => call.table === "uw_underwriters")).toHaveLength(1);
    expect(result.underwritersAdded).toEqual(["WUWF Day Sponsor"]);
    expect(calls.filter((call) => call.table === "uw_contract_copy")).toEqual([]);
    expect(rebalance).not.toHaveBeenCalled();
    expect(result.underwriterOnly).toBe(2);
  });

  it("keeps going past a failed message and reports it", async () => {
    failInsertLabel = "Copy 1";
    const rows = [
      row({ row: 5 }),
      row({ row: 6, label: "Copy 3", cart: "212", script: "Another message entirely." }),
    ];
    const plan = planLegacyCopyImport(rows, SNAPSHOT);
    const result = await executeLegacyCopyImport(plan, SNAPSHOT, "admin-1", "export.csv");
    expect(result.failed).toBe(1);
    expect(result.created).toBe(1);
    expect(result.rows.find((entry) => entry.outcome === "failed")).toMatchObject({
      label: "Copy 1",
      detail: expect.stringContaining("boom"),
    });
  });
});
