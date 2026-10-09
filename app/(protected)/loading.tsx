export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 w-48 bg-slate-200 rounded" />
      <div className="grid sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="panel h-32 bg-slate-100" />
        ))}
      </div>
      <div className="panel h-80 bg-slate-100" />
    </div>
  );
}
