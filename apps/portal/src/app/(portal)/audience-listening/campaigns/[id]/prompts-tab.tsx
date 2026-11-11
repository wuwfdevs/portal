import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmSubmit } from "@/components/ui/confirm-action";
import { FormActions } from "@/components/ui/form-actions";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { SectionHeading } from "@/components/ui/section-heading";
import { ReorderButtons } from "@/components/editorial/reorder-buttons";
import {
  MAX_HINT_LENGTH,
  MAX_PROMPT_LENGTH,
  MAX_PROMPT_SECONDS,
  MAX_TAGS,
  MAX_TAG_LENGTH,
  MIN_PROMPT_SECONDS,
  PROMPT_KINDS,
  PROMPT_KIND_LABEL,
} from "@/lib/audience-listening/campaigns";
import type { AlCampaign, AlCampaignPrompt, AlCampaignTag } from "@/lib/audience-listening/campaign-queries";
import { addPrompt, deletePrompt, movePrompt, saveTags, updatePrompt } from "../../campaign-actions";

function PromptFields({ prompt, idPrefix }: { prompt?: AlCampaignPrompt; idPrefix: string }) {
  return (
    <>
      <Field label="Kind" htmlFor={`${idPrefix}-kind`}>
        <Select id={`${idPrefix}-kind`} name="kind" defaultValue={prompt?.kind ?? "prompt"}>
          {PROMPT_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {PROMPT_KIND_LABEL[kind]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Words" htmlFor={`${idPrefix}-text`} hint="What the table reads or hears.">
        <Textarea id={`${idPrefix}-text`} name="text" rows={2} required maxLength={MAX_PROMPT_LENGTH} defaultValue={prompt?.text ?? ""} />
      </Field>
      <Field label="Hint for the facilitator" htmlFor={`${idPrefix}-hint`} hint="Optional. Shown to the facilitator only.">
        <Input id={`${idPrefix}-hint`} name="hint" maxLength={MAX_HINT_LENGTH} defaultValue={prompt?.hint ?? ""} />
      </Field>
      <Field
        label="Suggested seconds"
        htmlFor={`${idPrefix}-seconds`}
        hint={`Optional. Between ${MIN_PROMPT_SECONDS} and ${MAX_PROMPT_SECONDS}. The console uses it to suggest when to move on.`}
      >
        <Input
          id={`${idPrefix}-seconds`}
          name="suggested_seconds"
          type="number"
          inputMode="numeric"
          min={MIN_PROMPT_SECONDS}
          max={MAX_PROMPT_SECONDS}
          defaultValue={prompt?.suggested_seconds ?? ""}
        />
      </Field>
    </>
  );
}

/** The prompts a table is walked through, in order, and the tag vocabulary a facilitator picks from. */
export function PromptsTab({ campaign, prompts, tags }: { campaign: AlCampaign; prompts: AlCampaignPrompt[]; tags: AlCampaignTag[] }) {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {prompts.map((prompt, index) => (
        <Card key={prompt.id} className="p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <SectionHeading>Prompt {prompt.position}</SectionHeading>
              <Badge variant={prompt.kind === "question" ? "accent" : "muted"}>{PROMPT_KIND_LABEL[prompt.kind]}</Badge>
            </div>
            <ReorderButtons
              action={movePrompt.bind(null, campaign.id)}
              idName="prompt_id"
              id={prompt.id}
              label={`prompt ${prompt.position}`}
              isFirst={index === 0}
              isLast={index === prompts.length - 1}
            />
          </div>
          <form action={updatePrompt} className="flex flex-col gap-3">
            <input type="hidden" name="campaign_id" value={campaign.id} />
            <input type="hidden" name="prompt_id" value={prompt.id} />
            <PromptFields prompt={prompt} idPrefix={`p-${prompt.id}`} />
            <FormActions>
              <Button type="submit">Save</Button>
            </FormActions>
          </form>
          <form action={deletePrompt} className="mt-3 border-t border-line pt-3">
            <input type="hidden" name="campaign_id" value={campaign.id} />
            <input type="hidden" name="prompt_id" value={prompt.id} />
            <ConfirmSubmit label="Remove" confirmLabel="Yes, remove it" message="This removes the prompt from the campaign. Tables already in the room are not affected." />
          </form>
        </Card>
      ))}

      <Card className="p-5">
        <SectionHeading className="mb-4">{prompts.length === 0 ? "Add the first prompt" : "Add a prompt"}</SectionHeading>
        <form action={addPrompt} className="flex flex-col gap-3">
          <input type="hidden" name="campaign_id" value={campaign.id} />
          <PromptFields idPrefix="new" />
          <FormActions>
            <Button type="submit">Add prompt</Button>
          </FormActions>
        </form>
      </Card>

      <Card className="p-5">
        <SectionHeading className="mb-1">Tags</SectionHeading>
        <p className="mb-4 text-sm text-ink-500">
          The words a facilitator picks from when they mark a line &ldquo;what mattered&rdquo;. One per line or separated by commas, up to{" "}
          {MAX_TAGS}, each up to {MAX_TAG_LENGTH} characters. Saving replaces the list with what is here.
        </p>
        <form action={saveTags} className="flex flex-col gap-3">
          <input type="hidden" name="campaign_id" value={campaign.id} />
          <Field label="Tags" htmlFor="tags">
            <Textarea id="tags" name="tags" rows={5} defaultValue={tags.map((t) => t.label).join("\n")} />
          </Field>
          <FormActions>
            <Button type="submit">Save tags</Button>
          </FormActions>
        </form>
      </Card>
    </div>
  );
}
