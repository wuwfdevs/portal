// Resources' one capability (docs/resources-design.md, "Assistant"): a
// read-only search the in-portal assistant uses to answer "how do I…"
// questions from the same procedures, guides, and release notes /resources
// shows. It runs as the caller, so rc_articles RLS decides what it can find
// — audience, and tool access for a guide or release note — exactly as on
// the page. Nothing here writes.

import "server-only";
import { z } from "zod";
import { defineCapability } from "@/lib/capabilities/define";
import type { CapabilityContext } from "@/lib/capabilities/define";
import { assertResourcesAccess } from "./access";
import { shapeResourceSearchResults, type ResourceSearchResult } from "./articles";
import { searchArticles } from "./queries";

const RESULT_LIMIT = 8;

export const searchResources = defineCapability({
  id: "resources.search",
  summary:
    "Search WUWF Resources — station procedures, a guide to each portal tool, and release notes — for how to do something. Returns titles, one-line summaries, and links.",
  input: z.object({
    query: z.string().trim().min(1).max(200),
    kind: z.enum(["procedure", "guide", "release_note"]).optional(),
    /** A tools.key, to narrow guides and release notes to one tool (e.g. "log", "transcription"). */
    toolKey: z.string().trim().max(64).optional(),
  }),
  requires: { tool: "resources" },
  confirmation: "none",
  async handler(_ctx: CapabilityContext, input): Promise<ResourceSearchResult[]> {
    await assertResourcesAccess();
    const hits = await searchArticles(input.query);
    return shapeResourceSearchResults(hits, {
      kind: input.kind,
      toolKey: input.toolKey || undefined,
      limit: RESULT_LIMIT,
    });
  },
});
