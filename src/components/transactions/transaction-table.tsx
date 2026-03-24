"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { TRANSACTION_TYPES } from "@/lib/constants";
import { centsToUsd, formatDate, formatQuantity } from "@/lib/formatters";
import type { Transaction } from "@/types";
import type { TransactionType } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface TransactionTableProps {
  transactions: Transaction[];
  onRefresh: () => void;
  showAsset?: boolean;
}

const typeColors: Record<string, string> = {
  buy: "bg-emerald-50 text-emerald-700 border-emerald-200",
  sell: "bg-red-50 text-red-700 border-red-200",
  deposit: "bg-blue-50 text-blue-700 border-blue-200",
  withdrawal: "bg-orange-50 text-orange-700 border-orange-200",
  interest: "bg-purple-50 text-purple-700 border-purple-200",
  dividend: "bg-amber-50 text-amber-700 border-amber-200",
};

export function TransactionTable({
  transactions,
  onRefresh,
  showAsset = true,
}: TransactionTableProps) {
  async function handleDelete(id: number) {
    if (!confirm("Eliminar esta transaccion?")) return;
    await fetch(`/api/transactions/${id}`, { method: "DELETE" });
    onRefresh();
  }

  return (
    <div className="rounded-xl bg-white shadow-sm overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            {showAsset && <TableHead>Activo</TableHead>}
            <TableHead>Tipo</TableHead>
            <TableHead className="text-right">Cantidad</TableHead>
            <TableHead className="text-right">Precio</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={showAsset ? 7 : 6}
                className="text-center py-8 text-muted-foreground"
              >
                No hay transacciones registradas.
              </TableCell>
            </TableRow>
          ) : (
            transactions.map((tx) => (
              <TableRow key={tx.id}>
                <TableCell className="text-sm">
                  {formatDate(tx.date)}
                </TableCell>
                {showAsset && (
                  <TableCell>
                    <span className="font-medium">{tx.asset_symbol}</span>
                  </TableCell>
                )}
                <TableCell>
                  <Badge
                    variant="secondary"
                    className={cn("text-xs", typeColors[tx.type])}
                  >
                    {TRANSACTION_TYPES[tx.type as TransactionType] || tx.type}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatQuantity(Math.abs(tx.quantity))}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {centsToUsd(tx.price)}
                </TableCell>
                <TableCell className="text-right font-mono font-medium">
                  {centsToUsd(tx.total)}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(tx.id)}
                    className="text-muted-foreground hover:text-red-500"
                  >
                    <Trash2 size={16} />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
