import { describe, expect, it } from 'vitest'

import { renderBlock } from '../testing'
import { QuestionsSection } from './Component'

const html = (block: Record<string, unknown>) => renderBlock(QuestionsSection, 'sectionQuestions', block)

describe('Questions section', () => {
  it('draws nothing without a row that has a question and an answer', () => {
    expect(html({})).toBe('')
    expect(html({ items: [{ question: 'Q only' }, { answer: 'A only' }, { question: ' ', answer: ' ' }, null] })).toBe('')
  })
  it('draws each row as a details element, with paragraphs and a link', () => {
    const out = html({
      anchor: 'faq', tone: 'plain', heading: { title: 'Common questions' },
      items: [{ question: 'Is there a minimum?', answer: 'No.\n\nGifts of every size matter.', linkLabel: 'See levels', linkHref: '/support#levels' }, { question: 'Second?', answer: 'Yes.' }],
    })
    expect(out.match(/<details/g)?.length).toBe(2)
    expect(out).toContain('<summary')
    expect(out).toContain('id="faq"')
    expect(out).toContain('Common questions')
    expect(out).toContain('<p>No.</p>')
    expect(out).toContain('<p>Gifts of every size matter.</p>')
    expect(out).toContain('href="/support#levels"')
  })
  it('drops a link with an unsafe address but keeps the answer', () => {
    const out = html({ items: [{ question: 'Q', answer: 'A', linkLabel: 'Go', linkHref: 'javascript:x' }] })
    expect(out).toContain('<p>A</p>')
    expect(out).not.toContain('href=')
  })
})
