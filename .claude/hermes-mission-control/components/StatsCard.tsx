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
    <div className="mission-card animate-fadeIn rounded-[24px] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="section-label">
            {title}
          </p>
          <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">{value}</p>
          {subtitle && (
            <p className="mt-2 text-sm text-[var(--text-secondary)]">{subtitle}</p>
          )}
        </div>
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
