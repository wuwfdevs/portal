import { describe, expect, it } from "vitest";
import {
  AUTHORING_ACTOR_ID, AUTHORING_STATUSES, LISTENING_AUTHORING_ACTIONS, LISTENING_AUTHORING_ERROR_CODES, LISTENING_AUTHORING_PATHS, LISTENING_PATHS,
  isListeningAuthoringErrorCode, isListeningAuthoringStatus, signRequest, verifyRequestSignature,
} from "./index";

const SECRET = "a".repeat(40);
const OTHER = "b".repeat(40);
const NOW = 1_800_000_000;

describe("listening authoring channel", () => {
  it("has one path per action, all under its own prefix, none shared with the listener channel", () => {
    const paths = Object.values(LISTENING_AUTHORING_PATHS);
    expect(paths).toHaveLength(LISTENING_AUTHORING_ACTIONS.length);
    for (const action of LISTENING_AUTHORING_ACTIONS) expect(paths).toContain(`/api/site/listening-authoring/${action}`);
    const listener = new Set<string>(Object.values(LISTENING_PATHS));
    for (const p of paths) expect(listener.has(p)).toBe(false);
  });

  it("recognises its statuses and error codes and nothing else", () => {
    for (const s of AUTHORING_STATUSES) expect(isListeningAuthoringStatus(s)).toBe(true);
    expect(isListeningAuthoringStatus("published")).toBe(false);
    for (const c of LISTENING_AUTHORING_ERROR_CODES) expect(isListeningAuthoringErrorCode(c)).toBe(true);
    expect(isListeningAuthoringErrorCode("teapot")).toBe(false);
  });

  it("takes a Portal user id as the actor, not an email or a path", () => {
    expect(AUTHORING_ACTOR_ID.test("11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(AUTHORING_ACTOR_ID.test("leigh@wuwf.org")).toBe(false);
    expect(AUTHORING_ACTOR_ID.test("../x")).toBe(false);
  });

  it("is signed like every channel: another channel's secret does not verify, and neither does another path", async () => {
    const body = JSON.stringify({ actor: { portalUserId: "11111111-1111-4111-8111-111111111111" } });
    const path = LISTENING_AUTHORING_PATHS.list;
    const headers = await signRequest({ method: "POST", path, body, now: NOW }, SECRET);
    const input = { method: "POST", path, body, signature: headers["x-wuwf-signature"], timestamp: headers["x-wuwf-timestamp"], version: headers["x-wuwf-contract-version"] };
    expect(await verifyRequestSignature(input, SECRET, NOW)).toEqual({ ok: true });
    expect(await verifyRequestSignature(input, OTHER, NOW)).toEqual({ ok: false, reason: "bad_signature" });
    expect(await verifyRequestSignature({ ...input, path: LISTENING_AUTHORING_PATHS.save }, SECRET, NOW)).toEqual({ ok: false, reason: "bad_signature" });
  });
});
