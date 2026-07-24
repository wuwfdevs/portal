const BUTTON_CLASSES =
  "flex h-7 w-7 items-center justify-center rounded border border-line text-ink-500 " +
  "transition-colors hover:border-brand-primary hover:text-brand-link " +
  "focus:outline-none focus:ring-2 focus:ring-brand-surface " +
  "disabled:cursor-not-allowed disabled:border-line/60 disabled:text-ink-400/40 disabled:hover:border-line/60";

/**
 * Up/down controls for the settings screens' ordered lists. Each arrow is its
 * own form because the surrounding row already sits inside other forms — real
 * buttons with a proper hit target rather than bare glyphs.
 */
export function ReorderButtons({
  action,
  idName,
  id,
  label,
  isFirst,
  isLast,
}: {
  action: (formData: FormData) => Promise<void>;
  idName: string;
  id: string;
  label: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <div className="flex gap-1">
      <form action={action}>
        <input type="hidden" name={idName} value={id} />
        <input type="hidden" name="direction" value="up" />
        <button
          type="submit"
          disabled={isFirst}
          aria-label={`Move ${label} up`}
          className={BUTTON_CLASSES}
        >
          <span aria-hidden="true">↑</span>
        </button>
      </form>
      <form action={action}>
        <input type="hidden" name={idName} value={id} />
        <input type="hidden" name="direction" value="down" />
        <button
          type="submit"
          disabled={isLast}
          aria-label={`Move ${label} down`}
          className={BUTTON_CLASSES}
        >
          <span aria-hidden="true">↓</span>
        </button>
      </form>
    </div>
  );
}
