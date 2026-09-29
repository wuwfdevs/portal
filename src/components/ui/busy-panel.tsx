import { ProgressBar } from "@/components/ui/progress-bar";

/**
 * What a screen shows while a long server step runs and no percentage is
 * honest: a title, a soft time hint, and a sliding bar. It is a polite live
 * region, so the title is announced when the panel appears. Not for a wait
 * under a second or two — a pending button already covers that.
 */
export function BusyPanel({
  title,
  hint,
  note,
}: {
  /** What is happening, as a noun phrase: "Reading the log". */
  title: string;
  /** How long to expect, softly: "This can take a minute". */
  hint?: string;
  /** Reassurance about what has and hasn't happened yet. */
  note?: string;
}) {
  return (
    <div aria-live="polite" className="flex flex-col gap-2.5 rounded border border-line px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-[15px] font-bold text-ink-900">{title}</span>
        {hint && <span className="text-[13px] text-ink-500">{hint}</span>}
      </div>
      <ProgressBar indeterminate label={title} />
      {note && <p className="text-[13px] leading-snug text-ink-700">{note}</p>}
    </div>
  );
}
