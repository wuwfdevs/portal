"use client";

import { useMemo, useRef, useState } from "react";
import { EditorContent, Node, useEditor, type Content, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { cn } from "@/lib/cn";
import { Input, MOBILE_SAFE_TEXT_SIZE } from "@/components/ui/input";
import { EMPTY_RICH_TEXT, parseRichText, type RichTextDoc } from "@/lib/rich-text";

// The compose surface for rich-text bodies. Two things about its shape are
// deliberate:
//
//   1. It writes JSON.stringify(editor.getJSON()) into a hidden input on every
//      change, so the surrounding form stays this repository's ordinary
//      <form action={serverAction}> with hidden inputs — no useActionState, no
//      client-side submit handler, no fetch.
//   2. It is only ever reached through rich-text-field.tsx's next/dynamic
//      wrapper with ssr: false, so ProseMirror never enters the server bundle
//      or a read-only page's JavaScript.
//
// The extension set is configured down to the whitelist in
// lib/rich-text.ts. That is a courtesy to the writer, not the boundary:
// the server re-parses whatever arrives.

// Exported so a colocated test can assert on it directly without mounting a
// Tiptap/ProseMirror instance (which needs real-DOM layout APIs jsdom
// doesn't implement). This div is a contenteditable, not a native form
// element, so it never went through controlClasses — MOBILE_SAFE_TEXT_SIZE
// is what keeps it from reintroducing the mobile-zoom bug.
export const EDITOR_CONTENT_BASE_CLASS = cn(
  "px-3 py-2.5 text-ink-900 outline-none",
  MOBILE_SAFE_TEXT_SIZE,
  "[&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5",
  "[&_h2]:font-serif [&_h2]:text-[17px] [&_h2]:font-bold [&_h3]:text-[15px] [&_h3]:font-bold",
  "[&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-3 [&_blockquote]:text-ink-500",
  "[&_pre]:rounded [&_pre]:bg-panel-50 [&_pre]:p-2 [&_pre]:font-mono [&_pre]:text-xs",
  "[&_a]:text-brand-link [&_a]:underline",
);

/**
 * A screenshot. The stored node carries mediaId/alt/caption only
 * (lib/rich-text.ts drops anything else on the server); `src` is an
 * editor-only preview URL, injected on load and stripped on save.
 */
const FigureNode = Node.create({
  name: "figure",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      mediaId: { default: null },
      alt: { default: "" },
      caption: { default: null },
      src: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: "figure[data-media-id]" }];
  },
  renderHTML({ node }) {
    const { mediaId, alt, caption, src } = node.attrs as {
      mediaId: string;
      alt: string;
      caption: string | null;
      src: string | null;
    };
    const image = src
      ? ["img", { src, alt, class: "w-full rounded border border-line" }]
      : [
          "div",
          {
            class:
              "rounded border border-dashed border-line bg-panel-50 p-4 text-center text-xs text-ink-400",
          },
          alt,
        ];
    return [
      "figure",
      { "data-media-id": mediaId, class: "my-3" },
      image,
      ["figcaption", { class: "mt-1 text-xs text-ink-400" }, caption ?? ""],
    ];
  },
});

const EDITOR_EXTENSIONS = [
  StarterKit.configure({
    // Not on the whitelist — the renderer has no branch for them, so the
    // editor should not offer them either.
    underline: false,
    // The page's own <h1> is the post title; bodies get two sub-levels.
    heading: { levels: [2, 3] },
    link: {
      openOnClick: false,
      autolink: true,
      protocols: ["http", "https"],
    },
  }),
];

interface ToolbarButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function ToolbarButton({ label, active, onClick }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded px-2 py-1 text-xs font-semibold transition-colors",
        active ? "bg-brand-surface text-brand-link" : "text-ink-500 hover:bg-panel-50",
      )}
    >
      {label}
    </button>
  );
}

export interface FigureUploadResult {
  mediaId: string;
  previewUrl: string;
}

export interface RichTextFigureSupport {
  /** mediaId → preview URL, for figures already in the document. */
  previewUrls: Record<string, string>;
  /** Checked as soon as a file is picked; a message refuses it. */
  validate: (file: File, size: { width: number; height: number }) => string | null;
  /** Stores the file and its media row. Throws an Error whose message is shown. */
  upload: (
    file: File,
    meta: { alt: string; caption: string; width: number; height: number },
  ) => Promise<FigureUploadResult>;
}

interface PendingFigure {
  file: File;
  width: number;
  height: number;
  previewUrl: string;
}

/**
 * The "Add screenshot" step: pick a file, then write its alt text (required)
 * and an optional caption before anything is uploaded or inserted. These
 * inputs have no `name`, so the surrounding form never submits them, and
 * Enter inserts instead of submitting that form.
 */
function FigurePanel({ editor, support }: { editor: Editor; support: RichTextFigureSupport }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingFigure | null>(null);
  const [alt, setAlt] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    if (pending) URL.revokeObjectURL(pending.previewUrl);
    setPending(null);
    setAlt("");
    setCaption("");
    setBusy(false);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function pick(file: File | undefined) {
    setError(null);
    if (!file) return;
    let size: { width: number; height: number };
    try {
      const bitmap = await createImageBitmap(file);
      size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
    } catch {
      setError("That file couldn't be read as an image.");
      return;
    }
    const problem = support.validate(file, size);
    if (problem) {
      setError(problem);
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    setPending({ file, ...size, previewUrl: URL.createObjectURL(file) });
  }

  async function insert() {
    if (!pending || busy) return;
    if (alt.trim() === "") {
      setError("Describe what the screenshot shows before adding it.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await support.upload(pending.file, {
        alt: alt.trim(),
        caption: caption.trim(),
        width: pending.width,
        height: pending.height,
      });
      editor
        .chain()
        .focus()
        .insertContent({
          type: "figure",
          attrs: {
            mediaId: result.mediaId,
            alt: alt.trim(),
            caption: caption.trim() || null,
            src: result.previewUrl,
          },
        })
        .run();
      reset();
    } catch (cause) {
      setBusy(false);
      setError(cause instanceof Error ? cause.message : "The screenshot couldn't be added.");
    }
  }

  function enterInserts(event: React.KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      void insert();
    }
  }

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/webp"
        className="hidden"
        onChange={(event) => void pick(event.target.files?.[0])}
      />
      <ToolbarButton
        label="Add screenshot"
        active={pending !== null}
        onClick={() => fileInput.current?.click()}
      />
      {(pending || error) && (
        <div className="basis-full border-t border-line bg-white px-2 py-2">
          {pending && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              {/* A local object URL for the file just picked; nothing is uploaded yet. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pending.previewUrl}
                alt=""
                className="w-full rounded border border-line sm:w-40"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Input
                  aria-label="Alt text (required)"
                  placeholder="What the screenshot shows (required)"
                  value={alt}
                  onChange={(event) => setAlt(event.target.value)}
                  onKeyDown={enterInserts}
                  maxLength={300}
                  autoFocus
                />
                <Input
                  aria-label="Caption (optional)"
                  placeholder="Caption (optional)"
                  value={caption}
                  onChange={(event) => setCaption(event.target.value)}
                  onKeyDown={enterInserts}
                  maxLength={300}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void insert()}
                    disabled={busy}
                    className="rounded bg-brand-primary px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                  >
                    {busy ? "Adding…" : "Add to the text"}
                  </button>
                  <button
                    type="button"
                    onClick={reset}
                    disabled={busy}
                    className="rounded px-3 py-1.5 text-xs font-semibold text-ink-500 hover:bg-panel-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
          {error && (
            <p role="alert" className="mt-1 text-xs text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </>
  );
}

function Toolbar({ editor, figures }: { editor: Editor; figures?: RichTextFigureSupport }) {
  function promptForLink() {
    const previous = editor.getAttributes("link").href as string | undefined;
    const href = window.prompt(
      "Link to (a portal path like /sourcework, or an https:// URL)",
      previous ?? "",
    );
    if (href === null) return;
    if (href.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-line bg-panel-50 px-1.5 py-1">
      <ToolbarButton
        label="Bold"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <ToolbarButton
        label="Italic"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <ToolbarButton
        label="Heading"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      />
      <ToolbarButton
        label="Bullets"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolbarButton
        label="Numbers"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <ToolbarButton
        label="Quote"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      />
      <ToolbarButton
        label="Code"
        active={editor.isActive("codeBlock")}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      />
      <ToolbarButton label="Link" active={editor.isActive("link")} onClick={promptForLink} />
      {figures && <FigurePanel editor={editor} support={figures} />}
    </div>
  );
}

export interface RichTextEditorProps {
  /** Form field name for the hidden input carrying the serialized document. */
  name: string;
  /** The stored document to edit, or null/undefined to start empty. */
  defaultValue?: unknown;
  ariaLabel: string;
  /** Roughly how tall the writing area starts out. */
  minHeightClassName?: string;
  /**
   * Screenshots. Omitted (Roadmap), the editor has no figure node at all and
   * the parser drops any it's handed; given (Resources), figures load with
   * preview URLs and "Add screenshot" appears in the toolbar.
   */
  figures?: RichTextFigureSupport;
}

/** Puts each figure's preview URL on its node, for the editor's own rendering only. */
function withFigurePreviews(doc: RichTextDoc, previewUrls: Record<string, string>): Content {
  const walk = (node: unknown): unknown => {
    if (typeof node !== "object" || node === null) return node;
    const record = node as { type?: string; attrs?: { mediaId?: string }; content?: unknown[] };
    if (record.type === "figure" && record.attrs?.mediaId) {
      return {
        ...record,
        attrs: { ...record.attrs, src: previewUrls[record.attrs.mediaId] ?? null },
      };
    }
    return Array.isArray(record.content)
      ? { ...record, content: record.content.map(walk) }
      : record;
  };
  return walk(doc) as Content;
}

export function RichTextEditor({
  name,
  defaultValue,
  ariaLabel,
  minHeightClassName = "min-h-[180px]",
  figures,
}: RichTextEditorProps) {
  // Parsed rather than handed to the editor raw: a stored document is
  // trustworthy, but this way the editor and the renderer agree about what a
  // body can contain even if one predates a change to the whitelist.
  const allowFigures = figures !== undefined;
  const initial: RichTextDoc = parseRichText(defaultValue, { allowFigures }) ?? EMPTY_RICH_TEXT;
  const [serialized, setSerialized] = useState(() => JSON.stringify(initial));
  // Chosen once: an editor's schema can't change under it.
  const extensions = useMemo(
    () => (allowFigures ? [...EDITOR_EXTENSIONS, FigureNode] : EDITOR_EXTENSIONS),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const editor = useEditor({
    extensions,
    content: figures ? withFigurePreviews(initial, figures.previewUrls) : initial,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        "aria-label": ariaLabel,
        class: cn(EDITOR_CONTENT_BASE_CLASS, minHeightClassName),
      },
    },
    onUpdate: ({ editor: current }) => setSerialized(JSON.stringify(current.getJSON())),
  });

  return (
    <div className="rounded border border-line bg-white focus-within:border-brand-primary">
      {editor && <Toolbar editor={editor} figures={figures} />}
      <EditorContent editor={editor} />
      <input type="hidden" name={name} value={serialized} />
    </div>
  );
}
