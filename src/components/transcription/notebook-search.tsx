"use client";

import { Input } from "@/components/ui/input";

/**
 * The Notebook's one search box: a plain GET form to the Sourcework home, so it works
 * without script and a result is a URL. Uncontrolled by default; the Sources section
 * passes `value`/`onChange` so the same box also narrows its list by title as you type
 * (archive search never matches a source's own title), and Enter searches everything.
 */
export function NotebookSearchForm({
  view,
  defaultValue,
  value,
  onChange,
  hint,
  className,
}: {
  view?: "excerpts";
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  /** Shown under the box, e.g. what Enter does while text is typed. */
  hint?: string;
  className?: string;
}) {
  return (
    <form method="get" role="search" className={className} data-row="full">
      <input type="hidden" name="tab" value="notebook" />
      {view && <input type="hidden" name="view" value={view} />}
      <Input
        type="search"
        name="q"
        placeholder="Search sources, transcripts and excerpts"
        aria-label="Search the notebook"
        className="sm:max-w-xl"
        {...(onChange
          ? { value: value ?? "", onChange: (event) => onChange(event.target.value) }
          : { defaultValue })}
      />
      {hint && (
        <p className="mt-1.5 text-xs text-ink-500" aria-live="polite">
          {hint}
        </p>
      )}
    </form>
  );
}
