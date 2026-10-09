/**
 * The result shape for a Server Action that is called directly from client
 * code and so cannot redirect (a canvas, a picker, a board): either
 * `{ ok: true, ...data }` or `{ ok: false, error }`. Actions that redirect use
 * `failWith` / `failIfError` (editorial/action-result.ts) instead.
 */
export type ActionResult<T extends object = Record<never, never>> =
  ({ ok: true } & T) | { ok: false; error: string };

export function actionOk(): { ok: true };
export function actionOk<T extends object>(data: T): { ok: true } & T;
export function actionOk(data?: object) {
  return { ok: true as const, ...(data ?? {}) };
}

export function actionError(error: string): { ok: false; error: string } {
  return { ok: false, error };
}
