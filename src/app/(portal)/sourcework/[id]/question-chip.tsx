/**
 * The research question a data point answers, as a small label ("Q1", or
 * "Story") with the question as worded on hover. Renders nothing when the
 * point's question is unknown (it was removed).
 */
export function QuestionChip({ label, title }: { label: string | null; title?: string }) {
  if (!label) return null;
  return (
    <span
      title={title}
      className="inline-flex shrink-0 items-center rounded border border-line px-1.5 py-px font-mono text-[11px] font-semibold text-ink-500"
    >
      {label}
    </span>
  );
}
