/**
 * Does a dropped file satisfy an `accept` string like the one on a file
 * input ("audio/*,video/*,application/pdf" or ".pdf,.png")? Choosing files
 * through the picker already filters by `accept`; a drop doesn't, so a drop
 * zone checks the same rule itself. An empty or missing `accept` allows all.
 */
export function matchesAccept(file: { name: string; type: string }, accept?: string): boolean {
  const rules = (accept ?? "")
    .split(",")
    .map((rule) => rule.trim().toLowerCase())
    .filter(Boolean);
  if (rules.length === 0) return true;
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return rules.some((rule) => {
    if (rule.startsWith(".")) return name.endsWith(rule);
    if (rule.endsWith("/*")) return type.startsWith(rule.slice(0, -1));
    return type === rule;
  });
}
