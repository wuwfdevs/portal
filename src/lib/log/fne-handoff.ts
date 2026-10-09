// "Add to library" for a Florida News Exchange story. Deliberately NOT a write:
// it builds a link to the library's own "New content item" form with a few
// well-known fields prefilled, the same hand-off shape Editorial Inquiry uses
// for "Develop into pitch" (lib/editorial-inquiry/pitch-handoff.ts). The host
// reviews, saves through the ordinary create action, then adds components on
// the item's detail page like any other item. Pure, colocated test.
//
// The feed description goes into Summary, never Script: it is often only a
// summary, and the real script is frequently on the PRX item page. Nothing here
// guesses at one.

import { truncate } from "@/lib/text";
import type { FneItem } from "./providers/fne-response";

export const NEW_CONTENT_ITEM_PATH = "/log/library/new";

/** Keeps the link short enough for any browser or proxy. */
const DESCRIPTION_MAX = 1200;

export interface ContentItemPrefill {
  title: string;
  content_type: "news";
  summary: string;
}

export function buildFnePrefill(
  item: Pick<FneItem, "title" | "holdNote" | "description" | "link">,
): ContentItemPrefill {
  const description = truncate(item.description, DESCRIPTION_MAX);
  const parts = [
    item.holdNote ? `Hold note from the feed: ${item.holdNote}.` : null,
    description || null,
    `From Florida News Exchange (PRX): ${item.link}`,
  ];
  return {
    title: item.title.slice(0, 200),
    content_type: "news",
    summary: parts.filter(Boolean).join("\n\n"),
  };
}

export function buildFneLibraryHandoffPath(
  item: Pick<FneItem, "title" | "holdNote" | "description" | "link">,
): string {
  const prefill = buildFnePrefill(item);
  const params = new URLSearchParams({
    title: prefill.title,
    content_type: prefill.content_type,
    summary: prefill.summary,
  });
  return `${NEW_CONTENT_ITEM_PATH}?${params.toString()}`;
}

/** Reads the same fields back from the new-item page's query string; anything else is ignored. */
export function readPrefill(params: {
  title?: string;
  content_type?: string;
  summary?: string;
}): Partial<ContentItemPrefill> {
  return {
    ...(params.title ? { title: params.title.slice(0, 200) } : {}),
    ...(params.content_type === "news" ? { content_type: "news" as const } : {}),
    ...(params.summary ? { summary: params.summary.slice(0, DESCRIPTION_MAX + 400) } : {}),
  };
}
