import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { Users } from '@/collections/Users'

import { PortalLinkCell } from './index'

const cell = (cellData: unknown) => renderToStaticMarkup(createElement(PortalLinkCell as never, { cellData }))

describe('the staff list\'s Portal profile column', () => {
  it('says Linked for an account made from a Portal profile, not the profile\'s id', () => {
    const out = cell('0b0d2f5e-1111-4222-8333-444455556666')
    expect(out).toContain('Linked')
    expect(out).not.toContain('0b0d2f5e')
  })
  it('says None (local password) for the break-glass administrator and any account made by hand', () => {
    for (const empty of [null, undefined, '']) expect(cell(empty), String(empty)).toContain('None (local password)')
  })
  it('is wired as a default column of the staff list, with the cell, so it is seen without opening an account', () => {
    expect(Users.admin?.defaultColumns).toContain('portalUserId')
    const field = Users.fields.find((f) => 'name' in f && f.name === 'portalUserId') as { label?: string; admin?: { components?: { Cell?: string } } }
    expect(field.label).toBe('Portal profile')
    expect(field.admin?.components?.Cell).toBe('@/components/admin/PortalLinkCell#PortalLinkCell')
  })
})
