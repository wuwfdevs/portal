export default function RemoteInterviewLoading() {
  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <div className="animate-pulse" aria-busy="true" aria-label="Loading">
        <div className="mb-6 h-6 w-56 rounded bg-panel-100" />
        <div className="max-w-5xl rounded border border-line bg-white p-5">
          <div className="mb-5 h-10 rounded bg-panel-50" />
          <div className="rounded border border-line">
            {[0, 1, 2].map((row) => (
              <div key={row} className="border-b border-line px-4 py-3 last:border-b-0">
                <div className="mb-2 h-3 w-32 rounded bg-panel-50" />
                <div className="h-3 w-3/4 rounded bg-panel-100" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
