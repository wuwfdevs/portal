import type { StaticImageData } from 'next/image'

import { cn } from '@/utilities/ui'
import React from 'react'
import RichText from '@/components/RichText'

import type { MediaBlock as MediaBlockProps } from '@/payload-types'

import { Media } from '../../components/Media'

type Props = MediaBlockProps & {
  breakout?: boolean
  captionClassName?: string
  className?: string
  enableGutter?: boolean
  imgClassName?: string
  staticImage?: StaticImageData
  disableInnerContainer?: boolean
}

/** How the picture sits against the text. `full` is the default and adds nothing. */
const ALIGNMENT_CLASS = {
  full: '',
  center: 'mx-auto max-w-md',
  left: 'md:float-left md:mr-6 md:w-1/2',
  right: 'md:float-right md:ml-6 md:w-1/2',
} as const

export const MediaBlock: React.FC<Props> = (props) => {
  const {
    alignment,
    altText,
    caption: useCaption,
    captionClassName,
    className,
    credit: useCredit,
    enableGutter = true,
    imgClassName,
    media,
    source: useSource,
    staticImage,
    disableInnerContainer,
  } = props

  // This use's own caption, credit and source win; the library record's are the fallback.
  const library = media && typeof media === 'object' ? media : null
  const libraryCaption = library?.caption ?? null
  const credit = useCredit || library?.credit || null
  const source = useSource || library?.source || null
  const hasCaption = Boolean(useCaption || libraryCaption)

  return (
    <div
      className={cn(
        '',
        {
          container: enableGutter,
        },
        ALIGNMENT_CLASS[alignment ?? 'full'],
        className,
      )}
    >
      {(media || staticImage) && (
        <Media
          alt={altText || undefined}
          imgClassName={cn('border border-border rounded-[0.8rem]', imgClassName)}
          resource={media}
          src={staticImage}
        />
      )}
      {(hasCaption || credit || source) && (
        <div
          className={cn(
            'mt-6',
            {
              container: !disableInnerContainer,
            },
            captionClassName,
          )}
        >
          {useCaption ? (
            <p className="font-sans text-sm text-ink-2">{useCaption}</p>
          ) : (
            libraryCaption && <RichText data={libraryCaption} enableGutter={false} />
          )}
          {(credit || source) && (
            <p className="mt-1 font-sans text-xs text-ink-3">
              {credit}
              {credit && source ? ' · ' : ''}
              {source}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
