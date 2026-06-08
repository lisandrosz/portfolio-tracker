"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useFetch } from "@/hooks/use-fetch";
import { TransactionTable } from "@/components/transactions/transaction-table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ASSET_TYPES, isBoxType, type AssetType } from "@/lib/constants";
import { centsToUsd, formatMoney, formatPercent, formatQuantity, formatDate } from "@/lib/formatters";
import { useBalance, mask } from "@/components/home/balance-context";
import { cn } from "@/lib/utils";
import type { AssetWithValue, PortfolioSummary, Transaction } from "@/types";

function Stat({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  className?: string;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("font-mono font-medium", className)}>
        {value}
        {sub && <span className="ml-1 text-xs opacity-70">{sub}</span>}
      </div>
    </div>
  );
}

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { hidden } = useBalance();

  const { data: detail, loading, refetch } = useFetch<{ transactions: Transaction[] }>(
    `/api/assets/${id}`
  );
  const { data: summary } = useFetch<PortfolioSummary>("/api/portfolio/summary");

  const asset = summary?.assets.find((a) => a.id === Number(id)) as AssetWithValue | undefined;
  const txns = detail?.transactions ?? [];
  const box = asset ? isBoxType(asset.type) : false;

  const buys = txns.filter((t) => t.type === "buy");
  const sells = txns.filter((t) => t.type === "sell");
  const deposits = txns.filter((t) => t.type === "deposit");
  const withdrawals = txns.filter((t) => t.type === "withdrawal");
  const dates = txns.map((t) => t.date).sort();

  async function handleRefresh() {
    refetch();
    fetch("/api/portfolio/rebuild", { method: "POST" }).catch(() => {});
  }

  return (
    <div className="space-y-6">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={16} /> Volver
      </Link>

      {loading || !asset ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : (
        <>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold">{asset.symbol}</h1>
              <span className="text-muted-foreground">{asset.name}</span>
              <Badge variant="secondary">{ASSET_TYPES[asset.type as AssetType] || asset.type}</Badge>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="Valor (USD)" value={mask(centsToUsd(asset.current_value), hidden)} />
              <Stat label="Invertido" value={mask(centsToUsd(asset.net_invested), hidden)} />
              <Stat
                label="Ganancia"
                value={mask(centsToUsd(asset.profit_loss), hidden)}
                sub={formatPercent(asset.profit_loss_pct)}
                className={asset.profit_loss >= 0 ? "text-emerald-400" : "text-red-400"}
              />
              {!box && <Stat label="Cantidad" value={formatQuantity(asset.quantity)} />}
              <Stat
                label={box ? "Saldo" : "Precio actual"}
                value={formatMoney(asset.current_price, asset.currency)}
              />
              {!box && (
                <Stat label="PPC" value={asset.avg_cost > 0 ? centsToUsd(asset.avg_cost) : "—"} />
              )}
            </div>
          </div>

          {/* Counts */}
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
            {buys.length > 0 && <span><strong className="text-foreground">{buys.length}</strong> compras</span>}
            {sells.length > 0 && <span><strong className="text-foreground">{sells.length}</strong> ventas</span>}
            {deposits.length > 0 && <span><strong className="text-foreground">{deposits.length}</strong> aportes</span>}
            {withdrawals.length > 0 && <span><strong className="text-foreground">{withdrawals.length}</strong> retiros</span>}
            {dates.length > 0 && (
              <span>desde <strong className="text-foreground">{formatDate(dates[0])}</strong></span>
            )}
          </div>

          <div>
            <h2 className="mb-3 font-medium">Movimientos</h2>
            <TransactionTable transactions={txns} onRefresh={handleRefresh} showAsset={false} />
          </div>
        </>
      )}
    </div>
  );
}
