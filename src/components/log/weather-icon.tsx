import type { ReactNode } from "react";
import type { WeatherIconCode } from "@/lib/log/weather-outlook";

/**
 * Flat, single-color glyphs for the outlook strip's icon buckets — hand-drawn
 * from plain circles/rects/lines rather than NWS's own hosted icon images
 * (see lib/log/weather-outlook.ts's header: that service is documented
 * legacy/reference-only, and hotlinking it would be a new external-image
 * failure mode this tool has otherwise avoided everywhere) and rather than
 * freehand bezier paths, which risk an unreviewable rendering glitch from a
 * single wrong control point. Same currentColor/aria-hidden convention as
 * rundowns/[id]/item-card-icons.tsx.
 */

const SUN_RAYS = [
  [19.2, 12, 21.6, 12],
  [17.09, 6.91, 18.79, 5.21],
  [12, 4.8, 12, 2.4],
  [6.91, 6.91, 5.21, 5.21],
  [4.8, 12, 2.4, 12],
  [6.91, 17.09, 5.21, 18.79],
  [12, 19.2, 12, 21.6],
  [17.09, 17.09, 18.79, 18.79],
] as const;

function SunGlyph() {
  return (
    <>
      <circle cx="12" cy="12" r="4.5" />
      <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        {SUN_RAYS.map(([x1, y1, x2, y2]) => (
          <line key={`${x1}-${y1}`} x1={x1} y1={y1} x2={x2} y2={y2} />
        ))}
      </g>
    </>
  );
}

function MoonGlyph() {
  return (
    <>
      <circle cx="11" cy="13" r="4.5" />
      <circle cx="17.5" cy="6" r="0.9" />
      <circle cx="20" cy="10" r="0.6" />
    </>
  );
}

/** The fluffy cloud silhouette every cloud-based icon shares, as overlapping same-color circles plus a rounded base — reliable at any vertical offset without hand-tuned curve math. */
function CloudGlyph({ top = 6.5 }: { top?: number }) {
  return (
    <>
      <circle cx="9" cy={top + 2.5} r="3.2" />
      <circle cx="13" cy={top} r="4.2" />
      <circle cx="16.5" cy={top + 2.7} r="2.8" />
      <rect x="6" y={top + 2.5} width="13" height="5" rx="2.5" />
    </>
  );
}

function PartlyCloudyGlyph({ accent }: { accent: "sun" | "moon" }) {
  return (
    <>
      {accent === "sun" ? (
        <>
          <circle cx="8" cy="8" r="3" />
          <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <line x1="8" y1="1.8" x2="8" y2="3.4" />
            <line x1="2.6" y1="8" x2="4.2" y2="8" />
            <line x1="3.9" y1="3.9" x2="5" y2="5" />
          </g>
        </>
      ) : (
        <>
          <circle cx="8" cy="8" r="2.6" />
          <circle cx="12" cy="6" r="0.7" />
          <circle cx="6" cy="4" r="0.5" />
        </>
      )}
      <CloudGlyph top={11.5} />
    </>
  );
}

function FogGlyph() {
  return (
    <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <line x1="4" y1="9.5" x2="16" y2="9.5" />
      <line x1="2" y1="13" x2="18" y2="13" />
      <line x1="5" y1="16.5" x2="18" y2="16.5" />
      <line x1="8" y1="20" x2="17" y2="20" />
    </g>
  );
}

function RainGlyph() {
  return (
    <>
      <CloudGlyph top={6.5} />
      <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <line x1="9" y1="16.5" x2="7.7" y2="20" />
        <line x1="13" y1="16.5" x2="11.7" y2="20" />
        <line x1="17" y1="16.5" x2="15.7" y2="20" />
      </g>
    </>
  );
}

function ThunderstormGlyph() {
  return (
    <>
      <CloudGlyph top={6.5} />
      <polygon points="13,14 9.5,20 11.7,20 10,24.5 15,17.5 12.3,17.5 14.3,14" />
    </>
  );
}

function SnowGlyph() {
  return (
    <>
      <CloudGlyph top={6.5} />
      <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <line x1="8" y1="16.5" x2="8" y2="20.5" />
        <line x1="6.3" y1="18.5" x2="9.7" y2="18.5" />
        <line x1="13" y1="16.5" x2="13" y2="20.5" />
        <line x1="11.3" y1="18.5" x2="14.7" y2="18.5" />
        <line x1="17.5" y1="16.5" x2="17.5" y2="20.5" />
        <line x1="15.8" y1="18.5" x2="19.2" y2="18.5" />
      </g>
    </>
  );
}

function WindGlyph() {
  return (
    <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none">
      <path d="M3 9h11a2.5 2.5 0 1 0-2.3-3.4" />
      <path d="M3 13h14a2.5 2.5 0 1 1-2.3 3.4" />
      <path d="M3 17h9" />
    </g>
  );
}

function SevereGlyph() {
  return (
    <>
      <polygon
        points="12,3 22,20 2,20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <rect x="11" y="9" width="2" height="6" rx="1" />
      <rect x="11" y="16.5" width="2" height="2" rx="1" />
    </>
  );
}

function glyphFor(code: WeatherIconCode): ReactNode {
  switch (code) {
    case "sunny":
      return <SunGlyph />;
    case "clear-night":
      return <MoonGlyph />;
    case "partly-cloudy":
      return <PartlyCloudyGlyph accent="sun" />;
    case "partly-cloudy-night":
      return <PartlyCloudyGlyph accent="moon" />;
    case "cloudy":
      return <CloudGlyph top={4} />;
    case "fog":
      return <FogGlyph />;
    case "rain":
      return <RainGlyph />;
    case "thunderstorm":
      return <ThunderstormGlyph />;
    case "snow":
      return <SnowGlyph />;
    case "wind":
      return <WindGlyph />;
    case "severe":
      return <SevereGlyph />;
  }
}

export function WeatherIcon({ code, className }: { code: WeatherIconCode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      {glyphFor(code)}
    </svg>
  );
}
