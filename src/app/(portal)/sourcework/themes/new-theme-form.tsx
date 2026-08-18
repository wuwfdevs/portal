"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, FieldError } from "@/components/ui/input";
import { createTheme } from "./actions";

/** Route-owned (not components/transcription/, which stays presentational — see ThemeLibrary's header comment). */
export function NewThemeForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    const result = await createTheme(title);
    setIsSaving(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    router.push(`/sourcework/themes/${result.id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 flex items-start gap-2">
      <div>
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="New theme title…"
          className="max-w-xs"
        />
        {error && <FieldError>{error}</FieldError>}
      </div>
      <Button type="submit" variant="secondary" disabled={isSaving} className="shrink-0">
        {isSaving ? "Adding…" : "+ New theme"}
      </Button>
    </form>
  );
}
