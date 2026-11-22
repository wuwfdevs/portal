// Sorting numbers into a few colour steps for a map. Pure, and shared by the server's drawing and the browser's interactive map, so the two
// can never colour an area differently.

export interface Classes {
  /** n + 1 edges, lowest to highest. An area belongs to step i when edges[i] <= value < edges[i + 1] (the last step includes its top edge). */
  edges: number[]
  colorOf(value: number | null): string
  indexOf(value: number): number
}

/** Round an edge to a tidy number without moving it by more than a few percent of the span, so a legend reads "20 to 40", not "19.87 to 39.74". */
function tidy(value: number, span: number): number {
  if (span === 0) return value
  const unit = 10 ** Math.floor(Math.log10(span / 10))
  return Math.round(value / unit) * unit
}

/** Equal steps between the lowest and highest value. Steps are equal because a reader can check them against the legend; quantiles hide the spread. */
export function equalSteps(values: readonly number[], steps: number, colors: readonly string[], noData: string): Classes | null {
  const finite = values.filter((v) => Number.isFinite(v))
  if (finite.length === 0) return null
  const min = Math.min(...finite)
  const max = Math.max(...finite)
  const n = min === max ? 1 : Math.max(1, Math.min(steps, colors.length))
  const span = max - min
  const edges = Array.from({ length: n + 1 }, (_, i) => (i === 0 ? min : i === n ? max : tidy(min + (span * i) / n, span)))
  const indexOf = (v: number) => {
    if (n === 1) return 0
    for (let i = 1; i < n; i++) if (v < edges[i]!) return i - 1
    return n - 1
  }
  return {
    edges,
    indexOf,
    colorOf: (v) => (v === null || !Number.isFinite(v) ? noData : (colors[Math.round((indexOf(v) * (colors.length - 1)) / Math.max(1, n - 1))] ?? noData)),
  }
}
