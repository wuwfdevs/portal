import { describe, expect, it } from 'vitest'

import { isOpenToEveryone, membersAudioProblem, privateFileHeaders, readableUnlessMembersOnly } from './access'

const req = (roles: string[] | null) => ({ req: { user: roles ? { roles } : null } }) as never

describe('members-only rules', () => {
  it('opens a body only for a document known not to be members-only (fail closed)', () => {
    expect(isOpenToEveryone({ membersOnly: false })).toBe(true)
    expect(isOpenToEveryone({ membersOnly: true })).toBe(false)
    expect(isOpenToEveryone({})).toBe(false)
    expect(isOpenToEveryone({ membersOnly: null })).toBe(false)
    expect(isOpenToEveryone(null)).toBe(false)
  })

  it('lets the public read free work, and staff who write content read everything', () => {
    const read = (roles: string[] | null, doc: unknown) => readableUnlessMembersOnly({ ...(req(roles) as object), doc } as never)
    expect(read(null, { membersOnly: false })).toBe(true)
    expect(read(null, { membersOnly: true })).toBe(false)
    expect(read(null, {})).toBe(false)
    expect(read(['editor'], { membersOnly: true })).toBe(true)
  })

  it("refuses a members-only story whose audio is a public file, and nothing else", () => {
    expect(membersAudioProblem({ membersOnly: true }, { membersOnly: false })).toMatch(/public file/)
    expect(membersAudioProblem({ membersOnly: true }, { membersOnly: null })).toMatch(/public file/)
    expect(membersAudioProblem({ membersOnly: true }, { membersOnly: true })).toBeNull()
    expect(membersAudioProblem({ membersOnly: false }, { membersOnly: false })).toBeNull()
    expect(membersAudioProblem({ membersOnly: true }, null)).toBeNull()
  })

  it('marks every file response private so no shared cache keeps one', () => {
    expect(privateFileHeaders({ headers: new Headers() }).get('Cache-Control')).toBe('private')
  })
})
