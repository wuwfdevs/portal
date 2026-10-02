// Pure gate deciding whether an NPR CDS fetch should even be attempted for a
// program, checked before lib/log/npr.ts ever calls the provider. Pure so
// the two required short-circuits — no CDS mapping, no CDS credentials —
// are covered by a colocated test without mocking Supabase or fetch: an
// unmapped program or an unconfigured token must never reach the network.

export type NprAccessState =
  | { kind: "unmapped" }
  | { kind: "not_configured" }
  | { kind: "ready"; collectionId: number };

export function classifyNprAccess(nprCollectionId: number | null, cdsConfigured: boolean): NprAccessState {
  if (nprCollectionId === null) return { kind: "unmapped" };
  if (!cdsConfigured) return { kind: "not_configured" };
  return { kind: "ready", collectionId: nprCollectionId };
}
