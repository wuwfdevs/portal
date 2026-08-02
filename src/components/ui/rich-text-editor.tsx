"use client";

import { useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { cn } from "@/lib/cn";
import { MOBILE_SAFE_TEXT_SIZE } from "@/components/ui/input";
import { EMPTY_RICH_TEXT, parseRichText, type RichTextDoc } from "@/lib/roadmap/rich-text";

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
// lib/roadmap/rich-text.ts. That is a courtesy to the writer, not the boundary:
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

function Toolbar({ editor }: { editor: Editor }) {
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
}

export function RichTextEditor({
  name,
  defaultValue,
  ariaLabel,
  minHeightClassName = "min-h-[180px]",
}: RichTextEditorProps) {
  // Parsed rather than handed to the editor raw: a stored document is
  // trustworthy, but this way the editor and the renderer agree about what a
  // body can contain even if one predates a change to the whitelist.
  const initial: RichTextDoc = parseRichText(defaultValue) ?? EMPTY_RICH_TEXT;
  const [serialized, setSerialized] = useState(() => JSON.stringify(initial));

  const editor = useEditor({
    extensions: EDITOR_EXTENSIONS,
    content: initial,
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
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
      <input type="hidden" name={name} value={serialized} />
    </div>
  );
}
