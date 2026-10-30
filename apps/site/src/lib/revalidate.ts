// Drop-in replacements for next/cache's revalidatePath and revalidateTag for use in Payload hooks.
//
// Inside a Next request they behave exactly as the originals. Outside one (a script, an import job, an
// integration test, the Portal publish endpoint when called from a worker) Next throws "static generation
// store missing" because there is no cache to refresh. A cache refresh must not fail the database write
// that triggered it, but it must not vanish silently either, so it is logged.

import { revalidatePath as nextRevalidatePath, revalidateTag as nextRevalidateTag } from 'next/cache'

function attempt(what: string, run: () => void): void {
  try {
    run()
  } catch (error) {
    console.warn(`[revalidate] skipped ${what}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export function revalidatePath(path: string, type?: 'layout' | 'page'): void {
  attempt(`path ${path}`, () => nextRevalidatePath(path, type))
}

export function revalidateTag(tag: string, profile: 'max' | 'default' | 'seconds' | 'hours' | 'days' | 'weeks' = 'max'): void {
  attempt(`tag ${tag}`, () => nextRevalidateTag(tag, profile))
}
