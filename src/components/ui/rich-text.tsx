import { Fragment } from "react";
import { parseRichText, type RichTextDoc, type RichTextNode } from "@/lib/rich-text";

/** A figure's resolved image: a signed URL and the object's own size. */
export interface FigureImage {
  url: string;
  width: number;
  height: number;
}

type Figures = ReadonlyMap<string, FigureImage>;
const NO_FIGURES: Figures = new Map();

// Renders a stored rich-text body. A Server Component: the document is walked
// and emitted as React elements, so there is no HTML string and nothing to
// sanitize. A node type with no branch here simply does not render — that is
// the second of the two validation passes described in lib/rich-text.ts.

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

function Nodes({ nodes, figures }: { nodes: RichTextNode[]; figures: Figures }) {
  return (
    <>
      {nodes.map((node, index) => (
        <Node key={index} node={node} figures={figures} />
      ))}
    </>
  );
}

/**
 * A screenshot. The body carries only a media id; `figures` maps it to a
 * signed URL the page resolved. No entry — a missing row, an object not yet
 * captured, a URL that couldn't be signed — renders the alt text in a dashed
 * placeholder, never a broken image.
 */
function Figure({
  node,
  figures,
}: {
  node: Extract<RichTextNode, { type: "figure" }>;
  figures: Figures;
}) {
  const image = figures.get(node.attrs.mediaId);
  return (
    <figure className="my-4">
      {image ? (
        // A signed Storage URL, not a static asset next/image could optimize.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image.url}
          alt={node.attrs.alt}
          width={image.width}
          height={image.height}
          loading="lazy"
          className="h-auto w-full rounded border border-line"
        />
      ) : (
        <div className="flex min-h-[120px] items-center justify-center rounded border border-dashed border-line bg-panel-50 p-4 text-center text-xs text-ink-400">
          {node.attrs.alt}
        </div>
      )}
      {node.attrs.caption && (
        <figcaption className="mt-1.5 text-xs text-ink-400">{node.attrs.caption}</figcaption>
      )}
    </figure>
  );
}

function Node({ node, figures }: { node: RichTextNode; figures: Figures }) {
  switch (node.type) {
    case "figure":
      return <Figure node={node} figures={figures} />;
    case "text":
      return <Inline node={node} />;
    case "hardBreak":
      return <br />;
    case "horizontalRule":
      return <hr className="my-4 border-line" />;
    case "heading":
      return node.attrs.level === 2 ? (
        <h2 className="mt-5 font-serif text-[17px] font-bold text-ink-900 first:mt-0">
          <Nodes nodes={node.content} figures={figures} />
        </h2>
      ) : (
        <h3 className="mt-4 text-[15px] font-bold text-ink-900 first:mt-0">
          <Nodes nodes={node.content} figures={figures} />
        </h3>
      );
    case "paragraph":
      return (
        <p className="mb-3 leading-relaxed last:mb-0">
          <Nodes nodes={node.content} figures={figures} />
        </p>
      );
    case "blockquote":
      return (
        <blockquote className="mb-3 border-l-2 border-line pl-3 text-ink-500 last:mb-0">
          <Nodes nodes={node.content} figures={figures} />
        </blockquote>
      );
    case "bulletList":
      return (
        <ul className="mb-3 list-disc pl-5 last:mb-0">
          <Nodes nodes={node.content} figures={figures} />
        </ul>
      );
    case "orderedList":
      return (
        <ol className="mb-3 list-decimal pl-5 last:mb-0" start={node.attrs.start}>
          <Nodes nodes={node.content} figures={figures} />
        </ol>
      );
    case "listItem":
      return (
        <li className="mb-1 [&>p]:mb-0">
          <Nodes nodes={node.content} figures={figures} />
        </li>
      );
    case "codeBlock":
      return (
        <pre className="mb-3 overflow-x-auto rounded border border-line bg-panel-50 p-3 font-mono text-xs last:mb-0">
          <code>
            <Nodes nodes={node.content} figures={figures} />
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
  figures,
}: {
  body: unknown;
  className?: string;
  fallback?: React.ReactNode;
  /**
   * Screenshots for this body, keyed by media id. Passing it (even empty)
   * is what admits `figure` nodes at all; a caller that omits it — Roadmap —
   * renders none, however the body was stored.
   */
  figures?: Figures;
}) {
  const doc: RichTextDoc | null = parseRichText(body, { allowFigures: figures !== undefined });
  if (!doc || doc.content.length === 0) return <Fragment>{fallback}</Fragment>;

  return (
    <div className={className}>
      <Nodes nodes={doc.content} figures={figures ?? NO_FIGURES} />
    </div>
  );
}
