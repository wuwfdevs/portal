/**
 * The small icon set a control falls back to on a phone (`phoneIcon` on `Button`, `PrimaryLink` and
 * `SecondaryLink`, docs/ui-patterns.md "Icons on a phone"). Decorative: the control's label is its
 * accessible name. Only verbs with a universal picture belong here; `PlusIcon` is in its own file.
 */
const STROKE = {
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function EditIcon({ className }: { className?: string }) {
  return (
    <svg {...STROKE} className={className}>
      <path d="M2.5 13.5l.8-3.2 7.6-7.6a1.4 1.4 0 0 1 2 0l.4.4a1.4 1.4 0 0 1 0 2l-7.6 7.6z" />
      <path d="M9.6 3.9l2.5 2.5" />
    </svg>
  );
}

export function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg {...STROKE} className={className}>
      <path d="M8 2.5v8M4.5 7.5L8 11l3.5-3.5M3 13.5h10" />
    </svg>
  );
}

export function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg {...STROKE} className={className}>
      <path d="M13 8a5 5 0 1 1-1.5-3.5M13 2.5v3h-3" />
    </svg>
  );
}

export function PrintIcon({ className }: { className?: string }) {
  return (
    <svg {...STROKE} className={className}>
      <path d="M4.5 6V2.5h7V6M4.5 11.5h-2v-5h11v5h-2M4.5 9.5h7v4h-7z" />
    </svg>
  );
}
