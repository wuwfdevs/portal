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
  DataVizBlock as DataVizBlockProps,
  EmbedBlock as EmbedBlockProps,
  GalleryBlock as GalleryBlockProps,
  LinkLineBlock as LinkLineBlockProps,
  ListeningAskBlock as ListeningAskBlockProps,
  LegacyHtmlBlock as LegacyHtmlBlockProps,
  MediaBlock as MediaBlockProps,
  PullQuoteBlock as PullQuoteBlockProps,
  VideoPlayerBlock as VideoPlayerBlockProps,
  WidgetBlock as WidgetBlockProps,
} from '@/payload-types'
import { AudioPlayerBlock } from '@/blocks/AudioPlayer/Component'
import { BannerBlock } from '@/blocks/Banner/Component'
import { CallToActionBlock } from '@/blocks/CallToAction/Component'
import { DataVizBlock } from '@/blocks/DataViz/Component'
import { EmbedBlock } from '@/blocks/Embed/Component'
import { GalleryBlock } from '@/blocks/Gallery/Component'
import { LegacyHtmlBlock } from '@/blocks/LegacyHtml/Component'
import { LinkLineBlock } from '@/blocks/LinkLine/Component'
import { ListeningAskBlock } from '@/blocks/ListeningAsk/Component'
import { PullQuoteBlock } from '@/blocks/PullQuote/Component'
import { VideoPlayerBlock } from '@/blocks/VideoPlayer/Component'
import { WidgetBlock } from '@/blocks/Widget/Component'
import type { PlacementVariant } from '@/lib/listening/placement'
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
      | LinkLineBlockProps
      | ListeningAskBlockProps
      | EmbedBlockProps
      | DataVizBlockProps
      | AudioPlayerBlockProps
      | VideoPlayerBlockProps
      | WidgetBlockProps
      | LegacyHtmlBlockProps
    >

const convertersFor = (framing: PlacementVariant): JSXConvertersFunction<NodeTypes> => ({ defaultConverters }) => ({
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
    linkLine: ({ node }) => <LinkLineBlock {...node.fields} />,
    listeningAsk: ({ node }) => <ListeningAskBlock {...node.fields} framing={framing} />,
    embed: ({ node }) => <EmbedBlock {...node.fields} />,
    dataViz: ({ node }) => <DataVizBlock {...node.fields} />,
    audioPlayer: ({ node }) => <AudioPlayerBlock {...node.fields} />,
    videoPlayer: ({ node }) => <VideoPlayerBlock {...node.fields} />,
    widget: ({ node }) => <WidgetBlock {...node.fields} />,
    legacyHtml: ({ node }) => <LegacyHtmlBlock {...node.fields} />,
  },
})

// One converter set per framing, made once, so a render does not build a new one.
const CONVERTERS: Record<PlacementVariant, JSXConvertersFunction<NodeTypes>> = { story: convertersFor('story'), voice: convertersFor('voice') }

type Props = {
  data: DefaultTypedEditorState
  enableGutter?: boolean
  enableProse?: boolean
  /** How a listening block in this body is framed: `voice` for an audio or video story (`framingForFormat`), else `story`. */
  framing?: PlacementVariant
} & React.HTMLAttributes<HTMLDivElement>

export default function RichText(props: Props) {
  const { className, enableProse = true, enableGutter = true, framing = 'story', ...rest } = props
  return (
    <ConvertRichText
      converters={CONVERTERS[framing]}
      className={cn(
        'payload-richtext',
        // A long web address used as link text has nowhere to break, and would push the page wider than a phone.
        'break-words',
        {
          container: enableGutter,
          'max-w-none': !enableGutter,
          'mx-auto prose md:prose-md': enableProse,
        },
        className,
      )}
      {...rest}
    />
  )
}
