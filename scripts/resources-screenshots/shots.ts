// Every screenshot the capture script takes. One entry per rc_media row it
// maintains, matched on (screenKey, name) — the row's id never changes, so a
// guide whose body references it picks up each new capture with no edit.
//
// To add a shot: put data-help-shot="<name>" on the element in the same PR
// as the screen change, add an entry here, and reference the rc_media row
// from the guide's figure (a migration declares the row with a fixed id; see
// 20260928160000_resources_media.sql for the first one).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export interface ShotDefinition {
  screenKey: string;
  /** Matches the element's data-help-shot attribute. */
  name: string;
  alt: string;
  /**
   * The route to capture, resolved against seed data (never production).
   * Given the secret-key client so a shot can find a seeded record's id.
   */
  path: (admin: SupabaseClient<Database>) => Promise<string>;
}

export const SHOTS: ShotDefinition[] = [
  {
    screenKey: "sourcework.project",
    name: "source-grid",
    alt: "A project's source cards, with + Add source above them and the Sources and Excerpts tabs.",
    // The seeded project that references the most sources, so the grid shows
    // more than one card.
    async path(admin) {
      const { data, error } = await admin.from("sw_project_sources").select("project_id");
      if (error) throw new Error(`Could not find a project: ${error.message}`);
      const counts = new Map<string, number>();
      for (const row of data ?? [])
        counts.set(row.project_id, (counts.get(row.project_id) ?? 0) + 1);
      const [projectId] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [];
      if (!projectId) throw new Error("No Sourcework project in this database to capture.");
      return `/sourcework/${projectId}`;
    },
  },
  {
    screenKey: "audience-listening.query",
    name: "share-cards",
    alt: "A query's Share tab, with the Public link and Grove embed code cards and their Copy buttons.",
    async path(admin) {
      const { data, error } = await admin
        .from("al_queries")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw new Error(`Could not find a query: ${error.message}`);
      const queryId = data?.[0]?.id;
      if (!queryId) throw new Error("No Audience Listening query in this database to capture.");
      return `/audience-listening/${queryId}?tab=share`;
    },
  },
  {
    screenKey: "log.library",
    name: "library-list",
    alt: "The content library list, with its content-type/status filters and Import from DAD / + New content item buttons above it.",
    async path() {
      return "/log/library";
    },
  },
  {
    screenKey: "underwriting.contract",
    name: "ready-to-activate",
    alt: "A draft contract's \"Ready to activate?\" checklist, showing which of the order, agreement, schedule, copy, and policy steps are complete.",
    // A draft contract, since the checklist only renders for one.
    async path(admin) {
      const { data, error } = await admin
        .from("uw_contracts")
        .select("id")
        .eq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw new Error(`Could not find a contract: ${error.message}`);
      const contractId = data?.[0]?.id;
      if (!contractId) throw new Error("No draft Underwriting contract in this database to capture.");
      return `/underwriting/contracts/${contractId}`;
    },
  },
];
