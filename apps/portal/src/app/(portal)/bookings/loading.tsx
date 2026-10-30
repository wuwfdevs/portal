export default function BookingsLoading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      <div className="h-9 w-full max-w-md animate-pulse rounded bg-panel-50" />
      <div className="h-64 animate-pulse rounded border border-line bg-panel-50" />
    </div>
  );
}
