import 'server-only'

import { getCachedGlobal } from '@/utilities/getGlobals'

import { readAuthoringConfig, type AuthoringConfig } from './authoring-config'

/** The authoring configuration for this request: the Portal address from Site settings (then `PORTAL_ORIGIN`), plus this channel's secret. */
export async function getAuthoringConfig(): Promise<AuthoringConfig | null> {
  let setting: string | null = null
  try {
    setting = (await getCachedGlobal('site-settings', 0)()).portalOrigin ?? null
  } catch (error) {
    console.error('Could not read the Portal address from Site settings:', error instanceof Error ? error.name : 'unknown error')
  }
  return readAuthoringConfig(process.env, setting)
}
