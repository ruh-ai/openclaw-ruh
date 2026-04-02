"use client";

export function StatsCard({
  title,
  value,
  icon: Icon,
  color,
  subtitle,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  subtitle?: string;
}) {
  return (
    <div className="animate-fadeIn bg-[var(--card-color)] rounded-xl border border-[var(--border-default)] p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
            {title}
          </p>
          <p className="text-2xl font-bold text-[var(--text-primary)] mt-1">{value}</p>
          {subtitle && (
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{subtitle}</p>
          )}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
