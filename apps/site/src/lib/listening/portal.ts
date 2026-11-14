import 'server-only'

import type { ListeningPath } from '@wuwf/portal-contracts'

import { getListeningConfig } from './config-server'
import { callListeningWith, type PortalCall } from './portal-call'

export type { PortalCall } from './portal-call'

/** A signed call to the Portal's listening API: the address from Site settings (or the environment), the secret from the environment. See `portal-call.ts`. */
export async function callListening<T extends object>(path: ListeningPath, body: Record<string, unknown>): Promise<PortalCall<T>> {
  return callListeningWith<T>(await getListeningConfig(), fetch, path, body)
}
