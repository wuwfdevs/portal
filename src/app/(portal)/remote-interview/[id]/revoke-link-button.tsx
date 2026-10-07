"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
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
      <Button type="button" variant="danger-link" onClick={() => setIsConfirming(true)}>
        Revoke
      </Button>
    );
  }

  return (
    <form action={revokeParticipant} className="flex items-center gap-2">
      <input type="hidden" name="session_id" value={sessionId} />
      <input type="hidden" name="participant_id" value={participantId} />
      <span className="text-xs text-ink-500">Revoke this link?</span>
      <ConfirmButton />
      <Button
        type="button"
        variant="link"
        onClick={() => setIsConfirming(false)}
        className="text-brand-link"
      >
        Cancel
      </Button>
    </form>
  );
}

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger-link" disabled={pending}>
      {pending ? "Revoking…" : "Yes, revoke"}
    </Button>
  );
}
