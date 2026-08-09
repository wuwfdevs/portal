/**
 * The edit/save/cancel/remove glyphs for a rundown item card's corner
 * controls. Icon-only buttons are the exception in this app, not the rule
 * (see transport-icons.tsx) — these earn it because they replace what was
 * previously a text link plus a nested <details> form, and a corner glyph is
 * the standard reading for "edit this card" in the block-editor pattern this
 * screen is modeled on. Every caller still supplies an aria-label.
 */
export function EditIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true" fill="currentColor">
      <path d="M11.3 1.3a1 1 0 0 1 1.4 0l2 2a1 1 0 0 1 0 1.4l-7.6 7.6-3.6.8.8-3.6 7-7Zm-6.9 8.4-.5 2.4 2.4-.5 6.4-6.4-1.9-1.9-6.4 6.4Z" />
    </svg>
  );
}

export function RemoveIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true" fill="currentColor">
      <path d="M6 2h4a1 1 0 0 1 1 1v1h3v1.5H2V4h3V3a1 1 0 0 1 1-1Zm-1.5 4h7l-.6 7.1a1 1 0 0 1-1 .9H6.1a1 1 0 0 1-1-.9L4.5 6Z" />
    </svg>
  );
}

export function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true" fill="currentColor">
      <path d="M13.7 4.3a1 1 0 0 1 0 1.4l-6.5 6.5a1 1 0 0 1-1.4 0L2.3 8.7a1 1 0 1 1 1.4-1.4l2.8 2.8 5.8-5.8a1 1 0 0 1 1.4 0Z" />
    </svg>
  );
}

export function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true" fill="currentColor">
      <path d="M3.5 3.5a1 1 0 0 1 1.4 0L8 6.6l3.1-3.1a1 1 0 1 1 1.4 1.4L9.4 8l3.1 3.1a1 1 0 0 1-1.4 1.4L8 9.4l-3.1 3.1a1 1 0 0 1-1.4-1.4L6.6 8 3.5 4.9a1 1 0 0 1 0-1.4Z" />
    </svg>
  );
}

/** The card's single "more actions" trigger — consolidates edit/move/remove into one menu instead of three separate corner icons. */
export function DotsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true" fill="currentColor">
      <circle cx="3" cy="8" r="1.5" />
      <circle cx="8" cy="8" r="1.5" />
      <circle cx="13" cy="8" r="1.5" />
    </svg>
  );
}
