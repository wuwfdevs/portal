// The one line under a show's name: who hosts it, when it comes out, how many episodes. Pure.

const plural = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`

/** "Hosted by Leigh Ostrander · New episodes every other Friday · 3 episodes". Parts with nothing to say are left out. */
export function showLine(input: { hosts: readonly string[]; schedule?: string | null; episodes: number }): string | null {
  const parts: string[] = []
  if (input.hosts.length > 0) parts.push(`Hosted by ${input.hosts.join(', ')}`)
  const schedule = input.schedule?.trim()
  if (schedule) parts.push(schedule)
  if (input.episodes > 0) parts.push(plural(input.episodes, 'episode'))
  return parts.length > 0 ? parts.join(' · ') : null
}
