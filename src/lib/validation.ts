/** Minimal shape check — real verification happens via the magic link / invite email itself. */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
