import { Banner } from './Banner/config'
import { Code } from './Code/config'
import { Embed } from './Embed/config'
import { Gallery } from './Gallery/config'
import { LegacyHtml } from './LegacyHtml/config'
import { MediaBlock } from './MediaBlock/config'
import { Promo } from './Promo/config'
import { PullQuote } from './PullQuote/config'

/**
 * Every block an editor can put in a story body. Parity with the Brightspot rich-text elements (image, gallery,
 * pull quote, video, HTML/iframe embed, promo) plus preserved HTML for migrated content that cannot be mapped.
 * Brightspot's "Ad" element is deliberately absent: this site has no ads inside story text.
 */
export const bodyBlocks = [Banner, Code, MediaBlock, Gallery, PullQuote, Embed, Promo, LegacyHtml]
