import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { processingLabel } from "@/lib/transcription/status";
import type { SwSourceKind } from "@/lib/database.types";
import { retryTranscription } from "../actions";
import { ProcessingPoller } from "./processing-poller";

/**
 * The state of the text derived from a source — rendered *above* the
 * workspace rather than instead of it.
 *
 * A source's uploaded file and the representation extracted from it fail
 * independently, and only the second one is fragile: a PDF whose text
 * extraction died is still a perfectly readable PDF, and a recording whose
 * transcription failed is still playable. Both workspace pages used to
 * branch exclusively on computeProjectStatus(), which collapses the two into
 * one value — so a failed extraction replaced the entire workspace with an
 * error card and the file the reporter had just uploaded became unreachable
 * from the screen that was supposed to show it. That rollup is still the
 * right thing for a status badge and for the project/source lists; it is the
 * wrong thing to decide whether to render the viewer.
 */
export function RepresentationStatusBanner({
  status,
  kind,
  errorMessage,
  projectId,
  sourceId,
  returnTo,
}: {
  status: "pending" | "processing" | "ready" | "failed";
  kind: SwSourceKind;
  errorMessage: string | null;
  /** Null when the source has no project left to revalidate through — the retry action is project-scoped, so it can't be offered. */
  projectId: string | null;
  sourceId: string | null;
  returnTo?: string;
}) {
  if (status === "ready") return null;

  if (status === "failed") {
    return (
      <Alert variant="danger" className="mb-4">
        <p>
          {errorMessage ??
            (kind === "document"
              ? "Couldn't extract the text from this document."
              : "Couldn't transcribe this recording.")}{" "}
          The file itself uploaded fine and is shown below.
        </p>
        {projectId && (
          <form action={retryTranscription} className="mt-2.5">
            <input type="hidden" name="project_id" value={projectId} />
            {sourceId && <input type="hidden" name="source_id" value={sourceId} />}
            {returnTo && <input type="hidden" name="return_to" value={returnTo} />}
            <Button type="submit" variant="secondary">
              {kind === "document" ? "Retry text extraction" : "Retry transcription"}
            </Button>
          </form>
        )}
      </Alert>
    );
  }

  return (
    <Alert variant="note" className="mb-4">
      {processingLabel(kind)} — this can take a few minutes for a{" "}
      {kind === "document" ? "large document" : "long recording"}. The{" "}
      {kind === "document" ? "document" : "media"} below is ready now; the text will appear here on
      its own.
      <ProcessingPoller />
    </Alert>
  );
}
