/**
 * Plain readers for the fields of a submitted `<form>`. Every Server Action
 * used to carry its own copy of these; they are pure (no redirects), so they
 * work from an action, a route handler or a test. The ones that fail the
 * action with a message — a required number, a uuid, a date — are in
 * `action-fields.ts`.
 */

/** A text field, trimmed; "" when it is missing or not text. */
export function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

/** A text field, trimmed; null when it is missing or blank. */
export function optionalField(formData: FormData, name: string): string | null {
  const value = field(formData, name);
  return value === "" ? null : value;
}

/** A whole number from a text field; null when blank or not a number. */
export function optionalInt(formData: FormData, name: string): number | null {
  const raw = optionalField(formData, name);
  if (raw === null) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
}

/** Whether a checkbox was ticked (an unticked one is not submitted at all). */
export function checkboxField(formData: FormData, name: string): boolean {
  const value = formData.get(name);
  return value !== null && value !== "false" && value !== "off";
}

/** A comma-separated field as a trimmed, non-empty list. */
export function csvField(formData: FormData, name: string): string[] {
  return field(formData, name)
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * A number typed by a person: `$`, `%`, commas and spaces are ignored
 * ("$1,250" → 1250). Null when blank, NaN when something else is left over —
 * the caller decides which of the two is an error.
 */
export function parseNumberInput(raw: string): number | null {
  const cleaned = raw.replace(/[$,%\s]/g, "");
  if (cleaned === "") return null;
  return Number(cleaned);
}
