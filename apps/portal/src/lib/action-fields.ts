import { failWith } from "@/lib/editorial/action-result";
import { isValidDateISO } from "@/lib/dates";
import { field, isUuid, parseNumberInput } from "@/lib/form-fields";

/**
 * The form readers that fail the action — bounce back to `path` with a
 * message — when a value is required and wrong. Built on `failWith`, so they
 * never return a bad value; pure readers are in `form-fields.ts`.
 */

/** A required number ("$1,250" is fine). */
export function numberField(formData: FormData, name: string, path: string, label: string): number {
  const value = parseNumberInput(field(formData, name));
  if (value === null) failWith(path, `${label} is required.`);
  if (!Number.isFinite(value)) failWith(path, `${label} must be a number.`);
  return value;
}

/** A number that may be left blank (null). */
export function optionalNumberField(
  formData: FormData,
  name: string,
  path: string,
  label: string,
): number | null {
  const value = parseNumberInput(field(formData, name));
  if (value === null) return null;
  if (!Number.isFinite(value)) failWith(path, `${label} must be a number.`);
  return value;
}

/** A required id picked from a list. */
export function uuidField(formData: FormData, name: string, path: string, label: string): string {
  const value = field(formData, name);
  if (!isUuid(value)) failWith(path, `Choose ${label}.`);
  return value;
}

/** A required calendar date (`YYYY-MM-DD`, and a real one). */
export function dateField(formData: FormData, name: string, path: string, label: string): string {
  const value = field(formData, name);
  if (!isValidDateISO(value)) failWith(path, `${label} must be a date.`);
  return value;
}
