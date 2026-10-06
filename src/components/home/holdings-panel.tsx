"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  isPayableType,
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

// Every holding lands in exactly one section, in this order. Only Inversiones
// can earn anything, so it is the only section that shows a gain.
const SECTIONS: { key: string; label: string; match: (t: string) => boolean }[] = [
  {
    key: "inversiones",
    label: "Inversiones",
    match: (t) => !isCashType(t) && !isDebtType(t) && !isOffBalanceType(t),
  },
  { key: "liquidez", label: "Liquidez", match: (t) => isCashType(t) },
  { key: "me-deben", label: "Me deben", match: (t) => isDebtType(t) && !isPayableType(t) },
  { key: "debo", label: "Debo", match: (t) => isPayableType(t) },
  { key: "terreno", label: "Terreno", match: (t) => isOffBalanceType(t) },
];

// Activo, Valor, % cartera, Ganancia, actions.
const COLS = 5;

interface Props {
  assets: AssetWithValue[];
  onRefresh: () => void;
  onOpenMovements: () => void;
}

export function HoldingsPanel({ assets, onRefresh, onOpenMovements }: Props) {
  const { hidden } = useBalance();
  const router = useRouter();
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

  // Sorting applies inside each section; the sections themselves keep their order.
  const sections = SECTIONS.map((sec) => {
    const list = assets.filter((a) => sec.match(a.type));
    return { ...sec, list, rows: buildRows(list, sort.key, sort.dir) };
  }).filter((sec) => sec.list.length > 0);

  function toggle(name: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  // Value is net of debt, so the Total row reads as net worth.
  const totalValue = assets.reduce((s, a) => s + a.equity, 0);
  const totalLiabilities = assets.reduce((s, a) => s + a.liability, 0);
  // Cash, debts and cuota ledgers have no return to measure, so they stay out of
  // the P&L totals.
  const invested = assets.filter(
    (a) => !isCashType(a.type) && !isDebtType(a.type) && !isOffBalanceType(a.type)
  );
  const totalInvested = invested.reduce((s, a) => s + a.net_invested, 0);
  const totalGain = invested.reduce((s, a) => s + a.profit_loss, 0);
  const totalGross = invested.reduce((s, a) => s + a.gross_invested, 0);
  const totalPct = totalGross > 0 ? (totalGain / totalGross) * 100 : 0;
  const hasInvested = invested.length > 0;

  // Share of what is held, debts left out: measured against net worth, a debt
  // shrinks the base and the holdings add up to more than 100%.
  const totalHeld = assets.reduce((s, a) => s + Math.max(0, a.equity), 0);
  const share = (equity: number) =>
    totalHeld > 0 && equity > 0 ? `${((equity / totalHeld) * 100).toFixed(1)}%` : "";

  async function handleDelete(id: number) {
    if (!confirm("Eliminar este activo y todas sus transacciones?")) return;
    await fetch(`/api/assets/${id}`, { method: "DELETE" });
    onRefresh();
  }

  /** The figures only some holdings have, as one muted line under the name. */
  function detail(a: AssetWithValue): string {
    if (isInstallmentType(a.type)) {
      const parts = [`precio ${formatMoney(a.purchase_total, a.currency)}`];
      if (a.installments_total > 0) {
        parts.unshift(`${a.installments_paid}/${a.installments_total} cuotas`);
      }
      return parts.join(" · ");
    }
    // A BTC account is a box whose balance is an amount of bitcoin.
    if (isBtcDenominated(a.currency)) {
      return `${formatBtc(a.quantity)} · ${centsToUsd(a.current_price)}`;
    }
    if (isBoxType(a.type) || isDebtType(a.type)) {
      return ASSET_TYPES[a.type as AssetType] || a.type;
    }
    const parts = [
      `${formatQuantity(a.quantity)} ${a.symbol}`,
      formatMoney(a.current_price, a.currency),
    ];
    if (a.avg_cost > 0) parts.push(`PPC ${centsToUsd(a.avg_cost)}`);
    return parts.join(" · ");
  }

  function gainCell(show: boolean, gain: number, pct: number, strong = false) {
    return (
      <td
        className={cn(
          "px-4 py-2.5 text-right font-mono",
          strong && "font-semibold",
          gain >= 0 ? "text-emerald-400" : "text-red-400"
        )}
      >
        {show && (
          <>
            {mask(centsToUsd(gain), hidden)}
            <span className="ml-1 text-xs opacity-70">{formatPercent(pct)}</span>
          </>
        )}
      </td>
    );
  }

  function shareCell(equity: number) {
    return (
      <td className="hidden px-4 py-2.5 text-right font-mono text-xs text-muted-foreground sm:table-cell">
        {share(equity)}
      </td>
    );
  }

  function renderRow(a: AssetWithValue, indented: boolean) {
    const inst = isInstallmentType(a.type);
    const isDebt = isDebtType(a.type);
    const performs = !isDebt && !inst && !isCashType(a.type);
    // Kept on screen on purpose (an emptied account still has a history), but
    // it shouldn't weigh as much as the holdings that carry the portfolio.
    const empty = !inst && a.equity === 0;
    return (
      <tr
        key={a.id}
        onClick={() => router.push(`/activo/${a.id}`)}
        className={cn(
          "group cursor-pointer border-t border-border/40 hover:bg-accent/40",
          empty && "opacity-50"
        )}
      >
        <td className={cn("py-2.5 pr-4", indented ? "pl-12" : "pl-8")}>
          <div className="flex items-baseline gap-2">
            <span className="font-medium">{a.symbol}</span>
            <span className="hidden truncate text-xs text-muted-foreground sm:inline">
              {a.name}
            </span>
          </div>
          <div className="mt-0.5 font-mono text-xs text-muted-foreground/70">{detail(a)}</div>
        </td>
        <td
          className={cn(
            "px-4 py-2.5 text-right font-mono font-medium",
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
        {shareCell(inst ? 0 : a.equity)}
        {gainCell(performs, a.profit_loss, a.profit_loss_pct)}
        <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
          {/* Revealed on hover; always visible where nothing can hover. */}
          <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
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

  function renderGroup(name: string, list: AssetWithValue[]) {
    const g = groupTotals(list);
    const open = !collapsed.has(name);
    return (
      // Namespaced: groups and assets share one key space.
      <Fragment key={`group:${name}`}>
        <tr
          onClick={() => toggle(name)}
          className="cursor-pointer border-t border-border/40 hover:bg-accent/40"
        >
          <td className="py-2.5 pl-7 pr-4">
            <div className="flex items-center gap-1.5">
              {open ? (
                <ChevronDown size={15} className="text-muted-foreground" />
              ) : (
                <ChevronRight size={15} className="text-muted-foreground" />
              )}
              <span className="font-medium">{name}</span>
              <span className="text-xs text-muted-foreground">{list.length} estrategias</span>
            </div>
          </td>
          <td className="px-4 py-2.5 text-right font-mono font-medium">
            {mask(centsToUsd(g.value), hidden)}
          </td>
          {shareCell(g.value)}
          {gainCell(g.hasPerf, g.gain, g.pct)}
          <td></td>
        </tr>
        {open && list.map((a) => renderRow(a, true))}
      </Fragment>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <h2 className="font-medium">Activos</h2>
        <OrderForm assets={assets} onSaved={onRefresh} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              {COLUMNS.map((c) => {
                const active = sort.key === c.key;
                return (
                  <Fragment key={c.key}>
                    {c.key === "profit_loss" && (
                      <th className="hidden px-4 py-2 text-right font-medium sm:table-cell">
                        % cartera
                      </th>
                    )}
                    <th className={cn("px-4 py-2 font-medium", c.right && "text-right")}>
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
                  </Fragment>
                );
              })}
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {sections.length === 0 ? (
              <tr>
                <td colSpan={COLS} className="px-4 py-10 text-center text-muted-foreground">
                  Todavía no cargaste activos.
                </td>
              </tr>
            ) : (
              sections.map((sec) => {
                const key = `section:${sec.key}`;
                const open = !collapsed.has(key);
                const t = groupTotals(sec.list);
                // The terreno is a cuota ledger in ARS: no USD value to subtotal.
                const offBalance = sec.key === "terreno";
                return (
                  <Fragment key={key}>
                    <tr
                      onClick={() => toggle(key)}
                      className="cursor-pointer border-t border-border bg-muted/30 hover:bg-accent/40"
                    >
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5">
                          {open ? (
                            <ChevronDown size={14} className="text-muted-foreground" />
                          ) : (
                            <ChevronRight size={14} className="text-muted-foreground" />
                          )}
                          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {sec.label}
                          </span>
                        </div>
                      </td>
                      <td
                        className={cn(
                          "px-4 py-2 text-right font-mono font-semibold",
                          t.value < 0 && "text-red-400"
                        )}
                      >
                        {!offBalance && mask(centsToUsd(t.value), hidden)}
                      </td>
                      {shareCell(offBalance ? 0 : t.value)}
                      {gainCell(sec.key === "inversiones" && t.hasPerf, t.gain, t.pct, true)}
                      <td></td>
                    </tr>
                    {open &&
                      sec.rows.map((row) =>
                        row.kind === "asset"
                          ? renderRow(row.asset, false)
                          : renderGroup(row.name, row.list)
                      )}
                  </Fragment>
                );
              })
            )}
          </tbody>
          {assets.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-primary/30 bg-primary/5 text-sm">
                <td className="px-4 py-3.5">
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
                <td className="hidden sm:table-cell"></td>
                <td
                  className={cn(
                    "px-4 py-3.5 text-right font-mono font-bold",
                    totalGain >= 0 ? "text-emerald-400" : "text-red-400"
                  )}
                >
                  {hasInvested && (
                    <>
                      {mask(centsToUsd(totalGain), hidden)}
                      <span className="ml-1 text-xs opacity-80">{formatPercent(totalPct)}</span>
                    </>
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
