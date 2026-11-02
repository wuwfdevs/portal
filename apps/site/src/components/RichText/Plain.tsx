import type { DefaultNodeTypes, DefaultTypedEditorState } from '@payloadcms/richtext-lexical'
import { type JSXConvertersFunction, LinkJSXConverter, RichText as ConvertRichText } from '@payloadcms/richtext-lexical/react'
import React from 'react'

import { cn } from '@/utilities/ui'

import { internalDocToHref } from './links'

// Rich text with the default nodes and links only, and none of the story blocks (gallery, embed, promo, preserved
// HTML...). Those blocks are server components that read Payload, so anything that renders them is server-only.
// A client component (the form block, for its intro and confirmation text) must use this one instead of `RichText`:
// importing `RichText` from a client component pulls Payload into the browser bundle and the build fails.

const jsxConverters: JSXConvertersFunction<DefaultNodeTypes> = ({ defaultConverters }) => ({
  ...defaultConverters,
  ...LinkJSXConverter({ internalDocToHref }),
})

type Props = {
  data: DefaultTypedEditorState
  enableGutter?: boolean
  enableProse?: boolean
} & React.HTMLAttributes<HTMLDivElement>

export default function RichTextPlain(props: Props) {
  const { className, enableProse = true, enableGutter = true, ...rest } = props
  return (
    <ConvertRichText
      converters={jsxConverters}
      className={cn(
        'payload-richtext',
        { container: enableGutter, 'max-w-none': !enableGutter, 'mx-auto prose md:prose-md dark:prose-invert': enableProse },
        className,
      )}
      {...rest}
    />
  )
}
