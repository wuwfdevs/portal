import { describe, expect, it } from "vitest";
import { parseAuthoringRequest, planQuestionChanges, statusChangeProblem } from "./authoring";

const ACTOR = { portalUserId: "11111111-1111-4111-8111-111111111111" };
const Q1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const Q2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const query = { internalTitle: "Storm recovery", publicTitle: "How is recovery going?", publicIntro: "Tell us.", internalNotes: null, askedBy: null, fromLabel: null, contextLabel: null, allowTextAnswers: true, opensAt: null, closesAt: null };
const q = (prompt: string, extra: object = {}) => ({ prompt, guidance: null, required: false, maxDurationSeconds: 120, ...extra });

describe("parsing an authoring request", () => {
  it("needs an actor that is a Portal user id", () => {
    expect(parseAuthoringRequest("list", { actor: { portalUserId: "leigh@wuwf.org" } }).ok).toBe(false);
    expect(parseAuthoringRequest("list", {}).ok).toBe(false);
    expect(parseAuthoringRequest("list", { actor: ACTOR }).ok).toBe(true);
  });

  it("reads a save, trimming text and turning empty optional fields into null", () => {
    const r = parseAuthoringRequest("save", { actor: ACTOR, query: { ...query, internalTitle: "  Storm  ", askedBy: "  " }, questions: [q("  What changed?  ")] });
    expect(r.ok && r.value.action === "save" && r.value.query.internalTitle).toBe("Storm");
    expect(r.ok && r.value.action === "save" && r.value.query.askedBy).toBe(null);
    expect(r.ok && r.value.action === "save" && r.value.questions[0]?.prompt).toBe("What changed?");
  });

  it("applies the staff screens' rules, with their sentences", () => {
    const empty = parseAuthoringRequest("save", { actor: ACTOR, query: { ...query, internalTitle: "" }, questions: [] });
    expect(!empty.ok && empty.message).toBe("Give the query an internal title.");
    const backwards = parseAuthoringRequest("save", { actor: ACTOR, query: { ...query, opensAt: "2026-12-02T00:00:00Z", closesAt: "2026-12-01T00:00:00Z" }, questions: [] });
    expect(!backwards.ok && backwards.message).toBe("The closing date must be after the opening date.");
    const short = parseAuthoringRequest("save", { actor: ACTOR, query, questions: [q("Hi", { maxDurationSeconds: 5 })] });
    expect(!short.ok && short.message).toContain("Question 1");
    const blank = parseAuthoringRequest("save", { actor: ACTOR, query, questions: [q("   ")] });
    expect(!blank.ok && blank.message).toContain("needs a prompt");
  });

  it("refuses a sixth question, a repeated id, an unknown field type and a bad code", () => {
    expect(parseAuthoringRequest("save", { actor: ACTOR, query, questions: Array.from({ length: 6 }, (_, i) => q(`Q${i}`)) }).ok).toBe(false);
    expect(parseAuthoringRequest("save", { actor: ACTOR, query, questions: [q("a", { id: Q1 }), q("b", { id: Q1 })] }).ok).toBe(false);
    expect(parseAuthoringRequest("save", { actor: ACTOR, query: { ...query, allowTextAnswers: "yes" }, questions: [] }).ok).toBe(false);
    expect(parseAuthoringRequest("get", { actor: ACTOR, publicId: "../../etc" }).ok).toBe(false);
    expect(parseAuthoringRequest("get", { actor: ACTOR, publicId: "abcd1234efgh5678" }).ok).toBe(true);
    expect(parseAuthoringRequest("set-status", { actor: ACTOR, publicId: "abcd1234efgh5678", status: "published" }).ok).toBe(false);
  });
});

describe("planning a save's question changes", () => {
  const held = [{ id: Q1, position: 1 }, { id: Q2, position: 2 }];

  it("updates held questions, adds new ones and removes the missing, ending as 1..n in the order sent", () => {
    const r = planQuestionChanges(held, [q("new first"), q("two", { id: Q2 }), q("one", { id: Q1 })], false);
    expect(r.ok && r.plan.update.map((u) => [u.id, u.position])).toEqual([[Q2, 2], [Q1, 3]]);
    expect(r.ok && r.plan.add.map((a) => a.position)).toEqual([1]);
    const removed = planQuestionChanges(held, [q("only", { id: Q2 })], false);
    expect(removed.ok && removed.plan.remove).toEqual([Q1]);
  });

  it("refuses a question the query does not hold", () => {
    const r = planQuestionChanges(held, [q("x", { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" })], false);
    expect(!r.ok && r.error).toBe("invalid");
  });

  it("once there are submissions, refuses a removal and a reorder, and lets wording change and questions be added at the end", () => {
    const removal = planQuestionChanges(held, [q("one", { id: Q1 })], true);
    expect(!removal.ok && removal.error).toBe("conflict");
    const reorder = planQuestionChanges(held, [q("two", { id: Q2 }), q("one", { id: Q1 })], true);
    expect(!reorder.ok && reorder.error).toBe("conflict");
    const addedFirst = planQuestionChanges(held, [q("new"), q("one", { id: Q1 }), q("two", { id: Q2 })], true);
    expect(!addedFirst.ok && addedFirst.error).toBe("conflict");
    const fine = planQuestionChanges(held, [q("one, reworded", { id: Q1 }), q("two", { id: Q2 }), q("new")], true);
    expect(fine.ok && fine.plan.add.map((a) => a.position)).toEqual([3]);
  });
});

describe("status changes", () => {
  it("will not open a query with no question, and allows everything else", () => {
    expect(statusChangeProblem("open", 0)).toBe("Add at least one question before opening it.");
    expect(statusChangeProblem("open", 1)).toBeNull();
    expect(statusChangeProblem("closed", 0)).toBeNull();
    expect(statusChangeProblem("draft", 0)).toBeNull();
  });
});
