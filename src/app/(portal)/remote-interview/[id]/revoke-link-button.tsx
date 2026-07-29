"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { revokeParticipant } from "../actions";

/** Revoking a guest's link takes their access away immediately — worth a confirm, not a destructive-delete-sized one. */
export function RevokeLinkButton({
  sessionId,
  participantId,
}: {
  sessionId: string;
  participantId: string;
}) {
  const [isConfirming, setIsConfirming] = useState(false);

  if (!isConfirming) {
    return (
      <button
        type="button"
        onClick={() => setIsConfirming(true)}
        className="text-xs font-semibold text-danger hover:underline"
      >
        Revoke
      </button>
    );
  }

  return (
    <form action={revokeParticipant} className="flex items-center gap-2">
      <input type="hidden" name="session_id" value={sessionId} />
      <input type="hidden" name="participant_id" value={participantId} />
      <span className="text-xs text-ink-500">Revoke this link?</span>
      <ConfirmButton />
      <button
        type="button"
        onClick={() => setIsConfirming(false)}
        className="text-xs font-semibold text-brand-link hover:underline"
      >
        Cancel
      </button>
    </form>
  );
}

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xs font-bold text-danger hover:underline"
    >
      {pending ? "Revoking…" : "Yes, revoke"}
    </button>
  );
}
