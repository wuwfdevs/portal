"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { pendingOutcomeByItem } from "@/lib/log/broadcast-queue";
import type { LogMissReason } from "@/lib/database.types";
import { useBroadcastSync } from "../../broadcast-sync";

const MISS_REASON_LABEL: Record<LogMissReason, string> = {
  network_timing: "Network timing",
  breaking_news: "Breaking news",
  segment_overrun: "Segment overrun",
  technical_problem: "Technical problem",
  host_error: "Host error",
  unavailable_copy: "Unavailable copy",
  other: "Other",
};

/**
 * The aired/missed callout on an underwriting credit that hasn't aired yet
 * (page.tsx renders nothing once the server has it as aired). Both answers
 * go through the offline queue (broadcast-sync.tsx), not a <form action>:
 * they show at once, survive a dropped connection or a reload, and send
 * when the server can be reached. Credits get this callout, and ordinary
 * content doesn't, because they're the one item kind with a contractual
 * "must air" obligation and the only kind whose outcome the
 * exception/makegood pipeline reacts to (uw_flag_exception_from_broadcast_event).
 *
 * Once marked missed, the fix is the same drag/"Move to…" affordance the
 * card's own menu already offers — this panel just explains that, rather
 * than asking the host to go create a makegood in Underwriting & Traffic.
 */
export function CreditOutcomePanel({
  itemId,
  breakTimeLabel,
  serverMissed,
}: {
  itemId: string;
  breakTimeLabel: string;
  /** The server already has a missed event for this credit. */
  serverMissed: boolean;
}) {
  const { enqueue, overlay, pendingIds } = useBroadcastSync();
  const [reason, setReason] = useState<LogMissReason | "">("");
  const [notes, setNotes] = useState("");

  const queued = overlay.filter(
    (action) =>
      action.itemId === itemId &&
      (action.kind === "outcome_aired" || action.kind === "outcome_missed"),
  );
  const overlayOutcome = pendingOutcomeByItem(queued).get(itemId) ?? null;
  const outcome = overlayOutcome ?? (serverMissed ? "missed" : null);
  const waiting = queued.some((action) => pendingIds.has(action.id));
  const waitingNote = waiting && (
    <span className="ml-1 text-xs font-normal text-ink-500">Saved on this device — sending…</span>
  );

  if (outcome === "aired") {
    return (
      <div className="mt-2 rounded border border-line bg-panel-50 p-3">
        <p className="text-sm font-semibold text-ink-900">
          Recorded as aired at {breakTimeLabel}.{waitingNote}
        </p>
      </div>
    );
  }

  if (outcome === "missed") {
    return (
      <div className="mt-2 rounded border-2 border-danger bg-danger/5 p-3">
        <p className="text-sm font-semibold text-ink-900">
          Missed at {breakTimeLabel}.{waitingNote}
        </p>
        <p className="mt-1 text-xs text-ink-700">
          Drag this credit (⠿ above) or use its ⋮ menu&apos;s &quot;Move to…&quot; to reschedule it
          into another open break in this broadcast — that&apos;s the default fix, and destinations
          are offered closest to the original time first. Traffic only needs to schedule a makegood
          if it&apos;s still unresolved when this broadcast wraps up.
        </p>
      </div>
    );
  }

  function recordMissed(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reason === "") return;
    enqueue({ kind: "outcome_missed", itemId, reason, notes: notes.trim() || null });
  }

  return (
    <div className="mt-2 rounded border-2 border-brand-primary bg-brand-surface/30 p-3">
      <p className="mb-2 text-sm font-semibold text-ink-900">Did this air at {breakTimeLabel}?</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => enqueue({ kind: "outcome_aired", itemId })}>
          Yes, aired
        </Button>
        <details className="inline-block">
          <summary className="inline-flex cursor-pointer items-center rounded border border-line bg-white px-4 py-2.5 text-sm font-bold text-ink-700">
            No — flag it
          </summary>
          <form
            onSubmit={recordMissed}
            className="mt-2 flex flex-col gap-2 rounded border border-line bg-white p-3"
          >
            <Select
              required
              value={reason}
              onChange={(event) => setReason(event.target.value as LogMissReason | "")}
            >
              <option value="" disabled>
                Reason…
              </option>
              {Object.entries(MISS_REASON_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Input
              type="text"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Brief note (optional)"
            />
            <Button type="submit" variant="secondary">
              Record missed
            </Button>
          </form>
        </details>
      </div>
      <p className="mt-2 text-xs text-ink-700">
        If you flag it missed, you can move it to another open break in this same broadcast right
        from this card — Traffic only gets involved if it&apos;s still unresolved once this
        broadcast wraps up. Both answers work without a connection and send when it returns.
      </p>
    </div>
  );
}
