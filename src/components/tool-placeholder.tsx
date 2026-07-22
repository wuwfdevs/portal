import Link from "next/link";
import { ToolIcon } from "@/components/tool-icon";
import type { Tool } from "@/lib/tools";

export function ToolPlaceholder({ tool }: { tool: Tool }) {
  const statusCopy = tool.status === "planned" ? "planned" : "in development";

  return (
    <div className="flex min-h-[340px] items-center justify-center px-6 py-16">
      <div className="max-w-[420px] text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded bg-panel-100 text-ink-400">
          <ToolIcon toolKey={tool.key} />
        </div>
        <h1 className="mb-2 font-serif text-[22px] font-bold text-ink-900">
          {tool.name} is {statusCopy}
        </h1>
        <p className="mb-5 text-sm leading-relaxed text-ink-500">{tool.description} It isn&apos;t
          available yet — check back, or contact an administrator with questions.</p>
        <Link href="/dashboard" className="text-sm font-semibold text-brand-link">
          ← Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
