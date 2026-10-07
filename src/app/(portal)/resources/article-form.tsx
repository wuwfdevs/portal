import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CheckboxField, Field, FieldError, FieldHint, Input } from "@/components/ui/input";
import { SecondaryLink } from "@/components/ui/primary-link";
import {
  AREA_MAX,
  SLUG_MAX,
  SUMMARY_MAX,
  TITLE_MAX,
  VERSION_NOTE_MAX,
} from "@/lib/resources/article-form";
import { screensForTool } from "@/lib/resources/screens";
import type { ToolRef } from "@/lib/resources/queries";
import { ArticleBodyField } from "./article-body-field";
import { createArticle, updateArticle } from "./actions";

/** Fields that show their own error; any other error renders at the top of the form. */
const FIELDS_WITH_OWN_ERROR = new Set([
  "title",
  "slug",
  "summary",
  "area",
  "owner_role",
  "screen_keys",
  "sort_order",
  "version_note",
]);

export interface ArticleFormDefaults {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  body: unknown;
  area: string | null;
  owner_role: string | null;
  screen_keys: string[];
  sort_order: number;
}

/**
 * The one form for procedures and guides, create and edit alike
 * (docs/ui-patterns.md rule 3). A server component: `defaults` present means
 * edit. A guide's tool is chosen before this form (its screens depend on
 * it), so it arrives fixed. `error`/`field` come from the action's bounce
 * back: a message for one field replaces that field's hint; anything else
 * renders at the top.
 */
export function ArticleForm({
  kind,
  tool,
  defaults,
  previewUrls,
  existingAreas = [],
  error,
  field,
  cancelHref,
}: {
  kind: "procedure" | "guide";
  tool?: ToolRef;
  defaults?: ArticleFormDefaults;
  previewUrls?: Record<string, string>;
  /** Areas already in use on other procedures — offered as datalist suggestions, not a fixed list. */
  existingAreas?: string[];
  error?: string;
  field?: string;
  cancelHref: string;
}) {
  const editing = defaults !== undefined;
  const screens = tool ? screensForTool(tool.key) : [];
  const fieldError = (name: string) => (error && field === name ? error : null);
  // A message for one field replaces that field's hint.
  const hint = (name: string, text: React.ReactNode) => (fieldError(name) ? undefined : text);

  return (
    <form
      action={editing ? updateArticle : createArticle}
      className="flex w-full max-w-3xl flex-col gap-5"
    >
      {error && !(field && FIELDS_WITH_OWN_ERROR.has(field)) && <Alert>{error}</Alert>}
      <input type="hidden" name="kind" value={kind} />
      {defaults && <input type="hidden" name="id" value={defaults.id} />}
      {tool && <input type="hidden" name="tool_key" value={tool.key} />}

      <Field label="Title" htmlFor="title" error={fieldError("title")}>
        <Input
          id="title"
          name="title"
          required
          maxLength={TITLE_MAX}
          defaultValue={defaults?.title ?? ""}
          autoFocus
        />
      </Field>

      {editing ? (
        <Field
          label="Address"
          htmlFor="slug"
          hint={`Fixed once the page exists, so links to it keep working${
            kind === "guide" ? " and release updates can find it" : ""
          }.`}
        >
          <Input id="slug" value={defaults.slug} readOnly disabled />
        </Field>
      ) : (
        <Field
          label="Address"
          htmlFor="slug"
          error={fieldError("slug")}
          hint={hint(
            "slug",
            "Lowercase words joined by hyphens. Leave blank to make it from the title.",
          )}
        >
          <Input id="slug" name="slug" maxLength={SLUG_MAX} placeholder="Made from the title" />
        </Field>
      )}

      <Field
        label="Summary"
        htmlFor="summary"
        error={fieldError("summary")}
        hint={hint("summary", "One line, shown in lists.")}
      >
        <Input
          id="summary"
          name="summary"
          maxLength={SUMMARY_MAX}
          defaultValue={defaults?.summary ?? ""}
        />
      </Field>

      {kind === "procedure" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Area"
            htmlFor="area"
            error={fieldError("area")}
            hint={hint("area", "A department or category. Reuse one already in use where it fits.")}
          >
            <Input
              id="area"
              name="area"
              required
              list="area-options"
              maxLength={AREA_MAX}
              placeholder="Engineering & Broadcast"
              defaultValue={defaults?.area ?? ""}
            />
            <datalist id="area-options">
              {existingAreas.map((area) => (
                <option key={area} value={area} />
              ))}
            </datalist>
          </Field>
          <Field
            label="Owner"
            htmlFor="owner_role"
            error={fieldError("owner_role")}
            hint={hint("owner_role", "A role, not a person.")}
          >
            <Input
              id="owner_role"
              name="owner_role"
              maxLength={80}
              placeholder="Operations"
              defaultValue={defaults?.owner_role ?? ""}
            />
          </Field>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold text-ink-700">
              Screens in {tool?.name}
            </legend>
            {screens.length === 0 ? (
              <p className="text-xs text-ink-400">No screens are listed for this tool yet.</p>
            ) : (
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {screens.map((screen) => (
                  <CheckboxField
                    key={screen.key}
                    name="screen_keys"
                    value={screen.key}
                    defaultChecked={defaults?.screen_keys.includes(screen.key)}
                    className="items-center"
                    label={screen.name}
                  />
                ))}
              </div>
            )}
            {fieldError("screen_keys") ? (
              <FieldError>{fieldError("screen_keys")}</FieldError>
            ) : (
              <FieldHint>The screens this guide explains. The Help panel will use them.</FieldHint>
            )}
          </fieldset>
          <Field
            label="Order"
            htmlFor="sort_order"
            error={fieldError("sort_order")}
            hint={hint("sort_order", "Lower comes first.")}
          >
            <Input
              id="sort_order"
              name="sort_order"
              type="number"
              min={0}
              max={10000}
              step={1}
              defaultValue={defaults?.sort_order ?? 100}
            />
          </Field>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-sm font-semibold text-ink-700">Text</p>
        <ArticleBodyField
          defaultValue={defaults?.body}
          articleId={defaults?.id}
          previewUrls={previewUrls}
        />
        {!editing && <FieldHint>Screenshots can be added once the page is saved.</FieldHint>}
      </div>

      <Field
        label={editing ? "What changed" : "Note"}
        htmlFor="version_note"
        error={fieldError("version_note")}
        hint={hint("version_note", "Shown in the page's history.")}
      >
        <Input
          id="version_note"
          name="version_note"
          maxLength={VERSION_NOTE_MAX}
          placeholder={editing ? "Updated the overnight contact list" : "Created"}
        />
      </Field>

      <div className="flex items-center justify-end gap-3">
        <SecondaryLink href={cancelHref}>Cancel</SecondaryLink>
        <Button type="submit">{editing ? "Save changes" : `Create ${kind}`}</Button>
      </div>
    </form>
  );
}
