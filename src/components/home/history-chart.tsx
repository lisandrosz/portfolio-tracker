"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { centsToUsd, formatShortDate } from "@/lib/formatters";
import { useBalance, mask } from "./balance-context";
import { cn } from "@/lib/utils";
import type { PortfolioSnapshot } from "@/types";

const PERIODS: { key: string; label: string }[] = [
  { key: "1W", label: "7d" },
  { key: "1M", label: "30d" },
  { key: "3M", label: "3m" },
  { key: "6M", label: "6m" },
  { key: "1Y", label: "1A" },
  { key: "ALL", label: "Histórico" },
];

interface Props {
  refreshKey: number;
}

export function HistoryChart({ refreshKey }: Props) {
  const { hidden } = useBalance();
  const [period, setPeriod] = useState("1M");
  const [metric, setMetric] = useState<"value" | "gain">("value");
  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/portfolio/history?period=${period}`);
    const json = await res.json();
    setSnapshots(json.data || []);
  }, [period]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const data = snapshots.map((s) => ({
    date: s.date,
    value: s.total_value / 100,
    invested: s.total_cost / 100,
    gain: (s.total_value - s.total_cost) / 100,
  }));

  const isGain = metric === "gain";
  const last = data[data.length - 1];
  const profit = isGain ? (last ? last.gain >= 0 : true) : last ? last.value >= last.invested : true;
  const color = profit ? "#22c55e" : "#ef4444";

  // Auto-scale Y axis to the data range (with padding).
  const series = isGain
    ? data.map((d) => d.gain)
    : data.flatMap((d) => [d.value, d.invested]);
  const vals = series.filter((v) => Number.isFinite(v));
  let lo = vals.length ? Math.min(...vals) : 0;
  let hi = vals.length ? Math.max(...vals) : 1;
  if (isGain) {
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
  }
  const span = hi - lo || Math.abs(hi) || 1;
  const floorLo = Math.floor((lo - span * 0.1) / 250) * 250;
  const yDomain: [number, number] = [
    isGain ? floorLo : Math.max(0, floorLo),
    Math.ceil((hi + span * 0.1) / 250) * 250,
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h2 className="font-medium">Historia</h2>
          <div className="flex gap-1 rounded-lg bg-muted p-0.5 text-xs">
            {(["value", "gain"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={cn(
                  "rounded-md px-2.5 py-1 font-medium transition-colors",
                  metric === m
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {m === "value" ? "Valor" : "Ganancia"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                period === p.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {data.length < 2 ? (
        <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
          {data.length === 0
            ? "Cargá activos para ver tu evolución"
            : "Acumulando datos… vuelve mañana para ver la curva"}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="valueFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#262630" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatShortDate}
              stroke="#6b7280"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={48}
            />
            <YAxis
              stroke="#6b7280"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={56}
              domain={yDomain}
              allowDataOverflow={false}
              tickFormatter={(v) => (hidden ? "•••" : `$${Math.round(v).toLocaleString()}`)}
            />
            <Tooltip
              formatter={(value, name) => [
                mask(centsToUsd((value as number) * 100), hidden),
                name === "value" ? "Valor" : name === "invested" ? "Aportado" : "Ganancia",
              ]}
              labelFormatter={(label) => formatShortDate(String(label))}
              contentStyle={{
                backgroundColor: "#15151c",
                border: "1px solid #262630",
                borderRadius: "10px",
                color: "#ededf2",
                fontSize: "12px",
              }}
            />
            {isGain ? (
              <>
                <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="3 3" />
                <Area
                  type="monotone"
                  dataKey="gain"
                  stroke={color}
                  strokeWidth={2}
                  fill="url(#valueFill)"
                  baseValue={0}
                />
              </>
            ) : (
              <>
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={color}
                  strokeWidth={2}
                  fill="url(#valueFill)"
                />
                <Line
                  type="monotone"
                  dataKey="invested"
                  stroke="#9595a0"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                />
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
