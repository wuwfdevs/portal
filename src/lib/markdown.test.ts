import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown, type MarkdownInline } from "./markdown";

function textOf(nodes: MarkdownInline[]): string {
  return nodes
    .map((n) => {
      if (n.kind === "text" || n.kind === "code") return n.text;
      return textOf(n.children);
    })
    .join("");
}

describe("parseInline", () => {
  it("passes plain text through as one node", () => {
    expect(parseInline("just words")).toEqual([{ kind: "text", text: "just words" }]);
  });

  it("parses bold, italic, and code spans", () => {
    const nodes = parseInline("a **bold** and *em* and `code` end");
    expect(nodes.map((n) => n.kind)).toEqual([
      "text",
      "strong",
      "text",
      "em",
      "text",
      "code",
      "text",
    ]);
    expect(textOf(nodes)).toBe("a bold and em and code end");
  });

  it("parses nested emphasis inside bold", () => {
    const nodes = parseInline("**bold *inner* rest**");
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.kind).toBe("strong");
    const inner = (nodes[0] as Extract<MarkdownInline, { kind: "strong" }>).children;
    expect(inner.some((n) => n.kind === "em")).toBe(true);
  });

  it("leaves underscore snake_case untouched (no underscore emphasis)", () => {
    expect(parseInline("the still_thematic diagnosis")).toEqual([
      { kind: "text", text: "the still_thematic diagnosis" },
    ]);
  });

  it("parses http(s) and portal-relative links", () => {
    const nodes = parseInline("see [WUWF](https://wuwf.org) and [pitch](/editorial/pitches/new)");
    const links = nodes.filter((n) => n.kind === "link");
    expect(links).toHaveLength(2);
    expect((links[0] as Extract<MarkdownInline, { kind: "link" }>).href).toBe("https://wuwf.org");
    expect((links[1] as Extract<MarkdownInline, { kind: "link" }>).href).toBe(
      "/editorial/pitches/new",
    );
  });

  it("renders unsafe link schemes as plain text, never a link node", () => {
    for (const href of ["javascript:alert(1)", "data:text/html,x", "//evil.example"]) {
      const nodes = parseInline(`[click](${href})`);
      expect(nodes.every((n) => n.kind !== "link")).toBe(true);
      expect(textOf(nodes)).toContain("click");
    }
  });

  it("treats an unclosed marker as plain text", () => {
    expect(textOf(parseInline("a **dangling and `open"))).toBe("a **dangling and `open");
  });
});

describe("parseMarkdown", () => {
  it("splits paragraphs on blank lines and soft-joins single newlines", () => {
    const blocks = parseMarkdown("first line\nstill first\n\nsecond");
    expect(blocks.map((b) => b.kind)).toEqual(["paragraph", "paragraph"]);
    expect(textOf((blocks[0] as { children: MarkdownInline[] }).children)).toBe(
      "first line still first",
    );
  });

  it("parses headings with their level", () => {
    const blocks = parseMarkdown("## Two\n\ntext");
    expect(blocks[0]).toMatchObject({ kind: "heading", level: 2 });
  });

  it("groups consecutive bullet items into one list", () => {
    const blocks = parseMarkdown("- one\n- two **bold**\n- three");
    expect(blocks).toHaveLength(1);
    const list = blocks[0] as Extract<(typeof blocks)[number], { kind: "list" }>;
    expect(list.ordered).toBe(false);
    expect(list.items).toHaveLength(3);
  });

  it("parses ordered lists and folds continuation lines into their item", () => {
    const blocks = parseMarkdown("1. first\n   wrapped tail\n2. second");
    const list = blocks[0] as Extract<(typeof blocks)[number], { kind: "list" }>;
    expect(list.ordered).toBe(true);
    expect(list.items).toHaveLength(2);
    expect(textOf(list.items[0]!)).toBe("first wrapped tail");
  });

  it("does not read a bold-leading paragraph as a bullet", () => {
    const blocks = parseMarkdown("**Bold start** of a paragraph");
    expect(blocks[0]!.kind).toBe("paragraph");
  });

  it("parses fenced code without inline formatting, surviving an unclosed fence", () => {
    const closed = parseMarkdown("```\nconst a = **not bold**;\n```");
    expect(closed[0]).toMatchObject({ kind: "codeBlock", text: "const a = **not bold**;" });
    const unclosed = parseMarkdown("```\ncut off mid-stream");
    expect(unclosed[0]).toMatchObject({ kind: "codeBlock", text: "cut off mid-stream" });
  });

  it("parses blockquotes and horizontal rules", () => {
    const blocks = parseMarkdown("> quoted\n> more\n\n---\n\nafter");
    expect(blocks.map((b) => b.kind)).toEqual(["blockquote", "rule", "paragraph"]);
    expect(textOf((blocks[0] as { children: MarkdownInline[] }).children)).toBe("quoted more");
  });
});
