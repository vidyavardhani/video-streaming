interface MetricCardProps {
  title: string;
  value: string | number;
  description?: string;
  trend?: {
    value: number;
    label: string;
  };
}

export function MetricCard({ title, value, description, trend }: MetricCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm font-medium text-slate-500">{title}</div>
      <div className="mt-2 text-3xl font-semibold text-slate-900">{value}</div>
      {description && <p className="mt-2 text-xs text-slate-500">{description}</p>}
      {trend && (
        <div className="mt-3 text-xs font-medium text-emerald-600">{trend.value}% {trend.label}</div>
      )}
    </div>
  );
}
