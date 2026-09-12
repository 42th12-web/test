export default function StatCard({ label, value, unit, accent = "patina", sub }) {
  const accentClass = {
    patina: "text-patina-400",
    rust: "text-rust-400",
    teal: "text-teal-400",
    amber: "text-amber-400",
  }[accent];

  return (
    <div className="border border-graphite-700 bg-graphite-900/60 px-4 py-3 flex-1 min-w-[150px]">
      <div className="text-[11px] text-ink-500 mb-1">{label}</div>
      <div className={`font-mono text-2xl font-medium ${accentClass}`}>
        {value}
        {unit ? <span className="text-sm text-ink-500 ml-1">{unit}</span> : null}
      </div>
      {sub ? <div className="text-[11px] text-ink-500 mt-1">{sub}</div> : null}
    </div>
  );
}
