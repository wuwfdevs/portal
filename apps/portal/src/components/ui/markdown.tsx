import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { parseMarkdown, type MarkdownBlock, type MarkdownInline } from "@/lib/markdown";

/**
 * Renders model-generated markdown as React elements — the walk side of
 * lib/markdown.ts's parse (same split as Roadmap's rich-text pair: the lib
 * module is the boundary, this component only maps its AST to elements, so
 * there is no dangerouslySetInnerHTML and no HTML injection surface
 * regardless of what a model emits). Styling is sized relative to the
 * surrounding text (em-based) so it reads correctly inside a chat bubble.
 * Safe in server and client components alike.
 */

function renderInline(node: MarkdownInline, key: number): ReactNode {
  switch (node.kind) {
    case "text":
      return node.text;
    case "strong":
      return <strong key={key}>{node.children.map(renderInline)}</strong>;
    case "em":
      return <em key={key}>{node.children.map(renderInline)}</em>;
    case "code":
      return (
        <code key={key} className="rounded bg-black/[0.07] px-1 py-0.5 font-mono text-[0.85em]">
          {node.text}
        </code>
      );
    case "link": {
      const external = node.href.startsWith("http");
      return (
        <a
          key={key}
          href={node.href}
          target={external ? "_blank" : undefined}
          rel={external ? "noreferrer" : undefined}
          className="text-brand-link underline hover:no-underline"
        >
          {node.children.map(renderInline)}
        </a>
      );
    }
  }
}

function renderBlock(block: MarkdownBlock, key: number): ReactNode {
  switch (block.kind) {
    case "paragraph":
      return <p key={key}>{block.children.map(renderInline)}</p>;
    case "heading":
      // Chat-sized: a heading inside a bubble is a bolded lead line, not a
      // page-scale <h2> — but keep real heading elements for semantics.
      return (
        <p key={key} className={cn("font-bold", block.level <= 2 && "text-[1.05em]")}>
          {block.children.map(renderInline)}
        </p>
      );
    case "list": {
      const items = block.items.map((item, index) => <li key={index}>{item.map(renderInline)}</li>);
      return block.ordered ? (
        <ol key={key} className="list-decimal space-y-1 pl-5">
          {items}
        </ol>
      ) : (
        <ul key={key} className="list-disc space-y-1 pl-5">
          {items}
        </ul>
      );
    }
    case "codeBlock":
      return (
        <pre
          key={key}
          className="overflow-x-auto rounded bg-black/[0.06] p-2 font-mono text-[0.85em] whitespace-pre"
        >
          {block.text}
        </pre>
      );
    case "blockquote":
      return (
        <blockquote key={key} className="border-l-2 border-line pl-2.5 text-ink-500">
          {block.children.map(renderInline)}
        </blockquote>
      );
    case "rule":
      return <hr key={key} className="border-line" />;
  }
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  return <div className={cn("space-y-2", className)}>{parseMarkdown(text).map(renderBlock)}</div>;
}
