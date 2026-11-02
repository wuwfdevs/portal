/**
 * Same-origin path validation for user-supplied redirect targets (`next`,
 * `return_to`). Anything that is not a plain absolute path on this site falls
 * back, so a crafted link can never send someone to another host.
 *
 * What it refuses, and why: a value must start with a single "/" — "//host"
 * and "/\host" are protocol-relative to a browser, and "@host" appended to an
 * origin (`https://ours@evil.com`) changes the host. Control characters and
 * backslashes are refused outright because browsers normalise them into
 * slashes.
 */
export function safeLocalPath(
  value: string | null | undefined,
  fallback: string,
  options: { prefixes?: readonly string[] } = {},
): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return fallback;

  const { prefixes } = options;
  if (prefixes && !prefixes.some((prefix) => matchesPrefix(value, prefix))) return fallback;
  return value;
}

/** A prefix match on a path boundary: "/a/b" matches "/a/b", "/a/b/c", "/a/b?x", not "/a/bc". */
function matchesPrefix(value: string, prefix: string): boolean {
  if (!value.startsWith(prefix)) return false;
  const next = value.charAt(prefix.length);
  return next === "" || next === "/" || next === "?" || next === "#";
}
