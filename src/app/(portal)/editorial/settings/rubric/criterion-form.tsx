"use client";

import { useState } from "react";
import { FieldHint, Input, Label, Select, Textarea } from "@/components/ui/input";
import type { EpCriterionType } from "@/lib/database.types";
import type { RubricProfileRow } from "@/lib/editorial/data";

/**
 * The fields of the "Add a criterion" inline card. A client component purely
 * so the weight input can be hidden for a modifier (its weight column is
 * unused by the aggregation math — see design §4A); the surrounding
 * <form action={createCriterion}> is the server-rendered InlineCreateCard.
 */
export function CriterionFields({ profiles }: { profiles: RubricProfileRow[] }) {
  const [criterionType, setCriterionType] = useState<EpCriterionType>("core");

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="profile_id">Rubric profile</Label>
          <Select
            id="profile_id"
            name="profile_id"
            required
            defaultValue={profiles[0]?.id ?? ""}
            autoFocus
          >
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
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
      </div>
      <div>
        <Label htmlFor="guidance">Guidance for reviewers</Label>
        <Textarea id="guidance" name="guidance" rows={3} />
        <FieldHint>Shown inline while scoring.</FieldHint>
      </div>

      <div className="flex flex-wrap items-end gap-3">
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
          </div>
        )}
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
        {criterionType === "core" && "Active core weights within a profile should sum to 100. "}
        Leave the scale override blank to use the tool-wide scale. The seeded modifier uses 0–5
        since it isn&apos;t part of the core scale.
      </FieldHint>

      <div>
        <Label htmlFor="anchors">Anchored scale descriptions</Label>
        <Textarea
          id="anchors"
          name="anchors"
          rows={4}
          placeholder={"0: No discernible effect.\n1: Minor effect.\n2: Moderate effect.\n…"}
        />
        <FieldHint>One per line, formatted as &quot;score: description&quot;. Optional.</FieldHint>
      </div>
    </div>
  );
}
