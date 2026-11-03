import { describe, expect, it } from 'vitest'

import { STAGING_PROJECT_REF, checkStagingDatabase } from './staging-guard'

const ok = (url: string | undefined, opts?: { allowLocal?: boolean }) => checkStagingDatabase(url, opts)

describe('checkStagingDatabase', () => {
  it('accepts the staging pooler login and the staging direct host', () => {
    expect(ok(`postgresql://payload_app.${STAGING_PROJECT_REF}:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres`)).toEqual({ ok: true, where: 'staging' })
    expect(ok(`postgresql://importer_staging.${STAGING_PROJECT_REF}:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres`)).toEqual({ ok: true, where: 'staging' })
    expect(ok(`postgresql://postgres:pw@db.${STAGING_PROJECT_REF}.supabase.co:5432/postgres`)).toEqual({ ok: true, where: 'staging' })
  })

  it('refuses any other project, however it is written', () => {
    for (const url of [
      'postgresql://payload_app.someotherprojectref:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres',
      'postgresql://postgres:pw@db.someotherprojectref.supabase.co:5432/postgres',
      'postgresql://u:pw@example.com:5432/db',
      // the staging ref only in the password or the database name must not count
      `postgresql://payload_app.other:${STAGING_PROJECT_REF}@aws-0-us-east-1.pooler.supabase.com:5432/${STAGING_PROJECT_REF}`,
      // a look-alike host
      `postgresql://u:pw@${STAGING_PROJECT_REF}.evil.example:5432/db`,
    ]) {
      expect(ok(url).ok, url).toBe(false)
    }
  })

  it('refuses a missing or broken address, and a local database unless asked', () => {
    expect(ok(undefined).ok).toBe(false)
    expect(ok('not a url').ok).toBe(false)
    expect(ok('postgresql://wuwf@127.0.0.1:5432/x').ok).toBe(false)
    expect(ok('postgresql://wuwf@127.0.0.1:5432/x', { allowLocal: true })).toEqual({ ok: true, where: 'this machine' })
  })

  it('never puts the password in what it says', () => {
    const r = ok('postgresql://u:hunter2secret@example.com:5432/db')
    expect(JSON.stringify(r)).not.toContain('hunter2secret')
  })
})
