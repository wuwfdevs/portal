"use client";

import { useState, type ReactNode } from "react";
import { PaneTabs, type PaneTab } from "../../[id]/pane-tabs";

type Pane = "document" | "projects";

/**
 * A PDF source's tab row — the document, and (on the standalone view) the
 * projects using it. Both panes stay mounted so the viewer keeps its page and
 * zoom while the other tab is open.
 */
export function DocumentTabs({
  projectCount,
  projectsPane,
  children,
}: {
  projectCount: number;
  projectsPane: ReactNode;
  children: ReactNode;
}) {
  const [pane, setPane] = useState<Pane>("document");
  const tabs: PaneTab<Pane>[] = [
    { id: "document", label: "Document" },
    { id: "projects", label: "Projects", count: projectCount },
  ];
  return (
    <>
      <PaneTabs label="Source" tabs={tabs} pane={pane} onChange={setPane} showOnDesktop />
      <div className="pt-4" hidden={pane !== "document"}>
        {children}
      </div>
      <div hidden={pane !== "projects"}>{projectsPane}</div>
    </>
  );
}
