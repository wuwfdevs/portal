"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireActiveProfile } from "@/lib/auth/authz";
import { failIfError } from "@/lib/editorial/action-result";
import { field } from "@/lib/form-fields";
import { safeLocalPath } from "@/lib/safe-path";
import { NOTIFICATION_TYPES } from "@/lib/notifications/catalog";
import { diffPreferences, readPreferenceForm } from "@/lib/notifications/preferences";

const CENTER_PATH = "/notifications";
const PREFERENCES_PATH = "/notifications/preferences";

/**
 * Marks one notification read and goes to what it is about. RLS lets a person update only their own rows, and a column grant lets them
 * update only `read_at`; a row that is not theirs (or is gone) simply matches nothing and they land back on the Center.
 */
export async function openNotification(formData: FormData): Promise<void> {
  const profile = await requireActiveProfile();
  const id = field(formData, "id");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notification_inbox")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("recipient_id", profile.id)
    .is("read_at", null)
    .select("href");
  failIfError(error, CENTER_PATH, "Could not mark the notification read");

  // An already-read row matches nothing above, so the link is read separately.
  let href = data?.[0]?.href ?? null;
  if (!href) {
    const { data: row, error: readError } = await supabase
      .from("notification_inbox")
      .select("href")
      .eq("id", id)
      .eq("recipient_id", profile.id)
      .maybeSingle();
    failIfError(readError, CENTER_PATH, "Could not open the notification");
    href = row?.href ?? null;
  }

  revalidatePath(CENTER_PATH);
  redirect(safeLocalPath(href, CENTER_PATH));
}

export async function markAllNotificationsRead(): Promise<void> {
  const profile = await requireActiveProfile();
  const supabase = await createClient();
  const { error } = await supabase
    .from("notification_inbox")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", profile.id)
    .eq("in_app", true)
    .is("read_at", null);
  failIfError(error, CENTER_PATH, "Could not mark your notifications read");

  revalidatePath(CENTER_PATH);
  redirect(CENTER_PATH);
}

/** Saves the preferences screen: only choices that differ from a default are stored (`diffPreferences`). */
export async function savePreferences(formData: FormData): Promise<void> {
  const profile = await requireActiveProfile();
  const submitted = readPreferenceForm(NOTIFICATION_TYPES, (name) => formData.get(name) !== null);
  const { upserts, deletes } = diffPreferences(NOTIFICATION_TYPES, submitted);

  const supabase = await createClient();
  if (upserts.length > 0) {
    const { error } = await supabase.from("notification_preferences").upsert(
      upserts.map((row) => ({ ...row, user_id: profile.id })),
      { onConflict: "user_id,type" },
    );
    failIfError(error, PREFERENCES_PATH, "Could not save your preferences");
  }
  if (deletes.length > 0) {
    const { error } = await supabase
      .from("notification_preferences")
      .delete()
      .eq("user_id", profile.id)
      .in("type", deletes);
    failIfError(error, PREFERENCES_PATH, "Could not save your preferences");
  }

  revalidatePath(PREFERENCES_PATH);
  redirect(`${PREFERENCES_PATH}?saved=1`);
}
