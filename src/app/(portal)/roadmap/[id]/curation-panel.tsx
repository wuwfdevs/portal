import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea, FieldHint } from "@/components/ui/input";
import { availableStatusActions, POST_KIND_LABEL, STATUS_ACTION_LABEL } from "@/lib/roadmap/posts";
import type { PostDetail, PostTarget } from "@/lib/roadmap/queries";
import type { RdPostKind } from "@/lib/database.types";
import { promoteToProposedTool, setPostStatus, setPostTool } from "../actions";

const KINDS: RdPostKind[] = ["improvement", "feature", "bug", "new_tool"];

function suggestedKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Everything only a curator sees. The controls are hidden from everyone else as
 * a courtesy; assertRoadmapCurator() and the rd_posts guard trigger are what
 * actually stop the write.
 */
export function CurationPanel({
  post,
  tools,
  isAdministrator,
}: {
  post: PostDetail;
  tools: PostTarget[];
  isAdministrator: boolean;
}) {
  const transitions = availableStatusActions(post.status);
  const canPromote = isAdministrator && !post.tool_id && !!post.proposedToolName;

  return (
    <div className="flex flex-col gap-4 rounded border border-brand-primary/40 bg-brand-surface/20 p-4">
      <p className="text-[11px] font-bold uppercase tracking-wide text-brand-link">Curation</p>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-ink-700">Move this request</span>
        <div className="flex flex-wrap gap-2">
          {transitions
            .filter((next) => next !== "declined")
            .map((next) => (
              <form key={next} action={setPostStatus}>
                <input type="hidden" name="post_id" value={post.id} />
                <input type="hidden" name="status" value={next} />
                <Button type="submit" variant="secondary">
                  {STATUS_ACTION_LABEL[next]}
                </Button>
              </form>
            ))}
        </div>
      </div>

      {transitions.includes("declined") && (
        <form action={setPostStatus} className="flex flex-col gap-2 border-t border-line pt-3">
          <input type="hidden" name="post_id" value={post.id} />
          <input type="hidden" name="status" value="declined" />
          <Label htmlFor="status_note">Decline, with a reason</Label>
          <Textarea
            id="status_note"
            name="status_note"
            rows={2}
            required
            placeholder="Why not — and what to do instead, if there is something."
          />
          <FieldHint>
            The reason is shown on the request. A decision with no reason is why people stop filing
            them.
          </FieldHint>
          <div>
            <Button type="submit" variant="secondary" className="text-danger">
              Decline
            </Button>
          </div>
        </form>
      )}

      <form action={setPostTool} className="flex flex-col gap-2 border-t border-line pt-3">
        <input type="hidden" name="post_id" value={post.id} />
        <Label htmlFor="curate_tool">What it is about</Label>
        <Select id="curate_tool" name="tool_id" defaultValue={post.tool_id ?? ""}>
          <option value="">Nothing in particular / the portal itself</option>
          {tools.map((tool) => (
            <option key={tool.id} value={tool.id}>
              {tool.name}
              {tool.proposed ? " (proposed)" : ""}
            </option>
          ))}
        </Select>
        <Label htmlFor="curate_kind">Kind</Label>
        <Select id="curate_kind" name="kind" defaultValue={post.kind}>
          {KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {POST_KIND_LABEL[kind]}
            </option>
          ))}
        </Select>
        <div>
          <Button type="submit" variant="secondary">
            Save classification
          </Button>
        </div>
      </form>

      {canPromote && (
        <form
          action={promoteToProposedTool}
          className="flex flex-col gap-2 border-t border-line pt-3"
        >
          <input type="hidden" name="post_id" value={post.id} />
          <Label htmlFor="promote_name">
            Turn &ldquo;{post.proposedToolName}&rdquo; into a proposal
          </Label>
          <FieldHint>
            Creates a registry row with status <em>proposed</em>, so other requests can gather under
            it. It stays off the dashboard and cannot be granted to anyone.
          </FieldHint>
          <Input
            id="promote_name"
            name="name"
            defaultValue={post.proposedToolName ?? ""}
            required
          />
          <Input
            id="promote_key"
            name="key"
            defaultValue={suggestedKey(post.proposedToolName ?? "")}
            pattern="[a-z0-9][a-z0-9\-]*"
            required
          />
          <Input
            id="promote_description"
            name="description"
            placeholder="What it would do, in a sentence."
            required
          />
          <div>
            <Button type="submit" variant="secondary">
              Create proposal
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
