import { cn } from '@/utilities/ui'
import React from 'react'

import { Card, CardPostData } from '@/components/Card'

export type Props = {
  posts: CardPostData[]
  /** The cards' look (`Card`). A story the archive block loaded without its section draws no chip and keeps its topics line. */
  variant?: 'default' | 'editorial'
}

export const CollectionArchive: React.FC<Props> = (props) => {
  const { posts, variant = 'editorial' } = props

  return (
    <div className={cn('container')}>
      <div>
        <div className="grid grid-cols-4 sm:grid-cols-8 lg:grid-cols-12 gap-y-4 gap-x-4 lg:gap-y-8 lg:gap-x-8 xl:gap-x-8">
          {posts?.map((result, index) => {
            if (typeof result === 'object' && result !== null) {
              return (
                <div className="col-span-4" key={index}>
                  <Card className="h-full" doc={result} showCategories variant={variant} />
                </div>
              )
            }

            return null
          })}
        </div>
      </div>
    </div>
  )
}
