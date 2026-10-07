"use client";

// The clock page's diagram: one hour of a clock version as a Timeline or a
// Ring, with the same hover / select behaviour in both — hover or focus a slot
// to read it (labels are not printed on the shapes), click to select it and
// see it in the side panel — plus an hour-of-the-shift stepper, floating-break
// windows, and a slot list. Selection, hour and view live in state and are
// mirrored into the URL (`?view=&hour=&slot=`) with history.replaceState, so
// a reload or a shared link keeps them without a navigation per hover.
//
// Server-rendered pieces come in as props: the form for "Edit eligibility",
// "Pin content" or "Mark eligible" (only the slot named in the URL has one),
// and the two remove actions (server actions passed down as props).

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PrimaryLink, SecondaryLink, TextLink } from "@/components/ui/primary-link";
import { Cell, HeaderRow, Row, Table, Th } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { describeRingSegment, pointOnCircle } from "@/lib/log/clock-face";
import {
  HOUR_SECONDS,
  SLOT_VISUAL_COLORS,
  buildClockViewSlots,
  clampHour,
  defaultSelectedSlotId,
  describeFloatLength,
  describeFloatNote,
  describeFloatWhen,
  describePinScope,
  describeShiftHour,
  formatOffsetSeconds,
  shiftTimeOfDay,
  type ClockOpportunityInput,
  type ClockPinInput,
  type ClockSlotInput,
  type ClockViewSlot,
  type ShiftInfo,
} from "@/lib/log/clock-view";

export type ClockViewMode = "timeline" | "ring";

export interface ClockViewerOpportunity extends ClockOpportunityInput {
  permittedTypeLabels: string[];
  notes: string | null;
}

export interface ClockViewerForm {
  slotId: string;
  title: string;
  node: ReactNode;
  cancelHref: string;
}

export interface ClockViewerProps {
  templateId: string;
  slots: ClockSlotInput[];
  opportunities: ClockViewerOpportunity[];
  pins: ClockPinInput[];
  shift: ShiftInfo;
  /** Marking slots eligible and editing eligibility: the program director. */
  canEdit: boolean;
  /** Pinning and removing pinned content: the program director or traffic. */
  canPin: boolean;
  initial: { view: ClockViewMode; hour: number; slotId: string | null };
  form: ClockViewerForm | null;
  /** Query params to keep on every link and form return (version, from). */
  keepParams: Record<string, string>;
  removeOpportunityAction: (formData: FormData) => Promise<void>;
  removePinAction: (formData: FormData) => Promise<void>;
}

// The one accent: everything WUWF-local is this blue, everything the network
// publishes is a neutral (see SLOT_VISUAL_COLORS).
const LOCAL = "#185F95";
const LOCAL_TINT = "rgba(24, 95, 149, 0.07)";
const LOCAL_CORE = "rgba(24, 95, 149, 0.16)";

const RING_CENTER = 31;
const RING_NETWORK_OUTER = 23;
const RING_NETWORK_INNER = 15;
const RING_LOCAL_INNER = 24.2;
const RING_FLOAT_OUTER = 28.8;
const RING_FLOAT_INNER = 13.6;

/** SVG shapes aren't buttons: give the focusable ones Enter / Space to select, as a real button has. */
function selectOnKey(select: () => void) {
  return (event: KeyboardEvent<SVGPathElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select();
    }
  };
}

function pct(seconds: number): string {
  return `${(seconds / HOUR_SECONDS) * 100}%`;
}

function requirementLabel(requirement: "optional" | "required"): string {
  return requirement === "required" ? "Required" : "Optional";
}

/** Minutes 0..3600 as a ring angle, shaved a little each side so neighbours have a hairline gap. */
function ringPath(outer: number, inner: number, startSeconds: number, endSeconds: number): string {
  const start = (startSeconds / HOUR_SECONDS) * 360 + 0.35;
  const sweep = ((endSeconds - startSeconds) / HOUR_SECONDS) * 360 - 0.7;
  return (
    describeRingSegment(RING_CENTER, RING_CENTER, outer, inner, start, Math.max(sweep, 0.2)) ?? ""
  );
}

function ringEdge(seconds: number): string {
  const angle = (seconds / HOUR_SECONDS) * 360;
  const from = pointOnCircle(RING_CENTER, RING_CENTER, RING_FLOAT_INNER, angle);
  const to = pointOnCircle(RING_CENTER, RING_CENTER, RING_FLOAT_OUTER, angle);
  return `M ${from.x.toFixed(3)} ${from.y.toFixed(3)} L ${to.x.toFixed(3)} ${to.y.toFixed(3)}`;
}

export function ClockViewer(props: ClockViewerProps) {
  const {
    templateId,
    slots,
    opportunities,
    pins,
    shift,
    canEdit,
    canPin,
    initial,
    form,
    keepParams,
    removeOpportunityAction,
    removePinAction,
  } = props;

  const [view, setView] = useState<ClockViewMode>(initial.view);
  const [hour, setHour] = useState<number>(clampHour(initial.hour, shift.hours));
  const [hoverId, setHoverId] = useState<string | null>(null);
  // Hovering a row in the slot list highlights that slot but never swaps the
  // panel: in the Ring view the panel sits above the list, so a panel that
  // changed height on hover moved the list under the cursor, which hovered a
  // different row, and the two fed each other in a loop.
  const [listHoverId, setListHoverId] = useState<string | null>(null);

  const viewSlots = useMemo(
    () => buildClockViewSlots({ slots, opportunities, pins, hourIndex: hour }),
    [slots, opportunities, pins, hour],
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    initial.slotId && viewSlots.some((slot) => slot.id === initial.slotId)
      ? initial.slotId
      : defaultSelectedSlotId(viewSlots),
  );

  const activeId = hoverId ?? selectedId;
  const active = viewSlots.find((slot) => slot.id === activeId) ?? null;
  const highlightId = hoverId ?? listHoverId ?? selectedId;
  const highlighted = viewSlots.find((slot) => slot.id === highlightId) ?? null;
  const selected = viewSlots.find((slot) => slot.id === selectedId) ?? null;
  const previewing = hoverId !== null && hoverId !== selectedId;

  // Mirror view / hour / slot into the URL. A form's `mode` belongs to the slot
  // it was opened for, so moving to another slot drops it.
  const formSlotId = form?.slotId ?? null;
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("view", view);
    url.searchParams.set("hour", String(hour));
    if (selectedId) url.searchParams.set("slot", selectedId);
    if (selectedId !== formSlotId) url.searchParams.delete("mode");
    window.history.replaceState(null, "", url);
  }, [view, hour, selectedId, formSlotId]);

  const returnQuery = new URLSearchParams({
    ...keepParams,
    view,
    hour: String(hour),
    ...(selectedId ? { slot: selectedId } : {}),
  }).toString();

  const basePath = `/log/clocks/${templateId}`;
  const actionHref = (mode: "edit" | "pin" | "mark") =>
    `${basePath}?${new URLSearchParams({
      ...keepParams,
      view,
      hour: String(hour),
      ...(selectedId ? { slot: selectedId } : {}),
      mode,
    }).toString()}`;

  const hasFloat = viewSlots.some((slot) => slot.float);
  const hasPins = viewSlots.some((slot) => slot.pinsThisHour.length > 0);
  const hover = {
    onEnter: (id: string) => () => setHoverId(id),
    onLeave: () => setHoverId(null),
    onSelect: (id: string) => () => setSelectedId(id),
  };
  const listHover = {
    onEnter: (id: string) => () => setListHoverId(id),
    onLeave: () => setListHoverId(null),
    onSelect: (id: string) => () => {
      setListHoverId(null);
      setSelectedId(id);
    },
  };

  if (viewSlots.length === 0) {
    return <EmptyState>No slots yet.</EmptyState>;
  }

  const panel = (
    <SlotPanel
      slot={active}
      selected={selected}
      previewing={previewing}
      opportunity={
        active?.local
          ? (opportunities.find((o) => o.id === active.local?.opportunityId) ?? null)
          : null
      }
      shift={shift}
      hour={hour}
      canEdit={canEdit}
      canPin={canPin}
      templateId={templateId}
      returnQuery={returnQuery}
      actionHref={actionHref}
      form={form && form.slotId === selectedId && !previewing ? form : null}
      removeOpportunityAction={removeOpportunityAction}
      removePinAction={removePinAction}
    />
  );
  const list = (
    <SlotList
      slots={viewSlots}
      activeId={highlightId}
      onEnter={listHover.onEnter}
      onLeave={listHover.onLeave}
      onSelect={listHover.onSelect}
    />
  );
  const legend = <Legend hasFloat={hasFloat} hasPins={hasPins} />;

  return (
    <>
      <section
        aria-labelledby="clock-hour-heading"
        className="rounded border border-line px-6 pb-5 pt-4"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 id="clock-hour-heading" className="text-base font-bold text-ink-900">
            One hour of the clock
          </h2>
          {shift.hours > 1 && <HourStepper shift={shift} hour={hour} onChange={setHour} />}
          <span className="flex-1" />
          <div
            role="group"
            aria-label="View"
            className="flex overflow-hidden rounded border border-line"
          >
            {(["timeline", "ring"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={view === mode}
                onClick={() => setView(mode)}
                className={cn(
                  "h-8 border-r border-line px-3.5 text-[13px] font-semibold last:border-r-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-link",
                  view === mode
                    ? "bg-[#0F2235] text-white"
                    : "bg-white text-ink-900 hover:bg-panel-50",
                )}
              >
                {mode === "timeline" ? "Timeline" : "Ring"}
              </button>
            ))}
          </div>
        </div>

        {view === "timeline" ? (
          <Timeline
            slots={viewSlots}
            activeId={highlightId}
            active={highlighted}
            previewing={highlightId !== selectedId}
            shift={shift}
            hour={hour}
            onEnter={hover.onEnter}
            onLeave={hover.onLeave}
            onSelect={hover.onSelect}
            legend={legend}
          />
        ) : (
          <div className="mt-2 flex flex-col gap-8 lg:flex-row lg:items-start">
            <div className="flex w-full max-w-[520px] flex-col items-center gap-3 lg:w-[520px] lg:shrink-0">
              <Ring
                slots={viewSlots}
                activeId={highlightId}
                active={highlighted}
                onEnter={hover.onEnter}
                onLeave={hover.onLeave}
                onSelect={hover.onSelect}
              />
              {legend}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              {panel}
              {list}
            </div>
          </div>
        )}
      </section>

      {view === "timeline" && (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">{list}</div>
          <div className="w-full shrink-0 lg:w-[360px]">{panel}</div>
        </div>
      )}
    </>
  );
}

function HourStepper({
  shift,
  hour,
  onChange,
}: {
  shift: ShiftInfo;
  hour: number;
  onChange: (hour: number) => void;
}) {
  const button =
    "flex h-7 w-7 items-center justify-center rounded text-xl font-bold leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-link";
  return (
    <div
      role="group"
      aria-label="Hour of the shift"
      title="The network structure repeats every hour of the shift. Pinned content can differ by hour."
      className="ml-2 flex items-center gap-1"
    >
      <button
        type="button"
        aria-label="Previous hour"
        disabled={hour === 0}
        onClick={() => onChange(hour - 1)}
        className={cn(button, hour === 0 ? "text-[#B5BCC4]" : "text-brand-link hover:bg-panel-50")}
      >
        ‹
      </button>
      <span
        aria-live="polite"
        className="min-w-[13.5rem] text-center text-sm font-semibold tabular-nums text-ink-900"
      >
        {describeShiftHour(shift, hour)}
      </span>
      <button
        type="button"
        aria-label="Next hour"
        disabled={hour >= shift.hours - 1}
        onClick={() => onChange(hour + 1)}
        className={cn(
          button,
          hour >= shift.hours - 1 ? "text-[#B5BCC4]" : "text-brand-link hover:bg-panel-50",
        )}
      >
        ›
      </button>
    </div>
  );
}

function slotWhenText(slot: ClockViewSlot, shift: ShiftInfo, hour: number): string {
  if (slot.float) {
    return `${describeFloatWhen(slot.float)} · ${describeFloatLength(slot.float)} long`;
  }
  const end = slot.startSeconds + slot.durationSeconds;
  const base = `${formatOffsetSeconds(slot.startSeconds)} – ${formatOffsetSeconds(end)} · ${formatOffsetSeconds(slot.durationSeconds)}`;
  return shift.startTime
    ? `${base} · ${shiftTimeOfDay(shift.startTime, hour, slot.startSeconds)}`
    : base;
}

function localText(slot: ClockViewSlot): string {
  return slot.local ? `Local · ${slot.local.requirement}` : "Network only";
}

// ---------------------------------------------------------------- Timeline

interface ViewHandlers {
  onEnter: (id: string) => () => void;
  onLeave: () => void;
  onSelect: (id: string) => () => void;
}

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-link";

function Timeline({
  slots,
  activeId,
  active,
  previewing,
  shift,
  hour,
  onEnter,
  onLeave,
  onSelect,
  legend,
}: ViewHandlers & {
  slots: ClockViewSlot[];
  activeId: string | null;
  active: ClockViewSlot | null;
  previewing: boolean;
  shift: ShiftInfo;
  hour: number;
  legend: ReactNode;
}) {
  const fixed = slots.filter((slot) => !slot.float);
  const floats = slots.filter((slot) => slot.float);
  const locals = fixed.filter((slot) => slot.local);
  const ticks = [0, 10, 20, 30, 40, 50, 60];
  const state = (id: string) => (id === activeId ? "ring-2 ring-ink-900" : "");
  const dim = (id: string) => (id === activeId ? "opacity-100" : "opacity-50");

  return (
    <div className="mt-3">
      <div
        aria-live="polite"
        className="mb-2.5 ml-24 flex min-h-[34px] flex-wrap items-center gap-x-2.5 gap-y-1 rounded border border-line bg-panel-50 px-3 py-1 text-[15px]"
      >
        <span className="text-xs font-bold uppercase tracking-wide text-ink-500">
          {previewing ? "Previewing" : "Selected"}
        </span>
        <b>{active?.label}</b>
        {active && (
          <>
            <span className="tabular-nums text-ink-700">{slotWhenText(active, shift, hour)}</span>
            <span className={cn("font-bold", active.local ? "text-brand-link" : "text-ink-500")}>
              {localText(active)}
            </span>
          </>
        )}
      </div>

      <div className="relative ml-24 h-[22px]" aria-hidden>
        {ticks.map((minute) => (
          <span
            key={minute}
            className="absolute -translate-x-1/2 text-xs tabular-nums text-ink-500"
            style={{ left: pct(minute * 60) }}
          >
            {minute}:00
          </span>
        ))}
      </div>

      <div className="relative">
        <div className="flex items-center">
          <div className="w-24 shrink-0 text-[13px] font-bold text-ink-500">Network</div>
          <div className="relative h-11 flex-1 rounded-sm bg-panel-50">
            {fixed.map((slot) => {
              const color = SLOT_VISUAL_COLORS[slot.kind];
              return (
                <button
                  key={slot.id}
                  type="button"
                  aria-label={`${slot.label}, ${slotWhenText(slot, shift, hour)}`}
                  aria-pressed={slot.id === activeId}
                  onMouseEnter={onEnter(slot.id)}
                  onMouseLeave={onLeave}
                  onFocus={onEnter(slot.id)}
                  onBlur={onLeave}
                  onClick={onSelect(slot.id)}
                  className={cn(
                    "absolute inset-y-0 rounded-sm border",
                    focusRing,
                    state(slot.id),
                    dim(slot.id),
                  )}
                  style={{
                    left: pct(slot.startSeconds),
                    width: pct(slot.durationSeconds),
                    background: color.fill,
                    borderColor: color.border,
                  }}
                />
              );
            })}
          </div>
        </div>

        <div className="mt-2 flex items-center">
          <div className="w-24 shrink-0 text-[13px] font-bold text-brand-link">WUWF local</div>
          <div className="relative h-11 flex-1 rounded-sm bg-panel-50">
            {locals.map((slot) => {
              const required = slot.local?.requirement === "required";
              return (
                <button
                  key={slot.id}
                  type="button"
                  aria-label={`Local opportunity, ${slot.local?.requirement}: ${slot.label}${slot.pinsThisHour.length ? `, ${slot.pinsThisHour.length} pinned this hour` : ""}`}
                  aria-pressed={slot.id === activeId}
                  onMouseEnter={onEnter(slot.id)}
                  onMouseLeave={onLeave}
                  onFocus={onEnter(slot.id)}
                  onBlur={onLeave}
                  onClick={onSelect(slot.id)}
                  className={cn(
                    "absolute inset-y-0 rounded border-2",
                    required ? "border-solid bg-brand-link" : "border-dashed bg-white",
                    "border-brand-link",
                    focusRing,
                    state(slot.id),
                    dim(slot.id),
                  )}
                  style={{ left: pct(slot.startSeconds), width: pct(slot.durationSeconds) }}
                >
                  {slot.pinsThisHour.length > 0 && (
                    <span className="absolute -right-1.5 -top-2 h-[18px] min-w-[18px] rounded-full bg-ink-900 px-1 text-center text-[11px] font-bold leading-[18px] text-white">
                      {slot.pinsThisHour.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="pointer-events-none absolute inset-y-0 left-24 right-0">
          {floats.map((slot) => {
            const window = slot.float;
            if (!window) return null;
            const spansLocal = Boolean(slot.local);
            const coreWidth = Math.max(0, window.endEarliest - window.startLatest);
            return (
              <div key={slot.id} className={cn(dim(slot.id))}>
                <div
                  className="absolute -top-1"
                  style={{
                    left: pct(window.startEarliest),
                    width: pct(window.endLatest - window.startEarliest),
                    bottom: spansLocal ? "-4px" : "calc(3rem - 4px)",
                    background: LOCAL_TINT,
                    borderLeft: `1px ${window.startMoves ? "dashed" : "solid"} ${LOCAL}`,
                    borderRight: `1px ${window.endMoves ? "dashed" : "solid"} ${LOCAL}`,
                  }}
                >
                  <button
                    type="button"
                    aria-label={`${slot.label}, ${slotWhenText(slot, shift, hour)}`}
                    aria-pressed={slot.id === activeId}
                    onMouseEnter={onEnter(slot.id)}
                    onMouseLeave={onLeave}
                    onFocus={onEnter(slot.id)}
                    onBlur={onLeave}
                    onClick={onSelect(slot.id)}
                    className={cn(
                      "pointer-events-auto absolute -top-3 left-1/2 h-5 -translate-x-1/2 rounded-full border border-brand-link bg-white px-2 text-[11px] font-bold text-brand-link",
                      focusRing,
                      state(slot.id),
                    )}
                  >
                    Floating
                  </button>
                </div>
                {coreWidth > 0 && (
                  <div
                    className="absolute -top-1"
                    style={{
                      left: pct(window.startLatest),
                      width: pct(coreWidth),
                      bottom: spansLocal ? "-4px" : "calc(3rem - 4px)",
                      background: LOCAL_CORE,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="ml-24 mt-3.5">{legend}</div>
    </div>
  );
}

// -------------------------------------------------------------------- Ring

function Ring({
  slots,
  activeId,
  active,
  onEnter,
  onLeave,
  onSelect,
}: ViewHandlers & {
  slots: ClockViewSlot[];
  activeId: string | null;
  active: ClockViewSlot | null;
}) {
  const fixed = slots.filter((slot) => !slot.float);
  const floats = slots.filter((slot) => slot.float);
  const locals = fixed.filter((slot) => slot.local);
  const minutes = Array.from({ length: 12 }, (_, i) => i * 5);
  const dim = (id: string) => (id === activeId ? 1 : 0.5);
  const focus = { outline: "none", cursor: "pointer" } as const;

  return (
    <svg
      viewBox="0 0 62 62"
      className="h-auto w-full max-w-[520px]"
      role="group"
      aria-label="Clock ring for one hour. The inner ring is the network; the outer arcs are WUWF local opportunities."
    >
      <circle
        cx={RING_CENTER}
        cy={RING_CENTER}
        r={(RING_NETWORK_OUTER + RING_NETWORK_INNER) / 2}
        fill="none"
        stroke="#EEF0F3"
        strokeWidth={RING_NETWORK_OUTER - RING_NETWORK_INNER}
      />
      {minutes.map((minute) => {
        const point = pointOnCircle(RING_CENTER, RING_CENTER, 29.9, (minute / 60) * 360);
        return (
          <text
            key={minute}
            x={point.x}
            y={point.y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={1.5}
            fill="#5A6068"
          >
            {minute}
          </text>
        );
      })}
      {fixed.map((slot) => {
        const color = SLOT_VISUAL_COLORS[slot.kind];
        const isActive = slot.id === activeId;
        return (
          <path
            key={slot.id}
            d={ringPath(
              RING_NETWORK_OUTER,
              RING_NETWORK_INNER,
              slot.startSeconds,
              slot.startSeconds + slot.durationSeconds,
            )}
            fill={color.fill}
            stroke={isActive ? "#0F1419" : color.border}
            strokeWidth={isActive ? 0.4 : 0.15}
            opacity={dim(slot.id)}
            tabIndex={0}
            role="button"
            aria-label={`${slot.label}, ${formatOffsetSeconds(slot.startSeconds)} to ${formatOffsetSeconds(slot.startSeconds + slot.durationSeconds)}${slot.local ? `, local ${slot.local.requirement}` : ""}`}
            onMouseEnter={onEnter(slot.id)}
            onMouseLeave={onLeave}
            onFocus={onEnter(slot.id)}
            onBlur={onLeave}
            onClick={onSelect(slot.id)}
            onKeyDown={selectOnKey(onSelect(slot.id))}
            style={focus}
          />
        );
      })}
      {locals.map((slot) => {
        const required = slot.local?.requirement === "required";
        return (
          <path
            key={slot.id}
            d={ringPath(
              required ? 28 : 27,
              RING_LOCAL_INNER,
              slot.startSeconds,
              slot.startSeconds + slot.durationSeconds,
            )}
            fill={LOCAL}
            opacity={dim(slot.id)}
            tabIndex={0}
            role="button"
            aria-label={`Local opportunity, ${slot.local?.requirement}: ${slot.label} at ${formatOffsetSeconds(slot.startSeconds)}`}
            onMouseEnter={onEnter(slot.id)}
            onMouseLeave={onLeave}
            onFocus={onEnter(slot.id)}
            onBlur={onLeave}
            onClick={onSelect(slot.id)}
            onKeyDown={selectOnKey(onSelect(slot.id))}
            style={focus}
          />
        );
      })}
      {floats.map((slot) => {
        const window = slot.float;
        if (!window) return null;
        const opacity = slot.id === activeId ? 1 : 0.8;
        const coreEnd = window.endEarliest;
        return (
          <g key={slot.id}>
            <path
              d={ringPath(
                RING_FLOAT_OUTER,
                RING_FLOAT_INNER,
                window.startEarliest,
                window.endLatest,
              )}
              fill={LOCAL_TINT}
              opacity={opacity}
              style={{ pointerEvents: "none" }}
            />
            {coreEnd > window.startLatest && (
              <path
                d={ringPath(RING_FLOAT_OUTER, RING_FLOAT_INNER, window.startLatest, coreEnd)}
                fill={LOCAL_CORE}
                opacity={opacity}
                style={{ pointerEvents: "none" }}
              />
            )}
            <path
              d={ringEdge(window.startEarliest)}
              fill="none"
              stroke={LOCAL}
              strokeWidth={0.2}
              strokeDasharray={window.startMoves ? "0.6 0.4" : undefined}
              opacity={opacity}
              style={{ pointerEvents: "none" }}
            />
            <path
              d={ringEdge(window.endLatest)}
              fill="none"
              stroke={LOCAL}
              strokeWidth={0.2}
              strokeDasharray={window.endMoves ? "0.6 0.4" : undefined}
              opacity={opacity}
              style={{ pointerEvents: "none" }}
            />
            <path
              d={ringPath(RING_FLOAT_OUTER, 23.4, window.startEarliest, window.endLatest)}
              fill="rgba(255, 255, 255, 0.01)"
              tabIndex={0}
              role="button"
              aria-label={`${slot.label}, ${describeFloatWhen(window)}, lasts ${describeFloatLength(window)}`}
              onMouseEnter={onEnter(slot.id)}
              onMouseLeave={onLeave}
              onFocus={onEnter(slot.id)}
              onBlur={onLeave}
              onClick={onSelect(slot.id)}
              onKeyDown={selectOnKey(onSelect(slot.id))}
              style={focus}
            />
          </g>
        );
      })}
      {active && (
        <>
          <text x={31} y={28.6} textAnchor="middle" fontSize={2.5} fontWeight={700} fill="#0F1419">
            {active.label.length > 22 ? `${active.label.slice(0, 21)}…` : active.label}
          </text>
          <text x={31} y={31.8} textAnchor="middle" fontSize={1.7} fill="#2B2F36">
            {active.float
              ? `${formatOffsetSeconds(active.float.startEarliest)}${active.float.startMoves ? `–${formatOffsetSeconds(active.float.startLatest)}` : ""} → ${formatOffsetSeconds(active.float.endEarliest)}${active.float.endMoves ? `–${formatOffsetSeconds(active.float.endLatest)}` : ""}`
              : `${formatOffsetSeconds(active.startSeconds)} – ${formatOffsetSeconds(active.startSeconds + active.durationSeconds)} · ${formatOffsetSeconds(active.durationSeconds)}`}
          </text>
          <text
            x={31}
            y={34.4}
            textAnchor="middle"
            fontSize={1.7}
            fontWeight={700}
            fill={active.local ? LOCAL : "#5A6068"}
          >
            {localText(active)}
          </text>
        </>
      )}
    </svg>
  );
}

// ------------------------------------------------------------------ Legend

function Legend({ hasFloat, hasPins }: { hasFloat: boolean; hasPins: boolean }) {
  const item = "inline-flex items-center whitespace-nowrap";
  const swatch = "mr-1.5 inline-block h-3 shrink-0";
  return (
    <div className="flex w-full flex-wrap justify-center gap-x-5 gap-y-2 text-[13px] text-ink-700 lg:justify-start">
      <span className={item}>
        <span
          className={cn(swatch, "w-3 border")}
          style={{
            background: SLOT_VISUAL_COLORS.segment.fill,
            borderColor: SLOT_VISUAL_COLORS.segment.border,
          }}
        />
        Segment
      </span>
      <span className={item}>
        <span
          className={cn(swatch, "w-3")}
          style={{ background: SLOT_VISUAL_COLORS.newscast.fill }}
        />
        Newscast
      </span>
      <span className={item}>
        <span className={cn(swatch, "w-3")} style={{ background: SLOT_VISUAL_COLORS.promo.fill }} />
        Promo and credits
      </span>
      <span className={item}>
        <span className={cn(swatch, "w-3 border-2 border-dashed border-brand-link bg-white")} />
        Local, optional
      </span>
      <span className={item}>
        <span className={cn(swatch, "w-3 bg-brand-link")} />
        Local, required
      </span>
      {hasFloat && (
        <span className={item}>
          <span
            className={cn(swatch, "w-[22px]")}
            style={{
              background: `linear-gradient(${LOCAL_CORE}, ${LOCAL_CORE}) right / 12px 100% no-repeat, ${LOCAL_TINT}`,
              borderLeft: `1px dashed ${LOCAL}`,
              borderRight: `1px solid ${LOCAL}`,
            }}
          />
          Floating break
        </span>
      )}
      {hasPins && (
        <span className={item}>
          <span className="mr-1.5 inline-block h-4 min-w-4 shrink-0 rounded-full bg-ink-900 text-center text-[11px] font-bold leading-4 text-white">
            1
          </span>
          Pinned content this hour
        </span>
      )}
    </div>
  );
}

// -------------------------------------------------------------- Slot list

function SlotList({
  slots,
  activeId,
  onEnter,
  onLeave,
  onSelect,
}: ViewHandlers & { slots: ClockViewSlot[]; activeId: string | null }) {
  return (
    <section aria-labelledby="clock-slots-heading" className="rounded border border-line">
      <div className="flex items-center border-b border-line px-4 py-2.5">
        <h3 id="clock-slots-heading" className="text-[15px] font-bold text-ink-900">
          Slots
        </h3>
        <span className="ml-2 text-[13px] text-ink-500">{slots.length} in this version</span>
      </div>
      <Table>
        <thead>
          <HeaderRow>
            <Th scope="col" className="w-20 py-2">
              Start
            </Th>
            <Th scope="col" className="px-2 py-2">
              Slot
            </Th>
            <Th scope="col" className="w-24 px-2 py-2">
              Length
            </Th>
            <Th scope="col" className="w-32 py-2">
              Local
            </Th>
          </HeaderRow>
        </thead>
        <tbody>
          {slots.map((slot) => (
            <Row
              key={slot.id}
              onMouseEnter={onEnter(slot.id)}
              onMouseLeave={onLeave}
              className={cn(slot.id === activeId && "bg-brand-surface/50")}
            >
              <Cell className="py-1.5 tabular-nums">
                {formatOffsetSeconds(slot.startSeconds)}
                {slot.float ? "+" : ""}
              </Cell>
              <Cell className="px-2 py-1.5">
                <button
                  type="button"
                  aria-pressed={slot.id === activeId}
                  onClick={onSelect(slot.id)}
                  onFocus={onEnter(slot.id)}
                  onBlur={onLeave}
                  className={cn(
                    "rounded text-left hover:underline",
                    focusRing,
                    slot.id === activeId ? "font-bold" : "font-normal",
                  )}
                >
                  {slot.label}
                </button>
              </Cell>
              <Cell className="px-2 py-1.5 tabular-nums text-ink-700">
                {slot.float
                  ? describeFloatLength(slot.float)
                  : formatOffsetSeconds(slot.durationSeconds)}
              </Cell>
              <Cell
                className={cn(
                  "py-1.5 text-xs font-bold",
                  slot.local?.requirement === "required" ? "text-ink-900" : "text-brand-link",
                )}
              >
                {slot.local
                  ? `${requirementLabel(slot.local.requirement)}${slot.float ? " · floats" : ""}`
                  : slot.float
                    ? "Floats"
                    : ""}
              </Cell>
            </Row>
          ))}
        </tbody>
      </Table>
    </section>
  );
}

// ------------------------------------------------------------- Side panel

function SlotPanel({
  slot,
  selected,
  previewing,
  opportunity,
  shift,
  hour,
  canEdit,
  canPin,
  templateId,
  returnQuery,
  actionHref,
  form,
  removeOpportunityAction,
  removePinAction,
}: {
  slot: ClockViewSlot | null;
  selected: ClockViewSlot | null;
  previewing: boolean;
  opportunity: ClockViewerOpportunity | null;
  shift: ShiftInfo;
  hour: number;
  canEdit: boolean;
  canPin: boolean;
  templateId: string;
  returnQuery: string;
  actionHref: (mode: "edit" | "pin" | "mark") => string;
  form: ClockViewerForm | null;
  removeOpportunityAction: (formData: FormData) => Promise<void>;
  removePinAction: (formData: FormData) => Promise<void>;
}) {
  if (!slot) return null;
  const isLocal = Boolean(slot.local);
  // Actions belong to the selected slot; while previewing another, the panel is read-only.
  const isSelected = !previewing && selected?.id === slot.id;
  const acting = canEdit && isSelected;
  const pinning = canPin && isSelected;
  const hourLabel = shift.startTime
    ? `Hour ${hour + 1} (${shiftTimeOfDay(shift.startTime, hour, 0)})`
    : `Hour ${hour + 1}`;

  return (
    <aside aria-label="Selected slot" className="rounded border border-line bg-white">
      <div className="border-b border-line bg-panel-50 px-5 py-3.5">
        <div className="text-xs font-bold uppercase tracking-wide text-ink-500">
          {previewing ? "Previewing" : "Selected slot"}
        </div>
        <div className="mt-0.5 text-lg font-bold text-ink-900">
          {slot.label}
          {slot.float ? "" : ` · ${formatOffsetSeconds(slot.startSeconds)}`}
        </div>
        <div className="text-sm tabular-nums text-ink-700">
          {slot.float
            ? `${describeFloatLength(slot.float)} long · floats`
            : `${formatOffsetSeconds(slot.durationSeconds)} long · fixed timing${
                shift.startTime
                  ? ` · ${shiftTimeOfDay(shift.startTime, hour, slot.startSeconds)}`
                  : ""
              }`}
        </div>
      </div>

      <div className="flex flex-col gap-3.5 px-5 py-4">
        {slot.float && (
          <p className="rounded border border-dashed border-ink-700 bg-panel-50 px-3 py-2.5 text-sm text-ink-700">
            {describeFloatNote(slot.float)}
          </p>
        )}

        {isLocal && slot.local ? (
          <>
            <div>
              <div className="text-[13px] text-ink-500">Local opportunity</div>
              <div className="text-[15px] font-semibold text-ink-900">
                {requirementLabel(slot.local.requirement)}
              </div>
              <div className="text-sm text-ink-700">
                {slot.local.requirement === "required"
                  ? "Unfilled is flagged: a genuine local obligation."
                  : "If unused, the network carries this slot."}
              </div>
              {opportunity?.notes && (
                <div className="mt-1 text-sm text-ink-500">{opportunity.notes}</div>
              )}
            </div>
            <div>
              <div className="mb-1.5 text-[13px] text-ink-500">Permitted content</div>
              <div className="flex flex-wrap gap-1.5">
                {(opportunity?.permittedTypeLabels.length
                  ? opportunity.permittedTypeLabels
                  : ["Anything"]
                ).map((label) => (
                  <span
                    key={label}
                    className="rounded-full bg-brand-surface px-2.5 py-0.5 text-[13px] font-semibold text-brand-link"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-[13px] text-ink-500">Pinned content · {hourLabel}</div>
              {slot.pinsThisHour.map((pin) => (
                <div
                  key={pin.id}
                  className="mb-1.5 flex items-start justify-between gap-3 rounded border border-line px-3 py-2"
                >
                  <div>
                    <div className="text-[15px] font-semibold text-ink-900">{pin.title}</div>
                    <div className="text-[13px] text-ink-500">{describePinScope(pin)}</div>
                  </div>
                  {pinning && (
                    <form action={removePinAction}>
                      <input type="hidden" name="clock_template_id" value={templateId} />
                      <input type="hidden" name="assignment_id" value={pin.id} />
                      <input type="hidden" name="return_query" value={returnQuery} />
                      <button
                        type="submit"
                        className={cn(
                          "rounded text-sm text-ink-500 hover:text-ink-900 hover:underline",
                          focusRing,
                        )}
                      >
                        Remove
                      </button>
                    </form>
                  )}
                </div>
              ))}
              {slot.pinsThisHour.length === 0 && (
                <p className="text-sm text-ink-500">
                  {slot.pinsOtherHours > 0
                    ? `Nothing pinned for this hour. ${slot.pinsOtherHours} ${slot.pinsOtherHours === 1 ? "pin applies" : "pins apply"} to another hour.`
                    : "Nothing pinned."}
                </p>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-ink-700">
            The network carries this slot.
            {acting && !slot.float && " Mark it eligible to let WUWF fill it with local content."}
          </p>
        )}
      </div>

      {(acting || (pinning && isLocal)) && !form && (
        <div className="flex flex-wrap items-center gap-2.5 border-t border-line px-5 py-3">
          {isLocal ? (
            <>
              {acting && (
                <PrimaryLink href={actionHref("edit")} className="h-9 px-3.5 py-0">
                  Edit eligibility
                </PrimaryLink>
              )}
              {pinning && (
                <SecondaryLink href={actionHref("pin")} className="h-9 px-3.5 py-0">
                  Pin content
                </SecondaryLink>
              )}
              {acting && (
                <form action={removeOpportunityAction}>
                  <input type="hidden" name="clock_template_id" value={templateId} />
                  <input
                    type="hidden"
                    name="opportunity_id"
                    value={slot.local?.opportunityId ?? ""}
                  />
                  <input type="hidden" name="return_query" value={returnQuery} />
                  <Button type="submit" variant="secondary" className="h-9 px-3.5 py-0">
                    Remove
                  </Button>
                </form>
              )}
            </>
          ) : (
            <SecondaryLink href={actionHref("mark")} className="h-9 px-3.5 py-0">
              Mark eligible for local content
            </SecondaryLink>
          )}
        </div>
      )}

      {form && (
        <div className="border-t border-line bg-panel-50/60 px-5 py-4">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-bold text-ink-900">{form.title}</h4>
            <TextLink href={form.cancelHref} className="hover:underline">
              Cancel
            </TextLink>
          </div>
          {form.node}
        </div>
      )}
    </aside>
  );
}
