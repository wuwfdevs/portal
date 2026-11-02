// The only path preserved legacy HTML may take to a reader. Pure.
//
// Migrated Grove bodies that cannot be mapped to a block are kept as HTML rather than dropped, but HTML from an
// import is untrusted. This keeps typographic structure (paragraphs, headings, lists, links, tables, basic images)
// and removes everything that can run or phone home: scripts, styles, frames and plug-ins, forms, event handlers,
// inline styles, and any link or image that is not https (links may also be mailto/tel). It is applied when the
// HTML is saved and again when it is rendered, so a bad record cannot reach a page even if one of them is bypassed.

import sanitizeHtml from 'sanitize-html'

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'hr', 'a', 'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'code', 'pre', 'blockquote',
    'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'figure', 'figcaption', 'img',
    'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    th: ['colspan', 'rowspan', 'scope'],
    td: ['colspan', 'rowspan'],
  },
  allowedSchemes: ['https'],
  allowedSchemesByTag: { a: ['https', 'http', 'mailto', 'tel'], img: ['https'] },
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  // An opener the link could use to steer the page that followed it is not wanted; there is no target at all.
  transformTags: { a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, rel: 'noopener noreferrer nofollow' } }) },
}

export function sanitizeLegacyHtml(html: unknown): string {
  if (typeof html !== 'string' || html.trim() === '') return ''
  return sanitizeHtml(html, OPTIONS)
}
