"use client";

import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, DollarSign, PieChart } from "lucide-react";
import { centsToUsd, formatPercent } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { PortfolioSummary } from "@/types";

interface Props {
  summary: PortfolioSummary;
}

export function PortfolioSummaryCards({ summary }: Props) {
  const isProfit = summary.total_profit_loss >= 0;

  const cards = [
    {
      label: "Valor Total",
      value: centsToUsd(summary.total_value),
      icon: DollarSign,
      color: "bg-emerald-50 text-emerald-600",
      iconBg: "bg-emerald-100",
    },
    {
      label: "Costo Total",
      value: centsToUsd(summary.total_cost),
      icon: DollarSign,
      color: "bg-blue-50 text-blue-600",
      iconBg: "bg-blue-100",
    },
    {
      label: "Ganancia / Perdida",
      value: centsToUsd(summary.total_profit_loss),
      icon: isProfit ? TrendingUp : TrendingDown,
      color: isProfit ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600",
      iconBg: isProfit ? "bg-emerald-100" : "bg-red-100",
      valueColor: isProfit ? "text-emerald-600" : "text-red-500",
    },
    {
      label: "Rendimiento",
      value: formatPercent(summary.total_profit_loss_pct),
      icon: PieChart,
      color: isProfit ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600",
      iconBg: isProfit ? "bg-emerald-100" : "bg-red-100",
      valueColor: isProfit ? "text-emerald-600" : "text-red-500",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card
          key={card.label}
          className="p-5 border-0 shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-muted-foreground">
              {card.label}
            </span>
            <div
              className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center",
                card.iconBg
              )}
            >
              <card.icon size={16} className={card.color.split(" ")[1]} />
            </div>
          </div>
          <div
            className={cn(
              "text-2xl font-bold tracking-tight",
              card.valueColor || "text-foreground"
            )}
          >
            {card.value}
          </div>
        </Card>
      ))}
    </div>
  );
}
