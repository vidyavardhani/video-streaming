interface TicketBreakdownProps {
  metrics: {
    open: number;
    pending: number;
    hold: number;
    closed: number;
  };
}

export default function TicketBreakdown({ metrics }: TicketBreakdownProps) {
  const total = metrics.open + metrics.pending + metrics.hold + metrics.closed;
  const segments = [
    { label: 'Open', value: metrics.open, color: 'bg-emerald-500' },
    { label: 'Pending', value: metrics.pending, color: 'bg-amber-500' },
    { label: 'Hold', value: metrics.hold, color: 'bg-slate-400' },
    { label: 'Closed', value: metrics.closed, color: 'bg-indigo-500' }
  ];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">Ticket lifecycle</h3>
      <p className="text-xs text-slate-500">Snapshot of ticket statuses across your workspace.</p>
      <div className="mt-6 h-4 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="flex h-full">
          {segments.map((segment) => (
            <div
              key={segment.label}
              className={segment.color}
              style={{ width: total === 0 ? '0%' : `${(segment.value / total) * 100}%` }}
            />
          ))}
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${segment.color}`}></span>
            <span className="font-medium text-slate-700">{segment.label}</span>
            <span className="text-xs text-slate-500">{segment.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
