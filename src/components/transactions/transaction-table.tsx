"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { TRANSACTION_TYPES } from "@/lib/constants";
import { formatMoney, formatDate, formatQuantity } from "@/lib/formatters";
import type { Transaction } from "@/types";
import type { TransactionType } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface TransactionTableProps {
  transactions: Transaction[];
  onRefresh: () => void;
  showAsset?: boolean;
}

const typeColors: Record<string, string> = {
  buy: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  sell: "bg-red-500/15 text-red-400 border-red-500/20",
  deposit: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  withdrawal: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  interest: "bg-purple-500/15 text-purple-400 border-purple-500/20",
  dividend: "bg-amber-500/15 text-amber-400 border-amber-500/20",
};

export function TransactionTable({
  transactions,
  onRefresh,
  showAsset = true,
}: TransactionTableProps) {
  async function handleDelete(id: number) {
    if (!confirm("Eliminar esta transacción?")) return;
    await fetch(`/api/transactions/${id}`, { method: "DELETE" });
    onRefresh();
  }

  if (transactions.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
        No hay movimientos registrados.
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card">
      {transactions.map((tx) => (
        <div
          key={tx.id}
          className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4"
        >
          {/* Left: type + asset + date */}
          <div className="flex min-w-0 items-center gap-3">
            <Badge
              variant="secondary"
              className={cn("shrink-0 text-xs", typeColors[tx.type])}
            >
              {TRANSACTION_TYPES[tx.type as TransactionType] || tx.type}
            </Badge>
            <div className="min-w-0">
              {showAsset && (
                <div className="truncate font-medium">{tx.asset_symbol}</div>
              )}
              <div className="text-xs text-muted-foreground">{formatDate(tx.date)}</div>
            </div>
          </div>

          {/* Right: amount (+ qty @ price) + delete */}
          <div className="flex shrink-0 items-center gap-1.5">
            <div className="text-right">
              <div className="font-mono text-sm font-medium">
                {formatMoney(tx.total, tx.currency)}
              </div>
              {tx.quantity !== 0 && tx.price > 0 && (
                <div className="font-mono text-xs text-muted-foreground">
                  {formatQuantity(Math.abs(tx.quantity))} @ {formatMoney(tx.price, tx.currency)}
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleDelete(tx.id)}
              className="text-muted-foreground hover:text-red-400"
            >
              <Trash2 size={16} />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
