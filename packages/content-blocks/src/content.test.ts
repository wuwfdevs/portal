import { describe, expect, it } from "vitest";
import {
  parseContentDocument, plainText, publicBlocks, readingMinutes, toPublicDocument, totalAudioMs, wordCount,
  type ContentBlock, type ContentDocument,
} from "./index";

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function valid(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    title: "Rebuild, raise or leave?",
    dek: "For families on Perdido Key the question is the street.",
    media: [{ id: "m1", mimeType: "audio/mpeg", durationMs: 106000, sha256: "a".repeat(64) }],
    blocks: [
      { id: U(1), type: "narration", text: "The first contractor quoted a repair." },
      { id: U(2), type: "audio_excerpt", mediaId: "m1", transcript: "It's not a roof. It's a vote.", speaker: { name: "Dana Whitlock", description: "Resident, Warrington" }, source: { title: "Whitlock interview", recordedOn: "2026-10-12" }, startMs: 1000, endMs: 6500, caption: "Dana Whitlock walks the house." },
      { id: U(3), type: "editor_note", text: "Check the quote with her again." },
      { id: U(4), type: "text", style: "quote", text: "I'll be the house on stilts.", attribution: "Ray Castellano" },
    ],
    provenance: { system: "portal", projectId: U(10), pieceId: U(11), version: 3, excerptIds: [U(20)], findingIds: [U(30), U(31)], sentBy: U(40), sentAt: "2026-10-29T14:00:00Z" },
    placement: { publishingIdentity: "wuwf-news", fellowship: "coastal-futures", series: "after-isaias" },
  };
}

describe("parseContentDocument", () => {
  it("accepts a complete document and returns it unchanged in shape", () => {
    const r = parseContentDocument(valid());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.blocks).toHaveLength(4);
      expect(r.value.provenance.version).toBe(3);
      expect(r.value.placement?.fellowship).toBe("coastal-futures");
    }
  });

  it("does not carry unknown keys through, so nothing unreviewed is stored", () => {
    const doc = valid() as Record<string, unknown>;
    doc.surprise = "x";
    (doc.blocks as Record<string, unknown>[])[0]!.html = "<script>alert(1)</script>";
    const r = parseContentDocument(doc);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(JSON.stringify(r.value)).not.toContain("<script");
      expect(JSON.stringify(r.value)).not.toContain("alert(1)");
      expect(JSON.stringify(r.value)).not.toContain("surprise");
    }
  });

  it("refuses a non-object and a wrong schema version", () => {
    expect(parseContentDocument(null).ok).toBe(false);
    expect(parseContentDocument([]).ok).toBe(false);
    const r = parseContentDocument({ ...valid(), schemaVersion: 2 });
    expect(r).toEqual({ ok: false, errors: ["schemaVersion must be 1"] });
  });

  it("lists every problem, not just the first", () => {
    const doc = valid();
    doc.title = "";
    (doc.blocks as Record<string, unknown>[])[0] = { id: "nope", type: "mystery" };
    const r = parseContentDocument(doc);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContain("document.title must not be empty");
      expect(r.errors).toContain("blocks[0].id must be a UUID");
      expect(r.errors.some((e) => e.includes('"mystery" is not a known block type'))).toBe(true);
    }
  });

  it("refuses a repeated block id and a repeated media id", () => {
    const doc = valid();
    (doc.blocks as Record<string, unknown>[])[1]!.id = U(1);
    (doc.media as Record<string, unknown>[]).push({ id: "m1", mimeType: "audio/wav" });
    const r = parseContentDocument(doc);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContain("blocks[1].id repeats an earlier block id");
      expect(r.errors).toContain("media[1].id repeats an earlier media id");
    }
  });

  describe("audio excerpts", () => {
    const withExcerpt = (patch: Record<string, unknown>) => {
      const doc = valid();
      Object.assign((doc.blocks as Record<string, unknown>[])[1]!, patch);
      return parseContentDocument(doc);
    };
    it("must point at media that is in the document", () => {
      const r = withExcerpt({ mediaId: "missing" });
      expect(!r.ok && r.errors.some((e) => e.includes('"missing" is not in media'))).toBe(true);
    });
    it("need a speaker, a source, a transcript and a real range", () => {
      expect(withExcerpt({ speaker: undefined }).ok).toBe(false);
      expect(withExcerpt({ source: undefined }).ok).toBe(false);
      expect(withExcerpt({ transcript: "  " }).ok).toBe(false);
      expect(withExcerpt({ startMs: 5000, endMs: 5200 }).ok).toBe(false); // under 500 ms
      expect(withExcerpt({ startMs: 9000, endMs: 1000 }).ok).toBe(false); // reversed
      expect(withExcerpt({ startMs: 1.5, endMs: 9000 }).ok).toBe(false); // not an integer
    });
    it("refuse an impossible recording date", () => {
      expect(withExcerpt({ source: { title: "x", recordedOn: "2026-02-30" } }).ok).toBe(false);
      expect(withExcerpt({ source: { title: "x", recordedOn: "10/12/2026" } }).ok).toBe(false);
    });
  });

  it("refuses a bad checksum, media type and placement slug", () => {
    const doc = valid();
    (doc.media as Record<string, unknown>[])[0]!.sha256 = "ABC";
    expect(parseContentDocument(doc).ok).toBe(false);
    const doc2 = valid();
    (doc2.media as Record<string, unknown>[])[0]!.mimeType = "audio";
    expect(parseContentDocument(doc2).ok).toBe(false);
    const doc3 = valid();
    doc3.placement = { fellowship: "Coastal Futures!" };
    expect(parseContentDocument(doc3).ok).toBe(false);
  });

  it("requires provenance with real ids and a real timestamp, and version 1 or more", () => {
    for (const patch of [{ pieceId: "x" }, { version: 0 }, { sentAt: "yesterday" }, { system: "elsewhere" }, { excerptIds: ["x"] }]) {
      const doc = valid();
      doc.provenance = { ...(doc.provenance as object), ...patch };
      expect(parseContentDocument(doc).ok, JSON.stringify(patch)).toBe(false);
    }
    const none = valid();
    delete none.provenance;
    expect(parseContentDocument(none).ok).toBe(false);
  });

  it("refuses text that is too long", () => {
    const doc = valid();
    (doc.blocks as Record<string, unknown>[])[0]!.text = "x".repeat(20_001);
    expect(parseContentDocument(doc).ok).toBe(false);
  });
});

describe("publishing rules", () => {
  const doc = (): ContentDocument => {
    const r = parseContentDocument(valid());
    if (!r.ok) throw new Error(r.errors.join("; "));
    return r.value;
  };

  it("never lets an editor note reach a reader", () => {
    const d = doc();
    expect(d.blocks.some((b) => b.type === "editor_note")).toBe(true);
    expect((publicBlocks(d.blocks) as ContentBlock[]).some((b) => b.type === "editor_note")).toBe(false);
    expect(toPublicDocument(d).blocks.some((b) => b.type === "editor_note")).toBe(false);
    expect(plainText(d.blocks)).not.toContain("Check the quote");
    expect(JSON.stringify(toPublicDocument(d))).not.toContain("Check the quote");
  });

  it("does not mutate the document it was given", () => {
    const d = doc();
    toPublicDocument(d);
    expect(d.blocks).toHaveLength(4);
  });

  it("reads an audio excerpt as its transcript and counts its length", () => {
    const d = doc();
    expect(plainText(d.blocks)).toContain("It's not a roof.");
    expect(totalAudioMs(d.blocks)).toBe(5500);
  });

  it("counts words and reading time, rounding up to a minute for any text", () => {
    expect(wordCount("  one two\nthree  ")).toBe(3);
    expect(wordCount("")).toBe(0);
    expect(readingMinutes([])).toBe(0);
    expect(readingMinutes(doc().blocks)).toBe(1);
    const long = [{ id: U(9), type: "narration" as const, text: Array(1000).fill("word").join(" ") }];
    expect(readingMinutes(long)).toBe(5);
  });
});
