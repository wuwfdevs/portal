"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AddSourceModal } from "./add-source-modal";

/** "+ Add source" and its dialog, shared by the source list and the empty project. */
export function AddSourceButton({
  projectId,
  hasSources,
  primary = false,
}: {
  projectId: string;
  hasSources: boolean;
  primary?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant={primary ? "primary" : "secondary"}
        size={primary ? "md" : "sm"}
        onClick={() => setOpen(true)}
        className="shrink-0"
      >
        {primary ? "Add the first source" : "+ Add source"}
      </Button>
      {open && (
        <AddSourceModal
          projectId={projectId}
          hasSources={hasSources}
          onClose={() => setOpen(false)}
          onDone={() => {
            // Stay on the project: the new source appears in its list, and it
            // may still be processing, which is nothing to open yet.
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
