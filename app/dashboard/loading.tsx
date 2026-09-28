export default function DashboardLoading() {
  return (
    <div className="space-y-6 p-6 animate-pulse">
      {/* Header Skeleton */}
      <div className="flex flex-col gap-2">
        <div className="h-8 w-64 rounded-lg bg-slate-200" />
        <div className="h-4 w-96 rounded-lg bg-slate-100" />
      </div>

      {/* Top 4 Quick Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="h-4 w-24 rounded bg-slate-200" />
                <div className="h-7 w-16 rounded bg-slate-300" />
              </div>
              <div className="h-10 w-10 rounded-lg bg-slate-100" />
            </div>
          </div>
        ))}
      </div>

      {/* Middle Chart / Overview Skeleton */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="h-80 rounded-xl border border-slate-100 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="h-5 w-48 rounded bg-slate-200 mb-6" />
          <div className="h-60 w-full rounded-lg bg-slate-100" />
        </div>
        <div className="h-80 rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="h-5 w-36 rounded bg-slate-200 mb-6" />
          <div className="space-y-3">
            {[1, 2, 3, 4].map((j) => (
              <div key={j} className="h-10 rounded-lg bg-slate-100" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
