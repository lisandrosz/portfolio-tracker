"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { centsToUsd } from "@/lib/formatters";
import { useBalance, mask } from "./balance-context";
import type { AssetWithValue } from "@/types";

const COLORS = ["#f59e0b", "#fb923c", "#ec4899", "#f472b6", "#a78bfa", "#6b7280"];

interface Props {
  assets: AssetWithValue[];
  totalValue: number;
}

export function AllocationDonut({ assets, totalValue }: Props) {
  const { hidden } = useBalance();

  // Slice by equity (value net of debt): a terreno's gross price would swamp the
  // chart while most of it is still owed to the seller.
  const positive = assets.filter((a) => a.equity > 0).sort((a, b) => b.equity - a.equity);
  const top = positive.slice(0, 5);
  const restValue = positive.slice(5).reduce((s, a) => s + a.equity, 0);

  const data = top.map((a) => ({ name: a.symbol, value: a.equity }));
  if (restValue > 0) data.push({ name: "Otros", value: restValue });

  const pct = (v: number) => (totalValue > 0 ? ((v / totalValue) * 100).toFixed(2) : "0.00");

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-3 font-medium">Asignación</h2>
      {data.length === 0 ? (
        <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
          Sin datos para mostrar
        </div>
      ) : (
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-10">
          {/* Fixed box: a percentage width collapses to nothing once the card
              spans the whole row and the legend claims the free space. */}
          <div className="h-[220px] w-[240px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={62}
                outerRadius={95}
                paddingAngle={2}
                dataKey="value"
                stroke="none"
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => mask(centsToUsd(value as number), hidden)}
                contentStyle={{
                  backgroundColor: "#15151c",
                  border: "1px solid #262630",
                  borderRadius: "10px",
                  color: "#ededf2",
                  fontSize: "12px",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          </div>
          <div className="grid w-full max-w-xl gap-2 sm:grid-cols-2 sm:gap-x-10">
            {data.map((d, i) => (
              <div key={d.name} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}
                  />
                  {d.name}
                </span>
                <span className="font-mono text-muted-foreground">{pct(d.value)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
