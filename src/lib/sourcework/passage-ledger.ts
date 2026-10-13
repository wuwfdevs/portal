// The places in the sources a tool showed the model during a run (docs/sourcework-analysis-design.md
// §21). A narrative note may cite a passage only by the ref the ledger gave it, so the time, page and
// source it ends up pointing at came from a tool's result and never from the model. Pure.

import type { PassageRef } from "./synthesis";

export class PassageLedger {
  private readonly entries = new Map<number, PassageRef>();
  private next = 1;

  /** Records a place and returns its ref; the same place twice gets the same ref. */
  add(passage: PassageRef): number {
    for (const [ref, existing] of this.entries) {
      if (
        existing.sourceId === passage.sourceId &&
        existing.startMs === passage.startMs &&
        existing.endMs === passage.endMs &&
        existing.page === passage.page
      ) {
        return ref;
      }
    }
    const ref = this.next++;
    this.entries.set(ref, { ...passage });
    return ref;
  }

  get(ref: number): PassageRef | undefined {
    return this.entries.get(ref);
  }

  asMap(): ReadonlyMap<number, PassageRef> {
    return this.entries;
  }

  get size(): number {
    return this.entries.size;
  }
}
