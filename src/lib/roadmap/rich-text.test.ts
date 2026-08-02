import { describe, expect, it } from "vitest";
import {
  isEmptyRichText,
  parseRichText,
  plainTextToRichTextDoc,
  richTextToPlainText,
  type RichTextDoc,
} from "./rich-text";

function doc(...content: unknown[]) {
  return { type: "doc", content };
}

function paragraph(...content: unknown[]) {
  return { type: "paragraph", content };
}

function text(value: string, marks?: unknown[]) {
  return marks ? { type: "text", text: value, marks } : { type: "text", text: value };
}

describe("parseRichText", () => {
  it("keeps whitelisted nodes and marks", () => {
    const parsed = parseRichText(
      doc(
        { type: "heading", attrs: { level: 2 }, content: [text("Heading")] },
        paragraph(text("plain"), text("bold", [{ type: "bold" }])),
        { type: "bulletList", content: [{ type: "listItem", content: [paragraph(text("item"))] }] },
        { type: "horizontalRule" },
      ),
    );
    expect(parsed?.content.map((node) => node.type)).toEqual([
      "heading",
      "paragraph",
      "bulletList",
      "horizontalRule",
    ]);
  });

  it("drops node types that are not on the whitelist", () => {
    const parsed = parseRichText(
      doc(paragraph(text("kept")), { type: "image", attrs: { src: "http://x/y.png" } }),
    );
    expect(parsed?.content).toHaveLength(1);
    expect(parsed?.content[0]).toMatchObject({ type: "paragraph" });
  });

  it("drops marks that are not on the whitelist", () => {
    const parsed = parseRichText(doc(paragraph(text("x", [{ type: "highlight" }]))));
    const node = parsed?.content[0];
    expect(node).toMatchObject({ type: "paragraph" });
    if (node && node.type === "paragraph") {
      expect(node.content[0]).toMatchObject({ type: "text", marks: [] });
    }
  });

  describe("link hrefs", () => {
    function hrefOf(href: string): string | undefined {
      const parsed = parseRichText(doc(paragraph(text("l", [{ type: "link", attrs: { href } }]))));
      const node = parsed?.content[0];
      if (!node || node.type !== "paragraph") return undefined;
      const inline = node.content[0];
      if (!inline || inline.type !== "text") return undefined;
      const mark = inline.marks[0];
      return mark && mark.type === "link" ? mark.attrs.href : undefined;
    }

    it("keeps an internal path and an http(s) URL", () => {
      expect(hrefOf("/sourcework/123")).toBe("/sourcework/123");
      expect(hrefOf("https://example.org/a")).toBe("https://example.org/a");
      expect(hrefOf("http://example.org/a")).toBe("http://example.org/a");
    });

    it("drops javascript:, data:, and mailto:", () => {
      expect(hrefOf("javascript:alert(1)")).toBeUndefined();
      expect(hrefOf("data:text/html,<script>")).toBeUndefined();
      expect(hrefOf("mailto:someone@example.org")).toBeUndefined();
    });

    it("drops a protocol-relative URL, which starts with a slash but is not internal", () => {
      expect(hrefOf("//evil.example/x")).toBeUndefined();
    });
  });

  it("clamps a heading to the two levels the editor offers", () => {
    for (const [level, expected] of [
      [1, 3],
      [2, 2],
      [3, 3],
      [6, 3],
    ] as const) {
      const parsed = parseRichText(
        doc({ type: "heading", attrs: { level }, content: [text("h")] }),
      );
      expect(parsed?.content[0]).toMatchObject({ attrs: { level: expected } });
    }
  });

  it("strips marks inside a code block, where they would mean nothing", () => {
    const parsed = parseRichText(
      doc({ type: "codeBlock", content: [text("npm test", [{ type: "bold" }])] }),
    );
    const node = parsed?.content[0];
    if (node && node.type === "codeBlock") {
      expect(node.content[0]).toMatchObject({ type: "text", marks: [] });
    } else {
      expect.unreachable("expected a codeBlock");
    }
  });

  it("drops containers left empty, but keeps an empty paragraph as spacing", () => {
    const parsed = parseRichText(
      doc({ type: "bulletList", content: [] }, paragraph(), { type: "blockquote", content: [] }),
    );
    expect(parsed?.content.map((node) => node.type)).toEqual(["paragraph"]);
  });

  it("accepts the JSON string the editor's hidden input posts", () => {
    expect(parseRichText(JSON.stringify(doc(paragraph(text("hi")))))).toEqual({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "hi", marks: [] }] }],
    });
  });

  it("returns null for anything that is not a document", () => {
    expect(parseRichText(null)).toBeNull();
    expect(parseRichText("not json")).toBeNull();
    expect(parseRichText({ type: "paragraph" })).toBeNull();
    expect(parseRichText([])).toBeNull();
  });
});

describe("richTextToPlainText", () => {
  it("joins blocks with line breaks and drops the markup", () => {
    const parsed = parseRichText(
      doc(
        { type: "heading", attrs: { level: 2 }, content: [text("Title")] },
        paragraph(text("Some "), text("bold", [{ type: "bold" }]), text(" words.")),
      ),
    ) as RichTextDoc;
    expect(richTextToPlainText(parsed)).toBe("Title\nSome bold words.");
  });

  it("turns a hard break into a line break", () => {
    const parsed = parseRichText(
      doc(paragraph(text("one"), { type: "hardBreak" }, text("two"))),
    ) as RichTextDoc;
    expect(richTextToPlainText(parsed)).toBe("one\ntwo");
  });
});

describe("isEmptyRichText", () => {
  it("is true for an empty editor and for structure with no words", () => {
    expect(isEmptyRichText(parseRichText(doc()) as RichTextDoc)).toBe(true);
    expect(isEmptyRichText(parseRichText(doc(paragraph())) as RichTextDoc)).toBe(true);
    expect(
      isEmptyRichText(parseRichText(doc(paragraph(), { type: "horizontalRule" })) as RichTextDoc),
    ).toBe(true);
  });

  it("is false as soon as there are words", () => {
    expect(isEmptyRichText(parseRichText(doc(paragraph(text("a")))) as RichTextDoc)).toBe(false);
  });
});

describe("plainTextToRichTextDoc", () => {
  it("wraps blank-line-separated text into one paragraph per block", () => {
    const built = plainTextToRichTextDoc("First paragraph.\n\nSecond paragraph.");
    const parsed = parseRichText(built) as RichTextDoc;
    expect(parsed.content).toHaveLength(2);
    expect(richTextToPlainText(parsed)).toBe("First paragraph.\nSecond paragraph.");
  });

  it("collapses runs of blank lines and trims each block", () => {
    const built = plainTextToRichTextDoc("  one  \n\n\n\n  two  ");
    const parsed = parseRichText(built) as RichTextDoc;
    expect(richTextToPlainText(parsed)).toBe("one\ntwo");
  });

  it("produces an empty document for blank input", () => {
    const built = plainTextToRichTextDoc("   \n\n  ");
    expect(parseRichText(built)?.content).toEqual([]);
  });

  it("still validates against the whitelist, like every other caller", () => {
    // Not a bypass — the result is only ever used after another
    // parseRichText() pass, exactly like a client-supplied document.
    const built = plainTextToRichTextDoc("hello");
    expect(parseRichText(built)).toEqual(built);
  });
});
