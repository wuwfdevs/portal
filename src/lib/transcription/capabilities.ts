// Sourcework's capability layer (docs/agent-capabilities-design.md §4, Phase
// B). Only one capability so far — project search — since Phase B's job is
// to give the registry one real entry per remaining tool, not to extract
// every write path the way Phase A did for Editorial Planning.

import "server-only";
import { z } from "zod";
import { defineCapability } from "@/lib/capabilities/define";
import { assertToolAccess } from "@/lib/auth/authz";
import { listProjects, type ProjectListRow } from "./projects";

const PROJECT_STATUSES = ["uploading", "processing", "ready", "failed"] as const;

/**
 * Find projects by title and/or status. `listProjects()` is already RLS-
 * scoped to transcription tool members and cheap (one project list per
 * workspace) — no separate indexed search path, same tradeoff the read
 * side already makes elsewhere in this module.
 */
export const searchProjects = defineCapability({
  id: "sourcework.project.search",
  summary: "Find Sourcework projects by title and/or status",
  input: z.object({
    query: z.string().trim().optional(),
    status: z.enum(PROJECT_STATUSES).optional(),
  }),
  requires: { tool: "transcription" },
  confirmation: "none",
  async handler(_ctx, input): Promise<ProjectListRow[]> {
    await assertToolAccess("transcription");
    const projects = await listProjects();
    const query = input.query?.toLowerCase();
    return projects.filter((project) => {
      if (input.status && project.status !== input.status) return false;
      if (query && !project.title.toLowerCase().includes(query)) return false;
      return true;
    });
  },
});
