"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Trash2,
  ListOrdered,
  ChevronDown,
  ChevronRight,
  ChevronUp,
} from "lucide-react";
import {
  ASSET_TYPES,
  isBoxType,
  isCashType,
  isInstallmentType,
  isDebtType,
  isOffBalanceType,
  type AssetType,
  isBtcDenominated,
} from "@/lib/constants";
import {
  centsToUsd,
  formatBtc,
  formatMoney,
  formatPercent,
  formatQuantity,
} from "@/lib/formatters";
import {
  COLUMNS,
  DEFAULT_SORT,
  SORT_STORAGE_KEY,
  buildRows,
  groupTotals,
  type SortDir,
  type SortKey,
} from "@/lib/holdings-sort";
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

export function HoldingsPanel({ assets, onRefresh, onOpenMovements }: Props) {
  const { hidden } = useBalance();
  const router = useRouter();
  const [tab, setTab] = useState("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState(DEFAULT_SORT);

  // Restored after mount rather than in the initial state. The page is
  // prerendered, so seeding the sort from localStorage during the first render
  // would put the header arrow on a different column than the server's HTML and
  // break hydration. One extra render is the cheaper side of that trade — which
  // is why the setState-in-effect rule is waived here rather than worked around.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SORT_STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (COLUMNS.some((c) => c.key === parsed?.key) && (parsed.dir === 1 || parsed.dir === -1)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSort({ key: parsed.key, dir: parsed.dir });
      }
    } catch {
      /* private mode, cleared storage, corrupt value: the default is fine */
    }
  }, []);

  function sortBy(key: SortKey) {
    setSort((prev) => {
      // Same column flips direction; a new one starts the way that column reads
      // best — names A→Z, money biggest first.
      const next =
        prev.key === key
          ? { key, dir: (prev.dir === 1 ? -1 : 1) as SortDir }
          : { key, dir: (key === "symbol" ? 1 : -1) as SortDir };
      try {
        localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* not being able to remember the choice shouldn't block making it */
      }
      return next;
    });
  }

  const shown = assets.filter((a) => TABS.find((t) => t.key === tab)!.match(a.type));
  const rows = buildRows(shown, sort.key, sort.dir);

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
  // Cash, debts and cuota ledgers have no return to measure, so they stay out of
  // the P&L totals.
  const invested = shown.filter(
    (a) => !isCashType(a.type) && !isDebtType(a.type) && !isOffBalanceType(a.type)
  );
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
    // A BTC account is a box whose balance is a quantity, so it fills the Precio
    // and Cantidad columns a dollar account leaves empty.
    const btc = isBtcDenominated(a.currency);
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
            : btc
              ? centsToUsd(a.current_price)
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
            : btc
              ? formatBtc(a.quantity)
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
          {inst ? (
            // Off the balance sheet: show what it has cost, not a valuation.
            <>
              <span className="text-muted-foreground">
                {mask(formatMoney(a.current_price, a.currency), hidden)}
              </span>
              <div className="text-xs font-normal text-muted-foreground/70">pagado</div>
            </>
          ) : (
            <>
              {mask(centsToUsd(a.equity), hidden)}
              {a.liability > 0 && !isDebt && (
                <div className="text-xs font-normal text-red-400/80">
                  deuda {mask(centsToUsd(a.liability), hidden)}
                </div>
              )}
            </>
          )}
        </td>
        <td
          className={cn(
            "px-4 py-3 text-right font-mono",
            a.profit_loss >= 0 ? "text-emerald-400" : "text-red-400"
          )}
        >
          {isDebt || inst ? (
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
              {COLUMNS.map((c) => {
                const active = sort.key === c.key;
                return (
                  <th
                    key={c.key}
                    className={cn("px-4 py-2 font-medium", c.right && "text-right")}
                  >
                    <button
                      onClick={() => sortBy(c.key)}
                      className={cn(
                        "inline-flex items-center gap-1 transition-colors hover:text-foreground",
                        active && "text-foreground"
                      )}
                      aria-label={`Ordenar por ${c.label}`}
                    >
                      {c.label}
                      {active &&
                        (sort.dir === 1 ? (
                          <ChevronUp size={12} className="text-primary" />
                        ) : (
                          <ChevronDown size={12} className="text-primary" />
                        ))}
                    </button>
                  </th>
                );
              })}
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
                {rows.map((row) => {
                  if (row.kind === "asset") return renderRow(row.asset, false);
                  const { name, list } = row;
                  const t = groupTotals(list);
                  const open = !collapsed.has(name);
                  return (
                    // Namespaced: groups and assets share one key space now.
                    <Fragment key={`group:${name}`}>
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
