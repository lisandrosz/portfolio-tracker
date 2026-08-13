"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, ListOrdered, ChevronDown, ChevronRight } from "lucide-react";
import {
  ASSET_TYPES,
  isBoxType,
  isCashType,
  isInstallmentType,
  isDebtType,
  type AssetType,
} from "@/lib/constants";
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
  { key: "inmuebles", label: "Inmuebles", match: (t) => isInstallmentType(t) },
  { key: "deudas", label: "Deudas", match: (t) => isDebtType(t) },
];

interface Props {
  assets: AssetWithValue[];
  onRefresh: () => void;
  onOpenMovements: () => void;
}

/**
 * Order the rows so grouped assets sit together under their heading, and work
 * out which groups are real (a lone member is just a row, not a group).
 */
function buildRows(shown: AssetWithValue[]) {
  const members = new Map<string, AssetWithValue[]>();
  for (const a of shown) {
    if (!a.group_name) continue;
    if (!members.has(a.group_name)) members.set(a.group_name, []);
    members.get(a.group_name)!.push(a);
  }
  // One asset carrying a label isn't worth a heading and a subtotal of itself.
  for (const [name, list] of members) if (list.length < 2) members.delete(name);

  const ungrouped = shown.filter((a) => !a.group_name || !members.has(a.group_name));
  return { groups: members, ungrouped };
}

function groupTotals(list: AssetWithValue[]) {
  const value = list.reduce((s, a) => s + a.equity, 0);
  const perf = list.filter((a) => !isCashType(a.type) && !isDebtType(a.type));
  const gain = perf.reduce((s, a) => s + a.profit_loss, 0);
  const gross = perf.reduce((s, a) => s + a.gross_invested, 0);
  return { value, gain, gross, pct: gross > 0 ? (gain / gross) * 100 : 0, hasPerf: perf.length > 0 };
}

export function HoldingsPanel({ assets, onRefresh, onOpenMovements }: Props) {
  const { hidden } = useBalance();
  const router = useRouter();
  const [tab, setTab] = useState("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const shown = assets.filter((a) => TABS.find((t) => t.key === tab)!.match(a.type));
  const { groups, ungrouped } = buildRows(shown);

  function toggleGroup(name: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  // Totals for the footer summary (sum of the rows currently shown).
  // Value is net of debt, so the Total row reads as net worth.
  const totalValue = shown.reduce((s, a) => s + a.equity, 0);
  const totalLiabilities = shown.reduce((s, a) => s + a.liability, 0);
  // Cash and debts have no return to measure, so they stay out of the P&L totals.
  const invested = shown.filter((a) => !isCashType(a.type) && !isDebtType(a.type));
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

  function renderRow(a: AssetWithValue, indented: boolean) {
    const box = isBoxType(a.type);
    const inst = isInstallmentType(a.type);
    const isDebt = isDebtType(a.type);
    return (
      <tr
        key={a.id}
        onClick={() => router.push(`/activo/${a.id}`)}
        className="cursor-pointer border-t border-border/60 hover:bg-accent/40"
      >
        <td className={cn("px-4 py-3", indented && "pl-10")}>
          <div className="flex items-center gap-2">
            <span className="font-medium">{a.symbol}</span>
            <span className="hidden text-xs text-muted-foreground sm:inline">{a.name}</span>
            {!indented && (
              <Badge variant="secondary" className="text-[10px]">
                {ASSET_TYPES[a.type as AssetType] || a.type}
              </Badge>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-right font-mono text-muted-foreground">
          {inst
            ? formatMoney(a.purchase_total, a.currency)
            : box || isDebt
              ? "—"
              : formatMoney(a.current_price, a.currency)}
        </td>
        <td className="px-4 py-3 text-right font-mono text-muted-foreground">
          {box || inst || isDebt || a.avg_cost <= 0 ? "—" : centsToUsd(a.avg_cost)}
        </td>
        <td className="px-4 py-3 text-right font-mono text-muted-foreground">
          {inst
            ? a.installments_total > 0
              ? `${a.installments_paid}/${a.installments_total}`
              : "—"
            : box || isDebt
              ? "—"
              : formatQuantity(a.quantity)}
        </td>
        <td
          className={cn(
            "px-4 py-3 text-right font-mono font-medium",
            a.equity < 0 && "text-red-400"
          )}
        >
          {mask(centsToUsd(a.equity), hidden)}
          {a.liability > 0 && !isDebt && (
            <div className="text-xs font-normal text-red-400/80">
              deuda {mask(centsToUsd(a.liability), hidden)}
            </div>
          )}
        </td>
        <td
          className={cn(
            "px-4 py-3 text-right font-mono",
            a.profit_loss >= 0 ? "text-emerald-400" : "text-red-400"
          )}
        >
          {isDebt ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <>
              {mask(centsToUsd(a.profit_loss), hidden)}
              <span className="ml-1 text-xs opacity-70">{formatPercent(a.profit_loss_pct)}</span>
            </>
          )}
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
              <>
                {[...groups.entries()].map(([name, list]) => {
                  const t = groupTotals(list);
                  const open = !collapsed.has(name);
                  return (
                    <Fragment key={name}>
                      <tr
                        onClick={() => toggleGroup(name)}
                        className="cursor-pointer border-t border-border/60 bg-muted/40 hover:bg-accent/40"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {open ? (
                              <ChevronDown size={15} className="text-muted-foreground" />
                            ) : (
                              <ChevronRight size={15} className="text-muted-foreground" />
                            )}
                            <span className="font-semibold">{name}</span>
                            <span className="text-xs text-muted-foreground">
                              {list.length} estrategias
                            </span>
                          </div>
                        </td>
                        <td colSpan={3}></td>
                        <td className="px-4 py-3 text-right font-mono font-semibold">
                          {mask(centsToUsd(t.value), hidden)}
                        </td>
                        <td
                          className={cn(
                            "px-4 py-3 text-right font-mono font-semibold",
                            t.gain >= 0 ? "text-emerald-400" : "text-red-400"
                          )}
                        >
                          {t.hasPerf ? (
                            <>
                              {mask(centsToUsd(t.gain), hidden)}
                              <span className="ml-1 text-xs opacity-70">
                                {formatPercent(t.pct)}
                              </span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td></td>
                      </tr>
                      {open && list.map((a) => renderRow(a, true))}
                    </Fragment>
                  );
                })}
                {ungrouped.map((a) => renderRow(a, false))}
              </>
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
                  {totalLiabilities > 0 && (
                    <span className="ml-2 text-xs text-red-400/80">
                      Deuda {mask(centsToUsd(totalLiabilities), hidden)}
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
