"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Settings, TrendingDown, TrendingUp } from "lucide-react";
import { centsToUsd, formatPercent } from "@/lib/formatters";
import { useBalance, mask } from "./balance-context";
import { cn } from "@/lib/utils";
import type { PortfolioSummary } from "@/types";

function UpdatedBadge({ since }: { since: number | null }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, []);
  if (!since) return null;
  const secs = Math.max(0, Math.round((Date.now() - since) / 1000));
  const label = secs < 60 ? `hace ${secs}s` : `hace ${Math.round(secs / 60)}m`;
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
      actualizado {label}
    </span>
  );
}

interface Props {
  summary: PortfolioSummary | null;
  lastUpdated: number | null;
  onOpenSettings: () => void;
}

export function PortfolioHeader({ summary, lastUpdated, onOpenSettings }: Props) {
  const { hidden, toggle } = useBalance();
  const profit = (summary?.total_profit_loss ?? 0) >= 0;
  const value = summary ? centsToUsd(summary.total_value) : "$0.00";
  const invertido = summary ? centsToUsd(summary.total_invested) : "$0.00";
  const liquidez = summary ? centsToUsd(summary.liquidity) : "$0.00";
  const hasLiquidity = (summary?.liquidity ?? 0) > 0;
  const pnl = summary ? centsToUsd(summary.total_profit_loss) : "$0.00";
  const pct = summary ? formatPercent(summary.total_profit_loss_pct) : "+0.00%";

  return (
    <div className="relative flex flex-col items-center gap-5 pt-2">
      <div className="absolute right-0 top-0 flex items-center gap-3">
        <UpdatedBadge since={lastUpdated} />
        <button
          onClick={onOpenSettings}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Ajustes"
        >
          <Settings size={18} />
        </button>
      </div>

      <div className="flex flex-col items-center gap-1">
        <p className="text-sm text-muted-foreground">Panel de mi portfolio</p>
        <div className="flex items-center gap-3">
          <h1 className="text-4xl font-bold tracking-tight text-primary md:text-5xl">
            {mask(value, hidden)}
          </h1>
          <button
            onClick={toggle}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={hidden ? "Mostrar saldo" : "Ocultar saldo"}
          >
            {hidden ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>
      </div>

      <div
        className={cn(
          "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm",
          profit
            ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-400 shadow-[0_0_24px_-6px_rgba(34,197,94,0.4)]"
            : "border-red-500/40 bg-red-500/5 text-red-400 shadow-[0_0_24px_-6px_rgba(239,68,68,0.4)]"
        )}
      >
        {profit ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
        <span className="text-xs text-muted-foreground">Beneficio</span>
        <span className="font-semibold">{mask(pnl, hidden)}</span>
        <span className="font-medium opacity-80">{pct}</span>
      </div>

      <div className="flex items-center gap-5 text-sm">
        <div className="flex flex-col items-center">
          <span className="text-xs text-muted-foreground">Invertido</span>
          <span className="font-semibold">{mask(invertido, hidden)}</span>
        </div>
        {hasLiquidity && (
          <>
            <div className="h-7 w-px bg-border" />
            <div className="flex flex-col items-center">
              <span className="text-xs text-muted-foreground">Liquidez</span>
              <span className="font-semibold">{mask(liquidez, hidden)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
