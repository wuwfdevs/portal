// Reading an id out of a JSON body (a route handler's counterpart to
// lib/action-fields.ts's form-field readers). Pure.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The value as a uuid string, or null for anything else. */
export function uuidParam(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}
