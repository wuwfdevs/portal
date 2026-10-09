// Validation for the procedure and guide forms. Pure — no FormData, no
// Supabase — so the rules are tested directly; actions.ts reads the form and
// hands the fields here. Colocated test.

import { slugify as slugifyText } from "@/lib/text";
import { SCREENS } from "./screens";

export const TITLE_MAX = 160;
export const SUMMARY_MAX = 240;
export const SLUG_MAX = 80;
export const VERSION_NOTE_MAX = 200;
export const AREA_MAX = 60;

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** A title as a slug: lowercase words joined by hyphens, ASCII only. */
export function slugify(title: string): string {
  return slugifyText(title, { max: SLUG_MAX });
}

export interface ArticleFormInput {
  kind: "procedure" | "guide";
  title: string;
  /** Empty means "derive it from the title". Ignored on edit. */
  slug: string;
  summary: string;
  versionNote: string;
  // procedure
  area: string;
  ownerRole: string;
  // guide
  toolKey: string;
  screenKeys: string[];
  sortOrder: string;
}

export interface ArticleFields {
  title: string;
  slug: string;
  summary: string | null;
  versionNote: string | null;
  area: string | null;
  ownerRole: string | null;
  toolKey: string | null;
  screenKeys: string[];
  sortOrder: number;
}

export type ArticleFormResult =
  { ok: true; fields: ArticleFields } | { ok: false; field: string | null; message: string };

function fail(field: string | null, message: string): ArticleFormResult {
  return { ok: false, field, message };
}

/**
 * Checks what the form sent. `knownToolKeys` is the set of tools a guide may
 * be written for (read by the caller); a guide's screens must belong to its
 * tool, so a checkbox left over from switching tools can't slip through.
 */
export function validateArticleForm(
  input: ArticleFormInput,
  knownToolKeys: ReadonlySet<string>,
): ArticleFormResult {
  const title = input.title.trim();
  if (title === "") return fail("title", "Give it a title.");
  if (title.length > TITLE_MAX)
    return fail("title", `Keep the title under ${TITLE_MAX} characters.`);

  const slug = (input.slug.trim() || slugify(title)).toLowerCase();
  if (slug === "")
    return fail("slug", "The title needs at least one letter or number for its address.");
  if (slug.length > SLUG_MAX || !SLUG_PATTERN.test(slug)) {
    return fail("slug", "Use lowercase letters, numbers, and single hyphens in the address.");
  }

  const summary = input.summary.trim();
  if (summary.length > SUMMARY_MAX) {
    return fail("summary", `Keep the summary under ${SUMMARY_MAX} characters.`);
  }

  const versionNote = input.versionNote.trim();
  if (versionNote.length > VERSION_NOTE_MAX) {
    return fail("version_note", `Keep the note under ${VERSION_NOTE_MAX} characters.`);
  }

  const base = {
    title,
    slug,
    summary: summary || null,
    versionNote: versionNote || null,
  };

  if (input.kind === "procedure") {
    const area = input.area.trim();
    if (area === "") return fail("area", "Give it an area.");
    if (area.length > AREA_MAX) return fail("area", `Keep the area under ${AREA_MAX} characters.`);
    const ownerRole = input.ownerRole.trim();
    if (ownerRole.length > 80) return fail("owner_role", "Keep the owner under 80 characters.");
    return {
      ok: true,
      fields: {
        ...base,
        area,
        ownerRole: ownerRole || null,
        toolKey: null,
        screenKeys: [],
        sortOrder: 0,
      },
    };
  }

  const toolKey = input.toolKey.trim();
  if (!knownToolKeys.has(toolKey)) return fail("tool_key", "Choose the tool this guide is for.");
  const screenKeys = [...new Set(input.screenKeys.map((key) => key.trim()).filter(Boolean))];
  const foreign = screenKeys.find(
    (key) => !SCREENS.some((screen) => screen.key === key && screen.toolKey === toolKey),
  );
  if (foreign) return fail("screen_keys", "Choose only screens that belong to this tool.");
  const sortOrder = input.sortOrder.trim() === "" ? 0 : Number(input.sortOrder);
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10_000) {
    return fail("sort_order", "Use a whole number from 0 to 10000.");
  }
  return {
    ok: true,
    fields: { ...base, area: null, ownerRole: null, toolKey, screenKeys, sortOrder },
  };
}
