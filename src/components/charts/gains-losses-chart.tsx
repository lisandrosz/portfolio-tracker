"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { centsToUsd, formatShortDate } from "@/lib/formatters";
import type { PortfolioSnapshot } from "@/types";

interface Props {
  snapshots: PortfolioSnapshot[];
}

export function GainsLossesChart({ snapshots }: Props) {
  if (snapshots.length < 2) {
    return (
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Ganancias / Perdidas</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[300px] text-muted-foreground">
          Se necesitan al menos 2 snapshots
        </CardContent>
      </Card>
    );
  }

  const data = snapshots.slice(1).map((s, i) => {
    const prev = snapshots[i];
    const change = s.total_value - prev.total_value;
    return {
      date: s.date,
      change: change / 100,
      isPositive: change >= 0,
    };
  });

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">Ganancias / Perdidas por Periodo</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={data}>
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
                "Cambio",
              ]}
              labelFormatter={(label) => formatShortDate(String(label))}
              contentStyle={{
                backgroundColor: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "12px",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.05)",
              }}
            />
            <Bar dataKey="change" radius={[4, 4, 0, 0]}>
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.isPositive ? "#10b981" : "#ef4444"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
