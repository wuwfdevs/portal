"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select, Textarea } from "@/components/ui/input";
import type { EpCriterionType } from "@/lib/database.types";
import type { RubricProfileRow } from "@/lib/editorial/data";
import { createCriterion } from "../actions";

/**
 * Client component purely so the weight input can be hidden for a modifier
 * (its weight column is unused by the aggregation math — see design §4A).
 */
export function CriterionForm({
  profiles,
  error,
}: {
  profiles: RubricProfileRow[];
  error?: string;
}) {
  const [criterionType, setCriterionType] = useState<EpCriterionType>("core");

  return (
    <div className="rounded border border-line">
      <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
        Add a criterion
      </div>
      <form action={createCriterion} className="flex flex-col gap-4 p-5">
        {error && <Alert>{error}</Alert>}

        <div>
          <Label htmlFor="profile_id">Rubric profile</Label>
          <Select id="profile_id" name="profile_id" required defaultValue={profiles[0]?.id ?? ""}>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="criterion_type">Type</Label>
          <Select
            id="criterion_type"
            name="criterion_type"
            value={criterionType}
            onChange={(event) => setCriterionType(event.target.value as EpCriterionType)}
          >
            <option value="core">Core — part of the editorial-merit average</option>
            <option value="modifier">
              Modifier — scored separately (e.g. institutional alignment)
            </option>
          </Select>
          <FieldHint>
            Core criteria measure independent public-service and journalistic merit. Reserve
            modifier for something like institutional alignment that must stay visibly outside the
            core score.
          </FieldHint>
        </div>

        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required maxLength={80} placeholder="e.g. Public impact" />
        </div>
        <div>
          <Label htmlFor="description">Description</Label>
          <Input
            id="description"
            name="description"
            required
            maxLength={240}
            placeholder="What question does this score answer?"
          />
        </div>
        <div>
          <Label htmlFor="guidance">Guidance for reviewers</Label>
          <Textarea id="guidance" name="guidance" rows={3} />
          <FieldHint>Shown inline while scoring.</FieldHint>
        </div>

        {criterionType === "core" && (
          <div>
            <Label htmlFor="weight">Weight</Label>
            <Input
              id="weight"
              name="weight"
              type="number"
              step="0.1"
              min="0.1"
              max="100"
              defaultValue="10"
              className="w-24"
            />
            <FieldHint>Active core weights within a profile should sum to 100.</FieldHint>
          </div>
        )}

        <div className="flex gap-3">
          <div>
            <Label htmlFor="scale_min">Scale override — low</Label>
            <Input id="scale_min" name="scale_min" type="number" className="w-24" />
          </div>
          <div>
            <Label htmlFor="scale_max">Scale override — high</Label>
            <Input id="scale_max" name="scale_max" type="number" className="w-24" />
          </div>
        </div>
        <FieldHint>
          Leave both blank to use the tool-wide scale. The seeded modifier uses 0–5 since it
          isn&apos;t part of the core scale.
        </FieldHint>

        <div>
          <Label htmlFor="anchors">Anchored scale descriptions</Label>
          <Textarea
            id="anchors"
            name="anchors"
            rows={5}
            placeholder={"0: No discernible effect.\n1: Minor effect.\n2: Moderate effect.\n…"}
          />
          <FieldHint>
            One per line, formatted as &quot;score: description&quot;. Optional.
          </FieldHint>
        </div>

        <div className="flex justify-end border-t border-line pt-4">
          <Button type="submit">Add criterion</Button>
        </div>
      </form>
    </div>
  );
}
