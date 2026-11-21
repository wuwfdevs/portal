import React from 'react'

import { MembershipAppeal } from '@/components/Article/Parts'
import { Button } from '@/components/Kit'
import { membershipAppealOf } from '@/lib/shared-text'
import { getCachedGlobal } from '@/utilities/getGlobals'

/** Where the "All stories" button goes: the list of every story, newest first. */
export const ALL_STORIES_HREF = '/latest'

/**
 * What the home page ends with, whatever sections an editor put on it: the button to every story, and the membership appeal (its words are Shared text, so saving them reaches
 * every page that shows it). They were the coded page's last two things, and they are the page set's, not blocks, so an editor cannot delete the way to the rest of the news by
 * mistake. The appeal draws nothing without words.
 */
export async function HomeFoot() {
  const sharedText = await getCachedGlobal('shared-text', 0)()
  return (
    <div className="container flex flex-col gap-16 pb-20 pt-16">
      <p>
        <Button href={ALL_STORIES_HREF} size="lg" variant="outline">
          All stories
        </Button>
      </p>
      <section className="max-w-[60rem]">
        <MembershipAppeal appeal={membershipAppealOf(sharedText?.membershipAppeal)} />
      </section>
    </div>
  )
}
