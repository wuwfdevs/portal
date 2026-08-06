const ICONS: Record<string, React.ReactNode> = {
  "editorial-planning": (
    <>
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </>
  ),
  "remote-interview": (
    <>
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
    </>
  ),
  "clip-library": (
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  ),
  transcription: (
    <>
      <path d="M4 15v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2" />
      <line x1="8" y1="9" x2="8" y2="19" />
      <line x1="12" y1="9" x2="12" y2="19" />
      <line x1="16" y1="9" x2="16" y2="19" />
    </>
  ),
  "audience-listening": (
    <>
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    </>
  ),
  roadmap: (
    <>
      <path d="M4 19V6a2 2 0 0 1 2-2h5" />
      <polyline points="9 2 12 5 9 8" />
      <line x1="4" y1="12" x2="14" y2="12" />
      <polyline points="17 9 20 12 17 15" />
      <line x1="4" y1="19" x2="10" y2="19" />
    </>
  ),
  "academic-partnerships": (
    <>
      <path d="M2 9l10-5 10 5-10 5-10-5z" />
      <path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5" />
      <line x1="22" y1="9" x2="22" y2="15" />
    </>
  ),
  log: (
    <>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 16 14" />
    </>
  ),
};

const DEFAULT_ICON = (
  <>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </>
);

export function ToolIcon({ toolKey }: { toolKey: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      {ICONS[toolKey] ?? DEFAULT_ICON}
    </svg>
  );
}
