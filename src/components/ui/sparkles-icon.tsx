/**
 * The mark for an action a model performs. Every button or link that starts an AI run carries it
 * (`<Button ai>` does this itself), so a person can tell at a glance which controls spend a model call
 * and which only move their own work around. Decorative: the button's text is its name.
 */
export function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true" fill="currentColor">
      <path d="M6.2 1.6a.6.6 0 0 1 1.1 0l.9 2.7a2.4 2.4 0 0 0 1.5 1.5l2.7.9a.6.6 0 0 1 0 1.1l-2.7.9a2.4 2.4 0 0 0-1.5 1.5l-.9 2.7a.6.6 0 0 1-1.1 0l-.9-2.7a2.4 2.4 0 0 0-1.5-1.5l-2.7-.9a.6.6 0 0 1 0-1.1l2.7-.9a2.4 2.4 0 0 0 1.5-1.5l.9-2.7Z" />
      <path d="M12.6 9.8a.4.4 0 0 1 .8 0l.4 1.2c.1.4.4.7.8.8l1.2.4a.4.4 0 0 1 0 .8l-1.2.4c-.4.1-.7.4-.8.8l-.4 1.2a.4.4 0 0 1-.8 0l-.4-1.2a1.2 1.2 0 0 0-.8-.8l-1.2-.4a.4.4 0 0 1 0-.8l1.2-.4c.4-.1.7-.4.8-.8l.4-1.2Z" />
    </svg>
  );
}
