export default function ColdLoading() {
  return (
    <div className="space-y-6 p-6 animate-pulse">
      {/* Header Skeleton */}
      <div className="flex flex-col gap-2">
        <div className="h-8 w-72 rounded-lg bg-slate-200" />
        <div className="h-4 w-96 rounded-lg bg-slate-100" />
      </div>

      {/* Metric Cards Skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="h-4 w-28 rounded bg-slate-200" />
                <div className="h-7 w-20 rounded bg-slate-300" />
              </div>
              <div className="h-10 w-10 rounded-lg bg-slate-100" />
            </div>
          </div>
        ))}
      </div>

      {/* Main Content Area Skeleton */}
      <div className="h-96 rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="h-5 w-40 rounded bg-slate-200 mb-6" />
        <div className="h-72 w-full rounded-lg bg-slate-100" />
      </div>
    </div>
  );
}
