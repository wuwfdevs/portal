// What the evidence panel shows for a statement, a side of a tension or a pattern: the accepted findings
// behind it, each with who said it, where, and a link to the passage. Pure so the server can build it
// and the client can render it without sharing anything but this shape.

import { breadthLine } from "./synthesis-view";
import { supportBreadth, type CitedFindingInfo } from "./synthesis";
import { sourcePath } from "@/lib/transcription/links";

export interface EvidenceItem {
  id: string;
  claim: string;
  /** "Marcia T. · Porch interview" */
  who: string;
  sourceId: string;
  startMs: number | null;
  endMs: number | null;
  page: number | null;
  /** "12:41" into a recording; null for a document, which has no clock to play. */
  at: string | null;
  href: string;
}

export interface EvidencePayload {
  /** Unique on the page: the id of the statement, side or pattern. */
  key: string;
  heading: string;
  support: string;
  items: EvidenceItem[];
}

export interface EvidenceFinding {
  id: string;
  claim: string;
  sourceId: string;
  sourceTitle: string;
  speakerId: string | null;
  speakerLabel: string | null;
  startMs: number | null;
  endMs: number | null;
  page: number | null;
  at: string | null;
}

export function buildEvidence(args: {
  key: string;
  heading: string;
  cites: readonly string[];
  projectId: string;
  findingById: ReadonlyMap<string, EvidenceFinding>;
}): EvidencePayload {
  const info = new Map<string, CitedFindingInfo>(
    [...args.findingById.values()].map((finding) => [
      finding.id,
      { sourceId: finding.sourceId, speakerId: finding.speakerId },
    ]),
  );
  const items: EvidenceItem[] = [];
  for (const id of args.cites) {
    const finding = args.findingById.get(id);
    if (!finding) continue;
    items.push({
      id: finding.id,
      claim: finding.claim,
      who: [finding.speakerLabel, finding.sourceTitle].filter(Boolean).join(" · "),
      sourceId: finding.sourceId,
      startMs: finding.startMs,
      endMs: finding.endMs,
      page: finding.page,
      at: finding.at,
      href: sourcePath(finding.sourceId, {
        projectId: args.projectId,
        t: finding.startMs,
        page: finding.page,
      }),
    });
  }
  return {
    key: args.key,
    heading: args.heading,
    support: breadthLine(supportBreadth(args.cites, info)),
    items,
  };
}

/** How many of five dots to fill: one per distinct source, so a single-source claim looks thin. */
export const MAX_METER_DOTS = 5;
export function meterDots(sources: number): { filled: number; total: number } {
  return { filled: Math.min(sources, MAX_METER_DOTS), total: MAX_METER_DOTS };
}
