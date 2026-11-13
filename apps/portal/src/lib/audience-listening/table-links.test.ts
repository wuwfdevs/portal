import { describe, expect, it } from "vitest";
import { generateJoinToken, hashJoinToken, isJoinToken, issueTableLink } from "./table-links";

describe("table links", () => {
  it("makes a 256-bit token in base64url that nothing else looks like", () => {
    const a = generateJoinToken();
    expect(a).toHaveLength(43);
    expect(isJoinToken(a)).toBe(true);
    expect(generateJoinToken()).not.toBe(a);
    expect(isJoinToken("short")).toBe(false);
    expect(isJoinToken(`${a.slice(0, 42)}/`)).toBe(false);
  });

  it("stores a 64-character hex hash, not the token", () => {
    const token = generateJoinToken();
    const hash = hashJoinToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(hashJoinToken(token)).toBe(hash);
    expect(hashJoinToken("x")).toBe("2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881");
  });

  it("builds the address the card carries, with the token in the path", () => {
    const link = issueTableLink({ id: "t1", number: 3 }, "https://site.example/");
    expect(link.url).toBe(`https://site.example/listens/table/${link.token}`);
    expect(link.hash).toBe(hashJoinToken(link.token));
    expect(link.number).toBe(3);
  });

  it("makes the card's second token only when asked, and never the same as the table's", () => {
    const single = issueTableLink({ id: "t1", number: 3 }, "https://site.example");
    expect(single.card).toBeNull();
    const whole = issueTableLink({ id: "t1", number: 3 }, "https://site.example", { withCard: true });
    expect(whole.card!.url).toMatch(/^https:\/\/site\.example\/listens\/card\/[A-Za-z0-9_-]{43}$/);
    expect(whole.card!.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(whole.card!.hash).not.toBe(whole.hash);
    expect(whole.card!.url).not.toContain(whole.token);
  });
});
