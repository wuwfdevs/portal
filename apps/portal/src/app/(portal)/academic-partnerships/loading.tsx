export default function AcademicPartnershipsLoading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      <div className="h-9 w-full max-w-md animate-pulse rounded bg-panel-50" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((column) => (
          <div key={column} className="h-64 animate-pulse rounded border border-line bg-panel-50" />
        ))}
      </div>
    </div>
  );
}
