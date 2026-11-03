import { MediaBlock } from '@/blocks/MediaBlock/Component'
import {
  DefaultNodeTypes,
  SerializedBlockNode,
  type DefaultTypedEditorState,
} from '@payloadcms/richtext-lexical'
import {
  JSXConvertersFunction,
  LinkJSXConverter,
  RichText as ConvertRichText,
} from '@payloadcms/richtext-lexical/react'

import { CodeBlock, CodeBlockProps } from '@/blocks/Code/Component'

import type {
  AudioPlayerBlock as AudioPlayerBlockProps,
  BannerBlock as BannerBlockProps,
  CallToActionBlock as CTABlockProps,
  EmbedBlock as EmbedBlockProps,
  GalleryBlock as GalleryBlockProps,
  LegacyHtmlBlock as LegacyHtmlBlockProps,
  MediaBlock as MediaBlockProps,
  PullQuoteBlock as PullQuoteBlockProps,
  VideoPlayerBlock as VideoPlayerBlockProps,
} from '@/payload-types'
import { AudioPlayerBlock } from '@/blocks/AudioPlayer/Component'
import { BannerBlock } from '@/blocks/Banner/Component'
import { CallToActionBlock } from '@/blocks/CallToAction/Component'
import { EmbedBlock } from '@/blocks/Embed/Component'
import { GalleryBlock } from '@/blocks/Gallery/Component'
import { LegacyHtmlBlock } from '@/blocks/LegacyHtml/Component'
import { PullQuoteBlock } from '@/blocks/PullQuote/Component'
import { VideoPlayerBlock } from '@/blocks/VideoPlayer/Component'
import { cn } from '@/utilities/ui'

import { internalDocToHref } from './links'

type NodeTypes =
  | DefaultNodeTypes
  | SerializedBlockNode<
      | CTABlockProps
      | MediaBlockProps
      | BannerBlockProps
      | CodeBlockProps
      | GalleryBlockProps
      | PullQuoteBlockProps
      | EmbedBlockProps
      | AudioPlayerBlockProps
      | VideoPlayerBlockProps
      | LegacyHtmlBlockProps
    >

const jsxConverters: JSXConvertersFunction<NodeTypes> = ({ defaultConverters }) => ({
  ...defaultConverters,
  ...LinkJSXConverter({ internalDocToHref }),
  blocks: {
    banner: ({ node }) => <BannerBlock className="col-start-2 mb-4" {...node.fields} />,
    mediaBlock: ({ node }) => (
      <MediaBlock
        className="col-start-1 col-span-3"
        imgClassName="m-0"
        {...node.fields}
        captionClassName="mx-auto max-w-[48rem]"
        enableGutter={false}
        disableInnerContainer={true}
      />
    ),
    code: ({ node }) => <CodeBlock className="col-start-2" {...node.fields} />,
    cta: ({ node }) => <CallToActionBlock {...node.fields} />,
    gallery: ({ node }) => <GalleryBlock {...node.fields} />,
    pullQuote: ({ node }) => <PullQuoteBlock {...node.fields} />,
    embed: ({ node }) => <EmbedBlock {...node.fields} />,
    audioPlayer: ({ node }) => <AudioPlayerBlock {...node.fields} />,
    videoPlayer: ({ node }) => <VideoPlayerBlock {...node.fields} />,
    legacyHtml: ({ node }) => <LegacyHtmlBlock {...node.fields} />,
  },
})

type Props = {
  data: DefaultTypedEditorState
  enableGutter?: boolean
  enableProse?: boolean
} & React.HTMLAttributes<HTMLDivElement>

export default function RichText(props: Props) {
  const { className, enableProse = true, enableGutter = true, ...rest } = props
  return (
    <ConvertRichText
      converters={jsxConverters}
      className={cn(
        'payload-richtext',
        {
          container: enableGutter,
          'max-w-none': !enableGutter,
          'mx-auto prose md:prose-md dark:prose-invert': enableProse,
        },
        className,
      )}
      {...rest}
    />
  )
}
