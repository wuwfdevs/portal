export default function EditorialLoading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="mb-4 flex gap-2">
        <div className="h-7 w-20 rounded-full bg-panel-100" />
        <div className="h-7 w-20 rounded-full bg-panel-50" />
        <div className="h-7 w-24 rounded-full bg-panel-50" />
      </div>
      <div className="rounded border border-line">
        <div className="h-10 border-b border-line bg-panel-50" />
        {[0, 1, 2, 3].map((row) => (
          <div
            key={row}
            className="flex items-center gap-4 border-b border-line px-4 py-4 last:border-b-0"
          >
            <div className="h-3 w-1/3 rounded bg-panel-100" />
            <div className="h-3 w-24 rounded bg-panel-50" />
            <div className="h-3 w-16 rounded bg-panel-50" />
          </div>
        ))}
      </div>
    </div>
  );
}
