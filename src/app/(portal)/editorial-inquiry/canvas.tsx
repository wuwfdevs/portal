"use client";

import { useMemo, useRef, useState } from "react";
import {
  ancestryPath,
  type LaidOutEdge,
  type LaidOutQuestion,
  type TreeLayout,
} from "@/lib/editorial-inquiry/tree";
import { QuestionNode } from "./question-node";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.8;
const ZOOM_STEP = 0.15;
const MINIMAP_WIDTH = 168;
const MINIMAP_HEIGHT = 92;

interface DragState {
  id: string;
  startX: number;
  startY: number;
  moved: boolean;
}

interface PanState {
  startX: number;
  startY: number;
  baseX: number;
  baseY: number;
}

export interface CanvasProps {
  layout: TreeLayout;
  selectedId: string | null;
  contextCounts: Map<string, number>;
  pendingByQuestion: Map<string, "drilldown" | "evaluate">;
  onSelect: (id: string | null) => void;
  onDrillDown: (id: string) => void;
  onReject: (id: string) => void;
  onMove: (id: string, manualDx: number, manualDy: number) => void;
  canDrillDownFor: (node: LaidOutQuestion) => boolean;
  canRejectFor: (node: LaidOutQuestion) => boolean;
}

export function Canvas({
  layout,
  selectedId,
  contextCounts,
  pendingByQuestion,
  onSelect,
  onDrillDown,
  onReject,
  onMove,
  canDrillDownFor,
  canRejectFor,
}: CanvasProps) {
  const [view, setView] = useState({ x: 40, y: 40, zoom: 1 });
  const [liveDelta, setLiveDelta] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const panRef = useRef<PanState | null>(null);
  const justDraggedRef = useRef(false);

  const ancestryIds = useMemo(
    () => new Set(selectedId ? ancestryPath(layout.nodes, selectedId) : []),
    [layout.nodes, selectedId],
  );

  const nodesById = useMemo(() => new Map(layout.nodes.map((n) => [n.id, n])), [layout.nodes]);

  // The right-edge fork only shows on a LEAF (Whimsical's pattern): once a
  // node has children, another child is grown as a sibling from one of them
  // (the bottom fork), keeping each affordance spatially unambiguous. An
  // internal node can still be drilled from the inspector panel.
  const parentIds = useMemo(
    () => new Set(layout.nodes.map((n) => n.parentId).filter(Boolean)),
    [layout.nodes],
  );

  function handleNodeDragStart(node: LaidOutQuestion, event: React.MouseEvent) {
    event.stopPropagation();
    dragRef.current = { id: node.id, startX: event.clientX, startY: event.clientY, moved: false };
  }

  function handleCanvasMouseDown(event: React.MouseEvent) {
    panRef.current = { startX: event.clientX, startY: event.clientY, baseX: view.x, baseY: view.y };
  }

  function handleMouseMove(event: React.MouseEvent) {
    const drag = dragRef.current;
    if (drag) {
      const dx = (event.clientX - drag.startX) / view.zoom;
      const dy = (event.clientY - drag.startY) / view.zoom;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) drag.moved = true;
      setLiveDelta({ id: drag.id, dx, dy });
      return;
    }
    const pan = panRef.current;
    if (pan) {
      setView((v) => ({
        ...v,
        x: pan.baseX + (event.clientX - pan.startX),
        y: pan.baseY + (event.clientY - pan.startY),
      }));
    }
  }

  function endInteraction() {
    const drag = dragRef.current;
    if (drag) {
      if (drag.moved) {
        justDraggedRef.current = true;
        const node = nodesById.get(drag.id);
        const delta = liveDelta && liveDelta.id === drag.id ? liveDelta : { dx: 0, dy: 0 };
        onMove(drag.id, (node?.manualDx ?? 0) + delta.dx, (node?.manualDy ?? 0) + delta.dy);
      }
      dragRef.current = null;
      setLiveDelta(null);
    }
    panRef.current = null;
  }

  function handleSelect(id: string) {
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
      return;
    }
    onSelect(id);
  }

  function zoomBy(delta: number) {
    setView((v) => ({
      ...v,
      zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(v.zoom + delta).toFixed(2))),
    }));
  }

  function centerOn(node: LaidOutQuestion) {
    setView((v) => ({
      x: -(node.x * v.zoom) + 420,
      y: -(node.y * v.zoom) + 300,
      zoom: v.zoom,
    }));
    onSelect(node.id);
  }

  return (
    <div
      className="relative h-full flex-1 cursor-grab overflow-hidden bg-panel-50 active:cursor-grabbing"
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={endInteraction}
      onMouseLeave={endInteraction}
      onClick={() => onSelect(null)}
    >
      <div
        className="absolute top-0 left-0"
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
          transformOrigin: "0 0",
        }}
      >
        <svg
          className="pointer-events-none absolute top-0 left-0 overflow-visible"
          width={layout.width}
          height={layout.height}
        >
          {layout.edges.map((edge: LaidOutEdge) => {
            const onPath = ancestryIds.size > 0 && ancestryIds.has(edge.childId);
            return (
              <path
                key={edge.id}
                d={edge.d}
                fill="none"
                stroke={onPath ? "#3090D0" : "#8A9099"}
                strokeWidth={onPath ? 2.5 : 1.5}
              />
            );
          })}
        </svg>

        {layout.nodes.map((node) => {
          const delta = liveDelta && liveDelta.id === node.id ? liveDelta : null;
          const displayNode = delta
            ? { ...node, x: node.x + delta.dx, y: node.y + delta.dy }
            : node;
          const parent = node.parentId ? nodesById.get(node.parentId) : undefined;
          return (
            <QuestionNode
              key={node.id}
              node={displayNode}
              selected={node.id === selectedId}
              contextCount={contextCounts.get(node.id) ?? 0}
              pending={pendingByQuestion.get(node.id) ?? null}
              onSelect={() => handleSelect(node.id)}
              onDragStart={(e) => handleNodeDragStart(node, e)}
              onDrillDown={() => onDrillDown(node.id)}
              onAddSibling={() => node.parentId && onDrillDown(node.parentId)}
              onReject={() => onReject(node.id)}
              canDrillDown={canDrillDownFor(node) && !parentIds.has(node.id)}
              canAddSibling={parent ? canDrillDownFor(parent) : false}
              canReject={canRejectFor(node)}
            />
          );
        })}
      </div>

      <div className="absolute top-4 right-4 z-10 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            zoomBy(ZOOM_STEP);
          }}
          className="flex h-8 w-8 items-center justify-center rounded border border-line bg-white text-base text-ink-700 shadow-sm"
        >
          +
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            zoomBy(-ZOOM_STEP);
          }}
          className="flex h-8 w-8 items-center justify-center rounded border border-line bg-white text-base text-ink-700 shadow-sm"
        >
          −
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setView({ x: 40, y: 40, zoom: 1 });
          }}
          className="flex h-8 w-8 items-center justify-center rounded border border-line bg-white text-[10px] font-bold text-ink-700 shadow-sm"
        >
          RST
        </button>
      </div>

      <div
        className="absolute right-4 bottom-4 z-10 w-[180px] rounded border border-line bg-white p-1.5 shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 text-[9px] font-semibold tracking-wider text-ink-400 uppercase">
          Map — click to center
        </div>
        <div className="relative h-[92px] w-full">
          {layout.nodes.map((node) => (
            <button
              key={node.id}
              type="button"
              title={node.text}
              onClick={() => centerOn(node)}
              className="absolute h-[7px] w-[7px] rounded-full"
              style={{
                left: (node.x / layout.width) * MINIMAP_WIDTH,
                top: (node.y / layout.height) * MINIMAP_HEIGHT,
                background: node.status === "promoted" ? "#A8C830" : "#3090D0",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
