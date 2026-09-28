import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Input, Label, Select } from "@/components/ui/input";
import type { RcAudience } from "@/lib/database.types";
import { PROCEDURE_AREAS } from "@/lib/resources/articles";
import {
  AUDIENCES,
  SLUG_MAX,
  SUMMARY_MAX,
  TITLE_MAX,
  VERSION_NOTE_MAX,
} from "@/lib/resources/article-form";
import { screensForTool } from "@/lib/resources/screens";
import type { ToolRef } from "@/lib/resources/queries";
import { ArticleBodyField } from "./article-body-field";
import { createArticle, updateArticle } from "./actions";

const AUDIENCE_LABELS: Record<RcAudience, string> = {
  staff: "Staff",
  students: "Students",
  partners: "Partners",
};

/** Fields that show their own error; any other error renders at the top of the form. */
const FIELDS_WITH_OWN_ERROR = new Set([
  "title",
  "slug",
  "summary",
  "area",
  "owner_role",
  "screen_keys",
  "sort_order",
  "audience",
  "version_note",
]);

export interface ArticleFormDefaults {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  body: unknown;
  audience: RcAudience[];
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
  error,
  field,
  cancelHref,
}: {
  kind: "procedure" | "guide";
  tool?: ToolRef;
  defaults?: ArticleFormDefaults;
  previewUrls?: Record<string, string>;
  error?: string;
  field?: string;
  cancelHref: string;
}) {
  const editing = defaults !== undefined;
  const audience = defaults?.audience ?? (kind === "guide" ? AUDIENCES : ["staff"]);
  const screens = tool ? screensForTool(tool.key) : [];
  const fieldError = (name: string) => (error && field === name ? error : null);
  const hint = (name: string, text: React.ReactNode) => {
    const message = fieldError(name);
    return message ? <FieldError>{message}</FieldError> : <FieldHint>{text}</FieldHint>;
  };

  return (
    <form
      action={editing ? updateArticle : createArticle}
      className="flex w-full max-w-3xl flex-col gap-5"
    >
      {error && !(field && FIELDS_WITH_OWN_ERROR.has(field)) && <Alert>{error}</Alert>}
      <input type="hidden" name="kind" value={kind} />
      {defaults && <input type="hidden" name="id" value={defaults.id} />}
      {tool && <input type="hidden" name="tool_key" value={tool.key} />}

      <div>
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          name="title"
          required
          maxLength={TITLE_MAX}
          defaultValue={defaults?.title ?? ""}
          autoFocus
        />
        {fieldError("title") && <FieldError>{fieldError("title")}</FieldError>}
      </div>

      <div>
        <Label htmlFor="slug">Address</Label>
        {editing ? (
          <>
            <Input id="slug" value={defaults.slug} readOnly disabled />
            <FieldHint>
              Fixed once the page exists, so links to it keep working
              {kind === "guide" ? " and release updates can find it" : ""}.
            </FieldHint>
          </>
        ) : (
          <>
            <Input id="slug" name="slug" maxLength={SLUG_MAX} placeholder="Made from the title" />
            {hint(
              "slug",
              "Lowercase words joined by hyphens. Leave blank to make it from the title.",
            )}
          </>
        )}
      </div>

      <div>
        <Label htmlFor="summary">Summary</Label>
        <Input
          id="summary"
          name="summary"
          maxLength={SUMMARY_MAX}
          defaultValue={defaults?.summary ?? ""}
        />
        {hint("summary", "One line, shown in lists.")}
      </div>

      {kind === "procedure" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="area">Area</Label>
            <Select id="area" name="area" required defaultValue={defaults?.area ?? ""}>
              <option value="" disabled>
                Choose an area
              </option>
              {PROCEDURE_AREAS.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </Select>
            {fieldError("area") && <FieldError>{fieldError("area")}</FieldError>}
          </div>
          <div>
            <Label htmlFor="owner_role">Owner</Label>
            <Input
              id="owner_role"
              name="owner_role"
              maxLength={80}
              placeholder="Operations"
              defaultValue={defaults?.owner_role ?? ""}
            />
            {hint("owner_role", "A role, not a person.")}
          </div>
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
                  <label key={screen.key} className="flex items-center gap-2 text-sm text-ink-700">
                    <input
                      type="checkbox"
                      name="screen_keys"
                      value={screen.key}
                      defaultChecked={defaults?.screen_keys.includes(screen.key)}
                      className="h-4 w-4"
                    />
                    {screen.name}
                  </label>
                ))}
              </div>
            )}
            {hint("screen_keys", "The screens this guide explains. The Help panel will use them.")}
          </fieldset>
          <div>
            <Label htmlFor="sort_order">Order</Label>
            <Input
              id="sort_order"
              name="sort_order"
              type="number"
              min={0}
              max={10000}
              step={1}
              defaultValue={defaults?.sort_order ?? 100}
            />
            {hint("sort_order", "Lower comes first.")}
          </div>
        </div>
      )}

      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold text-ink-700">Visible to</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {AUDIENCES.map((value) => (
            <label key={value} className="flex items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                name="audience"
                value={value}
                defaultChecked={audience.includes(value)}
                className="h-4 w-4"
              />
              {AUDIENCE_LABELS[value]}
            </label>
          ))}
        </div>
        {hint(
          "audience",
          kind === "guide"
            ? `Only people who can open ${tool?.name ?? "the tool"} see a guide, whatever is checked here.`
            : "Who can read this procedure.",
        )}
      </fieldset>

      <div>
        <p className="mb-1.5 text-sm font-semibold text-ink-700">Text</p>
        <ArticleBodyField
          defaultValue={defaults?.body}
          articleId={defaults?.id}
          previewUrls={previewUrls}
        />
        {!editing && <FieldHint>Screenshots can be added once the page is saved.</FieldHint>}
      </div>

      <div>
        <Label htmlFor="version_note">{editing ? "What changed" : "Note"}</Label>
        <Input
          id="version_note"
          name="version_note"
          maxLength={VERSION_NOTE_MAX}
          placeholder={editing ? "Updated the overnight contact list" : "Created"}
        />
        {hint("version_note", "Shown in the page's history.")}
      </div>

      <div className="flex items-center justify-end gap-3">
        <Link href={cancelHref} className="text-xs font-semibold text-ink-500 hover:underline">
          Cancel
        </Link>
        <Button type="submit">{editing ? "Save changes" : `Create ${kind}`}</Button>
      </div>
    </form>
  );
}
