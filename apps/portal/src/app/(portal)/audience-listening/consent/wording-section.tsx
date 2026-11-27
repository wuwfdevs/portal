import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormActions } from "@/components/ui/form-actions";
import { Field, Textarea } from "@/components/ui/input";
import { SectionHeading } from "@/components/ui/section-heading";
import { formatEventTime } from "@/lib/audience-listening/event-times";

interface Version {
  id: string;
  version: number;
  body: string;
  created_at: string;
  created_by: string | null;
}

/**
 * One kind of numbered wording (the consent wording, or the opening every recording starts with): the version in use, the form for a
 * coordinator to add the next, and the earlier versions. Both kinds are insert-only, so one component shows both.
 */
export function WordingSection({
  title,
  empty,
  help,
  fieldLabel,
  fieldHint,
  maxLength,
  versions,
  names,
  isCoordinator,
  action,
  children,
}: {
  title: string;
  empty: string;
  help: ReactNode;
  fieldLabel: string;
  fieldHint: string;
  maxLength: number;
  versions: Version[];
  names: Map<string, string>;
  isCoordinator: boolean;
  action: (formData: FormData) => Promise<void>;
  children?: ReactNode;
}) {
  const current = versions[0];
  return (
    <section className="flex flex-col gap-6" aria-label={title}>
      <SectionHeading>{title}</SectionHeading>
      {!current && <Alert variant="note">{empty}</Alert>}
      <Alert variant="note">{help}</Alert>

      {current && (
        <Card className="p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2.5">
            <SectionHeading>Version {current.version}</SectionHeading>
            <Badge variant="success">In use</Badge>
          </div>
          <p className="whitespace-pre-wrap text-sm text-ink-900">{current.body}</p>
          <p className="mt-3 text-xs text-ink-400">
            Added {formatEventTime(current.created_at)}
            {current.created_by && names.get(current.created_by) ? ` by ${names.get(current.created_by)}` : ""}
          </p>
        </Card>
      )}
      {children}

      {isCoordinator ? (
        <Card className="p-5">
          <SectionHeading className="mb-4">{current ? "Add a new version" : "Add the first version"}</SectionHeading>
          <form action={action} className="flex flex-col gap-3">
            <Field label={fieldLabel} htmlFor={`${title}-body`} hint={fieldHint}>
              <Textarea id={`${title}-body`} name="body" rows={8} required maxLength={maxLength} defaultValue={current?.body ?? ""} />
            </Field>
            <FormActions>
              <Button type="submit">Save as version {(current?.version ?? 0) + 1}</Button>
            </FormActions>
          </form>
        </Card>
      ) : (
        <p className="text-sm text-ink-500">Only a coordinator can add a version.</p>
      )}

      {versions.length > 1 && (
        <Card className="p-5">
          <SectionHeading className="mb-3">Earlier versions</SectionHeading>
          <ul className="flex flex-col gap-4">
            {versions.slice(1).map((v) => (
              <li key={v.id}>
                <p className="text-xs font-semibold text-ink-500">
                  Version {v.version} · {formatEventTime(v.created_at)}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink-700">{v.body}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}
