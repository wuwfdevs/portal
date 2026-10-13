/**
 * The phone minimum for anything tappable: 44px tall below `lg`. `Button`'s
 * boxed variants and `controlClasses` already include it; use this on a raw
 * `<button>`, `<a>`, `<summary>`, or `Button touch` for a text-style action.
 * Kept out of `button.tsx` (a client module) so a server component gets the
 * string, not a client reference.
 */
export const TAP_TARGET = "max-lg:min-h-11";
