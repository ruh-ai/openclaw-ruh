import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

export function formatDate(value: string | null | undefined) {
  if (!value) {
    return "—";
  }
  return new Date(value).toLocaleString();
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--accent-primary)]">
          Ruh super admin
        </p>
        <h1 className="font-display mt-2 text-3xl font-semibold tracking-[-0.04em] text-[var(--text-primary)] md:text-4xl">
          {title}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">
          {description}
        </p>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx(
        "rounded-[28px] border border-[var(--border-default)] bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(247,244,251,0.94))] p-5 shadow-[var(--panel-shadow)] backdrop-blur",
        className,
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {description}
            </p>
          ) : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

const METRIC_TONES: Record<string, string> = {
  primary: "bg-[var(--accent-primary-soft)] text-[var(--accent-primary)]",
  success: "bg-[var(--success-soft)] text-[var(--success)]",
  warning: "bg-[var(--warning-soft)] text-[var(--warning)]",
  danger: "bg-[var(--danger-soft)] text-[var(--danger)]",
  neutral: "bg-[var(--bg-muted)] text-[var(--text-primary)]",
};

export function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "primary",
}: {
  label: string;
  value: number | string;
  detail?: string;
  icon: LucideIcon;
  tone?: keyof typeof METRIC_TONES;
}) {
  return (
    <div className="rounded-[28px] border border-[var(--border-default)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(244,240,251,0.94))] p-5 shadow-[var(--panel-shadow)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
            {label}
          </p>
          <p className="font-display mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
            {typeof value === "number" ? formatNumber(value) : value}
          </p>
          {detail ? (
            <p className="mt-2 text-sm text-[var(--text-secondary)]">{detail}</p>
          ) : null}
        </div>
        <div
          className={cx(
            "flex h-12 w-12 items-center justify-center rounded-2xl",
            METRIC_TONES[tone] || METRIC_TONES.primary,
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

const BADGE_TONES: Record<string, string> = {
  neutral:
    "border-[var(--border-default)] bg-[var(--bg-muted)] text-[var(--text-secondary)]",
  primary:
    "border-[var(--accent-primary-soft)] bg-[var(--accent-primary-soft)] text-[var(--accent-primary)]",
  success:
    "border-[var(--success-soft)] bg-[var(--success-soft)] text-[var(--success)]",
  warning:
    "border-[var(--warning-soft)] bg-[var(--warning-soft)] text-[var(--warning)]",
  danger:
    "border-[var(--danger-soft)] bg-[var(--danger-soft)] text-[var(--danger)]",
};

export function StatusPill({
  tone = "neutral",
  children,
}: {
  tone?: keyof typeof BADGE_TONES;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
        BADGE_TONES[tone] || BADGE_TONES.neutral,
      )}
    >
      {children}
    </span>
  );
}

export function AttentionRow({
  title,
  detail,
  severity,
  href,
}: {
  title: string;
  detail: string;
  severity: "high" | "medium" | "low";
  href?: string;
}) {
  const tone =
    severity === "high" ? "danger" : severity === "medium" ? "warning" : "primary";

  return (
    <div className="flex flex-col gap-3 rounded-[24px] border border-[var(--border-default)] bg-[linear-gradient(180deg,rgba(255,255,255,0.76),rgba(239,232,250,0.84))] p-4 md:flex-row md:items-start md:justify-between">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <StatusPill tone={tone}>{severity}</StatusPill>
          <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
        </div>
        <p className="text-sm leading-6 text-[var(--text-secondary)]">{detail}</p>
      </div>
      {href ? (
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent-primary)]"
        >
          Open
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      ) : null}
    </div>
  );
}

const BUTTON_TONES: Record<string, string> = {
  primary:
    "border-transparent bg-[linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))] text-white shadow-[0_16px_34px_rgba(123,90,255,0.28)] hover:opacity-95",
  secondary:
    "border-[var(--border-default)] bg-[rgba(255,255,255,0.84)] text-[var(--text-primary)] hover:border-[var(--accent-secondary)] hover:bg-white",
  danger:
    "border-transparent bg-[linear-gradient(135deg,#d14478,#ff7a9a)] text-white shadow-[0_14px_28px_rgba(209,68,120,0.26)] hover:opacity-95",
  ghost:
    "border-transparent bg-transparent text-[var(--accent-primary)] hover:bg-[var(--accent-primary-soft)]",
};

export function ActionButton({
  tone = "secondary",
  busy = false,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: keyof typeof BUTTON_TONES;
  busy?: boolean;
}) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-[18px] border px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60",
        BUTTON_TONES[tone] || BUTTON_TONES.secondary,
        className,
      )}
    >
      {busy ? "Working…" : children}
    </button>
  );
}

export const fieldClassName =
  "rounded-[18px] border border-[var(--border-default)] bg-[rgba(255,255,255,0.82)] px-4 py-2.5 text-sm text-[var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:bg-white";
