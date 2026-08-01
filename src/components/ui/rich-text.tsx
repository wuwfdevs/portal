import { Fragment } from "react";
import { parseRichText, type RichTextDoc, type RichTextNode } from "@/lib/roadmap/rich-text";

// Renders a stored rich-text body. A Server Component: the document is walked
// and emitted as React elements, so there is no HTML string and nothing to
// sanitize. A node type with no branch here simply does not render — that is
// the second of the two validation passes described in lib/roadmap/rich-text.ts.

function Inline({ node }: { node: Extract<RichTextNode, { type: "text" }> }) {
  let element: React.ReactNode = node.text;

  for (const mark of node.marks) {
    switch (mark.type) {
      case "bold":
        element = <strong className="font-bold text-ink-900">{element}</strong>;
        break;
      case "italic":
        element = <em>{element}</em>;
        break;
      case "strike":
        element = <s className="text-ink-400">{element}</s>;
        break;
      case "code":
        element = (
          <code className="rounded bg-panel-50 px-1 py-0.5 font-mono text-[0.9em]">{element}</code>
        );
        break;
      case "link":
        element = (
          <a
            href={mark.attrs.href}
            className="text-brand-link underline"
            rel="noopener noreferrer"
            target={mark.attrs.href.startsWith("/") ? undefined : "_blank"}
          >
            {element}
          </a>
        );
        break;
    }
  }

  return <>{element}</>;
}

function Nodes({ nodes }: { nodes: RichTextNode[] }) {
  return (
    <>
      {nodes.map((node, index) => (
        <Node key={index} node={node} />
      ))}
    </>
  );
}

function Node({ node }: { node: RichTextNode }) {
  switch (node.type) {
    case "text":
      return <Inline node={node} />;
    case "hardBreak":
      return <br />;
    case "horizontalRule":
      return <hr className="my-4 border-line" />;
    case "heading":
      return node.attrs.level === 2 ? (
        <h2 className="mt-5 font-serif text-[17px] font-bold text-ink-900 first:mt-0">
          <Nodes nodes={node.content} />
        </h2>
      ) : (
        <h3 className="mt-4 text-[15px] font-bold text-ink-900 first:mt-0">
          <Nodes nodes={node.content} />
        </h3>
      );
    case "paragraph":
      return (
        <p className="mb-3 leading-relaxed last:mb-0">
          <Nodes nodes={node.content} />
        </p>
      );
    case "blockquote":
      return (
        <blockquote className="mb-3 border-l-2 border-line pl-3 text-ink-500 last:mb-0">
          <Nodes nodes={node.content} />
        </blockquote>
      );
    case "bulletList":
      return (
        <ul className="mb-3 list-disc pl-5 last:mb-0">
          <Nodes nodes={node.content} />
        </ul>
      );
    case "orderedList":
      return (
        <ol className="mb-3 list-decimal pl-5 last:mb-0" start={node.attrs.start}>
          <Nodes nodes={node.content} />
        </ol>
      );
    case "listItem":
      return (
        <li className="mb-1 [&>p]:mb-0">
          <Nodes nodes={node.content} />
        </li>
      );
    case "codeBlock":
      return (
        <pre className="mb-3 overflow-x-auto rounded border border-line bg-panel-50 p-3 font-mono text-xs last:mb-0">
          <code>
            <Nodes nodes={node.content} />
          </code>
        </pre>
      );
    default:
      return null;
  }
}

/**
 * `body` is whatever came out of the jsonb column, so it is re-parsed here
 * rather than trusted. `fallback` renders when the body is unusable or empty —
 * a body that failed to parse must not render as a healthy blank space.
 */
export function RichText({
  body,
  className,
  fallback = null,
}: {
  body: unknown;
  className?: string;
  fallback?: React.ReactNode;
}) {
  const doc: RichTextDoc | null = parseRichText(body);
  if (!doc || doc.content.length === 0) return <Fragment>{fallback}</Fragment>;

  return (
    <div className={className}>
      <Nodes nodes={doc.content} />
    </div>
  );
}
