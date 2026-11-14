import 'server-only'

import { getCachedGlobal } from '@/utilities/getGlobals'

import { readListeningConfig, type ListeningConfig } from './config'

/**
 * The listening configuration for this request: the Portal address from Site settings (cached, and refreshed the moment an
 * editor saves it), then the environment's `PORTAL_ORIGIN`, plus the secret from the environment. Settings that cannot be read
 * (the database is down) fall back to the environment rather than turning listening off for a reason the reader cannot fix.
 */
export async function getListeningConfig(): Promise<ListeningConfig | null> {
  let setting: string | null = null
  try {
    setting = (await getCachedGlobal('site-settings', 0)()).portalOrigin ?? null
  } catch (error) {
    console.error('Could not read the Portal address from Site settings:', error instanceof Error ? error.name : 'unknown error')
  }
  return readListeningConfig(process.env, setting)
}
