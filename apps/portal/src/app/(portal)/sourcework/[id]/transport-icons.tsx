/**
 * The transport glyphs, shared by the player bar and the clip rail's preview
 * button so a clip's play control is visibly the same control as the one
 * driving the whole interview.
 *
 * Icon-only buttons are the exception in this app, not the rule — text
 * labels win almost everywhere (see the player bar's own "−5s" / "Following"
 * controls). Play and pause earn it: the glyph is more universally read than
 * any word for it. Every caller still supplies an aria-label.
 *
 * The triangle is optically left-heavy, so callers nudge it with `ml-0.5`
 * when centering it in a round button.
 */
export function PlayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={className} aria-hidden="true" fill="currentColor">
      <path d="M2 1.2v9.6a.5.5 0 0 0 .76.43l7.7-4.8a.5.5 0 0 0 0-.86l-7.7-4.8A.5.5 0 0 0 2 1.2Z" />
    </svg>
  );
}

export function PauseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={className} aria-hidden="true" fill="currentColor">
      <rect x="1" y="1" width="3.5" height="10" rx="0.5" />
      <rect x="7.5" y="1" width="3.5" height="10" rx="0.5" />
    </svg>
  );
}
