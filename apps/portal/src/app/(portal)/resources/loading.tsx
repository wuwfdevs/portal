export default function ResourcesLoading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      <div className="h-9 w-full max-w-xl animate-pulse rounded bg-panel-50" />
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="h-[60px] animate-pulse rounded border border-line bg-panel-50" />
      ))}
    </div>
  );
}
