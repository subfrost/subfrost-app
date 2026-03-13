'use client';

interface FireMetricCardProps {
  label: string;
  value: string;
  delta?: string;
  deltaPositive?: boolean;
  icon?: React.ReactNode;
  subValue?: string;
}

export default function FireMetricCard({
  label,
  value,
  delta,
  deltaPositive,
  icon,
  subValue,
}: FireMetricCardProps) {
  return (
    <div className="rounded-2xl p-3.5 sm:p-4 shadow-[0_4px_20px_rgba(0,0,0,0.12)] bg-[color:var(--sf-glass-bg)] backdrop-blur-md border border-[color:var(--sf-glass-border)] relative overflow-hidden">
      {/* Subtle glow */}
      <div className="absolute -top-8 -right-8 w-16 h-16 bg-orange-500/5 rounded-full blur-2xl pointer-events-none" />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-muted)]">
            {label}
          </span>
          {icon && <span className="text-orange-400">{icon}</span>}
        </div>
        <div className="text-lg sm:text-xl font-bold text-[color:var(--sf-text)] truncate">{value}</div>
        <div className="flex items-center gap-2 mt-0.5">
          {delta && (
            <span className={`text-[10px] sm:text-xs font-bold ${deltaPositive ? 'text-emerald-400' : 'text-red-400'}`}>
              {deltaPositive ? '+' : ''}{delta}
            </span>
          )}
          {subValue && (
            <span className="text-[10px] sm:text-xs text-[color:var(--sf-muted)]">{subValue}</span>
          )}
        </div>
      </div>
    </div>
  );
}
