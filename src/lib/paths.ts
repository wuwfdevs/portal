/** A path with the given query fields, skipping empty ones. */
export function withQuery(base: string, query: Record<string, string | undefined | null>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  const text = params.toString();
  return text ? `${base}?${text}` : base;
}
