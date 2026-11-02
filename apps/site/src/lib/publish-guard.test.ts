import { describe, expect, it } from 'vitest'

import { resultsInPublished } from './publish-guard'

describe('resultsInPublished', () => {
  it('is true when the write publishes', () => {
    expect(resultsInPublished({ operation: 'create', data: { _status: 'published' }, originalDoc: undefined })).toBe(true)
    expect(resultsInPublished({ operation: 'update', data: { _status: 'published' }, originalDoc: { _status: 'draft' } })).toBe(true)
  })
  it('is false for a draft save, even of a live document (a draft is a version, not the live copy)', () => {
    expect(resultsInPublished({ operation: 'create', data: { _status: 'draft' }, originalDoc: undefined })).toBe(false)
    expect(resultsInPublished({ operation: 'update', data: { _status: 'draft' }, originalDoc: { _status: 'published' } })).toBe(false)
  })
  it('is true for an edit that says nothing about status when the document is already live', () => {
    expect(resultsInPublished({ operation: 'update', data: {}, originalDoc: { _status: 'published' } })).toBe(true)
  })
  it('is false for an edit of a draft, and for a create with no status', () => {
    expect(resultsInPublished({ operation: 'update', data: {}, originalDoc: { _status: 'draft' } })).toBe(false)
    expect(resultsInPublished({ operation: 'create', data: {}, originalDoc: undefined })).toBe(false)
  })
})
