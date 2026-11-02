// A small, dependency-free markdown parser for model-generated chat replies —
// deliberately not a full CommonMark implementation. This repo renders model
// output as React elements, never HTML (CLAUDE.md: nothing here calls
// dangerouslySetInnerHTML), so the render side lives in
// components/ui/markdown.tsx walking this module's AST — the same
// parse-then-walk split Roadmap's rich-text whitelist uses. The subset is
// what chat models actually emit in prose: paragraphs, headings, flat
// bulleted/numbered lists, blockquotes, code fences, horizontal rules, and
// inline bold/italic/code/links. Notably absent on purpose: raw HTML
// (never rendered), images (nothing to serve), nested lists (flattened into
// their item), and underscore emphasis (it would mangle snake_case
// identifiers, which model replies mention constantly).

export type MarkdownInline =
  | { kind: "text"; text: string }
  | { kind: "strong"; children: MarkdownInline[] }
  | { kind: "em"; children: MarkdownInline[] }
  | { kind: "code"; text: string }
  | { kind: "link"; href: string; children: MarkdownInline[] };

export type MarkdownBlock =
  | { kind: "paragraph"; children: MarkdownInline[] }
  | { kind: "heading"; level: number; children: MarkdownInline[] }
  | { kind: "list"; ordered: boolean; items: MarkdownInline[][] }
  | { kind: "codeBlock"; text: string }
  | { kind: "blockquote"; children: MarkdownInline[] }
  | { kind: "rule" };

/** Only link targets that can't smuggle a script scheme: absolute http(s), or portal-relative. */
function isSafeHref(href: string): boolean {
  return /^https?:\/\//.test(href) || (href.startsWith("/") && !href.startsWith("//"));
}

const LINK_PATTERN = /^\[([^\]]*)\]\(([^)\s]+)\)/;

export function parseInline(src: string): MarkdownInline[] {
  const out: MarkdownInline[] = [];
  let textStart = 0;
  let i = 0;

  const flushText = (end: number) => {
    if (end > textStart) out.push({ kind: "text", text: src.slice(textStart, end) });
  };

  while (i < src.length) {
    const ch = src[i]!;

    if (ch === "`") {
      const close = src.indexOf("`", i + 1);
      if (close > i + 1) {
        flushText(i);
        out.push({ kind: "code", text: src.slice(i + 1, close) });
        i = close + 1;
        textStart = i;
        continue;
      }
    } else if (ch === "*") {
      const strong = src.startsWith("**", i);
      const marker = strong ? "**" : "*";
      const close = src.indexOf(marker, i + marker.length);
      if (close !== -1) {
        const inner = src.slice(i + marker.length, close);
        if (inner.trim()) {
          flushText(i);
          out.push({ kind: strong ? "strong" : "em", children: parseInline(inner) });
          i = close + marker.length;
          textStart = i;
          continue;
        }
      }
    } else if (ch === "[") {
      const match = LINK_PATTERN.exec(src.slice(i));
      if (match && isSafeHref(match[2]!)) {
        flushText(i);
        out.push({ kind: "link", href: match[2]!, children: parseInline(match[1]!) });
        i += match[0].length;
        textStart = i;
        continue;
      }
      // An unsafe or malformed link falls through and renders as plain text.
    }

    i++;
  }

  flushText(src.length);
  return out;
}

const UL_ITEM = /^[-*+]\s+(.*)$/;
const OL_ITEM = /^\d{1,3}[.)]\s+(.*)$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const RULE = /^(-{3,}|\*{3,}|_{3,})$/;

export function parseMarkdown(text: string): MarkdownBlock[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      // A single newline inside a paragraph is a soft break — joined with a
      // space, per CommonMark, so streamed prose reflows naturally.
      blocks.push({ kind: "paragraph", children: parseInline(paragraph.join(" ")) });
      paragraph = [];
    }
  };

  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i]!.trim();

    if (!trimmed) {
      flushParagraph();
      i++;
      continue;
    }

    if (trimmed.startsWith("```")) {
      flushParagraph();
      const buffer: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trim().startsWith("```")) {
        buffer.push(lines[i]!);
        i++;
      }
      i++; // past the closing fence (or the end, if the stream cut off mid-block)
      blocks.push({ kind: "codeBlock", text: buffer.join("\n") });
      continue;
    }

    const heading = HEADING.exec(trimmed);
    if (heading) {
      flushParagraph();
      blocks.push({
        kind: "heading",
        level: heading[1]!.length,
        children: parseInline(heading[2]!),
      });
      i++;
      continue;
    }

    if (RULE.test(trimmed)) {
      flushParagraph();
      blocks.push({ kind: "rule" });
      i++;
      continue;
    }

    if (trimmed.startsWith(">")) {
      flushParagraph();
      const buffer: string[] = [];
      while (i < lines.length && lines[i]!.trim().startsWith(">")) {
        buffer.push(lines[i]!.trim().replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ kind: "blockquote", children: parseInline(buffer.join(" ")) });
      continue;
    }

    const ordered = OL_ITEM.test(trimmed);
    if (ordered || UL_ITEM.test(trimmed)) {
      flushParagraph();
      const itemPattern = ordered ? OL_ITEM : UL_ITEM;
      const items: MarkdownInline[][] = [];
      while (i < lines.length) {
        const lineTrimmed = lines[i]!.trim();
        const item = itemPattern.exec(lineTrimmed);
        if (item) {
          items.push(parseInline(item[1]!));
          i++;
          continue;
        }
        // A non-blank line that starts no other block continues the previous
        // item — this is also where nested list items land, flattened.
        const startsAnotherBlock =
          !lineTrimmed ||
          HEADING.test(lineTrimmed) ||
          RULE.test(lineTrimmed) ||
          lineTrimmed.startsWith("```") ||
          lineTrimmed.startsWith(">") ||
          UL_ITEM.test(lineTrimmed) ||
          OL_ITEM.test(lineTrimmed);
        if (!startsAnotherBlock && items.length) {
          items[items.length - 1] = [
            ...items[items.length - 1]!,
            { kind: "text", text: " " },
            ...parseInline(lineTrimmed),
          ];
          i++;
          continue;
        }
        break;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }

    paragraph.push(trimmed);
    i++;
  }

  flushParagraph();
  return blocks;
}
