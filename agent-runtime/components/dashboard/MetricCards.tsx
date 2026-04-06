"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface MetricCard {
  label: string;
  value: string | number;
  trend?: "up" | "down" | "flat";
  trendValue?: string;
  icon?: LucideIcon;
  color?: string;
}

export function MetricCards({ metrics }: { metrics: MetricCard[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {metrics.map((card) => {
        const TrendIcon =
          card.trend === "up" ? TrendingUp : card.trend === "down" ? TrendingDown : Minus;
        const trendColor =
          card.trend === "up"
            ? "text-green-500"
            : card.trend === "down"
            ? "text-red-500"
            : "text-[var(--text-tertiary)]";

        return (
          <div
            key={card.label}
            className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4"
          >
            <div className="flex items-center justify-between mb-3">
              {card.icon && (
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${card.color || "var(--primary)"}15` }}
                >
                  <card.icon
                    className="h-4.5 w-4.5"
                    style={{ color: card.color || "var(--primary)" }}
                  />
                </div>
              )}
              {card.trend && (
                <div className={`flex items-center gap-1 ${trendColor}`}>
                  <TrendIcon className="h-3 w-3" />
                  {card.trendValue && (
                    <span className="text-[10px] font-medium">{card.trendValue}</span>
                  )}
                </div>
              )}
            </div>
            <p className="text-2xl font-bold text-[var(--text-primary)]">{card.value}</p>
            <p className="text-xs text-[var(--text-tertiary)] mt-1">{card.label}</p>
          </div>
        );
      })}
    </div>
  );
}
