import 'server-only'

import { getCachedGlobal } from '@/utilities/getGlobals'

import { readStaffActionsConfig, type StaffActionsConfig } from './config'

/** The staff actions configuration for this request: the Portal address from Site settings (then `PORTAL_ORIGIN`), plus the staff actions secret. */
export async function getStaffActionsConfig(): Promise<StaffActionsConfig | null> {
  let setting: string | null = null
  try {
    setting = (await getCachedGlobal('site-settings', 0)()).portalOrigin ?? null
  } catch (error) {
    console.error('Could not read the Portal address from Site settings:', error instanceof Error ? error.name : 'unknown error')
  }
  return readStaffActionsConfig(process.env, setting)
}
