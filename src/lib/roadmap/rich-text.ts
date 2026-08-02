// The Roadmap tool's rich-text whitelist — the security boundary for every
// post and comment body, and the only file that knows what a body may contain.
//
// Bodies are stored as the Tiptap editor's own ProseMirror JSON, never as
// HTML. That is the load-bearing choice: nothing in this codebase calls
// dangerouslySetInnerHTML, and storing structure rather than markup keeps it
// that way. There is no sanitizer here because there is no HTML to sanitize —
// components/ui/rich-text.tsx walks the parsed document and emits React
// elements, and anything not in the whitelist below simply has no branch.
//
// Validated twice, on purpose: actions run parseRichText() on the way in and
// store the normalized document, and the renderer ignores unknown types on the
// way out. Neither pass trusts the other. See docs/roadmap-design.md §6.
//
// Pure — no React, no Supabase, colocated test.

export type RichTextMark =
  | { type: "bold" }
  | { type: "italic" }
  | { type: "strike" }
  | { type: "code" }
  | { type: "link"; attrs: { href: string } };

export type RichTextNode =
  | { type: "text"; text: string; marks: RichTextMark[] }
  | { type: "hardBreak" }
  | { type: "horizontalRule" }
  | { type: "heading"; attrs: { level: 2 | 3 }; content: RichTextNode[] }
  | { type: "orderedList"; attrs: { start: number }; content: RichTextNode[] }
  | {
      type: "paragraph" | "blockquote" | "bulletList" | "listItem" | "codeBlock";
      content: RichTextNode[];
    };

export interface RichTextDoc {
  type: "doc";
  content: RichTextNode[];
}

export const EMPTY_RICH_TEXT: RichTextDoc = { type: "doc", content: [] };

/**
 * A body this long is a document, not a request. The cap exists so a jsonb
 * column can't be used as free storage, not because anything here struggles
 * with size; it is measured on the plain-text projection so markup can't be
 * used to smuggle past it.
 */
export const RICH_TEXT_MAX_CHARACTERS = 20_000;

const CONTAINER_TYPES = ["paragraph", "blockquote", "bulletList", "listItem", "codeBlock"] as const;
type ContainerType = (typeof CONTAINER_TYPES)[number];

/** Containers that mean nothing when empty, so an empty one is dropped rather than rendered. */
const DROP_WHEN_EMPTY: ReadonlySet<string> = new Set([
  "blockquote",
  "bulletList",
  "orderedList",
  "listItem",
  "heading",
  "codeBlock",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Links may point inside the portal or at the open web, and nothing else —
 * no javascript:, no data:, no mailto:. Protocol-relative "//host" is excluded
 * explicitly: it starts with a slash but is not an internal path.
 */
function safeHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const href = value.trim();
  if (href.startsWith("//")) return null;
  if (href.startsWith("/")) return href;
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  return null;
}

function parseMarks(value: unknown): RichTextMark[] {
  if (!Array.isArray(value)) return [];
  const marks: RichTextMark[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    switch (raw.type) {
      case "bold":
      case "italic":
      case "strike":
      case "code":
        marks.push({ type: raw.type });
        break;
      case "link": {
        const href = safeHref(isRecord(raw.attrs) ? raw.attrs.href : null);
        if (href) marks.push({ type: "link", attrs: { href } });
        break;
      }
      default:
        break;
    }
  }
  return marks;
}

function parseContent(value: unknown, inCodeBlock: boolean): RichTextNode[] {
  if (!Array.isArray(value)) return [];
  const nodes: RichTextNode[] = [];
  for (const child of value) {
    const node = parseNode(child, inCodeBlock);
    if (node) nodes.push(node);
  }
  return nodes;
}

function parseNode(value: unknown, inCodeBlock: boolean): RichTextNode | null {
  if (!isRecord(value)) return null;
  const type = value.type;

  if (type === "text") {
    if (typeof value.text !== "string" || value.text === "") return null;
    // Marks inside a code block would be rendered inside <pre>, where they mean
    // nothing — drop them rather than carry them around.
    return { type: "text", text: value.text, marks: inCodeBlock ? [] : parseMarks(value.marks) };
  }

  if (type === "hardBreak" || type === "horizontalRule") {
    return { type };
  }

  if (type === "heading") {
    // The editor offers two heading levels; the page's own <h1> is the title,
    // so anything else is clamped into range rather than dropped.
    const rawLevel = isRecord(value.attrs) ? value.attrs.level : null;
    const level = rawLevel === 2 ? 2 : 3;
    const content = parseContent(value.content, false);
    return content.length === 0 ? null : { type: "heading", attrs: { level }, content };
  }

  if (type === "orderedList") {
    const rawStart = isRecord(value.attrs) ? value.attrs.start : null;
    const start =
      typeof rawStart === "number" && Number.isInteger(rawStart) && rawStart > 0 ? rawStart : 1;
    const content = parseContent(value.content, false);
    return content.length === 0 ? null : { type: "orderedList", attrs: { start }, content };
  }

  if (typeof type === "string" && (CONTAINER_TYPES as readonly string[]).includes(type)) {
    const containerType = type as ContainerType;
    const content = parseContent(value.content, inCodeBlock || containerType === "codeBlock");
    if (content.length === 0 && DROP_WHEN_EMPTY.has(containerType)) return null;
    return { type: containerType, content };
  }

  return null;
}

/**
 * Normalizes an untrusted value into a document containing only whitelisted
 * nodes and marks. Returns null when the value isn't a ProseMirror document at
 * all — a caller should treat that as "the editor sent nothing usable", not as
 * an empty body.
 */
export function parseRichText(value: unknown): RichTextDoc | null {
  let candidate = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  if (!isRecord(candidate) || candidate.type !== "doc") return null;
  return { type: "doc", content: parseContent(candidate.content, false) };
}

/**
 * The plain-text projection stored in `body_text`: list excerpts, and whatever
 * search this tool eventually grows. A projection, never authoritative.
 */
export function richTextToPlainText(doc: RichTextDoc): string {
  const lines: string[] = [];

  function walkBlock(node: RichTextNode): void {
    if (node.type === "text") {
      appendInline(node.text);
      return;
    }
    if (node.type === "hardBreak") {
      appendInline("\n");
      return;
    }
    if (node.type === "horizontalRule") {
      lines.push("");
      return;
    }
    if (node.type === "listItem" || node.type === "paragraph" || node.type === "heading") {
      lines.push("");
      node.content.forEach(walkBlock);
      return;
    }
    node.content.forEach(walkBlock);
  }

  function appendInline(text: string): void {
    if (lines.length === 0) lines.push("");
    lines[lines.length - 1] += text;
  }

  doc.content.forEach(walkBlock);

  return lines
    .join("\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line, index, all) => line !== "" || (index > 0 && all[index - 1] !== ""))
    .join("\n")
    .trim();
}

/** Whether the document carries no words — an empty editor, or only structure. */
export function isEmptyRichText(doc: RichTextDoc): boolean {
  return richTextToPlainText(doc) === "";
}

/**
 * Wraps plain text — what an MCP caller without an editor sends — into a
 * minimal ProseMirror document, one paragraph per blank-line-separated block.
 * Still re-validated by parseRichText() by every caller; this only builds the
 * candidate, it doesn't bypass the whitelist.
 */
export function plainTextToRichTextDoc(text: string): RichTextDoc {
  return {
    type: "doc",
    content: text
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .map((paragraph) => ({
        type: "paragraph" as const,
        content: [{ type: "text" as const, text: paragraph, marks: [] }],
      })),
  };
}
