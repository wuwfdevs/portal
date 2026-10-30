"use client";

import dynamic from "next/dynamic";
import type { RichTextEditorProps } from "./rich-text-editor";

// The only thing that should import rich-text-editor.tsx. next/dynamic with
// ssr: false keeps ProseMirror out of the server bundle entirely and out of the
// JavaScript of every page that only *renders* rich text — which is most of
// them. The skeleton keeps the form from jumping when the editor arrives.

const RichTextEditor = dynamic(
  () => import("./rich-text-editor").then((module) => module.RichTextEditor),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[180px] animate-pulse rounded border border-line bg-panel-50" />
    ),
  },
);

export function RichTextField(props: RichTextEditorProps) {
  return <RichTextEditor {...props} />;
}
