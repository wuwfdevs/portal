"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BatchRunPanel } from "@/components/ui/batch-run-panel";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Input, Label, Textarea } from "@/components/ui/input";
import { summarizeTasks } from "@/lib/task-queue";
import type { SourceUploadActions } from "@/lib/transcription/upload-source";
import { createEmptyProject } from "../actions";
import {
  completeSourceUpload,
  createSourceForProject,
  failSourceUpload,
} from "../[id]/source-actions";
import { StagedFiles } from "../staged-files";
import { useSourceUploads, type StagedFile } from "../use-source-uploads";

function actionsFor(projectId: string): SourceUploadActions {
  return {
    createSource: (input) => createSourceForProject(projectId, input),
    completeSource: (input) => completeSourceUpload({ projectId, ...input }),
    failSource: (input) => failSourceUpload({ projectId, ...input }),
  };
}

/**
 * A project is a workspace that references sources, so it starts with a name
 * and nothing else. Files are optional: any chosen here become sources of the
 * new project (each its own, uploaded a few at a time), and sources can be
 * added or found in the library afterwards.
 */
export function NewProjectForm() {
  const router = useRouter();
  const uploads = useSourceUploads();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  // Whether the title box is still the file name we suggested (or empty), and
  // so may be replaced when files are chosen. Anything the reporter types is
  // theirs and is never overwritten.
  const [titleIsSuggested, setTitleIsSuggested] = useState(true);
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const summary = useMemo(() => summarizeTasks(uploads.tasks), [uploads.tasks]);
  const uploading = uploads.tasks.length > 0;
  const pending = creating || uploads.running;

  // Everything uploaded cleanly: go to the project. With failures the panel
  // stays, so they can be retried or the project opened regardless.
  useEffect(() => {
    if (projectId && summary.finished && summary.failed === 0) {
      router.push(`/sourcework/${projectId}`);
    }
  }, [projectId, summary.finished, summary.failed, router]);

  function handleStagedChange(next: StagedFile[]) {
    setStaged(next);
    if (titleIsSuggested) setTitle(next.length === 1 ? (next[0]?.title ?? "") : "");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    let id = projectId;
    if (!id) {
      setCreating(true);
      const created = await createEmptyProject({ title, description });
      setCreating(false);
      if ("error" in created) {
        setError(created.error);
        return;
      }
      id = created.id;
      setProjectId(id);
    }

    if (staged.length === 0) {
      router.push(`/sourcework/${id}`);
      return;
    }
    uploads.begin(staged, actionsFor(id));
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          name="title"
          placeholder="Mayor Reeves on bridge funding"
          required
          disabled={pending || uploading}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setTitleIsSuggested(event.target.value.trim() === "");
          }}
        />
        <FieldHint>
          {staged.length === 1
            ? "Taken from the file name — change it to whatever you’ll look for later."
            : "Whatever you’ll look for later."}
        </FieldHint>
      </div>
      <div>
        <Label htmlFor="description">Notes (optional)</Label>
        <Textarea
          id="description"
          name="description"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Context for this project — what it’s about, who set it up"
          disabled={pending || uploading}
        />
      </div>

      {!uploading && (
        <div>
          <Label>Sources (optional)</Label>
          <StagedFiles staged={staged} onChange={handleStagedChange} disabled={pending} />
          <FieldHint>
            You can also add sources later, or reference ones already in the library.
          </FieldHint>
        </div>
      )}

      {error && <FieldError>{error}</FieldError>}

      {uploading && (
        <>
          <BatchRunPanel
            tasks={uploads.tasks}
            running={uploads.running}
            onStop={uploads.stop}
            onResume={uploads.resume}
            onRetry={(id) => uploads.retry([id])}
            onRetryFailed={uploads.retryFailed}
          />
          {!uploads.running && summary.failed > 0 && projectId && (
            <p className="text-sm text-ink-700">
              The project was created.{" "}
              <Link href={`/sourcework/${projectId}`} className="font-semibold text-brand-link">
                Open it
              </Link>{" "}
              and add the rest later, or retry above.
            </p>
          )}
        </>
      )}

      {!uploading && (
        <Button type="submit" disabled={pending}>
          {pending
            ? "Working…"
            : staged.length === 0
              ? "Create project"
              : `Create project and upload ${staged.length} file${staged.length === 1 ? "" : "s"}`}
        </Button>
      )}
    </form>
  );
}
