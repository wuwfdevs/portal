import { AudioPlayer } from './AudioPlayer/config'
import { Banner } from './Banner/config'
import { Code } from './Code/config'
import { Embed } from './Embed/config'
import { Gallery } from './Gallery/config'
import { LegacyHtml } from './LegacyHtml/config'
import { MediaBlock } from './MediaBlock/config'
import { PullQuote } from './PullQuote/config'
import { VideoPlayer } from './VideoPlayer/config'
import { Widget } from './Widget/config'

/**
 * Every block an editor can put in a story body. The set follows what Grove's own data uses (the template census):
 * picture, gallery, pull quote, embed (a frame from another site, or a post on X or Facebook), audio and video, plus preserved
 * HTML for migrated content that cannot be mapped. There is no promo block: none of the sampled stories used one.
 * Grove's "Ad" element is deliberately absent: this site has no ads inside story text.
 */
export const bodyBlocks = [Banner, Code, MediaBlock, Gallery, PullQuote, Embed, AudioPlayer, VideoPlayer, Widget, LegacyHtml]

/** What can open a story: one picture, one gallery or one video. The same definitions as the body, defined once. */
export const featuredMediaBlocks = [MediaBlock, Gallery, VideoPlayer, Embed]
