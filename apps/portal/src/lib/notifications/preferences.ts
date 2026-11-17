// Resolving and saving a person's notification choices (docs/notifications-design.md §3). Pure. Only a choice that differs from the
// catalog's default is stored, so "reset to defaults" is the same operation as saving the defaults.

import type { NotificationTypeDef } from "./catalog";

export interface Channels {
  inApp: boolean;
  email: boolean;
}

/** A `notification_preferences` row as the database stores it. */
export interface StoredPreference {
  type: string;
  in_app: boolean;
  email: boolean;
}

/** What a person gets for one type: their stored choice, or the catalog's default. */
export function resolveChannels(
  def: NotificationTypeDef,
  stored: StoredPreference | undefined,
): Channels {
  if (!stored) return { ...def.defaults };
  return { inApp: stored.in_app, email: stored.email };
}

export function sameChannels(a: Channels, b: Channels): boolean {
  return a.inApp === b.inApp && a.email === b.email;
}

export interface PreferenceChanges {
  /** Rows to write: choices that differ from the default. */
  upserts: StoredPreference[];
  /** Types whose stored row should go, because the choice now matches the default. */
  deletes: string[];
}

/**
 * What saving the preferences screen does. `submitted` is every catalog type with the choice the form carried (an unticked box is
 * false). A choice equal to the default is not stored and removes any row; a type the form did not carry is left alone.
 */
export function diffPreferences(
  types: readonly NotificationTypeDef[],
  submitted: ReadonlyMap<string, Channels>,
): PreferenceChanges {
  const upserts: StoredPreference[] = [];
  const deletes: string[] = [];
  for (const def of types) {
    const choice = submitted.get(def.key);
    if (!choice) continue;
    if (sameChannels(choice, def.defaults)) deletes.push(def.key);
    else upserts.push({ type: def.key, in_app: choice.inApp, email: choice.email });
  }
  return { upserts, deletes };
}

export const inAppFieldName = (key: string) => `inapp:${key}`;
export const emailFieldName = (key: string) => `email:${key}`;

/** Reads the preferences form: each type has two checkboxes, present in the post only when ticked. */
export function readPreferenceForm(
  types: readonly NotificationTypeDef[],
  isTicked: (name: string) => boolean,
): Map<string, Channels> {
  return new Map(
    types.map((def) => [
      def.key,
      { inApp: isTicked(inAppFieldName(def.key)), email: isTicked(emailFieldName(def.key)) },
    ]),
  );
}
