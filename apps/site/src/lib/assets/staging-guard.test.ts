import { describe, expect, it } from 'vitest'

import { STAGING_PROJECT_REF, checkSiteDatabase, checkStagingDatabase } from './staging-guard'

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

describe('checkSiteDatabase', () => {
  const STAGING = 'postgresql://payload_app.avgeycgvaufwdfzdsogi:secret-pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres'
  const PRODUCTION = 'postgresql://payload_app.gyidqxhkkhajfazbcrug:secret-pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres'
  it('accepts staging as the staging guard does', () => {
    expect(checkSiteDatabase(STAGING)).toEqual({ ok: true, where: 'staging' })
  })
  it('accepts production only when asked, by its pooler login or its own host', () => {
    expect(checkSiteDatabase(PRODUCTION).ok).toBe(false)
    expect(checkSiteDatabase(PRODUCTION, { allowProduction: true })).toEqual({ ok: true, where: 'production' })
    expect(checkSiteDatabase('postgresql://postgres:pw@db.gyidqxhkkhajfazbcrug.supabase.co:5432/postgres', { allowProduction: true })).toEqual({ ok: true, where: 'production' })
  })
  it("refuses another project, even with the production ref in a non-Supabase host's login", () => {
    expect(checkSiteDatabase('postgresql://payload_app.other:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres', { allowProduction: true }).ok).toBe(false)
    expect(checkSiteDatabase('postgresql://payload_app.gyidqxhkkhajfazbcrug:pw@evil.example.com:5432/postgres', { allowProduction: true }).ok).toBe(false)
  })
  it('accepts this machine only when asked, and never prints the password', () => {
    expect(checkSiteDatabase('postgresql://wuwf@127.0.0.1:5433/x').ok).toBe(false)
    expect(checkSiteDatabase('postgresql://wuwf@127.0.0.1:5433/x', { allowLocal: true })).toEqual({ ok: true, where: 'this machine' })
    const refused = checkSiteDatabase(PRODUCTION)
    expect(refused.ok === false && refused.reason).not.toContain('secret-pw')
  })
})
