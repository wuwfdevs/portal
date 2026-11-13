import { describe, expect, it } from "vitest";
import {
  LISTENING_ERROR_CODES, LISTENING_PATHS, listeningCardLinkUrl, listeningTableLinkUrl, MAX_SUBJECT_ID_LENGTH, SIGNATURE_HEADER, TIMESTAMP_HEADER, isListeningErrorCode, isListeningSubject, signRequest,
  verifyRequestSignature,
  type ListeningStartRequest,
} from "./index";

const SECRET = "l".repeat(40);
const OTHER = "t".repeat(40);
const NOW = 1_800_000_000;

describe("listening subject", () => {
  it("accepts a visitor or an account with an opaque id", () => {
    expect(isListeningSubject({ kind: "visitor", id: "v_8f3a-91c2" })).toBe(true);
    expect(isListeningSubject({ kind: "account", id: "11111111-1111-4111-8111-111111111111" })).toBe(true);
  });

  it("refuses an unknown kind, an empty or over-long id, and ids that could carry an email or a path", () => {
    expect(isListeningSubject({ kind: "donor", id: "abc" })).toBe(false);
    expect(isListeningSubject({ kind: "visitor", id: "" })).toBe(false);
    expect(isListeningSubject({ kind: "visitor", id: "a".repeat(MAX_SUBJECT_ID_LENGTH + 1) })).toBe(false);
    expect(isListeningSubject({ kind: "visitor", id: "a".repeat(MAX_SUBJECT_ID_LENGTH) })).toBe(true);
    expect(isListeningSubject({ kind: "visitor", id: "leigh@wuwf.org" })).toBe(false);
    expect(isListeningSubject({ kind: "visitor", id: "../x" })).toBe(false);
  });

  it("refuses things that are not objects", () => {
    expect(isListeningSubject(null)).toBe(false);
    expect(isListeningSubject("visitor")).toBe(false);
    expect(isListeningSubject({ kind: "visitor" })).toBe(false);
    expect(isListeningSubject({ kind: "visitor", id: 7 })).toBe(false);
  });
});

describe("listening error codes", () => {
  it("recognises exactly the published codes", () => {
    for (const code of LISTENING_ERROR_CODES) expect(isListeningErrorCode(code)).toBe(true);
    expect(isListeningErrorCode("nope")).toBe(false);
    expect(isListeningErrorCode(undefined)).toBe(false);
  });

  it("covers every refusal the Portal's participant flow already gives", () => {
    const portal = [
      "not_accepting", "not_open", "submission_limit", "unsupported_type", "unknown_question", "invalid_size", "too_long",
      "consent_required", "no_answers", "required_answer_missing", "required_field_missing", "unavailable",
    ];
    for (const code of portal) expect(LISTENING_ERROR_CODES).toContain(code);
  });
});

describe("listening paths", () => {
  it("sit under one prefix, are distinct, and carry no query string", () => {
    const paths = Object.values(LISTENING_PATHS);
    expect(new Set(paths).size).toBe(paths.length);
    for (const p of paths) {
      expect(p.startsWith("/api/site/listening/")).toBe(true);
      expect(p.includes("?")).toBe(false);
    }
  });
});

describe("listening requests are signed like every other channel", () => {
  const body: ListeningStartRequest = { subject: { kind: "visitor", id: "v_8f3a-91c2" }, publicId: "abc123" };
  const json = JSON.stringify(body);

  async function verify(path: string, bodyText: string, secret: string, now = NOW) {
    const headers = await signRequest({ method: "POST", path: LISTENING_PATHS.start, body: json, now }, SECRET);
    return verifyRequestSignature(
      { method: "POST", path, body: bodyText, signature: headers[SIGNATURE_HEADER], timestamp: headers[TIMESTAMP_HEADER], version: headers["x-wuwf-contract-version"] },
      secret,
      NOW,
    );
  }

  it("verifies on the path and body that were signed", async () => {
    expect(await verify(LISTENING_PATHS.start, json, SECRET)).toEqual({ ok: true });
  });

  it("refuses the same signature on another listening path (no replay across endpoints)", async () => {
    expect(await verify(LISTENING_PATHS.finalize, json, SECRET)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("refuses a body with a different subject, so a captured request cannot be replayed as someone else", async () => {
    const other = JSON.stringify({ ...body, subject: { kind: "visitor", id: "v_someone-else" } });
    expect(await verify(LISTENING_PATHS.start, other, SECRET)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("refuses another channel's secret", async () => {
    expect(await verify(LISTENING_PATHS.start, json, OTHER)).toEqual({ ok: false, reason: "bad_signature" });
  });
});

describe("table links", () => {
  it("puts the token in the path of the site's table page", () => {
    expect(listeningTableLinkUrl("https://site.example", "abc_-123")).toBe("https://site.example/listens/table/abc_-123");
  });
  it("does not double a trailing slash on the origin", () => {
    expect(listeningTableLinkUrl("https://site.example/", "t")).toBe("https://site.example/listens/table/t");
  });
});

describe("card links", () => {
  it("puts the table's second token in the path of the site's card page", () => {
    expect(listeningCardLinkUrl("https://site.example/", "abc_-123")).toBe("https://site.example/listens/card/abc_-123");
  });
});
