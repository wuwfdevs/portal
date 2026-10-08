import { PageHeader } from "@/components/ui/page-header";
import { requireToolAccess } from "@/lib/auth/authz";
import { NewProjectForm } from "./new-project-form";

// completeSourceUpload (called from the upload forms) can kick off
// startDocumentProcessing, which schedules a Mistral OCR call via Next's
// after() for a large scanned document — raised here so that work has room
// to finish. A Server Action inherits its invoking route's maxDuration;
// this can't live in actions.ts itself (a "use server" file) — a bare
// `export const maxDuration` there broke Turbopack's Server Actions
// compilation entirely ("module has no exports at all"), confirmed while
// building this phase. See docs/sourcework-design.md §8.6 for the execution
// model and its stated risk (a hard platform-level kill below even this
// ceiling still leaves a run recoverable via isStaleProcessingRun, not
// stuck forever).
export const maxDuration = 300;

export default async function NewTranscriptionProjectPage() {
  await requireToolAccess("transcription");

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <div className="max-w-lg">
        <PageHeader
          size="form"
          back={{ href: "/sourcework", label: "Back to projects" }}
          title="New project"
          description="Name the project. Add interviews and documents now or whenever you have them."
          className="mb-6"
        />
        <NewProjectForm />
      </div>
    </div>
  );
}
