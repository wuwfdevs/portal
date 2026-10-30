/**
 * Whether a storage object path sits inside the folder `prefix` (an entity id
 * such as a contract or agreement id). Server Actions that sign or record a
 * path the browser sent must check it against the entity it claims to belong
 * to — otherwise the id in the call is decoration and any path in the bucket
 * can be named. Refuses "." / ".." segments and backslashes so a crafted path
 * can't walk out of the folder.
 */
export function pathIsUnder(prefix: string, path: string): boolean {
  if (!prefix || prefix.includes("/")) return false;
  if (!path.startsWith(`${prefix}/`) || path.length === prefix.length + 1) return false;
  if (path.includes("\\")) return false;
  return path.split("/").every((segment) => segment !== ".." && segment !== ".");
}
