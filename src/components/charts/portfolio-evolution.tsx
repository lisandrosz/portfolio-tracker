"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { centsToUsd, formatShortDate } from "@/lib/formatters";
import type { PortfolioSnapshot } from "@/types";

interface Props {
  snapshots: PortfolioSnapshot[];
}

export function PortfolioEvolution({ snapshots }: Props) {
  const data = snapshots.map((s) => ({
    date: s.date,
    value: s.total_value / 100,
  }));

  if (data.length === 0) {
    return (
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Evolucion del Portfolio</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[300px] text-muted-foreground">
          Crea snapshots mensuales para ver la evolucion
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">Evolucion del Portfolio</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="date"
              tickFormatter={formatShortDate}
              stroke="#9ca3af"
              fontSize={12}
            />
            <YAxis
              tickFormatter={(v) => `$${v.toLocaleString()}`}
              stroke="#9ca3af"
              fontSize={12}
            />
            <Tooltip
              formatter={(value) => [
                centsToUsd((value as number) * 100),
                "Valor",
              ]}
              labelFormatter={(label) => formatShortDate(String(label))}
              contentStyle={{
                backgroundColor: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "12px",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.05)",
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#10b981"
              fillOpacity={1}
              fill="url(#colorValue)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
