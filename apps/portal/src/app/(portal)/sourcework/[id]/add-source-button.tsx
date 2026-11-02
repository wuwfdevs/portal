"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "@/components/ui/plus-icon";
import { AddSourceModal } from "./add-source-modal";

/**
 * "+ Add source" and its dialog, shared by the source list and the empty project. As the list
 * toolbar's action it is an icon square on the search row on a phone.
 */
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
        // In the list toolbar it is the "+" beside the search and Filter on a phone.
        phoneIcon={primary ? undefined : <PlusIcon className="size-4" />}
        className={primary ? "shrink-0" : "shrink-0 max-sm:order-first"}
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
