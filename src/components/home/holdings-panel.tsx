"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, ListOrdered } from "lucide-react";
import { ASSET_TYPES, isBoxType, isCashType, type AssetType } from "@/lib/constants";
import { centsToUsd, formatMoney, formatPercent, formatQuantity } from "@/lib/formatters";
import { AssetForm } from "@/components/assets/asset-form";
import { OrderForm } from "./order-form";
import { useBalance, mask } from "./balance-context";
import { cn } from "@/lib/utils";
import type { AssetWithValue } from "@/types";

const TABS: { key: string; label: string; match: (t: string) => boolean }[] = [
  { key: "all", label: "Todo", match: () => true },
  { key: "crypto", label: "Cripto", match: (t) => t === "crypto" },
  { key: "fci", label: "FCI", match: (t) => t === "fci" },
  { key: "cuentas", label: "Cuentas", match: (t) => isBoxType(t) },
];

interface Props {
  assets: AssetWithValue[];
  onRefresh: () => void;
  onOpenMovements: () => void;
}

export function HoldingsPanel({ assets, onRefresh, onOpenMovements }: Props) {
  const { hidden } = useBalance();
  const router = useRouter();
  const [tab, setTab] = useState("all");

  const shown = assets.filter((a) => TABS.find((t) => t.key === tab)!.match(a.type));

  // Totals for the footer summary (sum of the rows currently shown).
  const totalValue = shown.reduce((s, a) => s + a.current_value, 0);
  const invested = shown.filter((a) => !isCashType(a.type)); // exclude cash from performance
  const totalInvested = invested.reduce((s, a) => s + a.net_invested, 0);
  const totalGain = invested.reduce((s, a) => s + a.profit_loss, 0);
  const totalGross = invested.reduce((s, a) => s + a.gross_invested, 0);
  const totalPct = totalGross > 0 ? (totalGain / totalGross) * 100 : 0;
  const hasInvested = invested.length > 0;

  async function handleDelete(id: number) {
    if (!confirm("Eliminar este activo y todas sus transacciones?")) return;
    await fetch(`/api/assets/${id}`, { method: "DELETE" });
    onRefresh();
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <h2 className="font-medium">Activos</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-4 text-sm">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "border-b-2 pb-1 transition-colors",
                  tab === t.key
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <OrderForm assets={assets} onSaved={onRefresh} />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="px-4 py-2 font-medium">Nombre</th>
              <th className="px-4 py-2 text-right font-medium">Precio</th>
              <th className="px-4 py-2 text-right font-medium">PPC</th>
              <th className="px-4 py-2 text-right font-medium">Cantidad</th>
              <th className="px-4 py-2 text-right font-medium">Valor</th>
              <th className="px-4 py-2 text-right font-medium">Ganancia</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  No hay activos en esta categoría.
                </td>
              </tr>
            ) : (
              shown.map((a) => {
                const box = isBoxType(a.type);
                return (
                  <tr
                    key={a.id}
                    onClick={() => router.push(`/activo/${a.id}`)}
                    className="cursor-pointer border-t border-border/60 hover:bg-accent/40"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{a.symbol}</span>
                        <span className="hidden text-xs text-muted-foreground sm:inline">
                          {a.name}
                        </span>
                        <Badge variant="secondary" className="text-[10px]">
                          {ASSET_TYPES[a.type as AssetType] || a.type}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                      {box ? "—" : formatMoney(a.current_price, a.currency)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                      {box || a.avg_cost <= 0 ? "—" : centsToUsd(a.avg_cost)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                      {box ? "—" : formatQuantity(a.quantity)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium">
                      {mask(centsToUsd(a.current_value), hidden)}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-right font-mono",
                        a.profit_loss >= 0 ? "text-emerald-400" : "text-red-400"
                      )}
                    >
                      {mask(centsToUsd(a.profit_loss), hidden)}
                      <span className="ml-1 text-xs opacity-70">{formatPercent(a.profit_loss_pct)}</span>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <AssetForm asset={a} onSaved={onRefresh} />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(a.id)}
                          className="text-muted-foreground hover:text-red-400"
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {shown.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-primary/30 bg-primary/5 text-sm">
                <td className="px-4 py-3.5" colSpan={4}>
                  <span className="font-semibold uppercase tracking-wide text-primary">
                    Total
                  </span>
                  {hasInvested && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      Invertido {mask(centsToUsd(totalInvested), hidden)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3.5 text-right font-mono font-bold">
                  {mask(centsToUsd(totalValue), hidden)}
                </td>
                <td
                  className={cn(
                    "px-4 py-3.5 text-right font-mono font-bold",
                    totalGain >= 0 ? "text-emerald-400" : "text-red-400"
                  )}
                >
                  {hasInvested ? (
                    <>
                      {mask(centsToUsd(totalGain), hidden)}
                      <span className="ml-1 text-xs opacity-80">{formatPercent(totalPct)}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3.5"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="border-t border-border p-3">
        <Button variant="ghost" size="sm" onClick={onOpenMovements} className="text-muted-foreground">
          <ListOrdered size={15} className="mr-2" />
          Ver movimientos
        </Button>
      </div>
    </div>
  );
}
